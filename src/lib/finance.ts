import "server-only"
import sql from "mssql"
import { audit } from "./api"
import { addDays, cents, dateOnly, DomainError, positiveId, today } from "./business"
import type { UserData } from "./auth"

export async function customer(tx: sql.Transaction, id: number, user: UserData) {
  const result = await new sql.Request(tx).input("id", sql.Int, id).input("actor", sql.Int, user.id_personal).input("admin", sql.Bit, user.rol === "administrador").query(`
    SELECT c.*,r.id_personal_asignado FROM dbo.Clientes c JOIN dbo.Ruta r ON r.id_ruta=c.id_ruta
    WHERE c.id_cliente=@id AND c.activo=1 AND r.activa=1 AND (@admin=1 OR r.id_personal_asignado=@actor)`)
  if (!result.recordset[0]) throw new DomainError("Cliente no disponible en su ruta", 404)
  return { ...result.recordset[0], tipo_cliente: String(result.recordset[0].tipo_cliente || "normal").trim().toLowerCase() }
}
export async function assertOpen(tx: sql.Transaction, actor: number, date = today()) {
  const result = await new sql.Request(tx).input("actor", sql.Int, actor).input("date", sql.Date, date).query("SELECT 1 closed FROM dbo.Cierre_Dia WITH(UPDLOCK,HOLDLOCK) WHERE id_personal=@actor AND fecha_cierre=@date")
  if (result.recordset[0]) throw new DomainError("La jornada ya está cerrada", 409)
}
export async function syncCredit(tx: sql.Transaction, client: number) {
  const account = await new sql.Request(tx).input("client", sql.Int, client).query("SELECT * FROM dbo.Cliente_Credito WITH(UPDLOCK,HOLDLOCK) WHERE id_cliente=@client")
  if (!account.recordset[0]) throw new DomainError("El cliente no tiene una cuenta de crédito", 409)
  const balances = await new sql.Request(tx).input("client", sql.Int, client).input("today", sql.Date, today()).query("SELECT ISNULL(SUM(saldo),0) saldo_actual,ISNULL(SUM(CASE WHEN vencimiento<@today THEN saldo ELSE 0 END),0) saldo_vencido FROM dbo.Credito_Cargo WHERE id_cliente=@client")
  const row = { ...account.recordset[0], ...balances.recordset[0] }
  await new sql.Request(tx).input("client", sql.Int, client).input("balance", sql.Decimal(18, 2), row.saldo_actual).input("overdue", sql.Decimal(18, 2), row.saldo_vencido).query("UPDATE dbo.Cliente_Credito SET saldo_actual=@balance,saldo_vencido=@overdue WHERE id_cliente=@client")
  return row
}
export async function charge(tx: sql.Transaction, client: number, sale: number, total: number) {
  const account = await syncCredit(tx, client)
  if (!account.activo || cents(account.saldo_actual, true) + cents(total) > cents(account.limite_credito, true)) throw new DomainError("La venta excede el crédito disponible", 409)
  await new sql.Request(tx).input("client", sql.Int, client).input("sale", sql.Int, sale).input("amount", sql.Decimal(18, 2), total).input("date", sql.Date, today()).input("due", sql.Date, addDays(today(), account.dias_credito)).query("INSERT dbo.Credito_Cargo(id_cliente,id_venta,monto,saldo,fecha,vencimiento,origen) VALUES(@client,@sale,@amount,@amount,@date,@due,'venta')")
  await syncCredit(tx, client)
}
export async function invoice(tx: sql.Transaction, saleId: number) {
  const existing = await new sql.Request(tx).input("sale", sql.Int, saleId).query("SELECT id_factura,numero_factura,fecha_emision FROM dbo.Factura WITH(UPDLOCK,HOLDLOCK) WHERE id_venta=@sale AND anulada=0")
  if (existing.recordset[0]) return existing.recordset[0]
  const saleResult = await new sql.Request(tx).input("sale", sql.Int, saleId).query("SELECT v.*,c.nombre+' '+c.apellido cliente,p.nombre+' '+p.apellido vendedor FROM dbo.Venta v JOIN dbo.Clientes c ON v.id_cliente=c.id_cliente JOIN dbo.Personal p ON v.id_personal=p.id_personal WHERE id_venta=@sale AND v.anulada=0")
  const sale = saleResult.recordset[0]
  if (!sale) throw new DomainError("Venta no disponible", 404)
  const result = await new sql.Request(tx).input("date", sql.Date, today()).query("SELECT TOP 1 * FROM dbo.CAI WITH(UPDLOCK,HOLDLOCK) WHERE activo=1 AND @date BETWEEN fecha_inicio AND fecha_fin AND siguiente_numero BETWEEN rango_inicial AND rango_final ORDER BY fecha_inicio DESC,id_cai DESC")
  const cai = result.recordset[0]
  if (!cai) throw new DomainError("Configure un CAI vigente con numeración disponible", 409)
  const number = `${today().replace(/-/g, "")}-${String(cai.siguiente_numero).padStart(5, "0")}`
  await new sql.Request(tx).input("id", sql.Int, cai.id_cai).query("UPDATE dbo.CAI SET siguiente_numero=siguiente_numero+1 WHERE id_cai=@id")
  const created = await new sql.Request(tx).input("sale", sql.Int, saleId).input("cai", sql.Int, cai.id_cai).input("number", sql.VarChar(50), number).input("date", sql.Date, today()).input("total", sql.Decimal(18, 2), sale.total).input("client", sql.NVarChar(205), sale.cliente).input("payment", sql.VarChar(20), sale.tipo_pago).input("code", sql.VarChar(50), cai.codigo_cai).input("first", sql.Int, cai.rango_inicial).input("last", sql.Int, cai.rango_final).input("end", sql.Date, dateOnly(cai.fecha_fin)).input("seller", sql.NVarChar(205), sale.vendedor).query(`
    INSERT dbo.Factura(id_venta,id_cai,numero_factura,fecha_emision,monto_total,anulada,nombre_cliente_snapshot,tipo_pago_snapshot,cai_snapshot,rango_inicial_snapshot,rango_final_snapshot,fecha_limite_snapshot,nombre_vendedor_snapshot)
    OUTPUT INSERTED.id_factura,INSERTED.numero_factura,INSERTED.fecha_emision VALUES(@sale,@cai,@number,@date,@total,0,@client,@payment,@code,@first,@last,@end,@seller);`)
  const row = created.recordset[0]
  await new sql.Request(tx).input("invoice", sql.Int, row.id_factura).input("sale", sql.Int, saleId).query("INSERT dbo.Factura_Detalle(id_factura,posicion,nombre,cantidad,precio_unitario,total) SELECT @invoice,ROW_NUMBER() OVER(ORDER BY id_detalle_venta),nombre_snapshot,cantidad,precio_unitario,subtotal FROM dbo.Detalle_Venta WHERE id_venta=@sale")
  return row
}
export async function payCredit(tx: sql.Transaction, user: UserData, creditId: number, amount: number, key: string) {
  const existing = await new sql.Request(tx).input("key", sql.VarChar(64), key).query("SELECT * FROM dbo.Credito_Pago WITH(UPDLOCK,HOLDLOCK) WHERE clave_idempotencia=@key")
  if (existing.recordset[0]) {
    const payment = existing.recordset[0]
    const account = await new sql.Request(tx).input("id", sql.Int, creditId).query("SELECT id_cliente FROM dbo.Cliente_Credito WHERE id_credito=@id")
    if (payment.id_personal !== user.id_personal || account.recordset[0]?.id_cliente !== payment.id_cliente || cents(payment.monto) !== cents(amount)) throw new DomainError("La clave corresponde a otro pago", 409)
    return { id_pago: payment.id_pago, ...await syncCredit(tx, payment.id_cliente) }
  }
  const accountResult = await new sql.Request(tx).input("id", sql.Int, positiveId(creditId)).query("SELECT id_cliente FROM dbo.Cliente_Credito WHERE id_credito=@id")
  if (!accountResult.recordset[0]) throw new DomainError("Cuenta no encontrada", 404)
  const client = accountResult.recordset[0].id_cliente
  await customer(tx, client, user)
  await assertOpen(tx, user.id_personal)
  const account = await syncCredit(tx, client)
  if (cents(amount) > cents(account.saldo_actual, true)) throw new DomainError("El pago excede la deuda pendiente", 409)
  const created = await new sql.Request(tx).input("client", sql.Int, client).input("actor", sql.Int, user.id_personal).input("amount", sql.Decimal(18, 2), amount).input("date", sql.Date, today()).input("key", sql.VarChar(64), key).query("INSERT dbo.Credito_Pago(id_cliente,id_personal,monto,fecha_negocio,clave_idempotencia) OUTPUT INSERTED.id_pago VALUES(@client,@actor,@amount,@date,@key)")
  const paymentId = created.recordset[0].id_pago
  const charges = await new sql.Request(tx).input("client", sql.Int, client).query("SELECT * FROM dbo.Credito_Cargo WITH(UPDLOCK,HOLDLOCK) WHERE id_cliente=@client AND saldo>0 ORDER BY vencimiento,fecha,id_cargo")
  let remaining = cents(amount)
  for (const item of charges.recordset) {
    if (!remaining) break
    const applied = Math.min(remaining, cents(item.saldo))
    await new sql.Request(tx).input("id", sql.Int, item.id_cargo).input("payment", sql.Int, paymentId).input("amount", sql.Decimal(18, 2), applied / 100).query("UPDATE dbo.Credito_Cargo SET saldo=saldo-@amount WHERE id_cargo=@id; INSERT dbo.Credito_Aplicacion(id_pago,id_cargo,monto) VALUES(@payment,@id,@amount)")
    remaining -= applied
  }
  if (remaining) throw new DomainError("La cuenta requiere conciliación", 409)
  await new sql.Request(tx).input("id", sql.Int, paymentId).query("INSERT dbo.Notificacion(id_pago) VALUES(@id)")
  await audit(tx, user.id_personal, "pago_credito", "Credito_Pago", paymentId, { monto: amount, id_cliente: client })
  const balances = await syncCredit(tx, client)
  await new sql.Request(tx).input("client", sql.Int, client).query("UPDATE dbo.Cliente_Credito SET fecha_actualizacion=SYSUTCDATETIME() WHERE id_cliente=@client")
  return { id_pago: paymentId, ...balances }
}
