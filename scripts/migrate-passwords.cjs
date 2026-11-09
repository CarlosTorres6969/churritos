const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), sql = require('mssql')
const { processEnv } = require('@next/env')
if (process.argv.includes('--production')) throw new Error('Use migrate-production.cjs --check / --apply with backup and maintenance confirmations for production')
const root = path.resolve(__dirname, '..'), file = '.env.development.local'
const [, env] = processEnv([{ path: file, contents: fs.readFileSync(path.join(root, file), 'utf8'), env: {} }], root, { info() {}, error() {} }, true)
const connectionString = env.DEV_DB_CONNECTION_STRING
if (!connectionString) throw new Error('Explicit migration connection required')
const config = sql.ConnectionPool.parseConnectionString(connectionString)
if (!['localhost', '127.0.0.1'].includes(config.server) || config.database !== 'ChurritosDev') throw new Error('Local development database required')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/password.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: exportsObject, require, Buffer })
;(async () => {
  const pool = await new sql.ConnectionPool(connectionString).connect()
  try {
    const rows = await pool.request().query('SELECT id_personal,contrasena FROM dbo.Personal')
    let migrated = 0
    for (const row of rows.recordset) {
      if (/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(row.contrasena)) continue
      const hash = await exportsObject.hashPassword(row.contrasena, 0)
      await pool.request().input('id', sql.Int, row.id_personal).input('hash', sql.VarChar(255), hash).input('old', sql.VarChar(255), row.contrasena).query('UPDATE dbo.Personal SET contrasena=@hash WHERE id_personal=@id AND contrasena=@old')
      migrated++
    }
    await pool.request().input('admin', sql.VarChar(50), env.DEV_ADMIN_USER).input('seller', sql.VarChar(50), env.DEV_VENDOR_USER).query('UPDATE dbo.Personal SET debe_cambiar_contrasena=0 WHERE usuario IN (@admin,@seller)')
    console.log(JSON.stringify({ passwordsMigrated: migrated, plaintextPasswordsPrinted: false, target: 'ChurritosDev' }))
  } finally { await pool.close() }
})().catch(error => { console.error('Password migration failed (' + (error.code || error.name) + '); sensitive details omitted.'); process.exitCode = 1 })
