import { escapeHtml, TIME_ZONE } from "./business"

export const PAYMENT_LOGO_CID = "inversiones-mejia-logo@churritos.local"

export interface PaymentEmailData {
  id: number
  amount: number
  date: string | Date
  customer: string
  seller: string
}

export function buildPaymentEmail(payment: PaymentEmailData, logoCid?: string) {
  const amount = `L. ${payment.amount.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const date = new Date(payment.date).toLocaleString("es-HN", { timeZone: TIME_ZONE })
  const reference = `COBRO-${payment.id}`
  const rows = [
    ["Cliente", payment.customer],
    ["Registrado por", payment.seller],
    ["Fecha y hora", date],
    ["Referencia", reference],
  ]
  const text = [
    "INVERSIONES MEJÍA",
    "Confirmación de cobro",
    "El abono a crédito se registró correctamente en el sistema.",
    `Monto recibido: ${amount}`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "Horario de Honduras.",
    "Notificación automática para control de cobros.",
  ].join("\n")

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Confirmación de cobro | Inversiones Mejía</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f3f7;color:#182338;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;color:#f1f3f7;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Abono registrado por ${escapeHtml(amount)} · ${escapeHtml(reference)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f3f7" style="font-family:Arial,Helvetica,sans-serif;color:#182338;">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e1e5ed;border-radius:16px;overflow:hidden;">
        <tr><td align="center" bgcolor="#02031b" style="padding:28px 24px;border-bottom:4px solid #d9b569;">
          ${logoCid ? `<img src="cid:${escapeHtml(logoCid)}" width="240" alt="Inversiones Mejía" border="0" style="display:block;width:240px;max-width:100%;height:auto;margin:0 auto;color:#f5d68c;font-family:Georgia,serif;font-size:24px;">` : `<p style="margin:0;color:#f5d68c;font-size:12px;letter-spacing:4px;">INVERSIONES</p><p style="margin:8px 0 0;color:#f5d68c;font-family:Georgia,serif;font-size:38px;letter-spacing:3px;">MEJÍA</p>`}
        </td></tr>
        <tr><td style="padding:32px 24px 24px;">
          <p style="margin:0 0 12px;color:#786032;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">Control de cobros</p>
          <h1 style="margin:0 0 12px;font-size:26px;line-height:34px;font-weight:bold;color:#101a30;">Pago registrado</h1>
          <p style="margin:0;color:#596579;font-size:15px;line-height:24px;">El abono a crédito se registró correctamente en el sistema.</p>
        </td></tr>
        <tr><td style="padding:0 24px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fbf7ed" style="border:1px solid #ead9b3;border-radius:12px;">
            <tr><td align="center" style="padding:24px 12px;">
              <p style="margin:0 0 8px;color:#786032;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Monto recibido</p>
              <p style="margin:0;color:#101a30;font-size:32px;line-height:42px;font-weight:bold;overflow-wrap:anywhere;">${escapeHtml(amount)}</p>
              <p style="margin:8px 0 0;color:#687182;font-size:13px;">Abono a crédito</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 28px;">
          <h2 style="margin:0 0 8px;color:#101a30;font-size:16px;line-height:24px;">Detalle del cobro</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
            ${rows.map(([label, value]) => `<tr><td style="padding:14px 0;border-bottom:1px solid #e9edf2;">
              <p style="margin:0 0 5px;color:#697487;font-size:12px;line-height:18px;">${label}</p>
              <p style="margin:0;color:#182338;font-size:15px;line-height:23px;font-weight:bold;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(value)}</p>
            </td></tr>`).join("\n")}
          </table>
          <p style="margin:14px 0 0;color:#697487;font-size:12px;line-height:18px;">Fecha y hora de Honduras.</p>
        </td></tr>
        <tr><td bgcolor="#f8f9fc" style="padding:22px 24px;border-top:1px solid #e9edf2;">
          <p style="margin:0 0 6px;color:#26344b;font-size:13px;font-weight:bold;">Inversiones Mejía</p>
          <p style="margin:0;color:#697487;font-size:12px;line-height:19px;">Notificación automática para control de cobros.<br>Conserva la referencia para identificar este movimiento.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`

  return { html, text }
}
