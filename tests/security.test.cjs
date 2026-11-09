const { test } = require('node:test'), assert = require('node:assert/strict')
const { NextResponse } = require('next/server'), { loadTs } = require('./helpers/load-ts.cjs')
const business = loadTs('src/lib/business.ts')

test('el acceso simultáneo limita a cuatro verificaciones aunque las solicitudes esperen al control de intentos', async () => {
  let unlockLimit, unlockHash, checks = 0, simultaneous = 0, maximum = 0
  const limit = new Promise(resolve => { unlockLimit = resolve }), hash = new Promise(resolve => { unlockHash = resolve })
  const query = { input() { return this }, async query() { return { recordset: [{ id_personal: 1, usuario: 'fixture', rol: 'vendedor', activo: true, contrasena: 'scrypt$fixture' }] } } }
  const { POST } = loadTs('src/app/API/auth/login/route.ts', {
    '@/lib/api': { withApi: handler => handler }, '@/lib/business': business,
    '@/lib/db': { async getConnection() { return { request() { return query } } } },
    '@/lib/password': { async verifyPassword() { checks++; simultaneous++; maximum = Math.max(maximum, simultaneous); await hash; simultaneous--; return true } },
    '@/lib/server-auth': { loginLimit: () => limit, normalizeRole: role => role, async createSession() {} },
  })
  const requests = Array.from({ length: 10 }, () => POST({ async json() { return { usuario: 'fixture', contrasena: 'test-password-fixture' } } }))
  const results = Promise.allSettled(requests)
  unlockLimit()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(maximum, 4); assert.equal(checks, 4)
  unlockHash()
  const settled = await results
  assert.equal(settled.filter(item => item.status === 'fulfilled').length, 4)
  for (const rejected of settled.filter(item => item.status === 'rejected')) assert.equal(rejected.reason.status, 429)
})

test('un acceso cuya contraseña cambió durante la comprobación no recibe una sesión', async () => {
  const server = loadTs('src/lib/server-auth.ts', {
    './business': business, './dev-origin': loadTs('src/lib/dev-origin.ts'),
    './db': { async getConnection() { return { request() { return { input() { return this }, async query() { return { recordset: [] } } } } } } },
  }, { process: { env: { NODE_ENV: 'development' } } })
  const response = NextResponse.json({ success: true })
  await assert.rejects(server.createSession(1, response, undefined, 'stale-hash-fixture'), error => error.status === 401)
  assert.equal(response.headers.get('set-cookie'), null)
})

test('los correos necesitan habilitación explícita y nunca se envían si falta EMAIL_ENABLED', async () => {
  let sent = 0
  for (const enabled of [undefined, '', 'false', 'TRUE', 'true']) {
    const states = []
    const notifications = loadTs('src/lib/notifications.ts', {
      './business': business,
      './db': { async getConnection() { return { request() { return { input() { return this }, async query(statement) {
        if (statement.includes("estado='enviando'")) return { recordset: [{ id_pago: 1 }] }
        if (statement.startsWith('SELECT')) return { recordset: [{ monto: 10, fecha: new Date(), cliente: 'Cliente ficticio', vendedor: 'Vendedor ficticio' }] }
        states.push(statement); return { recordset: [] }
      } } } } } },
      nodemailer: { createTransport() { return { async sendMail() { sent++ } } } },
    }, { process: { env: { EMAIL_ENABLED: enabled, EMAIL_USER: 'fixture@example.com', EMAIL_PASSWORD: 'fixture', EMAIL_RECIPIENTS: 'fixture@example.com' } } })
    await notifications.notifyPayment(1)
    assert.ok(states.some(statement => statement.includes(enabled === 'true' ? "estado='enviado'" : "estado='omitido'")))
  }
  assert.equal(sent, 1)
})
