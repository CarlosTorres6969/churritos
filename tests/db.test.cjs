const test = require('node:test'), assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')
test('desarrollo falla cerrado y nunca utiliza la conexión de producción', async () => {
  let connections = 0
  class Pool { constructor(config) { this.config = config; connections++ } async connect() { return this } }
  const database = loadTs('src/lib/db.ts', { mssql: { ConnectionPool: Pool } }, { process: { env: { NODE_ENV: 'development', DB_CONNECTION_STRING: 'PRODUCTION_FIXTURE' } } })
  await assert.rejects(database.getConnection(), /DEV_DB_CONNECTION_STRING/)
  assert.equal(connections, 0)
})
test('las peticiones reutilizan el pool sin cerrarlo entre solicitudes', async () => {
  let connections = 0, closed = 0
  class Pool { constructor(config) { this.config = config; connections++ } async connect() { return this } async close() { closed++ } request() { return { async query() { return { recordset: [{ value: 1 }] } } } } }
  const database = loadTs('src/lib/db.ts', { mssql: { ConnectionPool: Pool } }, { process: { env: { NODE_ENV: 'development', DEV_DB_CONNECTION_STRING: 'LOCAL_FIXTURE' } } })
  const first = await database.getConnection(), second = await database.getConnection()
  assert.equal(first, second); assert.equal(connections, 1)
  assert.equal(closed, 0)
})
test('desarrollo cierra y rechaza una base sin la marca de pruebas antes de usarla', async () => {
  let closed = 0
  class Pool { async connect() { return this } async close() { closed++ } request() { return { async query() { return { recordset: [] } } } } }
  const database = loadTs('src/lib/db.ts', { mssql: { ConnectionPool: Pool } }, { process: { env: { NODE_ENV: 'development', DEV_DB_CONNECTION_STRING: 'UNMARKED_FIXTURE' } } })
  await assert.rejects(database.getConnection(), /No se pudo conectar/)
  assert.equal(closed, 1)
  await assert.rejects(database.getConnection(), /No se pudo conectar/)
  assert.equal(closed, 2)
})
