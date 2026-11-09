const { test } = require('node:test'), assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')
const { mergeLiquidationDetails, summarizeLiquidation, liquidationForVendor } = loadTs('src/lib/liquidation.ts')
const detail = overrides => ({ tipo: 'DETALLE', id_personal: 1, nombre_vendedor: 'Prueba', id_producto: 1, descripcion: 'G', category: 'completo', precio_unitario: 20, cantidad_vendida: 1, total_unidades: 0.5, liquidacion_vendedor: 1, liquidacion_empresa: 2.45, requiere_revision: false, ...overrides })

test('las liquidaciones incompletas conservan la cantidad vendida y no suman parciales como totales', () => {
  const rows = summarizeLiquidation([detail({ cantidad_vendida: 3, total_unidades: null, liquidacion_vendedor: null, liquidacion_empresa: null, requiere_revision: 1 }), detail({ id_personal: 2 })])
  const vendor = rows.find(row => row.tipo === 'TOTAL_VENDEDOR' && row.id_personal === 1), general = rows.find(row => row.tipo === 'TOTAL_GENERAL')
  assert.equal(vendor.cantidad_vendida, 3); assert.equal(vendor.total_unidades_vendedor, null)
  assert.equal(general.cantidad_vendida, 4); assert.equal(general.total_unidades_vendedor, null)
  assert.equal(general.total_liquidacion_vendedor, null); assert.equal(general.total_liquidacion_empresa, null); assert.equal(general.requiere_revision, true)
})

test('una comisión registrada en cero se conserva y los importes se suman sin residuos decimales', () => {
  const rows = summarizeLiquidation([detail({ liquidacion_vendedor: 0, liquidacion_empresa: 0.1 }), detail({ liquidacion_vendedor: 0, liquidacion_empresa: 0.2 })])
  const general = rows.find(row => row.tipo === 'TOTAL_GENERAL')
  assert.equal(general.total_liquidacion_vendedor, 0); assert.equal(general.total_liquidacion_empresa, 0.3); assert.equal(general.requiere_revision, false)
})

test('el detalle de un vendedor conserva su propio total general al filtrar cierres de varios vendedores', () => {
  const rows = summarizeLiquidation([detail({ cantidad_vendida: 2 }), detail({ id_personal: 2, cantidad_vendida: 7, total_unidades: 7, liquidacion_vendedor: 14 })])
  const selected = liquidationForVendor(rows, 1), general = selected.find(row => row.tipo === 'TOTAL_GENERAL')
  assert.equal(general.cantidad_vendida, 2); assert.equal(general.total_unidades_vendedor, 0.5); assert.equal(general.total_liquidacion_vendedor, 1)
  assert.ok(selected.every(row => row.id_personal === 1 || row.tipo === 'TOTAL_GENERAL'))
})

test('se combinan importes guardados y reconstruidos sin perder sus valores ni su procedencia', () => {
  const rows = mergeLiquidationDetails([detail({ cantidad_vendida: 2, total_unidades: 2, liquidacion_vendedor: 4, liquidacion_empresa: 9.8, recalculado: true }), detail()])
  assert.equal(rows.length, 1); assert.equal(rows[0].cantidad_vendida, 3); assert.equal(rows[0].total_unidades, 2.5)
  assert.equal(rows[0].liquidacion_vendedor, 5); assert.equal(rows[0].liquidacion_empresa, 12.25); assert.equal(rows[0].recalculado, true)
  const general = summarizeLiquidation(rows).find(row => row.tipo === 'TOTAL_GENERAL')
  assert.equal(general.total_liquidacion_vendedor, 5); assert.equal(general.recalculado, true); assert.equal(general.requiere_revision, false)
})
