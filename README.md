# Sistema de ventas — Inversiones Mejía

Next.js, React y SQL Server. Administración de clientes, rutas, inventario, ventas, créditos, facturas y cierres.

## Desarrollo local en Windows

Requisitos: Node.js compatible con las dependencias instaladas, SQL Server Express `SQLEXPRESS` con autenticación mixta y TCP en `127.0.0.1:1433`, y una cuenta Windows administradora de esa instancia para preparar el esquema.

```powershell
npm ci
npm run db:dev
npm run dev -- --hostname 127.0.0.1 --port 3100
```

`db:dev` inicia el servicio si tiene permisos, crea exclusivamente `ChurritosDev`, aplica el esquema y las migraciones, y agrega datos ficticios. Rechaza una base existente sin la marca de desarrollo. Puede repetirse sin borrar datos ni cambiar contraseñas. La aplicación usa `churritos_dev`, un usuario con permisos de datos y sin `db_owner`.

Abre http://127.0.0.1:3100. Los usuarios son `admin.dev` y `vendedor.dev`; las contraseñas aleatorias se guardan en `DEV_ADMIN_PASSWORD` y `DEV_VENDOR_PASSWORD` de `.env.development.local`. No se imprimen ni se suben a Git. La semilla incluye clientes de los cuatro tipos para cada día de la semana, productos con inventario y un CAI ficticio no fiscal.

Si no utilizas el preparador, copia `.env.development.example` a `.env.development.local` y configura una base de pruebas independiente. `DEV_DB_CONNECTION_STRING` es obligatoria al ejecutar `npm run dev`: nunca se usa la conexión real como respaldo. La aplicación comprueba la propiedad SQL `ChurritosDevelopment=1`, que el preparador agrega exclusivamente a la base de pruebas. Una conexión sin esa marca se rechaza. El correo de desarrollo queda deshabilitado.

## Compartir pruebas mediante Ports de VS Code

Con el servidor activo en el puerto `3100`, agrega ese número al panel **Ports**.
Para que otra persona entre sin utilizar tu cuenta de VS Code, cambia la fila a
**Port Visibility → Public** y copia su dirección HTTPS de **Forwarded Address**.
Es el procedimiento de la [guía oficial de VS Code](https://code.visualstudio.com/docs/debugtest/port-forwarding).

Configura esa dirección exacta en el archivo local ignorado por Git:

```dotenv
DEV_APP_URL=https://your-tunnel-3100.use2.devtunnels.ms
```

Reinicia `npm run dev` después de cambiarla. Esta opción permite tanto el túnel
configurado como el acceso local; no admite comodines ni modifica la política de
producción. También contempla la reescritura de Origin que hace Dev Tunnels,
exigiendo el host público configurado y un destino local. Las cookies del enlace
HTTPS usan Secure y HttpOnly.

Tu compañero debe entrar con los usuarios de pruebas del sistema. Comparte solo
esas credenciales, pues el archivo `.env.development.local` incluye el acceso SQL.
Mantén la computadora, VS Code, SQL Server y el servidor de la aplicación activos.
Al terminar, puedes retirar el reenvío desde **Stop Forwarding**. El puerto a
compartir es el de la aplicación (`3100`); la base de datos permanece local.

## Variables privadas

Las plantillas `.env.example` y `.env.development.example` contienen únicamente ejemplos. Conserva tus archivos locales existentes. Los `.env*` reales están ignorados por Git; las variables SQL y de correo nunca deben llevar `NEXT_PUBLIC_`.

En producción, `DB_CONNECTION_STRING` tiene prioridad sobre `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`. Usa cifrado con `Encrypt=true;TrustServerCertificate=false;`. Configura las variables en el alojamiento y reinicia o despliega después de cambiarlas. `APP_URL` fija el origen exacto permitido; si no se configura, las escrituras exigen el mismo origen de la solicitud. Los correos requieren habilitación explícita, credenciales y `EMAIL_RECIPIENTS`.

En este proyecto, **Azure SQL es producción**. Su conexión se conserva en `.env`
o en las variables privadas del alojamiento. Desarrollo utiliza exclusivamente
`DEV_DB_CONNECTION_STRING` de `.env.development.local`, con la base local de
pruebas `ChurritosDev`.

Cuando la auditoría habla de «claves expuestas» se refiere a contraseñas que antes
estaban escritas en archivos de código y siguen apareciendo en versiones de Git.
Durante la publicación del 8 de noviembre se cambió la contraseña SQL expuesta
y se comprobó que la anterior ya no autentica. Vercel y `.env` usan una cuenta
nueva de ejecución sin `db_owner`, en la misma base Azure de producción. El acceso
administrativo nuevo se conserva localmente en `.env.operator.production.local`,
ignorado por Git y excluido de despliegues; no debe usarse como cuenta de la aplicación.
La clave SMTP se retiró inicialmente y luego se reutilizó por indicación del
propietario, tras comprobar la autenticación con Gmail. El correo está habilitado
para los dos destinatarios de la configuración anterior, mediante variables
privadas. Esa clave continúa expuesta en el historial de Git; queda pendiente
su sustitución y revocación en Google.

`.env.development.local` se carga solo en desarrollo. `npm run build` y `npm start` usan el entorno de producción; no iniciar esa modalidad contra la base real antes de aplicar el procedimiento de despliegue.

## Verificación

Con el servidor local abierto en el puerto 3100, desde otra terminal:

```powershell
npm test
npm run test:integration
npm run lint
npm run build
```

Las pruebas de integración exigen servidor local, la base `ChurritosDev` y su marca de desarrollo. Crean y retiran sus registros ficticios. `TEST_BASE_URL` permite cambiar únicamente el puerto de un servidor HTTP local.

`npm run db:migrate:dev` aplica migraciones nuevas en la base local.

## Créditos, inventario y reportes

- **Gestión de Créditos** muestra la ruta y el nombre completo que devuelve la cuenta del cliente.
- **Anular factura** conserva el documento como anulado, revierte la venta y repone las unidades físicas en su ruta original una sola vez. Si era a crédito, elimina el cargo de esa venta. Una jornada cerrada, pagos aplicados o datos históricos sin conciliar bloquean la anulación.
- **Panel de Administración** y **Registro de Ventas** muestran gráficos mensuales por vendedor, con selección de año, efectivo y crédito separados, y una tabla con los doce meses. Utilizan la fecha de negocio y excluyen ventas anuladas. El crédito corresponde a ventas otorgadas en ese mes; los abonos no se suman como ventas en efectivo.
- **Inventario por Ruta → Reponer / ajustar** permite agregar existencias o establecer el total contado. Con 2 unidades, agregar 10 deja 12. La tarjeta conserva 2 como inventario anterior a esa actualización. **Ver historial** muestra fecha, responsable, cantidad anterior, movimiento y resultado. Los vendedores solo pueden consultar el historial de sus rutas activas. Si no existe un ajuste registrado, se muestra “Sin registro”.
- Las facturas imprimen el vendedor desde una copia guardada al emitirlas; cambiar después el nombre del usuario no modifica esa copia. Las facturas anteriores a la migración `005` reciben el nombre disponible al migrar, porque no existe una copia del nombre original.

## Seguridad y publicación

- [Revisión completa y correcciones del 8 de noviembre de 2026](docs/revision-2026-11-08.md).
- [Auditoría, reglas confirmadas y alcance verificado](docs/auditoria.md).
- [Migración, respaldo, rotación de credenciales y despliegue](docs/despliegue.md).
- [Publicación en producción del 8 de noviembre de 2026](docs/publicacion-2026-11-08.md).

La versión está publicada en https://invesionesmj-red.vercel.app con las cinco
migraciones aplicadas en Azure. El primer ingreso exige cambiar la contraseña.
Falta ingresar un CAI vigente para emitir nuevas ventas y facturas; no se creó
una autorización fiscal ficticia. El correo de producción está habilitado para
avisar sobre nuevos abonos de crédito; desarrollo permanece sin envíos.
