// Production is never a default target. This script is not called by dev/build/start.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), sql = require('mssql')
const { processEnv } = require('@next/env')
const root = path.resolve(__dirname, '..'), apply = process.argv.includes('--apply'), file = '.env.migration.local'
let migrationContext
async function main() {
  if (apply && (!process.argv.includes('--backup-confirmed') || !process.argv.includes('--maintenance-confirmed'))) throw new Error('Apply requires --backup-confirmed and --maintenance-confirmed')
  if (!fs.existsSync(path.join(root, file))) throw new Error('Create the ignored .env.migration.local file explicitly; no .env fallback is used')
  const [, env] = processEnv([{ path: file, contents: fs.readFileSync(path.join(root, file), 'utf8'), env: {} }], root, { info() {}, error() {} }, true)
  const requestTimeout = Number(env.MIGRATION_REQUEST_TIMEOUT_MS || '900000')
  if (!Number.isInteger(requestTimeout) || requestTimeout < 1000 || requestTimeout > 1800000) throw new Error('MIGRATION_REQUEST_TIMEOUT_MS must be between 1000 and 1800000')
  const config = sql.ConnectionPool.parseConnectionString(env.MIGRATION_DB_CONNECTION_STRING || '')
  if (!env.MIGRATION_EXPECTED_SERVER || !env.MIGRATION_EXPECTED_DATABASE || config.server !== env.MIGRATION_EXPECTED_SERVER || config.database !== env.MIGRATION_EXPECTED_DATABASE) throw new Error('Explicit server/database do not match the expected migration target')
  if (!config.options?.encrypt || config.options?.trustServerCertificate !== false) throw new Error('Production migration requires encryption and certificate validation')
  const pool = await new sql.ConnectionPool(env.MIGRATION_DB_CONNECTION_STRING).connect()
  try {
    const checks = (await pool.request().query(fs.readFileSync(path.join(root, 'database/preflight.sql'), 'utf8'))).recordset
    const problems = checks.filter(row => row.cantidad > 0)
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'check', problems }))
    if (problems.length) throw new Error('Reconcile reported records before migration; no changes were applied')
    const history = await pool.request().query("IF OBJECT_ID('dbo.Schema_Migration') IS NULL SELECT CAST(NULL AS varchar(150)) nombre WHERE 1=0; ELSE SELECT nombre FROM dbo.Schema_Migration")
    const pending = fs.readdirSync(path.join(root, 'database/migrations')).filter(name => /^\d+_.+\.sql$/.test(name) && !history.recordset.some(row => row.nombre === name)).sort()
    const people = (await pool.request().query('SELECT id_personal,contrasena FROM dbo.Personal')).recordset
    const legacy = people.filter(row => !/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(row.contrasena))
    if (legacy.some(row => !row.contrasena || row.contrasena.length > 128)) throw new Error('Empty or oversized legacy passwords require an administrator reset before migration')
    console.log(JSON.stringify({ pending, passwordsToHash: legacy.length, credentialsPrinted: false }))
    if (!apply) return
    const exportsObject = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/password.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: exportsObject, require, Buffer })
    const hashes = []
    for (const row of legacy) hashes.push({ id: row.id_personal, old: row.contrasena, hash: await exportsObject.hashPassword(row.contrasena, 0) })
    const transaction = new sql.Transaction(pool)
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    try {
      await new sql.Request(transaction).query("IF OBJECT_ID('dbo.Schema_Migration') IS NULL CREATE TABLE dbo.Schema_Migration(nombre varchar(150) PRIMARY KEY,fecha datetime2 NOT NULL DEFAULT SYSUTCDATETIME())")
      for (const name of pending) {
        let batchNumber = 0
        for (const batch of fs.readFileSync(path.join(root, 'database/migrations', name), 'utf8').split(/^\s*GO\s*$/im)) {
          batchNumber++
          if (batch.trim()) {
            migrationContext = { migration: name, batch: batchNumber }
            const request = new sql.Request(transaction, { requestTimeout })
            await request.query(batch)
            console.log(JSON.stringify({ ...migrationContext, completed: true }))
          }
        }
        await new sql.Request(transaction).input('name', sql.VarChar(150), name).query('INSERT dbo.Schema_Migration(nombre) VALUES(@name)')
      }
      migrationContext = { phase: 'passwords' }
      for (const row of hashes) {
        const result = await new sql.Request(transaction).input('id', sql.Int, row.id).input('old', sql.VarChar(255), row.old).input('hash', sql.VarChar(255), row.hash).query('UPDATE dbo.Personal SET contrasena=@hash,debe_cambiar_contrasena=1 WHERE id_personal=@id AND CONVERT(varbinary(255),contrasena)=CONVERT(varbinary(255),@old)')
        if (result.rowsAffected[0] !== 1) throw new Error('A password changed during maintenance; migration rolled back')
      }
      await transaction.commit()
      console.log(JSON.stringify({ applied: pending, hashed: hashes.length, committed: true }))
    } catch (error) { try { await transaction.rollback() } catch {} throw error }
  } finally { await pool.close() }
}
main().catch(error => { console.error(error instanceof sql.RequestError || error instanceof sql.ConnectionError ? JSON.stringify({ migrationFailed: true, ...migrationContext, code: error.code, number: error.number, line: error.lineNumber, previous: error.precedingErrors?.map(item => ({ number: item.number, line: item.lineNumber })) }) : error.message); process.exitCode = 1 })
