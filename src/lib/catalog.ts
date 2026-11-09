import "server-only"
import sql from "mssql"
import { NextRequest, NextResponse } from "next/server"
import { withApi, audit, transaction } from "./api"
import { getConnection } from "./db"
import { requestUser } from "./server-auth"
import { cents, DomainError, pagination, passwordValue, positiveId, text, today, validDate } from "./business"
import { hashPassword } from "./password"

type Entity = "Personal" | "Productos" | "rutas" | "Clientes" | "inventario-ruta" | "LimiteCredito" | "CAI"
const tables: Record<Entity, [string, string]> = { Personal: ["Personal", "id_personal"], Productos: ["Producto", "id_producto"], rutas: ["Ruta", "id_ruta"], Clientes: ["Clientes", "id_cliente"], "inventario-ruta": ["Inventario_Ruta", "id_inventario_ruta"], LimiteCredito: ["Limite_Credito", "id_limite_credito"], CAI: ["CAI", "id_cai"] }
type Values = Record<string, string | number | boolean | null>
function bind(request: sql.Request, values: Values) { for (const [key, value] of Object.entries(values)) request.input(key, value); return request }
const optionalId = (value: unknown) => value == null || value === "" ? null : positiveId(value)
function boolean(value: unknown, defaultValue: boolean): boolean { if (value === undefined) return defaultValue; if (typeof value !== "boolean") throw new DomainError("Estado inválido"); return value }
const amount = (value: unknown) => cents(value, true) / 100
function visitDate(value: unknown) {
  if (!value) return null
  if (typeof value !== "string") throw new DomainError("Fecha inválida")
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/)
  return validDate(m ? `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2]}-${m[1]}` : value)
}

async function get(entity: Entity, req: NextRequest) {
  const user = requestUser(req), params = new URL(req.url).searchParams, pool = await getConnection(), request = pool.request()
  const vendor = user.rol === "vendedor"
  let query = ""
  if (entity === "Personal") query = "SELECT id_personal,nombre,apellido,telefono,direccion,email,fecha_registro,usuario,rol,fecha_contratacion,activo FROM dbo.Personal ORDER BY nombre,apellido"
  if (entity === "Productos") query = `SELECT * FROM dbo.Producto ${!vendor && params.get("inactivos") === "true" ? "" : "WHERE activo=1"} ORDER BY id_producto`
  if (entity === "rutas") {
    query = `SELECT r.*,p.nombre+' '+p.apellido vendedor_asignado,(SELECT COUNT(*) FROM dbo.Clientes c WHERE c.id_ruta=r.id_ruta AND c.activo=1) clientes_asignados FROM dbo.Ruta r LEFT JOIN dbo.Personal p ON r.id_personal_asignado=p.id_personal WHERE 1=1`
    if (vendor || params.get("inactivas") !== "true") query += " AND r.activa=1"
    if (vendor) { query += " AND r.id_personal_asignado=@actor"; request.input("actor", sql.Int, user.id_personal) }
    query += " ORDER BY r.nombre"
  }
  if (entity === "Clientes") {
    query = `SELECT c.*,FORMAT(c.ultima_visita,'dd/MM/yyyy') ultima_visita_formato,r.nombre nombre_ruta,cc.limite_credito,
      ISNULL(b.saldo,0) saldo_actual,ISNULL(b.vencido,0) saldo_vencido FROM dbo.Clientes c LEFT JOIN dbo.Ruta r ON c.id_ruta=r.id_ruta
      LEFT JOIN dbo.Cliente_Credito cc ON c.id_cliente=cc.id_cliente OUTER APPLY(SELECT SUM(saldo) saldo,SUM(CASE WHEN vencimiento<@today THEN saldo ELSE 0 END) vencido FROM dbo.Credito_Cargo WHERE id_cliente=c.id_cliente) b WHERE c.activo=1`
    request.input("today", sql.Date, today())
    if (vendor) { query += " AND r.activa=1 AND r.id_personal_asignado=@actor"; request.input("actor", sql.Int, user.id_personal) }
    for (const [key, column] of [["id_ruta", "c.id_ruta"], ["id_personal", "r.id_personal_asignado"]]) {
      if (params.has(key) && !(vendor && key === "id_personal")) { query += ` AND ${column}=@${key}`; request.input(key, sql.Int, positiveId(params.get(key))) }
    }
    query += " ORDER BY c.nombre,c.apellido"
  }
  if (entity === "inventario-ruta") {
    query = `SELECT ir.*,r.nombre ruta_nombre,p.codigo producto_codigo,p.nombre producto_nombre,p.precio_completo,p.precio_medio,p.precio_mayorista,p.precio_mayorista2,
      TRY_CONVERT(decimal(18,2),JSON_VALUE(a.datos,'$.anterior')) inventario_anterior,
      TRY_CONVERT(decimal(18,2),JSON_VALUE(a.datos,'$.cantidad')) inventario_tras_actualizacion,
      a.fecha fecha_ultimo_ajuste
      FROM dbo.Inventario_Ruta ir JOIN dbo.Ruta r ON ir.id_ruta=r.id_ruta JOIN dbo.Producto p ON ir.id_producto=p.id_producto
      OUTER APPLY(SELECT TOP 1 datos,fecha FROM dbo.Auditoria WHERE entidad='Inventario_Ruta' AND id_entidad=ir.id_inventario_ruta AND accion IN ('crear','actualizar') AND datos IS NOT NULL ORDER BY id_auditoria DESC) a WHERE 1=1`
    if (vendor) { query += " AND r.activa=1 AND p.activo=1 AND r.id_personal_asignado=@actor"; request.input("actor", sql.Int, user.id_personal) }
    for (const key of ["id_ruta", "id_producto"]) if (params.has(key)) { query += ` AND ir.${key}=@${key}`; request.input(key, sql.Int, positiveId(params.get(key))) }
    query += " ORDER BY r.nombre,p.id_producto"
  }
  if (entity === "LimiteCredito") {
    query = "SELECT * FROM dbo.Limite_Credito"
    if (params.has("id_personal")) { query += " WHERE id_personal=@id"; request.input("id", sql.Int, positiveId(params.get("id_personal"))) }
  }
  if (entity === "CAI") {
    if (params.has("id_cai")) {
      const result = await request.input("id", sql.Int, positiveId(params.get("id_cai"))).query("SELECT c.*,(SELECT COUNT(*) FROM dbo.Factura WHERE id_cai=c.id_cai) facturas_emitidas FROM dbo.CAI c WHERE c.id_cai=@id")
      if (!result.recordset[0]) throw new DomainError("CAI no encontrado", 404)
      const row = result.recordset[0]
      return NextResponse.json({ success: true, data: { ...row, estadisticas: { facturas_emitidas: row.facturas_emitidas } } })
    }
    const { page, pageSize, offset } = pagination(params)
    let where = ""
    if (params.has("activo")) { where = " WHERE c.activo=@active"; request.input("active", sql.Bit, params.get("activo") === "true") }
    const result = await request.input("size", sql.Int, pageSize).input("offset", sql.Int, offset).query(`SELECT c.*,COUNT(*) OVER() total_count,(SELECT COUNT(*) FROM dbo.Factura WHERE id_cai=c.id_cai) facturas_emitidas FROM dbo.CAI c${where} ORDER BY c.activo DESC,c.fecha_fin DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`)
    const total = result.recordset[0]?.total_count || 0
    return NextResponse.json({ success: true, data: { items: result.recordset, page, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) } })
  }
  const result = await request.query(query)
  const data = entity === "Clientes" ? result.recordset.map(row => ({ ...row, tipo_cliente: String(row.tipo_cliente || "normal").trim().toLowerCase(), ultima_visita: row.ultima_visita_formato })) : entity === "Personal" ? result.recordset.map(row => ({ ...row, rol: String(row.rol).trim().toLowerCase() === "admin" ? "administrador" : String(row.rol).trim().toLowerCase() })) : result.recordset
  return NextResponse.json(entity === "Personal" ? data : { success: true, data })
}

async function write(entity: Entity, req: NextRequest) {
  const user = requestUser(req), params = new URL(req.url).searchParams, body = req.method === "DELETE" && !req.headers.get("content-type")?.includes("application/json") ? {} : await req.json()
  const [table, idColumn] = tables[entity], updating = req.method === "PUT", deleting = req.method === "DELETE"
  const id = updating || deleting ? positiveId(body[idColumn] ?? params.get("id") ?? params.get(idColumn)) : null
  return transaction(async tx => {
    const old = id ? (await new sql.Request(tx).input("id", sql.Int, id).query(`SELECT * FROM dbo.${table} WITH(UPDLOCK,HOLDLOCK) WHERE ${idColumn}=@id`)).recordset[0] : null
    if (id && !old) throw new DomainError("Registro no encontrado", 404)
    if (entity === "Personal" && id) {
      const role = String(old.rol).toLowerCase()
      if ((deleting || body.activo === false || (body.rol && !["admin", "administrador"].includes(body.rol))) && ["admin", "administrador"].includes(role)) {
        const admins = await new sql.Request(tx).input("id", sql.Int, id).query("SELECT COUNT(*) n FROM dbo.Personal WITH(UPDLOCK,HOLDLOCK) WHERE activo=1 AND rol IN ('admin','administrador') AND id_personal<>@id")
        if (!admins.recordset[0].n) throw new DomainError("Debe conservar al menos un administrador activo", 409)
      }
    }
    if (deleting) {
      if (entity === "Clientes") {
        const debt = await new sql.Request(tx).input("id", sql.Int, id).query("SELECT SUM(saldo) saldo FROM dbo.Credito_Cargo WHERE id_cliente=@id")
        if (Number(debt.recordset[0]?.saldo || 0) > 0) throw new DomainError("El cliente conserva deuda pendiente", 409)
      }
      if (entity === "CAI") {
        const invoices = await new sql.Request(tx).input("id", sql.Int, id).query("SELECT COUNT(*) n FROM dbo.Factura WHERE id_cai=@id")
        if (old.activo || invoices.recordset[0].n) throw new DomainError("Desactive el CAI y conserve los que tienen facturas", 409)
      }
      if (entity === "rutas") {
        const clients = await new sql.Request(tx).input("id", sql.Int, id).query("SELECT COUNT(*) n FROM dbo.Clientes WHERE id_ruta=@id AND activo=1")
        if (clients.recordset[0].n) throw new DomainError("La ruta tiene clientes activos", 409)
      }
      if (entity === "inventario-ruta") {
        const used = await new sql.Request(tx).input("route", sql.Int, old.id_ruta).input("product", sql.Int, old.id_producto).query("SELECT TOP 1 1 n FROM dbo.Detalle_Venta d JOIN dbo.Venta v ON d.id_venta=v.id_venta WHERE d.id_producto=@product AND v.id_ruta_snapshot=@route")
        if (Number(old.cantidad) !== 0 || used.recordset[0]) throw new DomainError("Conserve el inventario con existencias o ventas registradas", 409)
      }
      const inactiveColumn = entity === "rutas" ? "activa" : ["Personal", "Clientes", "Productos"].includes(entity) ? "activo" : null
      await new sql.Request(tx).input("id", sql.Int, id).query(inactiveColumn ? `UPDATE dbo.${table} SET ${inactiveColumn}=0 WHERE ${idColumn}=@id` : `DELETE dbo.${table} WHERE ${idColumn}=@id`)
      if (entity === "Personal") await new sql.Request(tx).input("id", sql.Int, id).query("DELETE dbo.Auth_Sesion WHERE id_personal=@id")
      await audit(tx, user.id_personal, "desactivar", table, id!)
      return NextResponse.json({ success: true })
    }
    const values: Values = {}
    if (entity === "Productos") {
      Object.assign(values, { codigo: text(body.codigo ?? old?.codigo, "Código", 50), nombre: text(body.nombre, "Nombre", 100), descripcion: text(body.descripcion, "Descripción", 255, false) || null, activo: boolean(body.activo, old?.activo ?? true) })
      for (const key of ["precio_completo", "precio_medio", "precio_mayorista", "precio_mayorista2"]) values[key] = amount(body[key])
    }
    if (entity === "Personal") {
      if (!["administrador", "vendedor"].includes(body.rol)) throw new DomainError("Rol inválido")
      Object.assign(values, { nombre: text(body.nombre, "Nombre", 100), apellido: text(body.apellido, "Apellido", 100), usuario: text(body.usuario, "Usuario", 50), rol: body.rol, activo: boolean(body.activo, old?.activo ?? true), fecha_contratacion: validDate(String(body.fecha_contratacion || today()).slice(0, 10)) })
      for (const [key, max] of [["telefono", 20], ["direccion", 200], ["email", 100]] as const) values[key] = text(body[key], key, max, false) || null
      if (!updating || body.contrasena) {
        const password = passwordValue(body.contrasena)
        if (password.length < 12) throw new DomainError("La contraseña debe tener al menos 12 caracteres")
        values.contrasena = await hashPassword(password)
        values.debe_cambiar_contrasena = true
      }
    }
    if (entity === "rutas") {
      Object.assign(values, { nombre: text(body.nombre, "Nombre", 100), descripcion: text(body.descripcion, "Descripción", 255, false) || null, activa: boolean(body.activa, old?.activa ?? true), id_personal_asignado: body.id_personal_asignado === undefined ? old?.id_personal_asignado ?? null : optionalId(body.id_personal_asignado) })
      if (values.id_personal_asignado) {
        const person = await new sql.Request(tx).input("id", sql.Int, values.id_personal_asignado).query("SELECT 1 n FROM dbo.Personal WHERE id_personal=@id AND activo=1 AND rol='vendedor'")
        if (!person.recordset[0]) throw new DomainError("Seleccione un vendedor activo")
      }
    }
    if (entity === "Clientes") {
      if (!["normal", "credito", "mayorista", "mayorista-credito"].includes(body.tipo_cliente)) throw new DomainError("Tipo de cliente inválido")
      Object.assign(values, { nombre: text(body.nombre, "Nombre", 100), apellido: text(body.apellido, "Apellido", 100), direccion: text(body.direccion, "Dirección", 200), telefono: text(body.telefono, "Teléfono", 20, false) || null, email: text(body.email, "Email", 100, false) || null, id_ruta: optionalId(body.id_ruta), dia_visita: optionalId(body.dia_visita), tipo_cliente: body.tipo_cliente, ultima_visita: visitDate(body.ultima_visita), activo: boolean(body.activo, old?.activo ?? true) })
      if (values.dia_visita && Number(values.dia_visita) > 7) throw new DomainError("Día de visita inválido")
      if (values.id_ruta && !(await new sql.Request(tx).input("id", sql.Int, values.id_ruta).query("SELECT 1 n FROM dbo.Ruta WHERE id_ruta=@id AND activa=1")).recordset[0]) throw new DomainError("Ruta no disponible")
      if (updating && (!body.tipo_cliente.includes("credito") || values.activo === false)) {
        const credit = await new sql.Request(tx).input("id", sql.Int, id).query("SELECT SUM(saldo) saldo FROM dbo.Credito_Cargo WHERE id_cliente=@id")
        if (Number(credit.recordset[0]?.saldo || 0) > 0) throw new DomainError("El cliente conserva deuda pendiente", 409)
      }
    }
    if (entity === "inventario-ruta") {
      if (updating && (typeof body.cantidad_esperada !== "number" || body.cantidad_esperada !== Number(old.cantidad))) throw new DomainError("El inventario cambió; actualice la pantalla antes de ajustar", 409)
      const quantity = Number(body.cantidad)
      if (typeof body.cantidad !== "number" || quantity < 0 || !Number.isSafeInteger(quantity * 2)) throw new DomainError("Use unidades completas o medias unidades")
      const operation = body.operacion ?? "ajustar"
      if (!["agregar", "ajustar"].includes(operation)) throw new DomainError("Operación de inventario inválida")
      values.cantidad = updating && operation === "agregar" ? Number(old.cantidad) + quantity : quantity
      if (!Number.isSafeInteger(Number(values.cantidad) * 2)) throw new DomainError("Cantidad de inventario demasiado grande")
      values.fecha_actualizacion = new Date().toISOString()
      if (!updating) {
        values.id_ruta = positiveId(body.id_ruta); values.id_producto = positiveId(body.id_producto)
        const valid = await new sql.Request(tx).input("route", sql.Int, values.id_ruta).input("product", sql.Int, values.id_producto).query("SELECT 1 n FROM dbo.Ruta r CROSS JOIN dbo.Producto p WHERE r.id_ruta=@route AND p.id_producto=@product AND r.activa=1 AND p.activo=1")
        if (!valid.recordset[0]) throw new DomainError("Ruta o producto no disponible")
      }
    }
    if (entity === "LimiteCredito") {
      values.id_personal = positiveId(body.id_personal ?? old?.id_personal)
      values.monto_maximo = amount(body.monto_maximo ?? old?.monto_maximo)
      values.monto_actual = amount(body.monto_actual ?? old?.monto_actual ?? 0)
      if (Number(values.monto_actual) > Number(values.monto_maximo)) throw new DomainError("El monto actual excede el máximo")
    }
    if (entity === "CAI") {
      const issued = id ? (await new sql.Request(tx).input("id", sql.Int, id).query("SELECT COUNT(*) n FROM dbo.Factura WHERE id_cai=@id")).recordset[0].n : 0
      Object.assign(values, { codigo_cai: text(body.codigo_cai ?? old?.codigo_cai, "Código CAI", 50), fecha_inicio: validDate(String(body.fecha_inicio ?? old?.fecha_inicio?.toISOString().slice(0, 10))), fecha_fin: validDate(String(body.fecha_fin ?? old?.fecha_fin?.toISOString().slice(0, 10))), rango_inicial: positiveId(body.rango_inicial ?? old?.rango_inicial), rango_final: positiveId(body.rango_final ?? old?.rango_final), activo: boolean(body.activo, old?.activo ?? false) })
      if (String(values.fecha_inicio) >= String(values.fecha_fin) || Number(values.rango_inicial) >= Number(values.rango_final) || Number(values.rango_final) === 2147483647) throw new DomainError("Fechas o rango del CAI inválidos")
      if (issued && (values.codigo_cai !== old.codigo_cai || values.rango_inicial !== old.rango_inicial || values.rango_final !== old.rango_final || values.fecha_inicio !== old.fecha_inicio.toISOString().slice(0, 10) || values.fecha_fin !== old.fecha_fin.toISOString().slice(0, 10))) throw new DomainError("Conserve la autorización de un CAI que ya tiene facturas", 409)
      if (values.activo) await new sql.Request(tx).input("id", sql.Int, id ?? -1).query("UPDATE dbo.CAI SET activo=0 WHERE activo=1 AND id_cai<>@id")
      if (!updating) values.siguiente_numero = Number(values.rango_inicial)
    }
    const columns = Object.keys(values)
    const statement = updating ? `UPDATE dbo.${table} SET ${columns.map(key => `${key}=@${key}`).join(",")} WHERE ${idColumn}=@id; SELECT @id id;` : `INSERT dbo.${table}(${columns.join(",")}) OUTPUT INSERTED.${idColumn} id VALUES(${columns.map(key => `@${key}`).join(",")});`
    const request = bind(new sql.Request(tx), values)
    if (updating) request.input("id", sql.Int, id)
    const result = await request.query(statement), resultId = result.recordset[0].id
    if (entity === "Clientes" && body.tipo_cliente.includes("credito")) {
      const account = (await new sql.Request(tx).input("id", sql.Int, resultId).query("SELECT saldo_actual,limite_credito FROM dbo.Cliente_Credito WITH(UPDLOCK,HOLDLOCK) WHERE id_cliente=@id")).recordset[0]
      const limit = amount(body.limite_credito ?? account?.limite_credito ?? 0)
      if (limit < Number(account?.saldo_actual || 0)) throw new DomainError("El límite no puede ser menor que la deuda pendiente")
      await new sql.Request(tx).input("id", sql.Int, resultId).input("limit", sql.Decimal(18, 2), limit).query("IF EXISTS(SELECT 1 FROM dbo.Cliente_Credito WHERE id_cliente=@id) UPDATE dbo.Cliente_Credito SET limite_credito=@limit WHERE id_cliente=@id; ELSE INSERT dbo.Cliente_Credito(id_cliente,limite_credito) VALUES(@id,@limit)")
    }
    if (entity === "Personal" && updating && (values.contrasena || !values.activo || values.rol !== old.rol || values.usuario !== old.usuario)) await new sql.Request(tx).input("id", sql.Int, id).query("DELETE dbo.Auth_Sesion WHERE id_personal=@id")
    await audit(tx, user.id_personal, updating ? "actualizar" : "crear", table, resultId, entity === "inventario-ruta" ? { anterior: old?.cantidad ?? 0, cantidad: values.cantidad, variacion: Number(values.cantidad) - Number(old?.cantidad ?? 0), operacion: body.operacion ?? "ajustar", id_ruta: old?.id_ruta ?? values.id_ruta, id_producto: old?.id_producto ?? values.id_producto } : undefined)
    return NextResponse.json({ success: true, data: { [idColumn]: resultId } }, { status: updating ? 200 : 201 })
  })
}
export function catalog(entity: Entity) {
  const admin = { roles: ["administrador"] as ["administrador"] }
  return {
    GET: withApi(req => get(entity, req), ["Personal", "LimiteCredito", "CAI"].includes(entity) ? admin : {}),
    POST: withApi(req => write(entity, req), admin), PUT: withApi(req => write(entity, req), admin), DELETE: withApi(req => write(entity, req), admin),
  }
}
