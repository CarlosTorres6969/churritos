// Script para probar la API de correo
async function probarAPI() {
  try {
    console.log('Probando API de enviar correo...');
    
    const response = await fetch('http://localhost:3000/API/enviar-correo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tipo: 'pago_credito',
        cliente: 'Juan Pérez (Prueba)',
        monto: '250.00',
        vendedor: 'María López (Prueba)',
      }),
    });

    const result = await response.json();
    console.log('Respuesta:', result);
    
    if (result.success) {
      console.log('✅ API funcionando correctamente');
    } else {
      console.log('❌ Error:', result.error);
    }
  } catch (error) {
    console.error('❌ Error al llamar la API:', error.message);
  }
}

probarAPI();
