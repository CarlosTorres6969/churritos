import { NextRequest, NextResponse } from "next/server"
import sql from "mssql"
import { createHash } from "node:crypto"
import { audit, transaction, withApi } from "./api"
import { availablePrices, cents, commission, dateOnly, dayOfWeek, DomainError, pagination, positiveId, PriceType, stockUnits, text, today, validDate } from "./business"
import { getConnection } from "./db"
import { assertOpen, charge, customer, invoice, syncCredit } from "./finance"
import { requestUser } from "./server-auth"

export const GET = withApi(async request => {
  const user = requestUser(request), params = new URL(request.url).searchParams, pool = await getConnection()
  const query = pool.request().input("actor", sql.Int, user.id_personal).input("admin", sql.Bit, user.rol === "administrador")
  if (params.has("id_cliente")) {
    const result = await query.input("client", sql.Int, positiveId(params.get("id_cliente"))).query(`SELECT c.*,cc.limite_credito,ISNULL(b.saldo,0) saldo_actual FROM dbo.Clientes c JOIN dbo.Ruta r ON c.id_ruta=r.id_ruta LEFT JOIN dbo.Cliente_Credito cc ON c.id_cliente=cc.id_cliente OUTER APPLY(SELECT SUM(saldo) saldo FROM dbo.Credito_Cargo WHERE id_cliente=c.id_cliente) b WHERE c.id_cliente=@client AND c.activo=1 AND r.activa=1 AND (@admin=1 OR r.id_personal_asignado=@actor)`)
    const row = result.recordset[0]
    if (!row) throw new DomainError("Cliente no disponible", 404)
    return NextResponse.json({ success: true, data: { ...row, tipo_cliente: String(row.tipo_cliente || "normal").trim().toLowerCase(), availablePrices: availablePrices(row.tipo_cliente) } })
  }
  if (params.has("id_venta")) {
    const result = await query.input("id", sql.Int, positiveId(params.get("id_venta"))).query("SELECT v.*,c.nombre+' '+c.apellido nombre_cliente,p.nombre+' '+p.apellido nombre_personal FROM dbo.Venta v JOIN dbo.Clientes c ON v.id_cliente=c.id_cliente JOIN dbo.Personal p ON v.id_personal=p.id_personal WHERE v.id_venta=@id AND (@admin=1 OR v.id_personal=@actor)")
    const row = result.recordset[0]
    if (!row) throw new DomainError("Venta no encontrada", 404)
    const details = await pool.request().input("id", sql.Int, row.id_venta).query("SELECT id_detalle_venta id_detalle,id_producto,nombre_snapshot nombre_producto,cantidad,subtotal,tipo_precio,precio_unitario,unidades_inventario FROM dbo.Detalle_Venta WHERE id_venta=@id ORDER BY id_detalle_venta")
    return NextResponse.json({ success: true, data: { ...row, detalles_venta: details.recordset } })
  }
  let where = "WHERE v.anulada=0 AND (@admin=1 OR v.id_personal=@actor)"
  if (params.has("id_vendedor")) { where += " AND v.id_personal=@vendor"; query.input("vendor", sql.Int, positiveId(params.get("id_vendedor"))) }
  if (params.has("fecha")) { where += " AND v.fecha_negocio=@date"; query.input("date", sql.Date, validDate(params.get("fecha"))) }
  const all = params.get("sin_limite") === "true"
  if (all && !params.has("fecha")) throw new DomainError("Indique una fecha para consultar una jornada completa")
  const { page, pageSize, offset } = pagination(params)
  const result = await query.input("offset", sql.Int, all ? 0 : offset).input("size", sql.Int, all ? 10000 : pageSize).query(`SELECT v.*,c.nombre+' '+c.apellido nombre_cliente,p.nombre+' '+p.apellido nombre_personal,ISNULL(d.productos,0) total_productos,COUNT(*) OVER() total_count FROM dbo.Venta v JOIN dbo.Clientes c ON c.id_cliente=v.id_cliente JOIN dbo.Personal p ON p.id_personal=v.id_personal OUTER APPLY(SELECT SUM(cantidad) productos FROM dbo.Detalle_Venta WHERE id_venta=v.id_venta) d ${where} ORDER BY v.fecha_venta DESC,v.id_venta DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`)
  const total = result.recordset[0]?.total_count || 0
  if (all && total > 10000) throw new DomainError("La jornada requiere consultar por páginas")
  return NextResponse.json({ success: true, data: { ventas: result.recordset, pagination: { page, pageSize: all ? 10000 : pageSize, total, totalPages: Math.ceil(total / (all ? 10000 : pageSize)) } } })
})

async function save(request: NextRequest, updating: boolean) {
  const user = requestUser(request), body = await request.json(), clientId = positiveId(body.id_cliente)
  if (body.id_personal !== undefined && body.id_personal !== user.id_personal && !updating) throw new DomainError("No puede registrar ventas de otro usuario", 403)
  if (!["efectivo", "credito"].includes(body.tipo_pago)) throw new DomainError("Tipo de pago inválido")
  if (!Array.isArray(body.detalles_venta) || !body.detalles_venta.length || body.detalles_venta.length > 100) throw new DomainError("Seleccione entre 1 y 100 productos")
  const key = updating ? null : text(body.clave_idempotencia, "Clave de venta", 64)
  const fingerprint = createHash("sha256").update(JSON.stringify({ clientId, payment: body.tipo_pago, received: body.efectivo_recibido, details: body.detalles_venta })).digest("hex")
  if (key && !/^[a-zA-Z0-9-]{16,64}$/.test(key)) throw new DomainError("Clave de venta inválida")
  const data = await transaction(async tx => {
    if (key) {
      const existing = await new sql.Request(tx).input("key", sql.VarChar(64), key).query("SELECT id_venta,total,id_personal,id_cliente,solicitud_hash FROM dbo.Venta WITH(UPDLOCK,HOLDLOCK) WHERE clave_idempotencia=@key")
      if (existing.recordset[0]) {
        const previous = existing.recordset[0]
        if (previous.id_personal !== user.id_personal || previous.id_cliente !== clientId || previous.solicitud_hash !== fingerprint) throw new DomainError("La clave corresponde a otra venta", 409)
        return previous
      }
    }
    const old = updating ? (await new sql.Request(tx).input("id", sql.Int, positiveId(body.id_venta)).query("SELECT * FROM dbo.Venta WITH(UPDLOCK,HOLDLOCK) WHERE id_venta=@id")).recordset[0] : null
    if (updating && !old) throw new DomainError("Venta no encontrada", 404)
    if (old?.cerrada || old?.anulada) throw new DomainError("No se puede modificar una venta cerrada o anulada", 409)
    const actor = old?.id_personal ?? user.id_personal
    await assertOpen(tx, actor, old ? dateOnly(old.fecha_negocio) : today())
    if (old) {
      const issued = await new sql.Request(tx).input("id", sql.Int, old.id_venta).query("SELECT 1 n FROM dbo.Factura WHERE id_venta=@id")
      if (issued.recordset[0]) throw new DomainError("La venta ya tiene factura; anule y registre una nueva venta para conservar el historial", 409)
    }
    const client = await customer(tx, clientId, user)
    if (user.rol === "vendedor" && client.dia_visita !== dayOfWeek()) throw new DomainError("El cliente no corresponde al día de visita actual")
    if (body.tipo_pago === "credito" && !String(client.tipo_cliente).includes("credito")) throw new DomainError("Cliente no habilitado para crédito")
    if (body.tipo_pago === "credito") await syncCredit(tx, clientId)
    if (old) {
      const details = await new sql.Request(tx).input("id", sql.Int, old.id_venta).query("SELECT * FROM dbo.Detalle_Venta WHERE id_venta=@id")
      for (const row of details.recordset) {
        if (row.historico_reconstruido || row.unidades_inventario == null || !old.id_ruta_snapshot) throw new DomainError("La venta histórica requiere conciliación antes de modificarla", 409)
        await new sql.Request(tx).input("route", sql.Int, old.id_ruta_snapshot).input("product", sql.Int, row.id_producto).input("units", sql.Decimal(18, 2), row.unidades_inventario).query("UPDATE dbo.Inventario_Ruta SET cantidad=cantidad+@units WHERE id_ruta=@route AND id_producto=@product")
      }
      if (old.tipo_pago === "credito") {
        const applied = await new sql.Request(tx).input("id", sql.Int, old.id_venta).query("SELECT 1 n FROM dbo.Credito_Aplicacion a JOIN dbo.Credito_Cargo c ON a.id_cargo=c.id_cargo WHERE c.id_venta=@id")
        if (applied.recordset[0]) throw new DomainError("La venta tiene pagos aplicados", 409)
        await new sql.Request(tx).input("id", sql.Int, old.id_venta).query("DELETE dbo.Credito_Cargo WHERE id_venta=@id")
        await syncCredit(tx, old.id_cliente)
      }
      await new sql.Request(tx).input("id", sql.Int, old.id_venta).query("DELETE dbo.Detalle_Venta WHERE id_venta=@id")
    }
    const prepared = []
    let totalCents = 0
    for (const item of body.detalles_venta) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new DomainError("Detalle de venta inválido")
      const productId = positiveId(item.id_producto), quantity = positiveId(item.cantidad, "Cantidad")
      if (quantity > 100000) throw new DomainError("Cantidad demasiado grande")
      const result = await new sql.Request(tx).input("id", sql.Int, productId).query("SELECT * FROM dbo.Producto WHERE id_producto=@id AND activo=1")
      const product = result.recordset[0]
      if (!product) throw new DomainError("Producto no disponible", 404)
      const priceType = item.tipo_precio as PriceType
      if (!availablePrices(client.tipo_cliente, product.descripcion).includes(priceType)) throw new DomainError("Tipo de precio no permitido para este cliente y producto")
      const unitCents = cents(product[`precio_${priceType}`]), subtotal = unitCents * quantity
      totalCents += subtotal
      cents(totalCents / 100)
      prepared.push({ product, quantity, priceType, unit: unitCents / 100, subtotal: subtotal / 100, units: stockUnits(quantity, priceType) })
    }
    const received = body.tipo_pago === "efectivo" ? cents(body.efectivo_recibido) : 0
    if (body.tipo_pago === "efectivo" && received < totalCents) throw new DomainError("El efectivo recibido no cubre el total")
    const saved = await new sql.Request(tx).input("id", sql.Int, old?.id_venta ?? null).input("client", sql.Int, clientId).input("actor", sql.Int, actor).input("route", sql.Int, client.id_ruta).input("date", sql.Date, today()).input("total", sql.Decimal(18, 2), totalCents / 100).input("payment", sql.VarChar(20), body.tipo_pago).input("received", sql.Decimal(18, 2), received / 100).input("key", sql.VarChar(64), key).input("fingerprint", sql.Char(64), fingerprint).query(old ? "UPDATE dbo.Venta SET id_cliente=@client,total=@total,tipo_pago=@payment,efectivo_recibido=@received,id_ruta_snapshot=@route,fecha_actualizacion=SYSUTCDATETIME() WHERE id_venta=@id; SELECT @id id_venta;" : "INSERT dbo.Venta(id_cliente,id_personal,id_ruta_snapshot,fecha_venta,fecha_negocio,total,tipo_pago,cerrada,efectivo_recibido,clave_idempotencia,solicitud_hash) OUTPUT INSERTED.id_venta VALUES(@client,@actor,@route,SYSUTCDATETIME(),@date,@total,@payment,0,@received,@key,@fingerprint)")
    const saleId = saved.recordset[0].id_venta
    for (const item of prepared.sort((a, b) => a.product.id_producto - b.product.id_producto)) {
      const result = await new sql.Request(tx).input("route", sql.Int, client.id_ruta).input("product", sql.Int, item.product.id_producto).input("units", sql.Decimal(18, 2), item.units).query("UPDATE dbo.Inventario_Ruta SET cantidad=cantidad-@units,fecha_actualizacion=SYSUTCDATETIME() WHERE id_ruta=@route AND id_producto=@product AND cantidad>=@units")
      if (result.rowsAffected[0] !== 1) throw new DomainError("Inventario insuficiente o no asignado a esta ruta", 409)
      const rates = commission(item.product.descripcion || "", item.priceType, item.quantity, Number(item.product.precio_completo), item.unit)
      await new sql.Request(tx).input("sale", sql.Int, saleId).input("product", sql.Int, item.product.id_producto).input("quantity", sql.Int, item.quantity).input("subtotal", sql.Decimal(18, 2), item.subtotal).input("price", sql.VarChar(20), item.priceType).input("unit", sql.Decimal(18, 2), item.unit).input("units", sql.Decimal(18, 2), item.units).input("name", sql.NVarChar(100), item.product.nombre).input("description", sql.NVarChar(255), item.product.descripcion || "").input("seller", sql.Decimal(18, 4), rates.seller).input("company", sql.Decimal(18, 4), rates.company).input("liquid", sql.Decimal(18, 2), rates.units).query("INSERT dbo.Detalle_Venta(id_venta,id_producto,cantidad,subtotal,tipo_precio,precio_unitario,unidades_inventario,nombre_snapshot,descripcion_snapshot,liquidacion_vendedor,liquidacion_empresa,unidades_liquidas,historico_reconstruido) VALUES(@sale,@product,@quantity,@subtotal,@price,@unit,@units,@name,@description,@seller,@company,@liquid,0)")
    }
    if (body.tipo_pago === "credito") await charge(tx, clientId, saleId, totalCents / 100)
    await new sql.Request(tx).input("client", sql.Int, clientId).input("sale", sql.Int, saleId).input("date", sql.Date, today()).query("INSERT dbo.Estado_Visita(id_cliente,id_venta,estado,fecha_visita) VALUES(@client,@sale,'compró',SYSUTCDATETIME()); UPDATE dbo.Clientes SET ultima_visita=@date WHERE id_cliente=@client")
    const issued = await invoice(tx, saleId)
    await audit(tx, user.id_personal, old ? "editar_venta" : "venta", "Venta", saleId, { total: totalCents / 100, id_cliente: clientId })
    return { id_venta: saleId, total: totalCents / 100, ...issued }
  })
  return NextResponse.json({ success: true, data })
}
export const POST = withApi(req => save(req, false), { roles: ["vendedor"] })
export const PUT = withApi(req => save(req, true), { roles: ["administrador"] })
