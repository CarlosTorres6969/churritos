import { NextResponse } from "next/server"
import sql from "mssql"
import { audit, transaction, withApi } from "./api"
import { cents, DomainError, pagination, positiveId, text, validDate } from "./business"
import { getConnection } from "./db"
import { assertOpen, invoice, syncCredit } from "./finance"
import { requestUser } from "./server-auth"

export const GET = withApi(async request => {
  const user = requestUser(request), params = new URL(request.url).searchParams, pool = await getConnection(), query = pool.request()
  query.input("actor", sql.Int, user.id_personal).input("admin", sql.Bit, user.rol === "administrador")
  let where = "WHERE (@admin=1 OR v.id_personal=@actor)"
  for (const [key, column] of [["id_factura", "f.id_factura"], ["id_venta", "f.id_venta"], ["id_personal", "v.id_personal"]]) if (params.has(key)) { where += ` AND ${column}=@${key}`; query.input(key, sql.Int, positiveId(params.get(key))) }
  if (params.get("fechaInicio")) { where += " AND f.fecha_emision>=@start"; query.input("start", sql.Date, validDate(params.get("fechaInicio"))) }
  if (params.get("fechaFin")) { where += " AND f.fecha_emision<=@end"; query.input("end", sql.Date, validDate(params.get("fechaFin"))) }
  if (params.get("busqueda")) { where += " AND (f.numero_factura LIKE @search OR f.nombre_cliente_snapshot LIKE @search OR f.cai_snapshot LIKE @search)"; query.input("search", sql.NVarChar(110), `%${text(params.get("busqueda"), "Búsqueda", 100)}%`) }
  const { page, pageSize, offset } = pagination(params)
  const result = await query.input("offset", sql.Int, offset).input("size", sql.Int, pageSize).query(`SELECT f.*,f.nombre_cliente_snapshot nombre_cliente,f.nombre_vendedor_snapshot nombre_vendedor,f.cai_snapshot codigo_cai,f.tipo_pago_snapshot tipo_pago,v.id_personal,COUNT(*) OVER() total_count FROM dbo.Factura f JOIN dbo.Venta v ON f.id_venta=v.id_venta ${where} ORDER BY f.fecha_emision DESC,f.id_factura DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`)
  const ids = result.recordset.map(row => row.id_factura)
  const detailsRequest = pool.request()
  ids.forEach((id, index) => detailsRequest.input(`id${index}`, sql.Int, id))
  const details = ids.length ? (await detailsRequest.query(`SELECT * FROM dbo.Factura_Detalle WHERE id_factura IN (${ids.map((_, index) => `@id${index}`).join(",")}) ORDER BY id_factura,posicion`)).recordset : []
  const invoices = result.recordset.map(row => ({ ...row, productos: details.filter(item => item.id_factura === row.id_factura).map(item => ({ nombre: item.nombre, cantidad: item.cantidad, precio_unitario: item.precio_unitario, total: item.total })) }))
  if (params.has("id_factura")) { if (!invoices[0]) throw new DomainError("Factura no encontrada", 404); return NextResponse.json({ success: true, data: invoices[0] }) }
  if (params.has("id_venta")) return NextResponse.json({ success: true, data: invoices })
  const total = result.recordset[0]?.total_count || 0
  return NextResponse.json({ success: true, data: { facturas: invoices, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } })
})
export const POST = withApi(async request => {
  const user = requestUser(request), body = await request.json(), saleId = positiveId(body.id_venta)
  const data = await transaction(async tx => {
    const result = await new sql.Request(tx).input("id", sql.Int, saleId).input("actor", sql.Int, user.id_personal).input("admin", sql.Bit, user.rol === "administrador").query("SELECT total,id_personal FROM dbo.Venta WHERE id_venta=@id AND anulada=0 AND (@admin=1 OR id_personal=@actor)")
    const sale = result.recordset[0]
    if (!sale) throw new DomainError("Venta no encontrada", 404)
    if (body.monto_total !== undefined && cents(body.monto_total) !== cents(sale.total)) throw new DomainError("El monto debe coincidir con la venta")
    const created = await invoice(tx, saleId)
    await audit(tx, user.id_personal, "facturar", "Factura", created.id_factura)
    return created
  })
  return NextResponse.json({ success: true, data })
})
export const DELETE = withApi(async request => {
  const user = requestUser(request), body = await request.json(), id = positiveId(body.id_factura), reason = text(body.motivo, "Motivo", 500)
  if (reason.length < 10) throw new DomainError("Explique el motivo de la anulación")
  await transaction(async tx => {
    const result = await new sql.Request(tx).input("id", sql.Int, id).query("SELECT f.id_venta,f.anulada,v.id_cliente,v.id_personal,v.id_ruta_snapshot,v.tipo_pago,v.cerrada,v.fecha_negocio FROM dbo.Factura f WITH(UPDLOCK,HOLDLOCK) JOIN dbo.Venta v ON f.id_venta=v.id_venta WHERE id_factura=@id")
    const sale = result.recordset[0]
    if (!sale) throw new DomainError("Factura no encontrada", 404)
    if (sale.anulada) return
    if (sale.cerrada) throw new DomainError("La jornada ya está cerrada", 409)
    await assertOpen(tx, sale.id_personal, sale.fecha_negocio.toISOString().slice(0, 10))
    const details = await new sql.Request(tx).input("sale", sql.Int, sale.id_venta).query("SELECT * FROM dbo.Detalle_Venta WHERE id_venta=@sale")
    if (details.recordset.some(row => row.historico_reconstruido || row.unidades_inventario == null) || !sale.id_ruta_snapshot) throw new DomainError("La factura histórica requiere conciliación antes de anularla", 409)
    const payments = await new sql.Request(tx).input("sale", sql.Int, sale.id_venta).query("SELECT 1 n FROM dbo.Credito_Aplicacion a JOIN dbo.Credito_Cargo c ON a.id_cargo=c.id_cargo WHERE c.id_venta=@sale")
    if (payments.recordset[0]) throw new DomainError("La venta tiene pagos aplicados y requiere conciliación", 409)
    for (const row of details.recordset) {
      const restored = await new sql.Request(tx).input("route", sql.Int, sale.id_ruta_snapshot).input("product", sql.Int, row.id_producto).input("units", sql.Decimal(18, 2), row.unidades_inventario).query("UPDATE dbo.Inventario_Ruta SET cantidad=cantidad+@units,fecha_actualizacion=SYSUTCDATETIME() WHERE id_ruta=@route AND id_producto=@product")
      if (restored.rowsAffected[0] !== 1) throw new DomainError("Falta el inventario original; requiere conciliación", 409)
    }
    await new sql.Request(tx).input("id", sql.Int, id).input("sale", sql.Int, sale.id_venta).query("UPDATE dbo.Factura SET anulada=1 WHERE id_factura=@id; UPDATE dbo.Venta SET anulada=1,fecha_actualizacion=SYSUTCDATETIME() WHERE id_venta=@sale; UPDATE dbo.Credito_Cargo SET saldo=0,origen='anulado' WHERE id_venta=@sale")
    if (sale.tipo_pago === "credito") await syncCredit(tx, sale.id_cliente)
    await audit(tx, user.id_personal, "anular_factura", "Factura", id, { motivo: reason })
  })
  return NextResponse.json({ success: true })
}, { roles: ["administrador"] })
