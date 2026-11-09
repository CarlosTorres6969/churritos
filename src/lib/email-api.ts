import { NextResponse } from "next/server"
import sql from "mssql"
import { withApi } from "./api"
import { DomainError, positiveId } from "./business"
import { getConnection } from "./db"
import { notifyPayment } from "./notifications"
export const POST = withApi(async request => {
  const { id_pago } = await request.json(), id = positiveId(id_pago), pool = await getConnection()
  const result = await pool.request().input("id", sql.Int, id).query("SELECT estado FROM dbo.Notificacion WHERE id_pago=@id")
  if (!result.recordset[0]) throw new DomainError("Pago no encontrado", 404)
  if (result.recordset[0].estado === "enviando") throw new DomainError("La notificación ya está en proceso", 409)
  await notifyPayment(id)
  return NextResponse.json({ success: true })
}, { roles: ["administrador"] })
