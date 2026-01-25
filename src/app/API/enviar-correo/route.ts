import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tipo, cliente, monto, vendedor } = body

    if (!tipo || !cliente || !monto) {
      return NextResponse.json(
        { success: false, error: "Faltan datos requeridos" },
        { status: 400 }
      )
    }

    // Configurar el transportador de correo
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    })

    // Emails de destino
    const destinatarios = ["robimejia381@gmail.com", "ulloamartina26@gmail.com"]

    // Construir el mensaje según el tipo
    let asunto = ""
    let mensaje = ""

    if (tipo === "pago_credito") {
      asunto = `💰 Pago de Crédito Recibido - ${cliente}`
      mensaje = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2563eb; margin-bottom: 20px;">✅ Pago de Crédito Registrado</h2>
            
            <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 10px 0;"><strong>Cliente:</strong> ${cliente}</p>
              <p style="margin: 10px 0; font-size: 24px; color: #16a34a;"><strong>Monto Pagado:</strong> L. ${monto}</p>
              <p style="margin: 10px 0;"><strong>Vendedor:</strong> ${vendedor || "No especificado"}</p>
              <p style="margin: 10px 0;"><strong>Fecha:</strong> ${new Date().toLocaleString("es-HN", { timeZone: "America/Tegucigalpa" })}</p>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              Este es un mensaje automático del sistema de gestión de ventas Inversiones Mejia.
            </p>
          </div>
        </div>
      `
    }

    // Enviar el correo
    const info = await transporter.sendMail({
      from: `"Sistema Inversiones Mejia" <${process.env.EMAIL_USER}>`,
      to: destinatarios.join(", "),
      subject: asunto,
      html: mensaje,
    })

    console.log("Correo enviado:", info.messageId)

    return NextResponse.json({
      success: true,
      message: "Notificación enviada correctamente",
      data: {
        destinatarios,
        asunto,
        messageId: info.messageId,
      },
    })
  } catch (error) {
    console.error("Error al enviar correo:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al enviar correo",
      },
      { status: 500 }
    )
  }
}
