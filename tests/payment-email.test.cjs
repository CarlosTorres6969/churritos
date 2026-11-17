const { test } = require('node:test'), assert = require('node:assert/strict')
const nodemailer = require('nodemailer')
const { loadTs } = require('./helpers/load-ts.cjs')
const business = loadTs('src/lib/business.ts')
const template = loadTs('src/lib/payment-email.ts', { './business': business })

test('el correo conserva los datos del cobro, escapa HTML y usa la fecha de Honduras', () => {
  const payment = { id: 42, amount: 1250.5, date: '2026-11-16T03:00:00Z', customer: '<img src=x onerror=alert(1)> & Cliente', seller: 'José <Vendedor>' }
  const { html, text } = template.buildPaymentEmail(payment, template.PAYMENT_LOGO_CID)
  assert.ok(html.includes(business.escapeHtml(payment.customer)))
  assert.ok(html.includes(business.escapeHtml(payment.seller)))
  assert.ok(!html.includes(payment.customer))
  assert.ok(!html.includes(payment.seller))
  assert.match(html, /L\. 1,250\.50/)
  assert.match(html, /15\/11\/2026/)
  assert.match(html, /COBRO-42/)
  assert.ok(html.includes(`src="cid:${template.PAYMENT_LOGO_CID}"`))
  assert.ok(!/<(?:img|link)[^>]+(?:src|href)="https?:/i.test(html))
  assert.ok(text.includes(payment.customer))
  assert.match(text, /Monto recibido: L\. 1,250\.50/)
  assert.match(text, /COBRO-42/)
})

test('el envío genera un mensaje con logo integrado y versión de texto sin conectar a SMTP', async () => {
  const states = []
  let composed, options
  const notifications = loadTs('src/lib/notifications.ts', {
    './payment-email': template,
    './db': { async getConnection() { return { request() { return { input() { return this }, async query(statement) {
      if (statement.includes("estado='enviando'")) return { recordset: [{ id_pago: 42 }] }
      if (statement.startsWith('SELECT')) return { recordset: [{ monto: 1250.5, fecha: '2026-11-16T03:00:00Z', cliente: 'Cliente de ejemplo', vendedor: 'Vendedor de ejemplo' }] }
      states.push(statement)
      return { recordset: [] }
    } } } } } },
    nodemailer: { createTransport() { return { async sendMail(mail) {
      options = mail
      composed = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(mail)
    } } } },
  }, { process: { cwd: () => process.cwd(), env: { EMAIL_ENABLED: 'true', EMAIL_USER: 'fixture@example.com', EMAIL_PASSWORD: 'fixture', EMAIL_RECIPIENTS: 'operations@example.com' } } })
  await notifications.notifyPayment(42)
  assert.ok(composed, 'Se debe componer el correo')
  assert.equal(options.from.name, 'Inversiones Mejía')
  assert.equal(options.to[0], 'operations@example.com')
  assert.equal(options.attachments[0].content.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const mime = composed.message.toString()
  assert.match(mime, /Content-Type: multipart\/alternative/)
  assert.match(mime, /Content-Type: multipart\/related/)
  assert.match(mime, /Content-Type: text\/plain/)
  assert.match(mime, /Content-Type: text\/html/)
  assert.match(mime, /Content-Type: image\/png/)
  assert.ok(mime.includes(`Content-ID: <${template.PAYMENT_LOGO_CID}>`))
  assert.match(mime, /Content-Disposition: inline/)
  assert.ok(states.some(statement => statement.includes("estado='enviado'")))
})
