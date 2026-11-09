# Aplicar los parches en producción

Este procedimiento está preparado para revisión. **No se ha ejecutado en la base
real.** La base y los usuarios de desarrollo no deben utilizarse en producción.

## Preparar y revisar

1. Validar la versión en desarrollo: pruebas unitarias, integración, lint y build.
   Probar también las pantallas y la impresión en los dispositivos de operación.
2. Rotar el acceso SQL y la contraseña de aplicación de correo expuestos. Preparar
   las variables del alojamiento con credenciales nuevas, privadas y sin prefijo
   `NEXT_PUBLIC_`. No pegar secretos en Git, tickets, terminales compartidas o chat.
3. Crear y comprobar un respaldo o punto de restauración de SQL. Identificar la
   versión de aplicación anterior y quién ejecutará una restauración si falla.
4. Crear `.env.migration.local` **fuera de Git**, solo en la máquina del operador:

```dotenv
MIGRATION_EXPECTED_SERVER=your-server.database.windows.net
MIGRATION_EXPECTED_DATABASE=your_database
MIGRATION_DB_CONNECTION_STRING="Server=tcp:your-server.database.windows.net,1433;Database=your_database;User Id=migration_operator;Password=replace_locally;Encrypt=true;TrustServerCertificate=false;"
```

La cuenta de migración debe poder modificar el esquema y conceder permisos. Es
distinta de la cuenta de ejecución. El script no toma credenciales del `.env`
habitual y verifica que servidor y base coincidan exactamente con los esperados.

```powershell
node scripts/migrate-production.cjs --check
```

Este comando solo lee: muestra nombres y cantidades de problemas, migraciones
pendientes y cuántas contraseñas requieren hash. No imprime datos de clientes ni
contraseñas. Si hay duplicados, referencias rotas, saldos incompatibles, rangos
CAI o valores inválidos, corregirlos con el responsable de operación antes de
continuar. Las contraseñas vacías o mayores a 128 caracteres requieren un reinicio
administrativo previo. No se truncan silenciosamente.

## Qué ocurre con los datos anteriores

- Se conserva el total de cada deuda y su parte vencida. Se crean cargos de
  `origen='apertura'` para trasladar esos saldos al nuevo registro de movimientos;
  no se vuelven a cobrar ventas históricas.
- Cuando no hay vencimientos originales, la parte ya vencida recibe una fecha
  técnica de ayer y el resto, hoy más el plazo configurado. **Esas fechas no son
  el historial real.** Revisar y conciliar los saldos de apertura antes de usar
  sus días vencidos en reportes o gestiones con clientes. No se calculan intereses.
- Las facturas históricas recuperan datos disponibles de la venta y el catálogo
  actual. No es posible recuperar nombres o precios originales que nunca se
  guardaron. Los detalles quedan marcados `historico_reconstruido=1`, se bloquean
  anulaciones automáticas ambiguas y no se inventan comisiones históricas.
- Los cierres anteriores conservan sus totales; no se atribuyen cobros antiguos
  sin registros de pagos. El campo nuevo de cobros empieza en cero para ellos.
- La fecha comercial de ventas antiguas conserva la fecha almacenada en SQL.
  Las ventas nuevas usan `America/Tegucigalpa` y guardan sus datos comerciales.
- La migración normaliza domingo de 0 a 7 y clientes sin categoría a `normal`.
  Confirmar esas asignaciones si el origen utilizaba otra convención.

## Aplicar durante mantenimiento

Detener escrituras y mantener fuera de servicio todas las instancias anteriores
de la aplicación. Volver a ejecutar `--check` y, solo con respaldo y mantenimiento
confirmados por el operador, ejecutar:

```powershell
node scripts/migrate-production.cjs --apply --backup-confirmed --maintenance-confirmed
```

Los indicadores son comprobaciones explícitas del operador; el script no crea
un respaldo ni detiene el sitio por sí mismo. Aplica todas las migraciones
pendientes y los hashes en una transacción. Si falla, revierte esa transacción.
Registra los archivos aplicados en `dbo.Schema_Migration`; no editar una migración
que ya esté registrada. El proceso lee contraseñas antiguas únicamente para
hashearlas, sin imprimirlas. Obliga a cambiarlas en el siguiente ingreso.

Configurar una cuenta SQL de ejecución nueva, sin `db_owner`, privilegios de
servidor ni pertenencia a roles de migración, y asignarla a `churritos_app`:

```sql
-- Sustituir únicamente por el usuario de ejecución creado por el administrador.
ALTER ROLE [churritos_app] ADD MEMBER [your_runtime_user];
```

La creación de login/usuario depende de SQL Server o Azure SQL. Realizarla en la
administración de esa instancia, con la contraseña nueva. Verificar que la cuenta
no conserve permisos heredados de propietario: los DENY del rol no limitan al
propietario de la base. No reutilizar la cuenta de migración como ejecución.

En el alojamiento configurar al menos:

```dotenv
DB_CONNECTION_STRING="Server=tcp:your-server.database.windows.net,1433;Database=your_database;User Id=your_runtime_user;Password=replace_locally;Encrypt=true;TrustServerCertificate=false;"
APP_URL=https://your-sales-domain.example.com
EMAIL_ENABLED=false
# Habilitar correo cuando las credenciales nuevas y destinatarios estén verificados:
# EMAIL_ENABLED=true
# EMAIL_USER=your-mailbox
# EMAIL_PASSWORD=your-new-app-password
# EMAIL_RECIPIENTS=operations@example.com
```

Desplegar esta versión, reiniciar todas las instancias y comprobar que no queda
la versión anterior atendiendo escrituras. Confirmar acceso sin sesión rechazado,
ingreso y cambio obligatorio de contraseña, aislamiento por vendedor, catálogo
mayorista, saldos, CAI y contadores, impresión, cierre y notificaciones. Verificar
que el contenido privado nunca se sirve desde una caché pública. Retirar el
archivo temporal de credenciales de migración después del despliegue.

## Recuperación

Antes de confirmar la transacción, un fallo provoca rollback automático. Después
de confirmarla, no existe una migración descendente automática: volver a la
versión antigua requiere restaurar el respaldo coordinadamente con esa versión.
Mantener detenido el sistema mientras se verifica la restauración. Si ya hubo
operaciones nuevas, conciliarlas antes de restaurar para no perder ventas o pagos.
Nunca borrar el registro de movimientos para forzar un despliegue.
