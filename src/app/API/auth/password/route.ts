import { NextResponse } from "next/server"
import sql from "mssql"
import { audit, transaction, withApi } from "@/lib/api"
import { getConnection } from "@/lib/db"
import { DomainError, passwordValue } from "@/lib/business"
import { hashPassword, verifyPassword } from "@/lib/password"
import { clearSessionCookie, requestUser } from "@/lib/server-auth"
export const POST = withApi(async request => {
  const user = requestUser(request), body = await request.json()
  const current = passwordValue(body.actual), next = passwordValue(body.nueva)
  if (next.length < 12 || next === current) throw new DomainError("Use una contraseña nueva de al menos 12 caracteres")
  const pool = await getConnection(), result = await pool.request().input("id", sql.Int, user.id_personal).query("SELECT contrasena FROM dbo.Personal WHERE id_personal=@id")
  if (!await verifyPassword(current, result.recordset[0].contrasena)) throw new DomainError("La contraseña actual no es correcta", 400)
  const hash = await hashPassword(next)
  await transaction(async tx => {
    const changed = await new sql.Request(tx).input("id", sql.Int, user.id_personal).input("hash", sql.VarChar(255), hash).input("old", sql.VarChar(255), result.recordset[0].contrasena).query("UPDATE dbo.Personal SET contrasena=@hash,debe_cambiar_contrasena=0 WHERE id_personal=@id AND activo=1 AND CONVERT(varbinary(255),contrasena)=CONVERT(varbinary(255),@old); DELETE dbo.Auth_Sesion WHERE id_personal=@id")
    if (changed.rowsAffected[0] !== 1) throw new DomainError("La cuenta cambió; vuelva a iniciar sesión", 409)
    await audit(tx, user.id_personal, "cambiar_contrasena", "Personal", user.id_personal)
  })
  const response = NextResponse.json({ success: true })
  clearSessionCookie(response, request)
  return response
}, { allowPasswordChange: true })
