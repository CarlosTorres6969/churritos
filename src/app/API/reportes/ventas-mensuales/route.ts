import { NextResponse } from "next/server"
import sql from "mssql"
import { withApi } from "@/lib/api"
import { DomainError, today } from "@/lib/business"
import { getConnection } from "@/lib/db"

export const GET = withApi(async request => {
  const value = new URL(request.url).searchParams.get("anio") ?? today().slice(0, 4)
  if (!/^\d{4}$/.test(value) || Number(value) < 2000 || Number(value) > 9998) throw new DomainError("Año inválido")
  const year = Number(value), pool = await getConnection()
  const result = await pool.request().input("start", sql.Date, `${year}-01-01`).input("end", sql.Date, `${year + 1}-01-01`).query(`
    SELECT p.id_personal,p.nombre+' '+p.apellido vendedor,p.activo FROM dbo.Personal p
    WHERE (p.rol='vendedor' AND p.activo=1) OR EXISTS(SELECT 1 FROM dbo.Venta v WHERE v.id_personal=p.id_personal AND v.fecha_negocio>=@start AND v.fecha_negocio<@end)
    ORDER BY p.nombre,p.apellido;
    SELECT v.id_personal,MONTH(v.fecha_negocio) mes,COUNT(*) ventas,
      SUM(CASE WHEN v.tipo_pago='efectivo' THEN v.total ELSE 0 END) efectivo,
      SUM(CASE WHEN v.tipo_pago='credito' THEN v.total ELSE 0 END) credito
    FROM dbo.Venta v WHERE v.anulada=0 AND v.fecha_negocio>=@start AND v.fecha_negocio<@end
    GROUP BY v.id_personal,MONTH(v.fecha_negocio);`)
  const sets = Array.isArray(result.recordsets) ? result.recordsets : Object.values(result.recordsets)
  return NextResponse.json({ success: true, data: { anio: year, vendedores: sets[0], meses: sets[1] } })
}, { roles: ["administrador"] })
