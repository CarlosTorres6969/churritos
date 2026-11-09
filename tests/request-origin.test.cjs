const test = require('node:test'), assert = require('node:assert/strict')
const { NextRequest, NextResponse } = require('next/server'), { loadTs } = require('./helpers/load-ts.cjs')
const business = loadTs('src/lib/business.ts'), origins = loadTs('src/lib/dev-origin.ts')
const tunnel = 'https://fixture-3100.use2.devtunnels.ms', local = 'http://127.0.0.1:3100'
function auth(env) {
  const query = { input() { return this }, async query() { return { recordset: [{ id_personal: 1 }] } } }
  return loadTs('src/lib/server-auth.ts', { './business': business, './dev-origin': origins, './db': { async getConnection() { return { request() { return query } } } } }, { process: { env } })
}
function request(origin, host = '127.0.0.1:3100', headers = {}) { return new NextRequest(local + '/API/auth/login', { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), Host: host, ...headers } }) }
test('el túnel debe ser una URL HTTPS exacta, sin comodines ni credenciales', () => {
  assert.equal(origins.getDevelopmentAppOrigin(tunnel + '/'), tunnel)
  assert.equal(origins.getDevelopmentAppOrigin(''), undefined)
  for (const value of ['http://example.com', 'https://*.devtunnels.ms', 'https://user:password@example.com', 'https://example.com/path', 'https://example.com?x=1', 'https://example.com#fragment']) assert.throws(() => origins.getDevelopmentAppOrigin(value))
})
test('desarrollo permite el túnel configurado y conserva el acceso local', () => {
  const server = auth({ NODE_ENV: 'development', DEV_APP_URL: tunnel, APP_URL: 'https://production.example.com' })
  assert.doesNotThrow(() => server.assertOrigin(request(tunnel)))
  assert.doesNotThrow(() => server.assertOrigin(request(local)))
  assert.throws(() => server.assertOrigin(request('https://another-3100.use2.devtunnels.ms')))
  assert.throws(() => server.assertOrigin(request('https://evil.example.com')))
  assert.throws(() => server.assertOrigin(request()))
})
test('producción ignora el túnel y exige su propio origen configurado', () => {
  const server = auth({ NODE_ENV: 'production', DEV_APP_URL: tunnel, APP_URL: 'https://production.example.com' })
  assert.doesNotThrow(() => server.assertOrigin(request('https://production.example.com')))
  assert.throws(() => server.assertOrigin(request(tunnel)))
  assert.throws(() => server.assertOrigin(request(local)))
  assert.throws(() => server.assertOrigin(request('http://localhost:3100', 'localhost:3100', { 'x-forwarded-host': new URL(tunnel).host, 'x-forwarded-proto': 'https' })))
})
test('acepta la reescritura real del túnel solo con su host configurado y un destino local', () => {
  const server = auth({ NODE_ENV: 'development', DEV_APP_URL: tunnel })
  const headers = { 'x-forwarded-host': new URL(tunnel).host, 'x-forwarded-proto': 'https' }
  assert.doesNotThrow(() => server.assertOrigin(request('http://localhost:3100', 'localhost:3100', headers)))
  assert.throws(() => server.assertOrigin(request('http://localhost:3100', 'localhost:3100', { 'x-forwarded-proto': 'https' })))
  assert.throws(() => server.assertOrigin(request('http://localhost:3100', 'localhost:3100', { ...headers, 'x-forwarded-host': 'other-3100.use2.devtunnels.ms' })))
  assert.throws(() => server.assertOrigin(request('http://localhost:3100', 'localhost:3100', { ...headers, 'x-forwarded-host': new URL(tunnel).host + ', attacker.example.com' })))
  assert.throws(() => server.assertOrigin(request('http://attacker.example.com', 'attacker.example.com', headers)))
  assert.throws(() => server.assertOrigin(request('https://attacker.example.com', 'localhost:3100', headers)))
})
test('la cookie de desarrollo usa Secure en HTTPS y funciona también por HTTP local', async () => {
  const server = auth({ NODE_ENV: 'development' })
  for (const [origin, secure] of [[tunnel, true], [local, false]]) {
    const req = request(origin), response = NextResponse.json({ success: true })
    await server.createSession(1, response, req)
    assert.equal(response.cookies.get(server.SESSION_COOKIE).secure, secure)
    assert.match(response.headers.get('set-cookie'), /HttpOnly/)
    server.clearSessionCookie(response, req)
    assert.equal(response.cookies.get(server.SESSION_COOKIE).secure, secure)
    assert.equal(response.cookies.get(server.SESSION_COOKIE).maxAge, 0)
  }
})
