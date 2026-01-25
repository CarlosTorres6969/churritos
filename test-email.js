// Script de prueba para enviar correo
const nodemailer = require('nodemailer');

async function enviarCorreoPrueba() {
  try {
    console.log('Configurando transportador...');
    
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "robimejia381@gmail.com",
        pass: "skqkcvfnxjolbrng",
      },
    });

    console.log('Enviando correo de prueba...');

    const info = await transporter.sendMail({
      from: '"Sistema Churritos" <robimejia381@gmail.com>',
      to: "robimejia381@gmail.com, ulloamartina26@gmail.com",
      subject: "🧪 Correo de Prueba - Sistema Churritos",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2563eb; margin-bottom: 20px;">✅ Correo de Prueba</h2>
            
            <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 10px 0;">Este es un correo de prueba del sistema de notificaciones.</p>
              <p style="margin: 10px 0;"><strong>Cliente:</strong> Juan Pérez (Ejemplo)</p>
              <p style="margin: 10px 0; font-size: 24px; color: #16a34a;"><strong>Monto Pagado:</strong> L. 500.00</p>
              <p style="margin: 10px 0;"><strong>Vendedor:</strong> María López (Ejemplo)</p>
              <p style="margin: 10px 0;"><strong>Fecha:</strong> ${new Date().toLocaleString("es-HN", { timeZone: "America/Tegucigalpa" })}</p>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              Si recibes este correo, el sistema de notificaciones está funcionando correctamente. ✅
            </p>
          </div>
        </div>
      `,
    });

    console.log('✅ Correo enviado exitosamente!');
    console.log('ID del mensaje:', info.messageId);
    console.log('Destinatarios:', 'robimejia381@gmail.com, ulloamartina26@gmail.com');
    
  } catch (error) {
    console.error('❌ Error al enviar correo:', error.message);
    if (error.code) {
      console.error('Código de error:', error.code);
    }
  }
}

enviarCorreoPrueba();
