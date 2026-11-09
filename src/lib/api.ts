import "server-only"
import { NextRequest, NextResponse } from "next/server"
import sql from "mssql"
import { DomainError, pagination } from "./business"
import { authenticate, assertOrigin } from "./server-auth"

type Role = "administrador" | "vendedor"
export function withApi(handler: (request: NextRequest) => Promise<Response>, options: { roles?: Role[]; public?: boolean; allowPasswordChange?: boolean } = {}) {
  return async (request: NextRequest): Promise<Response> => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertOrigin(request)
      if (request.body && !["GET", "HEAD"].includes(request.method)) {
        if (!request.headers.get("content-type")?.includes("application/json")) throw new DomainError("Use JSON para esta solicitud", 415)
        const reader = request.body.getReader(), chunks: Uint8Array[] = []
        let length = 0
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          length += chunk.value.byteLength
          if (length > 1000000) { await reader.cancel(); throw new DomainError("Solicitud demasiado grande", 413) }
          chunks.push(chunk.value)
        }
        const body = new Uint8Array(length)
        let offset = 0
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
        const serialized = new TextDecoder().decode(body)
        const parsed = JSON.parse(serialized)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new DomainError("Envíe un objeto JSON")
        request = new NextRequest(request.url, { method: request.method, headers: request.headers, body: serialized })
      }
      if (!options.public) {
        const user = await authenticate(request)
        if (options.roles && !options.roles.includes(user.rol as Role)) throw new DomainError("No tiene permisos para esta operación", 403)
        if (user.debe_cambiar_contrasena && !options.allowPasswordChange) throw new DomainError("Actualice su contraseña", 403, "PASSWORD_CHANGE_REQUIRED")
      }
      if (request.method === "GET") pagination(new URL(request.url).searchParams)
      if (Number(request.headers.get("content-length") || 0) > 1000000) throw new DomainError("Solicitud demasiado grande", 413)
      const response = await handler(request)
      response.headers.set("Cache-Control", "no-store")
      // Legacy CRUD handlers are gradually replaced; never forward SQL diagnostics.
      if (response.status >= 500) return NextResponse.json({ success: false, error: "No se pudo completar la operación" }, { status: response.status, headers: { "Cache-Control": "no-store" } })
      return response
    } catch (error) {
      const known = error instanceof DomainError
      const duplicate = error instanceof sql.RequestError && [2601, 2627].includes(error.number ?? 0)
      const status = known ? error.status : duplicate ? 409 : error instanceof SyntaxError ? 400 : 500
      if (status >= 500) console.error("Error de API", { path: new URL(request.url).pathname, type: error instanceof Error ? error.name : "unknown" })
      return NextResponse.json({ success: false, error: known ? error.message : duplicate ? "El registro ya existe" : status === 400 ? "JSON inválido" : "No se pudo completar la operación", code: known ? error.code : undefined }, { status, headers: { "Cache-Control": "no-store" } })
    }
  }
}
export async function transaction<T>(work: (transaction: sql.Transaction) => Promise<T>): Promise<T> {
  const { getConnection } = await import("./db")
  for (let attempt = 0; ; attempt++) {
    const tx = new sql.Transaction(await getConnection())
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    try { const result = await work(tx); await tx.commit(); return result }
    catch (error) {
      try { await tx.rollback() } catch {}
      if (error instanceof sql.RequestError && error.number === 1205 && attempt < 2) continue
      throw error
    }
  }
}
export async function audit(tx: sql.Transaction, user: number, action: string, entity: string, id?: number, data?: object) {
  await new sql.Request(tx).input("user", sql.Int, user).input("action", sql.VarChar(60), action).input("entity", sql.VarChar(40), entity)
    .input("id", sql.Int, id ?? null).input("data", sql.NVarChar(sql.MAX), data ? JSON.stringify(data) : null)
    .query("INSERT dbo.Auditoria(id_personal,accion,entidad,id_entidad,datos) VALUES(@user,@action,@entity,@id,@data)")
}
