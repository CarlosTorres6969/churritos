const test = require('node:test'), assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')
const password = loadTs('src/lib/password.ts')
test('scrypt utiliza sales diferentes y verifica únicamente la contraseña correcta', async () => {
  const value = 'Frase ficticia para pruebas 2026'
  const first = await password.hashPassword(value), second = await password.hashPassword(value)
  assert.notEqual(first, second); assert.notEqual(first, value)
  assert.equal(await password.verifyPassword(value, first), true)
  assert.equal(await password.verifyPassword('incorrecta', first), false)
  assert.equal(await password.verifyPassword(value, value), false)
  await assert.rejects(password.hashPassword('123456'))
})
