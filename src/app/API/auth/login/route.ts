import { NextResponse } from "next/server"
import sql from "mssql"
import { withApi } from "@/lib/api"
import { DomainError, text, passwordValue } from "@/lib/business"
import { getConnection } from "@/lib/db"
import { verifyPassword } from "@/lib/password"
import { createSession, loginLimit, normalizeRole } from "@/lib/server-auth"

let active = 0
export const POST = withApi(async request => {
  if (active >= 4) throw new DomainError("Espere un momento e intente nuevamente", 429)
  const body = await request.json(), username = text(body.usuario, "Usuario", 50)
  const password = passwordValue(body.contrasena)
  await loginLimit(request, username)
  if (active >= 4) throw new DomainError("Espere un momento e intente nuevamente", 429)
  active++
  try {
    const pool = await getConnection()
    const result = await pool.request().input("username", sql.VarChar(50), username).query("SELECT id_personal,nombre,apellido,usuario,rol,activo,contrasena,debe_cambiar_contrasena FROM dbo.Personal WHERE usuario=@username")
    const row = result.recordset[0]
    const dummy = "scrypt$32768$8$3$" + "0".repeat(32) + "$" + "0".repeat(128)
    const correct = await verifyPassword(password, row?.contrasena?.startsWith("scrypt$") ? row.contrasena : dummy)
    if (!row?.activo || !correct) throw new DomainError("Credenciales incorrectas o usuario inactivo", 401)
    const user = { id_personal: row.id_personal, nombre: row.nombre, apellido: row.apellido, usuario: row.usuario, rol: normalizeRole(row.rol), debe_cambiar_contrasena: Boolean(row.debe_cambiar_contrasena) }
    const response = NextResponse.json({ success: true, data: { user } })
    await createSession(row.id_personal, response, request, row.contrasena)
    return response
  } finally { active-- }
}, { public: true })
