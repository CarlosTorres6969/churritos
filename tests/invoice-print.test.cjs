const { test } = require('node:test'), assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')
const { invoicePrintHtml } = loadTs('src/lib/invoice-print.ts', { './business': loadTs('src/lib/business.ts') })
test('la impresión conserva el vendedor de la factura y escapa los nombres recibidos', () => {
  const html = invoicePrintHtml({ numero_factura: 'DEV-1', fecha_emision: '2026-10-31', nombre_cliente: 'Cliente <script>alert(1)</script>', nombre_vendedor: 'Ana & Pedro <img src=x>', codigo_cai: 'CAI-DEV', monto_total: 100, anulada: true, productos: [{ nombre: '<b>Producto</b>', cantidad: 1, precio_unitario: 100, total: 100 }] })
  assert.ok(html.includes('Vendedor: Ana &amp; Pedro &lt;img src=x&gt;'))
  assert.ok(html.includes('FACTURA ANULADA'))
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('<b>Producto</b>'))
})
