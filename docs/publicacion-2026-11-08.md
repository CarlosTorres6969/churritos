# Publicación — 8 de noviembre de 2026

La versión está activa en https://invesionesmj-red.vercel.app. El código se
integró en `main`; Azure SQL continúa siendo la base real de producción.
`ChurritosDev` y sus credenciales de prueba permanecen separados.

## Base y credenciales

- Se verificaron respaldos retenidos completos, diferenciales y de log en Azure
  antes de migrar. El último log consultado terminó el 9 de noviembre a las
  01:47:23 UTC, todavía 8 de noviembre en Honduras.
- Se pausó el proyecto en Vercel y se verificó HTTP 503 en sus dominios y en el
  despliegue anterior. Se comprobó que no hubiera solicitudes SQL de usuarios
  activas antes de aplicar cambios.
- Se aplicaron 001–005 y la conversión de las cinco contraseñas a scrypt en una
  transacción confirmada. Todas las cuentas migradas exigen cambio de contraseña
  en su siguiente ingreso; se conserva la contraseña anterior para ese ingreso.
- Se compararon antes y después los conteos de ventas, detalles, facturas,
  clientes y personal, y los totales de ventas, existencias, deuda y saldo vencido.
  Esos valores se conservaron.
- La actualización del historial superó inicialmente el tiempo de espera. Los
  intentos fallidos se revirtieron. Se corrigió el uso de `requestTimeout` y se
  completó con un límite de 15 minutos por lote, sin cambiar el plan Basic.
- Se creó una cuenta de ejecución en `churritos_app`, sin `db_owner`, sin permiso
  para editar auditoría y sin permiso para insertar en el historial de migraciones.
- Se rotó la contraseña del operador SQL expuesta, se renovó la caché de
  autenticación y se comprobó que la contraseña anterior ya no conecta.
- Vercel y `.env` usan la cuenta limitada en la misma base Azure. Las variables
  SQL quedan exclusivamente en el ámbito de producción y como sensibles. Los
  `.env*` se excluyen tanto de Git como de las subidas de la CLI a Vercel.
- El acceso administrativo nuevo se conserva únicamente en el archivo privado
  local `.env.operator.production.local`; no se utiliza desde la aplicación.

## Aplicación

La compilación de producción se preparó antes de migrar y se promovió después
de verificar la base. Se retiró la pausa y se comprobó el enlace público:

- Ingreso: HTTP 200.
- Sesión anónima: HTTP 401, sin caché.
- Login desde otro origen: HTTP 403.
- Login con usuario inexistente desde el origen correcto: HTTP 401, comprobando
  la ruta de autenticación y su conexión SQL sin crear una cuenta de prueba.
- HTML y diez recursos JavaScript/CSS cargados por el ingreso: no contienen las
  contraseñas SQL conocidas ni la clave SMTP expuesta.

No se crearon ventas, pagos ni clientes ficticios en producción. Las pruebas
funcionales con operaciones se realizaron en desarrollo: 24 pruebas unitarias,
15 escenarios de integración SQL, TypeScript, lint, compilación y revisión de
las 17 pantallas en escritorio y móvil.

## Pendientes de operación

1. **CAI vigente:** el propietario todavía no dispone de la autorización.
   Se conservaron los datos fiscales existentes. Las nuevas ventas y facturas
   están bloqueadas hasta ingresar un CAI vigente desde administración.
2. **Clave de correo:** tras la publicación inicial con correo deshabilitado, el
   propietario pidió reutilizar la configuración anterior. Se verificó la
   autenticación Gmail sin enviar mensajes y se habilitó producción con
   `EMAIL_ENABLED=true`, la clave anterior y sus dos destinatarios anteriores,
   exclusivamente mediante variables privadas. Desarrollo continúa deshabilitado.
   Queda pendiente sustituir la clave expuesta y revocarla en Google. Los avisos
   omitidos durante la desactivación no se reenvían automáticamente.
3. **Historial e impresión:** conciliar los datos reconstruidos cuando falten
   precios o vencimientos originales y probar la impresora física de operación.

Las copias antiguas de credenciales permanecen en Git. La rotación SQL invalida
su contraseña anterior; retirar la clave SMTP del código o del alojamiento no
la revoca en Google.

## Corrección del detalle de liquidación

Se corrigió la columna de precio unitario para usar el precio guardado con la
venta y separar filas vendidas a distintos precios. Ahora se muestra también la
cantidad vendida registrada, independientemente de las unidades de liquidación.
Los valores faltantes y los totales incompletos aparecen «Por conciliar»; los
ceros registrados se conservan como cero. Al abrir un cierre desde un filtro de
varios vendedores, su total general corresponde únicamente a ese vendedor.

El propietario indicó que desconoce si las tarifas históricas eran las mismas.
Por eso no se recalcularon comisiones antiguas ni se modificaron los cierres o
ventas de producción. Es necesario confirmar las tarifas originales para
conciliar esos importes. Las ventas nuevas conservan sus comisiones guardadas.

Validación: 27 pruebas unitarias y 16 escenarios de integración SQL, TypeScript,
ESLint y compilación aprobados. La tabla se verificó en un navegador aislado con
datos ficticios en escritorio y móvil, sin errores de página ni desbordamiento
horizontal del documento. Los archivos de entorno permanecen ignorados.
La consulta corregida se comprobó también directamente en Azure, solo en lectura,
con precios y cantidades disponibles y totales desconocidos conservados como
pendientes. Se optimizó su plan por filtro para evitar el tiempo de espera
observado en la primera comprobación; la ejecución verificada tardó unos dos segundos.
