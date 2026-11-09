# Auditoría y parches

Aplicación de ventas con datos reales en producción. Los cambios de este trabajo
se aplicaron y probaron únicamente en `ChurritosDev`, con datos ficticios.
No se desplegó la aplicación ni se migró la base real.

## Reglas de negocio confirmadas

- `saldo_actual` es toda la deuda pendiente. `saldo_vencido` es la parte atrasada
  de esa misma deuda; **no se suman**. De L1,000 vencidos, abonar L800 deja
  `saldo_actual=200` y `saldo_vencido=200`.
- Los pagos se aplican primero a los cargos con vencimiento más antiguo. Un
  abono no reinicia las fechas de vencimiento del resto de la deuda.
- `mayorista` y `mayorista-credito` usan exclusivamente `mayorista` o `mayorista2`
  en todos los productos, incluidos G, C, MEGA, CCP, CHF y CF. El servidor decide
  el importe a partir del catálogo; no acepta subtotales del navegador.
- Las medias unidades consumen 0.5 del inventario físico. Los dos precios
  mayoristas consumen unidades completas. Las comisiones se guardan al vender,
  usando el precio seleccionado y las tarifas que existían en el sistema.
- El cierre distingue ventas en efectivo, crédito otorgado y cobros de créditos.
  La caja es efectivo de las ventas más cobros, sin volver a sumar ventas a crédito.

## Hallazgos tratados

| Hallazgo | Corrección |
| --- | --- |
| Credenciales en código y correo de prueba | Variables privadas del servidor, plantillas sin secretos y archivos locales ignorados por Git |
| Desarrollo podía usar la conexión real | `DEV_DB_CONNECTION_STRING` obligatoria, sin respaldo de producción |
| Login comparaba contraseñas en el navegador | Autenticación en servidor, scrypt con sal, sin contraseñas en respuestas |
| APIs públicas e identidad tomada de localStorage | Sesión opaca en cookie HttpOnly, comprobación por petición, roles y acceso por ruta/vendedor |
| Intentos ilimitados y cuentas con contraseña temporal | Límites compartidos en SQL, cambio obligatorio y revocación de sesiones |
| Escrituras desde otros orígenes y entradas sin validar | Comprobación de Origin, JSON limitado a 1 MB y validación de tipos, fechas, cantidades e importes |
| SQL y esquema desalineados | Consultas corregidas y migraciones versionadas, con comprobación previa de inconsistencias |
| Inventario negativo, carreras y peticiones duplicadas | Actualización condicional, transacción serializable, reintento de interbloqueos e idempotencia |
| Saldos de crédito sobrescritos desde el cliente | Cargos, pagos y aplicaciones por movimiento; no se permite editar la deuda absoluta |
| Facturas duplicadas o cambiantes al editar el catálogo | Un solo emisor, numeración reservada bajo bloqueo y datos de factura guardados al emitir |
| Anulaciones sin reversión o modificación de ventas cerradas | Anulación con motivo, conservación de documentos y reversión única; bloqueos por cierre y pagos aplicados |
| Cierres y estadísticas calculados con datos parciales del navegador | Totales del servidor, paginación de ventas/facturas y separación de cobros |
| Correo arbitrario y fallo de correo confundido con fallo de pago | Destinatarios configurados en servidor, registro de notificación por pago y reintento administrativo |
| Contenido sin escapar en impresión y exportación | Escape HTML, CSV con comillas y neutralización de fórmulas |
| Ajustes que podían pisar inventario vendido mientras se editaba | Cantidad esperada obligatoria y rechazo del ajuste desactualizado |
| Pérdida de vendedor al editar una ruta y domingo inconsistente | Asignación conservada/editable y domingo normalizado a 7 |
| Permisos SQL excesivos | Rol de datos sin db_owner; historial de auditoría y migraciones protegido contra cambios del rol de aplicación |
| Dependencias con avisos de seguridad | Actualizadas; la última consulta de npm audit reportó 0 vulnerabilidades conocidas |

## Verificación reproducible

```powershell
npm ci
npm run db:dev
npm run dev -- --hostname 127.0.0.1 --port 3100
# En otra terminal:
npm test
npm run test:integration
npm run lint
npm run build
```

Las pruebas de integración rechazan conexiones a otra base/servidor, exigen la
marca de desarrollo y crean registros con un prefijo aleatorio. Al terminar,
retiran solo esos registros ficticios; conservan la auditoría y no reinician
contadores de facturas. El correo permanece deshabilitado en desarrollo.

Se verifican autenticación, permisos, aislamiento por vendedor, CSRF, precios de
todos los productos mayoristas, medias unidades, idempotencia y competencia por
la última unidad, abonos y sobrepago concurrente, reversión sin CAI, facturas
inmutables, anulaciones, contraseñas, asignación de rutas y cierre autoritativo.

Resultado de la verificación inicial: pasaron 13 pruebas unitarias y 11 escenarios de integración,
además de TypeScript, lint y la compilación. Los mismos escenarios de integración
pasaron con el paquete compilado ejecutado mediante `next start` contra
`ChurritosDev`, con el correo deshabilitado. No se conectó esa ejecución de prueba
a la base real. La comprobación de credenciales no encontró valores expuestos
en los archivos actuales ni en los archivos públicos compilados; el historial
anterior de Git continúa requiriendo rotación de los secretos afectados.

La compatibilidad añadida para el túnel de VS Code se validó con 18 pruebas
unitarias, TypeScript y lint, además de comprobar por el enlace HTTPS real el
ingreso, sesión, resumen y cierre de sesión de administrador y vendedor.
Se reprodujo y corrigió el 403 causado por la reescritura de Origin a localhost;
un origen externo distinto sigue siendo rechazado. El permiso adicional se
limita al túnel configurado en desarrollo y no se aplica en producción.

La regla opcional de ESLint `react-hooks/set-state-in-effect` está desactivada:
este proyecto no habilita React Compiler y utiliza efectos para cargar datos y
comprobar sesiones. Las reglas de hooks y dependencias continúan activas.

En la verificación inicial no se completó la inspección en navegador porque no
se autorizó abrir la sesión aislada. La revisión del 8 de noviembre sí se realizó
con permiso: se comprobaron las 17 pantallas en escritorio y móvil y sus flujos
principales. Los resultados y las correcciones adicionales se detallan en
[la revisión del proyecto](revision-2026-11-08.md).

## Créditos, reportes e inventario — 31 de octubre de 2026

Se corrigió la ruta del cliente en créditos eliminando una combinación de datos
que sobrescribía el nombre de ruta entregado por la API. El inventario ahora
permite reposiciones aditivas y ajustes absolutos, conserva el valor anterior
mediante la auditoría existente y ofrece un historial paginado por registro.
Se conservan los controles de concurrencia y se bloquea eliminar existencias
o registros necesarios para revertir ventas.

Los reportes mensuales son exclusivos de administración, se agrupan en SQL por
vendedor y fecha de negocio y excluyen ventas anuladas. Los meses sin ventas
se muestran con cero. Las facturas nuevas guardan el nombre del vendedor al
emitirse y lo utilizan en la impresión de administrador y vendedor. La migración
005 usa el nombre disponible para las facturas previas, sin atribuirle certeza
histórica.

Se aplicó la migración solamente en `ChurritosDev`. Pasaron 19 pruebas unitarias
y 14 escenarios de integración con SQL Server, además de TypeScript, lint y
la compilación. Se verificó reponer 10 sobre 2, consultar el historial y su
aislamiento por ruta, conservar el vendedor tras renombrar el usuario, límites
de mes y año del reporte y exclusión de anuladas. También se comprobó anular
crédito sin abonos y reponer medias unidades una sola vez. No se realizó una
impresión física ni una inspección visual en navegador.

## Límites y pendientes de operación

1. **Rotar las credenciales de SQL y correo que estuvieron expuestas.** Quitarlas
   del código y usar `.env` no invalida las anteriores ni las borra del historial
   de Git. Actualizar el alojamiento y revocar las antiguas es un paso externo.
2. Aplicar el procedimiento de [despliegue](despliegue.md) con respaldo recuperable,
   revisión de saldos y una ventana de mantenimiento. No ejecutar migraciones
   directamente con el usuario SQL de la aplicación.
3. Comprobar en el alojamiento HTTPS, variables, acceso de red a SQL, copias y
   alertas. No se revisaron sus registros, firewall ni políticas de restauración.
4. Conciliar el historial cuando falten precios, comisiones o vencimientos
   originales. Las filas reconstruidas se identifican y sus liquidaciones
   desconocidas no se presentan como importes ciertos.
5. Revisar notificaciones en estado `error` o `enviando`. Un envío SMTP incierto
   necesita comprobación antes de reintentarlo; no se promete entrega exactamente
   una vez. No se configuró un servicio externo de reintentos automáticos.

Este documento describe el alcance verificado; no afirma ausencia absoluta de
vulnerabilidades ni sustituye una evaluación del entorno de producción.
