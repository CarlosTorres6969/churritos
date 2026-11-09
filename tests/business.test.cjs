const test = require('node:test'), assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')
const rules = loadTs('src/lib/business.ts')
test('el saldo vencido es parte de la deuda: pagar 800 de 1000 vencidos deja 200', () => {
  const result = rules.paymentBalances(1000, 1000, 800)
  assert.equal(result.saldo_actual, 200); assert.equal(result.saldo_vencido, 200)
})
test('los abonos se aplican a deuda vencida antes que a deuda vigente', () => {
  const result = rules.paymentBalances(1000, 200, 100)
  assert.equal(result.saldo_actual, 900); assert.equal(result.saldo_vencido, 100)
  assert.throws(() => rules.paymentBalances(200, 200, 201))
})
test('los mayoristas usan solo sus dos precios en todos los productos', () => {
  for (const customer of ['mayorista', 'mayorista-credito']) for (const code of ['L4', 'L3', ...rules.SPECIAL_PRODUCTS]) {
    assert.equal(rules.availablePrices(customer, code).join(','), 'mayorista,mayorista2')
  }
  assert.equal(rules.availablePrices('normal', 'G').join(','), 'completo')
  assert.equal(rules.availablePrices('normal', 'L4').join(','), 'completo,medio')
  assert.equal(rules.availablePrices(' MAYORISTA ', 'CHF').join(','), 'mayorista,mayorista2')
})
test('dos medias unidades descuentan una unidad física', () => {
  assert.equal(rules.stockUnits(2, 'medio'), 1); assert.equal(rules.stockUnits(1, 'mayorista'), 1)
})
test('las comisiones específicas no se confunden con C o G', () => {
  assert.equal(rules.commission('CF', 'completo', 1, 40, 38.5).seller, 1.2)
  assert.equal(rules.commission('CHF', 'completo', 1, 40, 38.5).seller, 1.49)
  assert.equal(rules.commission('CCP', 'completo', 1, 40, 38.5).seller, 1)
  assert.equal(rules.commission('MEGA', 'completo', 1, 40, 38.5).company, 3.184)
  assert.equal(rules.commission('L4', 'mayorista2', 1, 160, 154).company, 17.648)
})
test('se rechazan montos negativos, no finitos, booleanos y decimales extra', () => {
  for (const amount of [-1, NaN, Infinity, true, null, '', '1.001', 1.001]) assert.throws(() => rules.cents(amount))
  assert.equal(rules.cents('0.10'), 10); assert.equal(rules.cents(0, true), 0)
})
test('se validan fechas reales y días de visita consistentes', () => {
  assert.throws(() => rules.validDate('2026-02-31')); assert.throws(() => rules.validDate('2025-02-29'))
  assert.equal(rules.validDate('2024-02-29'), '2024-02-29'); assert.equal(rules.dayOfWeek('2026-11-01'), 7)
})
test('se escapa contenido de facturas y se limita la paginación', () => {
  assert.equal(rules.escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  assert.throws(() => rules.pagination(new URLSearchParams('pageSize=1000000')))
  assert.throws(() => rules.pagination(new URLSearchParams('page=-1')))
  assert.throws(() => rules.pagination(new URLSearchParams('page=2147483647&pageSize=100')))
})
test('las contraseñas se conservan completas y nunca se recortan', () => { assert.equal(rules.passwordValue(' frase segura de prueba '), ' frase segura de prueba ') })
test('el CSV escapa comillas y neutraliza fórmulas de hojas de cálculo', () => {
  assert.equal(rules.csvCell('="ejecutar"'), '"\'=\"\"ejecutar\"\""')
  assert.equal(rules.csvCell('Apellido, "Nombre"'), '"Apellido, ""Nombre"""')
})
test('el día comercial y las fechas de SQL conservan el calendario de Honduras', () => {
  const moment = new Date('2026-11-09T03:30:00Z')
  assert.equal(rules.today(moment), '2026-11-08')
  assert.equal(rules.dayOfWeek(rules.today(moment)), 7)
  assert.equal(rules.formatBusinessDate('2026-11-08T00:00:00.000Z'), '8/11/2026')
})
