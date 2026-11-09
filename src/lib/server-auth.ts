import "server-only"
import { createHash, randomBytes } from "node:crypto"
import sql from "mssql"
import { NextRequest, NextResponse } from "next/server"
import { getConnection } from "./db"
import { DomainError } from "./business"
import { getDevelopmentAppOrigin } from "./dev-origin"
import type { UserData } from "./auth"

export const SESSION_COOKIE = "churritos_session"
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
const requestUsers = new WeakMap<NextRequest, UserData>()
export function requestUser(request: NextRequest): UserData {
  const user = requestUsers.get(request)
  if (!user) throw new DomainError("Inicie sesión", 401, "UNAUTHENTICATED")
  return user
}
export function normalizeRole(role: string): "administrador" | "vendedor" {
  role = role.trim().toLowerCase()
  if (role === "admin" || role === "administrador") return "administrador"
  if (role === "vendedor") return role
  throw new DomainError("Cuenta sin permisos", 403)
}
export async function authenticate(request: NextRequest): Promise<UserData> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new DomainError("Inicie sesión", 401, "UNAUTHENTICATED")
  const pool = await getConnection()
  const result = await pool.request().input("token", sql.Char(64), digest(token)).query(`
    SELECT p.id_personal,p.nombre,p.apellido,p.usuario,p.rol,p.debe_cambiar_contrasena,
      (SELECT TOP 1 id_ruta FROM dbo.Ruta WHERE id_personal_asignado=p.id_personal AND activa=1 ORDER BY id_ruta) id_ruta
    FROM dbo.Auth_Sesion s JOIN dbo.Personal p ON s.id_personal=p.id_personal
    WHERE s.token_hash=@token AND s.expira>SYSUTCDATETIME() AND p.activo=1`)
  const row = result.recordset[0]
  if (!row) throw new DomainError("La sesión expiró", 401, "UNAUTHENTICATED")
  const user: UserData = { ...row, rol: normalizeRole(row.rol) }
  requestUsers.set(request, user)
  return user
}
function secureCookie(request?: NextRequest): boolean {
  return process.env.NODE_ENV === "production" || request?.headers.get("origin")?.startsWith("https://") === true || request?.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https" || (request !== undefined && new URL(request.url).protocol === "https:")
}
export async function createSession(userId: number, response: NextResponse, request?: NextRequest, verifiedHash?: string) {
  const pool = await getConnection(), token = randomBytes(32).toString("hex")
  const created = await pool.request().input("token", sql.Char(64), digest(token)).input("id", sql.Int, userId).input("hash", sql.VarChar(255), verifiedHash ?? null).query(`
    DELETE dbo.Auth_Sesion WHERE expira<=SYSUTCDATETIME();
    INSERT dbo.Auth_Sesion(token_hash,id_personal,expira)
    OUTPUT INSERTED.id_personal
    SELECT @token,id_personal,DATEADD(hour,8,SYSUTCDATETIME()) FROM dbo.Personal
    WHERE id_personal=@id AND activo=1 AND (@hash IS NULL OR CONVERT(varbinary(255),contrasena)=CONVERT(varbinary(255),@hash));`)
  if (!created.recordset[0]) throw new DomainError("La cuenta cambió; vuelva a iniciar sesión", 401)
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: secureCookie(request), sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 })
}
export async function destroySession(request: NextRequest, response: NextResponse, allForUser?: number) {
  const pool = await getConnection()
  if (allForUser) await pool.request().input("id", sql.Int, allForUser).query("DELETE dbo.Auth_Sesion WHERE id_personal=@id")
  else await pool.request().input("token", sql.Char(64), digest(request.cookies.get(SESSION_COOKIE)?.value || "")).query("DELETE dbo.Auth_Sesion WHERE token_hash=@token")
  clearSessionCookie(response, request)
}
export function clearSessionCookie(response: NextResponse, request?: NextRequest) {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: secureCookie(request), sameSite: "lax", path: "/", maxAge: 0 })
}
export function assertOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  const expected = new URL(request.url)
  const host = request.headers.get("host")
  if (host) expected.host = host
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim()
  if (protocol === "https" || protocol === "http") expected.protocol = protocol + ":"
  const development = process.env.NODE_ENV === "development"
  const configured = development ? getDevelopmentAppOrigin(process.env.DEV_APP_URL) : process.env.APP_URL ? new URL(process.env.APP_URL).origin : undefined
  // Dev Tunnels rewrites a same-site Origin to the local HTTP listener while
  // preserving the public host and HTTPS scheme in the forwarded headers.
  const local = new URL(expected)
  local.protocol = "http:"
  const forwardedDevelopment = development && configured && protocol === "https" &&
    request.headers.get("x-forwarded-host") === new URL(configured).host &&
    ["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname) && origin === local.origin
  const allowed = origin === (configured || expected.origin) || (development && origin === expected.origin) || forwardedDevelopment
  if (!allowed) throw new DomainError("Origen de solicitud no permitido", 403, "ORIGIN_NOT_ALLOWED")
}
export async function loginLimit(request: NextRequest, username: string) {
  const pool = await getConnection()
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local"
  const transaction = new sql.Transaction(pool)
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
  try {
    for (const [value, max] of [[`user:${username.toLowerCase()}`, 20], [`ip:${ip}`, 50]] as const) {
      const result = await new sql.Request(transaction).input("key", sql.Char(64), digest(value)).query(`
        DELETE dbo.Auth_Intento WHERE inicio<DATEADD(minute,-15,SYSUTCDATETIME());
        IF EXISTS(SELECT 1 FROM dbo.Auth_Intento WITH(UPDLOCK,HOLDLOCK) WHERE clave=@key)
          UPDATE dbo.Auth_Intento SET intentos=intentos+1 WHERE clave=@key;
        ELSE INSERT dbo.Auth_Intento(clave,inicio,intentos) VALUES(@key,SYSUTCDATETIME(),1);
        SELECT intentos FROM dbo.Auth_Intento WHERE clave=@key;`)
      if (result.recordset[0].intentos > max) throw new DomainError("Demasiados intentos; espere 15 minutos", 429)
    }
    await transaction.commit()
  } catch (error) { await transaction.rollback(); throw error }
}
