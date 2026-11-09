import { NextResponse } from "next/server"
import sql from "mssql"
import { withApi } from "@/lib/api"
import { DomainError, pagination, positiveId } from "@/lib/business"
import { getConnection } from "@/lib/db"
import { requestUser } from "@/lib/server-auth"

export const GET = withApi(async request => {
  const params = new URL(request.url).searchParams, user = requestUser(request)
  const id = positiveId(params.get("id_inventario_ruta")), pool = await getConnection()
  const allowed = await pool.request().input("id", sql.Int, id).input("actor", sql.Int, user.id_personal).input("admin", sql.Bit, user.rol === "administrador").query(`
    SELECT ir.id_inventario_ruta FROM dbo.Inventario_Ruta ir JOIN dbo.Ruta r ON ir.id_ruta=r.id_ruta
    WHERE ir.id_inventario_ruta=@id AND (@admin=1 OR (r.activa=1 AND r.id_personal_asignado=@actor))`)
  if (!allowed.recordset[0]) throw new DomainError("Inventario no encontrado", 404)
  const { page, pageSize, offset } = pagination(params)
  const result = await pool.request().input("id", sql.Int, id).input("offset", sql.Int, offset).input("size", sql.Int, pageSize).query(`
    SELECT a.id_auditoria,a.fecha,p.nombre+' '+p.apellido responsable,
      TRY_CONVERT(decimal(18,2),JSON_VALUE(a.datos,'$.anterior')) anterior,
      TRY_CONVERT(decimal(18,2),JSON_VALUE(a.datos,'$.cantidad')) cantidad,
      JSON_VALUE(a.datos,'$.operacion') operacion,COUNT(*) OVER() total_count
    FROM dbo.Auditoria a LEFT JOIN dbo.Personal p ON a.id_personal=p.id_personal
    WHERE a.entidad='Inventario_Ruta' AND a.id_entidad=@id AND a.accion IN ('crear','actualizar') AND a.datos IS NOT NULL
    ORDER BY a.id_auditoria DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`)
  const total = result.recordset[0]?.total_count || 0
  return NextResponse.json({ success: true, data: result.recordset, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } })
})
