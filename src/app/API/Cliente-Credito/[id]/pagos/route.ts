import { NextResponse } from "next/server"
import { transaction, withApi } from "@/lib/api"
import { cents, DomainError, positiveId, text } from "@/lib/business"
import { payCredit } from "@/lib/finance"
import { notifyPayment } from "@/lib/notifications"
import { requestUser } from "@/lib/server-auth"
export const POST = withApi(async request => {
  const id = positiveId(new URL(request.url).pathname.split("/").at(-2)), body = await request.json(), key = text(body.clave_idempotencia, "Clave del pago", 64)
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(key)) throw new DomainError("Clave del pago inválida")
  const data = await transaction(tx => payCredit(tx, requestUser(request), id, cents(body.monto) / 100, key))
  await notifyPayment(data.id_pago).catch(() => console.error("Notificación pendiente de revisión", { id_pago: data.id_pago }))
  return NextResponse.json({ success: true, data })
})
