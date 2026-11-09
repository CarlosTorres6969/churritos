import { NextResponse } from "next/server"
import sql from "mssql"
import { audit, transaction, withApi } from "./api"
import { DomainError, pagination, positiveId, today, validDate } from "./business"
import { getConnection } from "./db"
import { requestUser } from "./server-auth"

async function dayTotals(query: sql.Request) {
  const result = await query.query(`
      SELECT COUNT(*) total_ventas,COUNT(DISTINCT id_cliente) clientes_atendidos,ISNULL(SUM(total),0) monto_total,
      ISNULL(SUM(CASE WHEN tipo_pago='efectivo' THEN 1 ELSE 0 END),0) ventas_efectivo,ISNULL(SUM(CASE WHEN tipo_pago='credito' THEN 1 ELSE 0 END),0) ventas_credito,
      ISNULL(SUM(CASE WHEN tipo_pago='efectivo' THEN total ELSE 0 END),0) efectivo_recaudado,ISNULL(SUM(CASE WHEN tipo_pago='credito' THEN total ELSE 0 END),0) total_credito
      FROM dbo.Venta WHERE id_personal=@actor AND fecha_negocio=@date AND anulada=0;
      SELECT ISNULL(SUM(d.cantidad),0) productos_vendidos FROM dbo.Detalle_Venta d JOIN dbo.Venta v ON d.id_venta=v.id_venta WHERE v.id_personal=@actor AND v.fecha_negocio=@date AND v.anulada=0;
      SELECT ISNULL(SUM(monto),0) cobros_credito FROM dbo.Credito_Pago WHERE id_personal=@actor AND fecha_negocio=@date;`)
    const sets = Array.isArray(result.recordsets) ? result.recordsets : Object.values(result.recordsets)
  return { ...sets[0][0], ...sets[1][0], ...sets[2][0] }
}

export const GET = withApi(async request => {
  const user = requestUser(request), params = new URL(request.url).searchParams, pool = await getConnection(), query = pool.request()
  const vendor = user.rol === "vendedor" ? user.id_personal : params.has("id_vendedor") ? positiveId(params.get("id_vendedor")) : null
  let where = "WHERE 1=1"
  if (vendor) { query.input("vendor", sql.Int, vendor); where += " AND cd.id_personal=@vendor" }
  const date = params.has("fecha") ? validDate(params.get("fecha")) : null
  if (date) { query.input("date", sql.Date, date); where += " AND cd.fecha_cierre=@date" }
  if (params.get("preview") === "true") {
    if (!date || !vendor) throw new DomainError("Indique fecha y vendedor")
    return NextResponse.json({ success: true, data: await dayTotals(pool.request().input("actor", sql.Int, vendor).input("date", sql.Date, date)) })
  }
  const { page, pageSize, offset } = pagination(params)
  const result = await query.input("offset", sql.Int, date ? 0 : offset).input("size", sql.Int, date ? 1000 : pageSize).query(`SELECT cd.*,cd.efectivo_recaudado+cd.cobros_credito total_efectivo_caja,p.nombre+' '+p.apellido nombre_personal,COUNT(*) OVER() total_count FROM dbo.Cierre_Dia cd JOIN dbo.Personal p ON cd.id_personal=p.id_personal ${where} ORDER BY cd.fecha_cierre DESC,cd.id_cierre DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`)
  if (!date) { const total = result.recordset[0]?.total_count || 0; return NextResponse.json({ success: true, data: { cierres: result.recordset, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } }) }
  if (!result.recordset.length) return NextResponse.json({ success: true, data: { cierre: null, cierres: [], liquidacion: [] } })
  const liquidation = await pool.request().input("date", sql.Date, date).input("vendor", sql.Int, vendor).query(`
    SELECT v.id_personal,p.nombre+' '+p.apellido nombre_vendedor,d.descripcion_snapshot descripcion,d.tipo_precio category,
      SUM(d.unidades_liquidas) total_unidades,CASE WHEN MAX(CONVERT(int,d.historico_reconstruido))=1 THEN NULL ELSE SUM(d.liquidacion_vendedor) END liquidacion_vendedor,
      CASE WHEN MAX(CONVERT(int,d.historico_reconstruido))=1 THEN NULL ELSE SUM(d.liquidacion_empresa) END liquidacion_empresa,
      MAX(CONVERT(int,d.historico_reconstruido)) requiere_revision
    FROM dbo.Venta v JOIN dbo.Personal p ON v.id_personal=p.id_personal JOIN dbo.Detalle_Venta d ON d.id_venta=v.id_venta
    WHERE v.fecha_negocio=@date AND v.anulada=0 AND (@vendor IS NULL OR v.id_personal=@vendor)
    GROUP BY v.id_personal,p.nombre,p.apellido,d.descripcion_snapshot,d.tipo_precio ORDER BY v.id_personal,d.descripcion_snapshot`)
  const details = liquidation.recordset.map(row => ({ tipo: "DETALLE", ...row }))
  const totals = [...new Set(details.map(row => row.id_personal))].map(id => {
    const items = details.filter(row => row.id_personal === id), uncertain = items.some(row => row.requiere_revision)
    return { tipo: "TOTAL_VENDEDOR", id_personal: id, nombre_vendedor: items[0].nombre_vendedor, total_unidades_vendedor: items.reduce((sum, row) => sum + Number(row.total_unidades || 0), 0), total_liquidacion_vendedor: uncertain ? null : items.reduce((sum, row) => sum + Number(row.liquidacion_vendedor), 0), total_liquidacion_empresa: uncertain ? null : items.reduce((sum, row) => sum + Number(row.liquidacion_empresa), 0), requiere_revision: uncertain }
  })
  const uncertain = totals.some(row => row.requiere_revision)
  const general = { tipo: "TOTAL_GENERAL", total_unidades_vendedor: totals.reduce((sum, row) => sum + row.total_unidades_vendedor, 0), total_liquidacion_vendedor: uncertain ? null : totals.reduce((sum, row) => sum + Number(row.total_liquidacion_vendedor), 0), total_liquidacion_empresa: uncertain ? null : totals.reduce((sum, row) => sum + Number(row.total_liquidacion_empresa), 0), requiere_revision: uncertain }
  return NextResponse.json({ success: true, data: { cierre: result.recordset[0], cierres: result.recordset, liquidacion: [...details, ...totals, general] } })
})
export const POST = withApi(async request => {
  const user = requestUser(request), body = await request.json(), date = validDate(body.fecha_cierre)
  if (date > today()) throw new DomainError("No puede cerrar una fecha futura")
  if (body.id_personal !== undefined && body.id_personal !== user.id_personal) throw new DomainError("Solo puede cerrar su propia jornada", 403)
  const data = await transaction(async tx => {
    const existing = await new sql.Request(tx).input("actor", sql.Int, user.id_personal).input("date", sql.Date, date).query("SELECT * FROM dbo.Cierre_Dia WITH(UPDLOCK,HOLDLOCK) WHERE id_personal=@actor AND fecha_cierre=@date")
    if (existing.recordset[0]) return existing.recordset[0]
    const totals = await dayTotals(new sql.Request(tx).input("actor", sql.Int, user.id_personal).input("date", sql.Date, date))
    const insert = new sql.Request(tx).input("actor", sql.Int, user.id_personal).input("date", sql.Date, date)
    for (const [key, value] of Object.entries(totals)) insert.input(key, value)
    const created = await insert.query(`INSERT dbo.Cierre_Dia(fecha_cierre,id_personal,total_ventas,ventas_efectivo,ventas_credito,efectivo_recaudado,total_credito,clientes_atendidos,productos_vendidos,monto_total,cobros_credito,cerrado)
      OUTPUT INSERTED.* VALUES(@date,@actor,@total_ventas,@ventas_efectivo,@ventas_credito,@efectivo_recaudado,@total_credito,@clientes_atendidos,@productos_vendidos,@monto_total,@cobros_credito,1);
      UPDATE dbo.Venta SET cerrada=1 WHERE id_personal=@actor AND fecha_negocio=@date;`)
    await audit(tx, user.id_personal, "cerrar_jornada", "Cierre_Dia", created.recordset[0].id_cierre, totals)
    return created.recordset[0]
  })
  return NextResponse.json({ success: true, data })
}, { roles: ["vendedor"] })
