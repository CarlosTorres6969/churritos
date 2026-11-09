const { test, before, after } = require('node:test'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto'), fs = require('node:fs')
const sql = require('mssql'), { processEnv } = require('@next/env'), { loadTs, root } = require('../helpers/load-ts.cjs')
const rules = loadTs('src/lib/business.ts'), passwords = loadTs('src/lib/password.ts')
const [, fileEnv] = processEnv([{ path: '.env.development.local', contents: fs.readFileSync(root + '/.env.development.local', 'utf8'), env: {} }], root, { info() {}, error() {} }, true)
const env = { ...fileEnv, ...process.env }
const config = sql.ConnectionPool.parseConnectionString(env.DEV_DB_CONNECTION_STRING || '')
const base = new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:3100')
if (!['localhost', '127.0.0.1'].includes(config.server) || config.database !== 'ChurritosDev' || !['localhost', '127.0.0.1'].includes(base.hostname) || base.protocol !== 'http:') throw new Error('Integration tests require the isolated local development database and HTTP server')
const prefix = 'it_' + randomUUID().slice(0, 8) + '_', pass = 'Test-fixture-' + randomUUID()
let pool, admin, seller, outsider, hashed, sequence = 0
async function query(statement, values = {}) { const request = pool.request(); for (const [key, value] of Object.entries(values)) request.input(key, value); return (await request.query(statement)).recordset }
async function request(path, method = 'GET', body, cookie, origin = base.origin) {
  const headers = { Origin: origin }; if (cookie) headers.Cookie = cookie
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(new URL(path, base), { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const json = await response.json()
  return { status: response.status, ...(Array.isArray(json) ? { data: json } : json), cookie: response.headers.get('set-cookie')?.split(';')[0], cookieHeader: response.headers.get('set-cookie') }
}
async function login(user, password = pass) { const result = await request('/API/auth/login', 'POST', { usuario: user, contrasena: password }); assert.equal(result.status, 200, JSON.stringify({ status: result.status, error: result.error })); return result }
async function actor(name) {
  const user = prefix + name, person = (await query("INSERT dbo.Personal(nombre,apellido,usuario,contrasena,rol,fecha_contratacion,activo,debe_cambiar_contrasena) OUTPUT INSERTED.id_personal VALUES(@name,'Ficticio',@user,@hash,'vendedor',@date,1,0)", { name: user, user, hash: hashed, date: rules.today() }))[0].id_personal
  const route = (await query("INSERT dbo.Ruta(nombre,descripcion,id_personal_asignado,activa) OUTPUT INSERTED.id_ruta VALUES(@name,'Fixture de integración',@person,1)", { name: user, person }))[0].id_ruta
  return { person, route, cookie: (await login(user)).cookie }
}
async function client(type = 'normal', owner = seller) {
  const id = (await query("INSERT dbo.Clientes(nombre,apellido,direccion,id_ruta,dia_visita,tipo_cliente,activo) OUTPUT INSERTED.id_cliente VALUES(@name,'Ficticio','Solo pruebas',@route,@day,@type,1)", { name: prefix + (++sequence), route: owner.route, day: rules.dayOfWeek(), type }))[0].id_cliente
  const account = type.includes('credito') ? (await query("INSERT dbo.Cliente_Credito(id_cliente,limite_credito,saldo_actual,saldo_vencido,activo,dias_credito,tasa_interes) OUTPUT INSERTED.id_credito VALUES(@id,10000,0,0,1,30,0)", { id }))[0].id_credito : null
  return { id, account }
}
async function product(code = 'L4', stock = 5, owner = seller, price = 100) {
  const name = prefix + (++sequence), id = (await query("INSERT dbo.Producto(codigo,nombre,descripcion,precio_completo,precio_medio,precio_mayorista,precio_mayorista2,activo) OUTPUT INSERTED.id_producto VALUES(@name,@name,@code,@price,@half,38.5,37,1)", { name, code, price, half: price / 2 }))[0].id_producto
  const inventory = (await query("INSERT dbo.Inventario_Ruta(id_ruta,id_producto,cantidad) OUTPUT INSERTED.id_inventario_ruta VALUES(@route,@id,@stock)", { route: owner.route, id, stock }))[0].id_inventario_ruta
  return { id, inventory, name, code, price }
}
function saleBody(customer, item, overrides = {}) { return { id_cliente: customer.id, tipo_pago: 'efectivo', efectivo_recibido: 10000, clave_idempotencia: randomUUID(), detalles_venta: [{ id_producto: item.id, cantidad: 1, tipo_precio: 'completo' }], ...overrides } }
async function sale(customer, item, overrides = {}, owner = seller) { return request('/API/Ventas', 'POST', saleBody(customer, item, overrides), owner.cookie) }
async function stock(item) { return Number((await query('SELECT cantidad FROM dbo.Inventario_Ruta WHERE id_inventario_ruta=@id', { id: item.inventory }))[0].cantidad) }
before(async () => {
  pool = await new sql.ConnectionPool(env.DEV_DB_CONNECTION_STRING).connect()
  const marker = await query("SELECT value FROM sys.extended_properties WHERE class=0 AND name='ChurritosDevelopment'")
  assert.equal(String(marker[0]?.value), '1', 'Development database marker is required')
  admin = (await login(env.DEV_ADMIN_USER, env.DEV_ADMIN_PASSWORD)).cookie
  hashed = await passwords.hashPassword(pass); seller = await actor('seller'); outsider = await actor('other')
})
after(async () => {
  if (!pool) return
  try {
    await query(`DECLARE @people TABLE(id int); DECLARE @clients TABLE(id int); DECLARE @sales TABLE(id int); DECLARE @invoices TABLE(id int); DECLARE @payments TABLE(id int);
      INSERT @people SELECT id_personal FROM dbo.Personal WHERE LEFT(usuario,LEN(@prefix))=@prefix;
      INSERT @clients SELECT id_cliente FROM dbo.Clientes WHERE LEFT(nombre,LEN(@prefix))=@prefix;
      INSERT @sales SELECT id_venta FROM dbo.Venta WHERE id_personal IN(SELECT id FROM @people);
      INSERT @invoices SELECT id_factura FROM dbo.Factura WHERE id_venta IN(SELECT id FROM @sales);
      INSERT @payments SELECT id_pago FROM dbo.Credito_Pago WHERE id_personal IN(SELECT id FROM @people);
      DELETE dbo.Notificacion WHERE id_pago IN(SELECT id FROM @payments);
      DELETE dbo.Credito_Aplicacion WHERE id_pago IN(SELECT id FROM @payments);
      DELETE dbo.Credito_Pago WHERE id_pago IN(SELECT id FROM @payments);
      DELETE dbo.Credito_Cargo WHERE id_cliente IN(SELECT id FROM @clients);
      DELETE dbo.Factura_Detalle WHERE id_factura IN(SELECT id FROM @invoices);
      DELETE dbo.Factura WHERE id_factura IN(SELECT id FROM @invoices);
      DELETE dbo.Estado_Visita WHERE id_cliente IN(SELECT id FROM @clients);
      DELETE dbo.Detalle_Venta WHERE id_venta IN(SELECT id FROM @sales);
      DELETE dbo.Venta WHERE id_venta IN(SELECT id FROM @sales);
      DELETE dbo.Cierre_Dia WHERE id_personal IN(SELECT id FROM @people);
      DELETE dbo.Cliente_Credito WHERE id_cliente IN(SELECT id FROM @clients);
      DELETE dbo.Clientes WHERE id_cliente IN(SELECT id FROM @clients);
      DELETE dbo.Inventario_Ruta WHERE id_ruta IN(SELECT id_ruta FROM dbo.Ruta WHERE id_personal_asignado IN(SELECT id FROM @people));
      DELETE dbo.Ruta WHERE id_personal_asignado IN(SELECT id FROM @people);
      DELETE dbo.Producto WHERE LEFT(codigo,LEN(@prefix))=@prefix;
      DELETE dbo.Auth_Sesion WHERE id_personal IN(SELECT id FROM @people);
      DELETE dbo.Personal WHERE id_personal IN(SELECT id FROM @people);`, { prefix })
  } finally { await pool.close() }
})
test('protección, reglas comerciales y transacciones sobre SQL Server local', async t => {
  await t.test('autenticación obligatoria, permisos, aislamiento de rutas y CSRF', async () => {
    for (const path of ['Personal', 'Clientes', 'Productos', 'rutas', 'inventario-ruta', 'inventario-ruta/historial', 'reportes/ventas-mensuales', 'LimiteCredito', 'CAI', 'Ventas', 'Factura', 'Cliente-Credito', 'Cierre-dia', 'resumen']) assert.equal((await request('/API/' + path)).status, 401, path)
    assert.equal((await request('/API/Personal', 'GET', undefined, seller.cookie)).status, 403)
    assert.equal((await request('/API/Productos', 'POST', {}, seller.cookie)).status, 403)
    assert.equal((await request('/API/enviar-correo', 'POST', { id_pago: 1 })).status, 401)
    assert.equal((await request('/API/enviar-correo', 'POST', { id_pago: 1 }, seller.cookie)).status, 403)
    assert.equal((await request('/API/auth/logout', 'POST', {}, seller.cookie, 'https://untrusted.invalid')).status, 403)
    assert.equal((await request('/API/Productos', 'POST', [], admin)).status, 400)
    assert.equal((await request('/API/Productos', 'POST', { oversized: 'x'.repeat(1000001) }, admin)).status, 413)
    const people = await request('/API/Personal', 'GET', undefined, admin)
    assert.equal(people.status, 200); assert.ok(people.data.length > 0); for (const person of people.data) assert.ok(!('contrasena' in person))
    const foreign = await client('normal', outsider), item = await product()
    assert.equal((await request('/API/Ventas?id_cliente=' + foreign.id, 'GET', undefined, seller.cookie)).status, 404)
    assert.equal((await sale(foreign, item)).status, 404)
  })
  await t.test('cantidades, precios y efectivo se validan sin alterar inventario', async () => {
    const customer = await client(), item = await product('G', 3)
    assert.equal((await sale(customer, item, { detalles_venta: [{ id_producto: item.id, cantidad: -1, tipo_precio: 'completo' }] })).status, 400)
    assert.equal((await sale(customer, item, { detalles_venta: [{ id_producto: item.id, cantidad: 1, tipo_precio: 'medio' }] })).status, 400)
    assert.equal((await sale(customer, item, { efectivo_recibido: 0.01 })).status, 400)
    assert.equal((await sale(customer, item, { detalles_venta: [null] })).status, 400)
    assert.equal((await sale(customer, item, { id_personal: outsider.person })).status, 403)
    assert.equal(await stock(item), 3)
    assert.equal((await request('/API/inventario-ruta', 'PUT', { id_inventario_ruta: item.inventory, cantidad: null, cantidad_esperada: 3 }, admin)).status, 400)
    assert.equal((await request('/API/inventario-ruta', 'PUT', { id_inventario_ruta: item.inventory, cantidad: 0, cantidad_esperada: 99 }, admin)).status, 409)
    const permissions = (await query("SELECT IS_ROLEMEMBER('db_owner') propietario,HAS_PERMS_BY_NAME('dbo.Auditoria','OBJECT','UPDATE') editar_auditoria,HAS_PERMS_BY_NAME('dbo.Schema_Migration','OBJECT','INSERT') cambiar_migraciones"))[0]
    assert.equal(permissions.propietario, 0); assert.equal(permissions.editar_auditoria, 0); assert.equal(permissions.cambiar_migraciones, 0)
    await assert.rejects(query('UPDATE dbo.Inventario_Ruta SET cantidad=-1 WHERE id_inventario_ruta=@id', { id: item.inventory }), error => error.number === 547)
    assert.equal(await stock(item), 3)
  })
  await t.test('reponer 10 sobre 2 conserva el inventario anterior y el historial por ruta', async () => {
    const item = await product('L4', 2)
    const replenish = { id_inventario_ruta: item.inventory, cantidad_esperada: 2, cantidad: 10, operacion: 'agregar' }
    const added = await request('/API/inventario-ruta', 'PUT', replenish, admin)
    assert.equal(added.status, 200, added.error); assert.equal(await stock(item), 12)
    assert.equal((await request('/API/inventario-ruta', 'PUT', replenish, admin)).status, 409)
    const list = await request(`/API/inventario-ruta?id_ruta=${seller.route}&id_producto=${item.id}`, 'GET', undefined, seller.cookie)
    assert.equal(list.data[0].cantidad, 12); assert.equal(list.data[0].inventario_anterior, 2); assert.equal(list.data[0].inventario_tras_actualizacion, 12)
    assert.equal((await request('/API/inventario-ruta', 'DELETE', { id_inventario_ruta: item.inventory }, admin)).status, 409)
    const path = `/API/inventario-ruta/historial?id_inventario_ruta=${item.inventory}`
    const history = await request(path, 'GET', undefined, seller.cookie)
    assert.equal(history.status, 200); assert.equal(history.data[0].anterior, 2); assert.equal(history.data[0].cantidad, 12); assert.equal(history.data[0].operacion, 'agregar')
    assert.equal((await request(path, 'GET', undefined, outsider.cookie)).status, 404)
    assert.equal((await request('/API/inventario-ruta', 'PUT', { ...replenish, cantidad_esperada: 12, cantidad: 10.5, operacion: 'ajustar' }, admin)).status, 200)
    const updated = await request(path + '&pageSize=1', 'GET', undefined, admin)
    assert.equal(updated.data[0].anterior, 12); assert.equal(updated.data[0].cantidad, 10.5); assert.equal(updated.pagination.totalPages, 2)
  })
  await t.test('todos los productos admiten solamente precios mayoristas para ambos tipos mayoristas', async () => {
    for (const type of ['mayorista', 'mayorista-credito']) {
      const customer = await client(type)
      for (const code of ['L4', 'L3', ...rules.SPECIAL_PRODUCTS]) {
        const item = await product(code, 2)
        for (const priceType of ['mayorista', 'mayorista2']) {
          const result = await sale(customer, item, { detalles_venta: [{ id_producto: item.id, cantidad: 1, tipo_precio: priceType }] })
          assert.equal(result.status, 200, code + ': ' + result.error)
          assert.equal(result.data.total, priceType === 'mayorista' ? 38.5 : 37)
        }
        assert.equal((await sale(customer, item)).status, 400)
        assert.equal(await stock(item), 0)
      }
      const special = await product('L4', 1)
      await query('UPDATE dbo.Producto SET precio_mayorista2=154 WHERE id_producto=@id', { id: special.id })
      const selected = await sale(customer, special, { detalles_venta: [{ id_producto: special.id, cantidad: 1, tipo_precio: 'mayorista2' }] })
      assert.equal(selected.status, 200); assert.equal(selected.data.total, 154)
      const rates = await query('SELECT liquidacion_empresa FROM dbo.Detalle_Venta WHERE id_venta=@id', { id: selected.data.id_venta }); assert.equal(rates[0].liquidacion_empresa, 17.648)
    }
  })
  await t.test('medias unidades e idempotencia concurrente conservan existencias y una sola factura', async () => {
    const customer = await client(), half = await product('L4', 1)
    assert.equal((await sale(customer, half, { detalles_venta: [{ id_producto: half.id, cantidad: 2, tipo_precio: 'medio' }] })).status, 200)
    assert.equal(await stock(half), 0)
    const item = await product('L4', 3), body = saleBody(customer, item)
    const results = await Promise.all([request('/API/Ventas', 'POST', body, seller.cookie), request('/API/Ventas', 'POST', body, seller.cookie)])
    for (const result of results) assert.equal(result.status, 200, result.error)
    assert.equal(results[0].data.id_venta, results[1].data.id_venta); assert.equal(await stock(item), 2)
    assert.equal((await request('/API/Ventas', 'POST', { ...body, efectivo_recibido: 10001 }, seller.cookie)).status, 409)
    const invoices = await query('SELECT COUNT(*) n FROM dbo.Factura WHERE id_venta=@id', { id: results[0].data.id_venta }); assert.equal(invoices[0].n, 1)
    const last = await product('L4', 1), races = await Promise.all([sale(customer, last), sale(customer, last)])
    assert.equal(races.map(result => result.status).sort().join(','), '200,409'); assert.equal(await stock(last), 0)
  })
  await t.test('abonar L800 a L1000 vencidos deja L200 totales y vencidos, sin pagos duplicados', async () => {
    const customer = await client('credito'), item = await product('L4', 2, seller, 1000), sold = await sale(customer, item, { tipo_pago: 'credito' })
    assert.equal(sold.status, 200, sold.error)
    await query('UPDATE dbo.Credito_Cargo SET vencimiento=@date WHERE id_cliente=@id', { id: customer.id, date: rules.addDays(rules.today(), -1) })
    const key = randomUUID(), path = `/API/Cliente-Credito/${customer.account}/pagos`, body = { monto: 800, clave_idempotencia: key }
    const paid = await request(path, 'POST', body, seller.cookie)
    assert.equal(paid.status, 200, paid.error); assert.equal(paid.data.saldo_actual, 200); assert.equal(paid.data.saldo_vencido, 200)
    const repeat = await request(path, 'POST', body, seller.cookie); assert.equal(repeat.data.id_pago, paid.data.id_pago)
    assert.equal((await request(path, 'POST', { monto: 201, clave_idempotencia: randomUUID() }, seller.cookie)).status, 409)
    const list = await request('/API/Cliente-Credito?id_cliente=' + customer.id, 'GET', undefined, seller.cookie)
    assert.equal(list.data[0].saldo_actual, 200); assert.equal(list.data[0].saldo_vencido, 200)
    assert.equal(list.data[0].id_ruta, seller.route); assert.equal(list.data[0].ruta, prefix + 'seller')
    assert.equal((await request('/API/Cliente-Credito', 'PUT', { id_credito: customer.account, saldo_actual: 0 }, admin)).status, 400)
    assert.equal((await request('/API/Cliente-Credito', 'PUT', { id_credito: customer.account, activo: false }, admin)).status, 409)
    const outbox = await query('SELECT estado FROM dbo.Notificacion WHERE id_pago=@id', { id: paid.data.id_pago }); assert.equal(outbox[0].estado, 'omitido')
    assert.equal((await request('/API/Factura', 'DELETE', { id_factura: sold.data.id_factura, motivo: 'Prueba de factura con pago aplicado' }, admin)).status, 409)
    const full = (await query('SELECT * FROM dbo.Clientes WHERE id_cliente=@id', { id: customer.id }))[0]
    assert.equal((await request('/API/Clientes', 'PUT', { ...full, activo: false, ultima_visita: null }, admin)).status, 409)
  })
  await t.test('dos cobros concurrentes no permiten sobrepagar la misma deuda', async () => {
    const customer = await client('credito'), item = await product('L4', 1, seller, 1000)
    assert.equal((await sale(customer, item, { tipo_pago: 'credito' })).status, 200)
    const results = await Promise.all([1, 2].map(() => request(`/API/Cliente-Credito/${customer.account}/pagos`, 'POST', { monto: 800, clave_idempotencia: randomUUID() }, seller.cookie)))
    assert.equal(results.map(result => result.status).sort().join(','), '200,409')
    const account = await query('SELECT saldo_actual FROM dbo.Cliente_Credito WHERE id_credito=@id', { id: customer.account }); assert.equal(account[0].saldo_actual, 200)
  })
  await t.test('un CAI no disponible revierte toda la venta', async () => {
    const customer = await client(), item = await product('L4', 1), active = (await query('SELECT id_cai FROM dbo.CAI WHERE activo=1'))[0].id_cai
    const before = (await query('SELECT COUNT(*) n FROM dbo.Venta WHERE id_personal=@id', { id: seller.person }))[0].n
    try {
      assert.equal((await request('/API/CAI?id_cai=' + active, 'PUT', { activo: false }, admin)).status, 200)
      assert.equal((await sale(customer, item)).status, 409); assert.equal(await stock(item), 1)
      assert.equal((await query('SELECT COUNT(*) n FROM dbo.Venta WHERE id_personal=@id', { id: seller.person }))[0].n, before)
    } finally { assert.equal((await request('/API/CAI?id_cai=' + active, 'PUT', { activo: true }, admin)).status, 200) }
  })
  await t.test('facturas inmutables y anulación con reversión única de inventario', async () => {
    const customer = await client(), item = await product('L4', 2), sold = await sale(customer, item)
    assert.equal(sold.status, 200, sold.error)
    const changed = await request('/API/Productos', 'PUT', { id_producto: item.id, codigo: item.name, nombre: 'Nombre cambiado', descripcion: 'L4', precio_completo: 999, precio_medio: 100, precio_mayorista: 50, precio_mayorista2: 51, activo: true }, admin); assert.equal(changed.status, 200, changed.error)
    const detail = await request('/API/Factura?id_factura=' + sold.data.id_factura, 'GET', undefined, seller.cookie)
    assert.equal(detail.data.productos[0].nombre, item.name); assert.equal(detail.data.productos[0].precio_unitario, 100)
    const originalName = prefix + 'seller'
    await query("UPDATE dbo.Personal SET nombre='Nombre modificado' WHERE id_personal=@id", { id: seller.person })
    try {
      const preserved = await request('/API/Factura?id_factura=' + sold.data.id_factura, 'GET', undefined, admin)
      assert.equal(preserved.data.nombre_vendedor, originalName + ' Ficticio')
      assert.equal(detail.data.nombre_vendedor, preserved.data.nombre_vendedor)
    } finally { await query('UPDATE dbo.Personal SET nombre=@name WHERE id_personal=@id', { id: seller.person, name: originalName }) }
    assert.equal((await request('/API/Factura', 'POST', { id_venta: sold.data.id_venta, monto_total: 1 }, seller.cookie)).status, 400)
    assert.equal((await request('/API/Ventas', 'PUT', { ...saleBody(customer, item), id_venta: sold.data.id_venta }, admin)).status, 409)
    for (let count = 0; count < 2; count++) assert.equal((await request('/API/Factura', 'DELETE', { id_factura: sold.data.id_factura, motivo: 'Anulación ficticia de integración' }, admin)).status, 200)
    assert.equal(await stock(item), 2)
    const saved = await request('/API/Factura?id_factura=' + sold.data.id_factura, 'GET', undefined, admin); assert.equal(saved.data.anulada, true); assert.equal(saved.data.monto_total, 100)
  })
  await t.test('anular crédito sin abonos revierte la deuda y repone las medias unidades una sola vez', async () => {
    const customer = await client('credito'), item = await product('L4', 2)
    const sold = await sale(customer, item, { tipo_pago: 'credito', detalles_venta: [{ id_producto: item.id, cantidad: 3, tipo_precio: 'medio' }] })
    assert.equal(sold.status, 200, sold.error); assert.equal(await stock(item), 0.5)
    const before = await request('/API/Cliente-Credito?id_cliente=' + customer.id, 'GET', undefined, admin)
    assert.equal(before.data[0].saldo_actual, 150)
    for (let i = 0; i < 2; i++) assert.equal((await request('/API/Factura', 'DELETE', { id_factura: sold.data.id_factura, motivo: 'Reversión de crédito sin abonos' }, admin)).status, 200)
    assert.equal(await stock(item), 2)
    const after = await request('/API/Cliente-Credito?id_cliente=' + customer.id, 'GET', undefined, admin)
    assert.equal(after.data[0].saldo_actual, 0); assert.equal(after.data[0].saldo_vencido, 0)
    assert.equal((await query('SELECT anulada FROM dbo.Venta WHERE id_venta=@id', { id: sold.data.id_venta }))[0].anulada, true)
  })
  await t.test('el reporte mensual separa efectivo y crédito, limita el año y excluye anulaciones', async () => {
    const owner = await actor('monthly'), cash = await client('normal', owner), credit = await client('credito', owner), item = await product('L4', 20, owner)
    const year = Number(rules.today().slice(0, 4))
    const january = await sale(cash, item, {}, owner), february = await sale(credit, item, { tipo_pago: 'credito', detalles_venta: [{ id_producto: item.id, cantidad: 2, tipo_precio: 'completo' }] }, owner)
    const previous = await sale(cash, item, {}, owner), next = await sale(cash, item, {}, owner), annulled = await sale(cash, item, {}, owner)
    for (const sold of [january, february, previous, next, annulled]) assert.equal(sold.status, 200, sold.error)
    assert.equal((await request('/API/Factura', 'DELETE', { id_factura: annulled.data.id_factura, motivo: 'Anular venta de prueba del reporte' }, admin)).status, 200)
    for (const [id, date] of [[january.data.id_venta, `${year}-01-31`], [february.data.id_venta, `${year}-02-01`], [previous.data.id_venta, `${year - 1}-12-31`], [next.data.id_venta, `${year + 1}-01-01`], [annulled.data.id_venta, `${year}-01-15`]]) await query('UPDATE dbo.Venta SET fecha_negocio=@date WHERE id_venta=@id', { id, date })
    await query('UPDATE dbo.Personal SET activo=0 WHERE id_personal=@id', { id: owner.person })
    const report = await request(`/API/reportes/ventas-mensuales?anio=${year}`, 'GET', undefined, admin)
    assert.equal(report.status, 200, report.error); assert.equal(report.data.anio, year)
    assert.equal(report.data.vendedores.find(row => row.id_personal === owner.person).activo, false)
    assert.deepEqual(report.data.meses.filter(row => row.id_personal === owner.person).sort((a, b) => a.mes - b.mes), [
      { id_personal: owner.person, mes: 1, ventas: 1, efectivo: 100, credito: 0 },
      { id_personal: owner.person, mes: 2, ventas: 1, efectivo: 0, credito: 200 },
    ])
    assert.equal((await request('/API/reportes/ventas-mensuales?anio=invalid', 'GET', undefined, admin)).status, 400)
    assert.equal((await request('/API/reportes/ventas-mensuales', 'GET', undefined, seller.cookie)).status, 403)
  })
  await t.test('la liquidación separa precios históricos, muestra cantidades y conserva comisiones pendientes y ceros reales', async () => {
    const owner = await actor('liquidation'), customer = await client('normal', owner), wholesale = await client('mayorista', owner)
    const item = await product('G', 20, owner, 20), zero = await product('SIN_TARIFA', 2, owner)
    const historical = await sale(customer, item, { detalles_venta: [{ id_producto: item.id, cantidad: 2, tipo_precio: 'completo' }] }, owner)
    assert.equal(historical.status, 200, historical.error)
    assert.equal((await sale(customer, item, {}, owner)).status, 200)
    await query('UPDATE dbo.Producto SET precio_completo=25 WHERE id_producto=@id', { id: item.id })
    assert.equal((await sale(customer, item, {}, owner)).status, 200)
    assert.equal((await sale(customer, zero, {}, owner)).status, 200)
    assert.equal((await sale(wholesale, item, { detalles_venta: [{ id_producto: item.id, cantidad: 1, tipo_precio: 'mayorista' }] }, owner)).status, 200)
    await query('UPDATE dbo.Detalle_Venta SET historico_reconstruido=1,unidades_liquidas=NULL,liquidacion_vendedor=NULL,liquidacion_empresa=NULL WHERE id_venta=@id', { id: historical.data.id_venta })
    await query('UPDATE dbo.Producto SET precio_completo=99,precio_mayorista=88 WHERE id_producto=@id', { id: item.id })
    assert.equal((await request('/API/Cierre-dia', 'POST', { fecha_cierre: rules.today() }, owner.cookie)).status, 200)
    const response = await request(`/API/Cierre-dia?fecha=${rules.today()}&id_vendedor=${owner.person}`, 'GET', undefined, admin)
    assert.equal(response.status, 200, response.error)
    const rows = response.data.liquidacion, details = rows.filter(row => row.tipo === 'DETALLE')
    const pending = details.find(row => row.id_producto === item.id && row.precio_unitario === 20)
    assert.equal(pending.cantidad_vendida, 3); assert.equal(pending.total_unidades, null)
    assert.equal(pending.liquidacion_vendedor, null); assert.equal(pending.liquidacion_empresa, null); assert.equal(pending.requiere_revision, 1)
    const complete = details.find(row => row.id_producto === item.id && row.precio_unitario === 25)
    assert.equal(complete.cantidad_vendida, 1); assert.equal(complete.total_unidades, 1); assert.equal(complete.liquidacion_vendedor, 2)
    const bulk = details.find(row => row.id_producto === item.id && row.category === 'mayorista')
    assert.equal(bulk.precio_unitario, 38.5); assert.equal(bulk.total_unidades, 2)
    const noCommission = details.find(row => row.id_producto === zero.id)
    assert.equal(noCommission.liquidacion_vendedor, 0); assert.equal(noCommission.liquidacion_empresa, 0)
    const general = rows.find(row => row.tipo === 'TOTAL_GENERAL')
    assert.equal(general.cantidad_vendida, 6); assert.equal(general.total_unidades_vendedor, null)
    assert.equal(general.total_liquidacion_vendedor, null); assert.equal(general.total_liquidacion_empresa, null)
    assert.ok(rows.filter(row => row.tipo !== 'TOTAL_GENERAL').every(row => row.id_personal === owner.person))
  })
  await t.test('cambio obligatorio de contraseña y revocación de sesiones', async () => {
    const user = prefix + 'password', created = await request('/API/Personal', 'POST', { nombre: user, apellido: 'Ficticio', usuario: user, contrasena: pass, rol: 'vendedor', fecha_contratacion: rules.today(), activo: true }, admin)
    assert.equal(created.status, 201, created.error)
    const initial = await login(user); assert.match(initial.cookieHeader, /HttpOnly/i); assert.match(initial.cookieHeader, /SameSite=lax/i)
    assert.equal((await request('/API/Productos', 'GET', undefined, initial.cookie)).status, 403)
    const next = pass + 'new', changed = await request('/API/auth/password', 'POST', { actual: pass, nueva: next }, initial.cookie); assert.equal(changed.status, 200, changed.error)
    assert.equal((await request('/API/auth/me', 'GET', undefined, initial.cookie)).status, 401)
    const fresh = await login(user, next); assert.equal((await request('/API/Productos', 'GET', undefined, fresh.cookie)).status, 200)
    assert.equal((await request('/API/auth/login', 'POST', { usuario: user, contrasena: pass })).status, 401)
    await request('/API/auth/logout', 'POST', {}, fresh.cookie)
    assert.equal((await request('/API/auth/me', 'GET', undefined, fresh.cookie)).status, 401)
  })
  await t.test('una contraseña cambiada durante un ingreso no puede crear una nueva sesión con el hash anterior', async () => {
    const owner = await actor('stale_login')
    await query("UPDATE dbo.Personal SET contrasena=@hash WHERE id_personal=@id; DELETE dbo.Auth_Sesion WHERE id_personal=@id", { id: owner.person, hash: await passwords.hashPassword(pass + '-changed') })
    const { NextResponse } = require('next/server')
    const server = loadTs('src/lib/server-auth.ts', { './db': { async getConnection() { return pool } }, './business': rules, './dev-origin': loadTs('src/lib/dev-origin.ts') })
    const response = NextResponse.json({ success: true })
    await assert.rejects(server.createSession(owner.person, response, undefined, hashed), error => error.status === 401)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal((await query('SELECT COUNT(*) n FROM dbo.Auth_Sesion WHERE id_personal=@id', { id: owner.person }))[0].n, 0)
  })
  await t.test('edición de ruta conserva asignación y la paginación tiene límite', async () => {
    assert.equal((await request('/API/rutas', 'PUT', { id_ruta: seller.route, nombre: prefix + 'seller', descripcion: 'Editada', activa: true }, admin)).status, 200)
    assert.equal((await query('SELECT id_personal_asignado FROM dbo.Ruta WHERE id_ruta=@id', { id: seller.route }))[0].id_personal_asignado, seller.person)
    assert.equal((await request('/API/Factura?pageSize=1000000', 'GET', undefined, admin)).status, 400)
  })
  await t.test('el cierre calcula ventas, cobros y caja en el servidor y bloquea movimientos posteriores', async () => {
    const owner = await actor('closure'), cash = await client('normal', owner), credit = await client('credito', owner), small = await product('L4', 2, owner), large = await product('L4', 1, owner, 1000)
    const pending = await request('/API/Cierre-dia?fecha=' + rules.today(), 'GET', undefined, owner.cookie)
    assert.equal(pending.status, 200); assert.equal(pending.data.cierre, null); assert.equal(pending.data.cierres.length, 0)
    const sold = await sale(cash, small, {}, owner); assert.equal(sold.status, 200)
    assert.equal((await sale(credit, large, { tipo_pago: 'credito' }, owner)).status, 200)
    assert.equal((await request(`/API/Cliente-Credito/${credit.account}/pagos`, 'POST', { monto: 800, clave_idempotencia: randomUUID() }, owner.cookie)).status, 200)
    assert.equal((await request('/API/Cierre-dia', 'POST', { fecha_cierre: rules.today(), id_personal: seller.person }, owner.cookie)).status, 403)
    const preview = await request('/API/Cierre-dia?preview=true&fecha=' + rules.today(), 'GET', undefined, owner.cookie)
    assert.equal(preview.status, 200); assert.equal(preview.data.cobros_credito, 800); assert.equal(preview.data.efectivo_recaudado, 100)
    const closed = await request('/API/Cierre-dia', 'POST', { fecha_cierre: rules.today(), total_ventas: 999, efectivo_recaudado: 999999 }, owner.cookie)
    assert.equal(closed.status, 200, closed.error); assert.equal(closed.data.total_ventas, 2); assert.equal(closed.data.efectivo_recaudado, 100); assert.equal(closed.data.total_credito, 1000); assert.equal(closed.data.cobros_credito, 800); assert.equal(closed.data.monto_total, 1100)
    const repeat = await request('/API/Cierre-dia', 'POST', { fecha_cierre: rules.today() }, owner.cookie); assert.equal(repeat.data.id_cierre, closed.data.id_cierre)
    assert.equal((await sale(cash, small, {}, owner)).status, 409); assert.equal(await stock(small), 1)
    assert.equal((await request(`/API/Cliente-Credito/${credit.account}/pagos`, 'POST', { monto: 100, clave_idempotencia: randomUUID() }, owner.cookie)).status, 409)
    assert.equal((await request('/API/Factura', 'DELETE', { id_factura: sold.data.id_factura, motivo: 'No permitir anulación de jornada cerrada' }, admin)).status, 409)
    const result = await request('/API/Cierre-dia?fecha=' + rules.today(), 'GET', undefined, owner.cookie); assert.equal(result.status, 200); assert.equal(result.data.cierre.total_efectivo_caja, 900)
  })
})
