import { NextResponse } from "next/server"
import sql from "mssql"
import { audit, transaction, withApi } from "./api"
import { cents, DomainError, positiveId, today } from "./business"
import { getConnection } from "./db"
import { requestUser } from "./server-auth"
import { syncCredit } from "./finance"
export const GET = withApi(async request => {
  const user = requestUser(request), params = new URL(request.url).searchParams, pool = await getConnection()
  const query = pool.request().input("today", sql.Date, today()).input("actor", sql.Int, user.id_personal).input("admin", sql.Bit, user.rol === "administrador")
  let where = "WHERE (@admin=1 OR (r.id_personal_asignado=@actor AND r.activa=1))"
  for (const key of ["id_cliente", "id_ruta"]) if (params.has(key)) { where += ` AND c.${key}=@${key}`; query.input(key, sql.Int, positiveId(params.get(key))) }
  if (params.has("activo")) { where += " AND cc.activo=@active"; query.input("active", sql.Bit, params.get("activo") === "true") }
  const result = await query.query(`SELECT cc.*,c.nombre+' '+c.apellido cliente,c.nombre nombre_cliente,c.apellido apellido_cliente,c.telefono,c.id_ruta,r.nombre ruta,
    ISNULL(b.saldo_actual,0) deuda,ISNULL(b.saldo_vencido,0) vencido,b.proximo_vencimiento,b.primero_vencido,
    CASE WHEN b.primero_vencido IS NOT NULL THEN DATEDIFF(day,b.primero_vencido,@today) ELSE 0 END dias_vencido
    FROM dbo.Cliente_Credito cc JOIN dbo.Clientes c ON cc.id_cliente=c.id_cliente LEFT JOIN dbo.Ruta r ON c.id_ruta=r.id_ruta
    OUTER APPLY(SELECT SUM(saldo) saldo_actual,SUM(CASE WHEN vencimiento<@today THEN saldo ELSE 0 END) saldo_vencido,
      MIN(CASE WHEN saldo>0 THEN vencimiento END) proximo_vencimiento,MIN(CASE WHEN saldo>0 AND vencimiento<@today THEN vencimiento END) primero_vencido FROM dbo.Credito_Cargo WHERE id_cliente=c.id_cliente) b ${where} ORDER BY c.nombre,c.apellido`)
  return NextResponse.json({ success: true, data: result.recordset.map(row => ({ ...row, saldo_actual: row.deuda, saldo_vencido: row.vencido })) })
})
export const POST = withApi(async request => {
  const user = requestUser(request), body = await request.json(), client = positiveId(body.id_cliente), limit = cents(body.limite_credito) / 100
  if (Number(body.saldo_actual || 0) || Number(body.saldo_vencido || 0)) throw new DomainError("Las deudas se registran mediante ventas y movimientos")
  const data = await transaction(async tx => {
    const valid = await new sql.Request(tx).input("id", sql.Int, client).query("SELECT tipo_cliente FROM dbo.Clientes WHERE id_cliente=@id AND activo=1")
    if (!valid.recordset[0]?.tipo_cliente?.includes("credito")) throw new DomainError("Cliente no habilitado para crédito")
    const result = await new sql.Request(tx).input("client", sql.Int, client).input("limit", sql.Decimal(18, 2), limit).query("INSERT dbo.Cliente_Credito(id_cliente,limite_credito) OUTPUT INSERTED.* VALUES(@client,@limit)")
    await audit(tx, user.id_personal, "crear_cuenta", "Cliente_Credito", result.recordset[0].id_credito)
    return result.recordset[0]
  })
  return NextResponse.json({ success: true, data }, { status: 201 })
}, { roles: ["administrador"] })
export const PUT = withApi(async request => {
  const user = requestUser(request), body = await request.json(), id = positiveId(body.id_credito)
  if (body.saldo_actual !== undefined || body.saldo_vencido !== undefined) throw new DomainError("Registre un pago; no sobrescriba los saldos")
  const data = await transaction(async tx => {
    const result = await new sql.Request(tx).input("id", sql.Int, id).query("SELECT * FROM dbo.Cliente_Credito WITH(UPDLOCK,HOLDLOCK) WHERE id_credito=@id")
    const old = result.recordset[0]
    if (!old) throw new DomainError("Cuenta no encontrada", 404)
    const current = await syncCredit(tx, old.id_cliente), limit = cents(body.limite_credito ?? current.limite_credito, true) / 100, days = positiveId(body.dias_credito ?? current.dias_credito)
    if (days > 365 || limit < current.saldo_actual) throw new DomainError("Límite o plazo inválido")
    if (body.activo !== undefined && typeof body.activo !== "boolean") throw new DomainError("Estado inválido")
    if (body.activo === false && Number(current.saldo_actual) > 0) throw new DomainError("La cuenta tiene deuda pendiente", 409)
    if (body.tasa_interes !== undefined && Number(body.tasa_interes) !== Number(current.tasa_interes)) throw new DomainError("No se calculan intereses automáticamente; conserve la tasa vigente")
    await new sql.Request(tx).input("id", sql.Int, id).input("limit", sql.Decimal(18, 2), limit).input("days", sql.Int, days).input("active", sql.Bit, body.activo ?? current.activo).query("UPDATE dbo.Cliente_Credito SET limite_credito=@limit,dias_credito=@days,activo=@active WHERE id_credito=@id")
    await audit(tx, user.id_personal, "configurar_cuenta", "Cliente_Credito", id, { limite: limit, dias: days })
    return { ...current, limite_credito: limit, dias_credito: days, activo: body.activo ?? current.activo }
  })
  return NextResponse.json({ success: true, data })
}, { roles: ["administrador"] })
export const DELETE = withApi(async request => {
  const id = positiveId(new URL(request.url).searchParams.get("id")), user = requestUser(request)
  await transaction(async tx => {
    const result = await new sql.Request(tx).input("id", sql.Int, id).query("SELECT id_cliente FROM dbo.Cliente_Credito WITH(UPDLOCK,HOLDLOCK) WHERE id_credito=@id")
    if (!result.recordset[0]) throw new DomainError("Cuenta no encontrada", 404)
    if (Number((await syncCredit(tx, result.recordset[0].id_cliente)).saldo_actual)) throw new DomainError("La cuenta tiene deuda pendiente", 409)
    await new sql.Request(tx).input("id", sql.Int, id).query("UPDATE dbo.Cliente_Credito SET activo=0 WHERE id_credito=@id")
    await audit(tx, user.id_personal, "desactivar_cuenta", "Cliente_Credito", id)
  })
  return NextResponse.json({ success: true })
}, { roles: ["administrador"] })
