import "server-only"
import nodemailer from "nodemailer"
import sql from "mssql"
import { getConnection } from "./db"
import { escapeHtml, TIME_ZONE } from "./business"
export async function notifyPayment(id: number) {
  const pool = await getConnection()
  const claimed = await pool.request().input("id", sql.Int, id).query("UPDATE dbo.Notificacion SET estado='enviando',fecha=SYSUTCDATETIME() OUTPUT INSERTED.id_pago WHERE id_pago=@id AND estado IN ('pendiente','error')")
  if (!claimed.recordset[0]) return
  if (process.env.EMAIL_ENABLED !== "true") { await pool.request().input("id", sql.Int, id).query("UPDATE dbo.Notificacion SET estado='omitido' WHERE id_pago=@id"); return }
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD || !process.env.EMAIL_RECIPIENTS) throw new Error("Missing email configuration")
    const result = await pool.request().input("id", sql.Int, id).query("SELECT p.monto,p.fecha,c.nombre+' '+c.apellido cliente,per.nombre+' '+per.apellido vendedor FROM dbo.Credito_Pago p JOIN dbo.Clientes c ON p.id_cliente=c.id_cliente JOIN dbo.Personal per ON p.id_personal=per.id_personal WHERE id_pago=@id")
    const row = result.recordset[0], transport = nodemailer.createTransport({ service: "gmail", connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD } })
    await transport.sendMail({ from: process.env.EMAIL_USER, to: process.env.EMAIL_RECIPIENTS.split(",").map(value => value.trim()), subject: "Pago de crédito registrado", messageId: `<pago-${id}@churritos.local>`, html: `<h2>Pago registrado</h2><p>Cliente: ${escapeHtml(row.cliente)}</p><p>Monto: L. ${Number(row.monto).toFixed(2)}</p><p>Vendedor: ${escapeHtml(row.vendedor)}</p><p>Fecha: ${escapeHtml(new Date(row.fecha).toLocaleString("es-HN", { timeZone: TIME_ZONE }))}</p>` })
    await pool.request().input("id", sql.Int, id).query("UPDATE dbo.Notificacion SET estado='enviado',fecha=SYSUTCDATETIME() WHERE id_pago=@id")
  } catch { await pool.request().input("id", sql.Int, id).query("UPDATE dbo.Notificacion SET estado='error',fecha=SYSUTCDATETIME() WHERE id_pago=@id"); console.error("No se pudo enviar la notificación del pago", { id }) }
}
