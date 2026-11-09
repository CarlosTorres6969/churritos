import { NextResponse } from "next/server"
import sql from "mssql"
import { withApi } from "@/lib/api"
import { today } from "@/lib/business"
import { getConnection } from "@/lib/db"
import { requestUser } from "@/lib/server-auth"
export const GET = withApi(async request => {
  const user = requestUser(request), pool = await getConnection()
  const result = await pool.request().input("actor", sql.Int, user.id_personal).input("admin", sql.Bit, user.rol === "administrador").input("today", sql.Date, today()).query(`
    SELECT COUNT(*) ventas_historicas,COUNT(DISTINCT id_cliente) clientes_historicos,ISNULL(SUM(total),0) monto_historico,
      ISNULL(SUM(CASE WHEN fecha_negocio=@today THEN 1 ELSE 0 END),0) ventas_hoy,
      ISNULL(SUM(CASE WHEN fecha_negocio=@today THEN total ELSE 0 END),0) monto_hoy,
      ISNULL(SUM(CASE WHEN tipo_pago='efectivo' THEN total ELSE 0 END),0) efectivo_historico,
      ISNULL(SUM(CASE WHEN tipo_pago='credito' THEN total ELSE 0 END),0) credito_historico
      FROM dbo.Venta WHERE anulada=0 AND (@admin=1 OR id_personal=@actor);
    SELECT COUNT(*) clientes_activos FROM dbo.Clientes c LEFT JOIN dbo.Ruta r ON c.id_ruta=r.id_ruta WHERE c.activo=1 AND (@admin=1 OR (r.id_personal_asignado=@actor AND r.activa=1));
    SELECT COUNT(*) productos_activos FROM dbo.Producto p WHERE p.activo=1 AND (@admin=1 OR EXISTS(SELECT 1 FROM dbo.Inventario_Ruta ir JOIN dbo.Ruta r ON ir.id_ruta=r.id_ruta WHERE ir.id_producto=p.id_producto AND r.id_personal_asignado=@actor AND r.activa=1));
    SELECT COUNT(*) creditos_pendientes FROM dbo.Cliente_Credito cc JOIN dbo.Clientes c ON cc.id_cliente=c.id_cliente LEFT JOIN dbo.Ruta r ON c.id_ruta=r.id_ruta WHERE (@admin=1 OR r.id_personal_asignado=@actor) AND EXISTS(SELECT 1 FROM dbo.Credito_Cargo cg WHERE cg.id_cliente=cc.id_cliente AND cg.saldo>0);
    SELECT COUNT(*) total_facturas,ISNULL(SUM(CASE WHEN f.anulada=0 THEN f.monto_total ELSE 0 END),0) total_facturado,
      ISNULL(SUM(CASE WHEN f.anulada=1 THEN 1 ELSE 0 END),0) facturas_anuladas,
      ISNULL(SUM(CASE WHEN f.fecha_emision=@today AND f.anulada=0 THEN 1 ELSE 0 END),0) facturas_hoy FROM dbo.Factura f JOIN dbo.Venta v ON f.id_venta=v.id_venta WHERE (@admin=1 OR v.id_personal=@actor);
    SELECT COUNT(*) vendedores_activos FROM dbo.Personal WHERE activo=1 AND rol='vendedor' AND @admin=1;
    SELECT COUNT(*) rutas_activas FROM dbo.Ruta WHERE activa=1 AND (@admin=1 OR id_personal_asignado=@actor);
    SELECT COUNT(*) cierres_pendientes FROM dbo.Personal p WHERE activo=1 AND rol='vendedor' AND (@admin=1 OR id_personal=@actor) AND NOT EXISTS(SELECT 1 FROM dbo.Cierre_Dia cd WHERE cd.id_personal=p.id_personal AND cd.fecha_cierre=@today);
    SELECT ISNULL(SUM(d.cantidad),0) productos_historicos FROM dbo.Detalle_Venta d JOIN dbo.Venta v ON d.id_venta=v.id_venta WHERE v.anulada=0 AND (@admin=1 OR v.id_personal=@actor);
    SELECT TOP 5 cd.*,p.nombre+' '+p.apellido nombre_personal FROM dbo.Cierre_Dia cd JOIN dbo.Personal p ON cd.id_personal=p.id_personal WHERE (@admin=1 OR cd.id_personal=@actor) ORDER BY cd.fecha_cierre DESC,cd.id_cierre DESC;
    SELECT p.id_personal,p.nombre+' '+p.apellido vendedor,COUNT(*) Ventas_dia,COUNT(DISTINCT v.id_cliente) clientes_atendidos,
      SUM(CASE WHEN v.tipo_pago='efectivo' THEN v.total ELSE 0 END) efectivo_recaudado,
      SUM(CASE WHEN v.tipo_pago='credito' THEN v.total ELSE 0 END) credito_otorgado,SUM(v.total) total_vendido
      FROM dbo.Venta v JOIN dbo.Personal p ON v.id_personal=p.id_personal WHERE v.anulada=0 AND @admin=1 GROUP BY p.id_personal,p.nombre,p.apellido ORDER BY p.nombre,p.apellido;`)
  const sets = Array.isArray(result.recordsets) ? result.recordsets : Object.values(result.recordsets)
  const totals = Object.assign({}, ...sets.slice(0, 9).map(set => set[0]))
  return NextResponse.json({ success: true, data: { ...totals, cierres_recientes: sets[9], ventas_por_vendedor: sets[10] } })
})
