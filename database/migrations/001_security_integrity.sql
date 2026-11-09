SET XACT_ABORT ON;
IF EXISTS (SELECT 1 FROM dbo.Personal GROUP BY usuario HAVING COUNT(*) > 1) THROW 51000, 'Duplicate staff usernames require reconciliation', 1;
IF EXISTS (SELECT 1 FROM dbo.Producto GROUP BY codigo HAVING COUNT(*) > 1) THROW 51000, 'Duplicate product codes require reconciliation', 1;
IF EXISTS (SELECT 1 FROM dbo.Inventario_Ruta GROUP BY id_ruta,id_producto HAVING COUNT(*) > 1) THROW 51000, 'Duplicate inventory requires reconciliation', 1;
IF EXISTS (SELECT 1 FROM dbo.Cliente_Credito GROUP BY id_cliente HAVING COUNT(*) > 1) THROW 51000, 'Duplicate credit accounts require reconciliation', 1;
IF EXISTS (SELECT 1 FROM dbo.Factura GROUP BY numero_factura HAVING COUNT(*) > 1) THROW 51000, 'Duplicate invoice numbers require reconciliation', 1;
IF EXISTS (SELECT 1 FROM dbo.Factura WHERE ISNULL(anulada,0)=0 GROUP BY id_venta HAVING COUNT(*) > 1) THROW 51000, 'Multiple active invoices require reconciliation', 1;
IF EXISTS (SELECT 1 FROM dbo.Cliente_Credito WHERE saldo_actual < 0 OR saldo_vencido < 0 OR saldo_vencido > saldo_actual OR limite_credito < saldo_actual) THROW 51000, 'Credit balances require reconciliation; overdue is included in current balance', 1;
IF EXISTS (SELECT 1 FROM dbo.Inventario_Ruta WHERE cantidad < 0 OR cantidad*2 <> FLOOR(cantidad*2)) THROW 51000, 'Invalid inventory requires reconciliation', 1;
IF EXISTS (SELECT 1 FROM dbo.Detalle_Venta WHERE cantidad <= 0 OR subtotal < 0) THROW 51000, 'Invalid sale details require reconciliation', 1;
IF EXISTS (SELECT 1 FROM dbo.Venta WHERE total < 0 OR tipo_pago NOT IN ('efectivo','credito')) THROW 51000, 'Invalid sales require reconciliation', 1;
IF (SELECT COUNT(*) FROM dbo.CAI WHERE activo=1) > 1 THROW 51000, 'Multiple active CAIs require reconciliation', 1;
GO
ALTER TABLE dbo.Personal ADD debe_cambiar_contrasena bit NOT NULL CONSTRAINT DF_Personal_Cambiar DEFAULT 1;
ALTER TABLE dbo.Venta ADD fecha_actualizacion datetime2 NULL, clave_idempotencia varchar(64) NULL;
ALTER TABLE dbo.Detalle_Venta ADD tipo_precio varchar(20) NULL, precio_unitario decimal(18,2) NULL,
  unidades_inventario decimal(18,2) NULL, nombre_snapshot nvarchar(100) NULL, descripcion_snapshot nvarchar(255) NULL,
  liquidacion_vendedor decimal(18,4) NULL, liquidacion_empresa decimal(18,4) NULL, unidades_liquidas decimal(18,2) NULL,
  historico_reconstruido bit NOT NULL CONSTRAINT DF_Detalle_Historico DEFAULT 1;
ALTER TABLE dbo.Factura ADD nombre_cliente_snapshot nvarchar(205) NULL, tipo_pago_snapshot varchar(20) NULL,
  cai_snapshot varchar(50) NULL, rango_inicial_snapshot int NULL, rango_final_snapshot int NULL, fecha_limite_snapshot date NULL;
ALTER TABLE dbo.CAI ADD siguiente_numero int NULL;
ALTER TABLE dbo.Cierre_Dia ADD cobros_credito decimal(18,2) NOT NULL CONSTRAINT DF_Cierre_Cobros DEFAULT 0;
GO
UPDATE dbo.Factura SET anulada=0 WHERE anulada IS NULL;
UPDATE dbo.CAI SET siguiente_numero = CASE WHEN ISNULL(n.used,0) >= rango_inicial THEN n.used+1 ELSE rango_inicial END
FROM dbo.CAI c OUTER APPLY (SELECT MAX(TRY_CONVERT(int,RIGHT(f.numero_factura,CHARINDEX('-',REVERSE(f.numero_factura)+'-')-1))) used FROM dbo.Factura f WHERE f.id_cai=c.id_cai) n;
UPDATE d SET nombre_snapshot=p.nombre, descripcion_snapshot=CONVERT(nvarchar(255),p.descripcion), precio_unitario=d.subtotal/NULLIF(d.cantidad,0),
tipo_precio=CASE WHEN d.subtotal/NULLIF(d.cantidad,0)=p.precio_completo THEN 'completo' WHEN d.subtotal/NULLIF(d.cantidad,0)=p.precio_medio THEN 'medio' WHEN d.subtotal/NULLIF(d.cantidad,0)=p.precio_mayorista THEN 'mayorista' WHEN d.subtotal/NULLIF(d.cantidad,0)=p.precio_mayorista2 THEN 'mayorista2' ELSE 'historico' END
FROM dbo.Detalle_Venta d JOIN dbo.Producto p ON p.id_producto=d.id_producto;
UPDATE dbo.Detalle_Venta SET unidades_inventario=CASE WHEN tipo_precio='medio' THEN cantidad*0.5 WHEN tipo_precio<>'historico' THEN cantidad ELSE NULL END;
UPDATE f SET nombre_cliente_snapshot=c.nombre+' '+c.apellido,tipo_pago_snapshot=v.tipo_pago,cai_snapshot=ca.codigo_cai,
rango_inicial_snapshot=ca.rango_inicial,rango_final_snapshot=ca.rango_final,fecha_limite_snapshot=ca.fecha_fin
FROM dbo.Factura f JOIN dbo.Venta v ON f.id_venta=v.id_venta JOIN dbo.Clientes c ON v.id_cliente=c.id_cliente JOIN dbo.CAI ca ON f.id_cai=ca.id_cai;
GO
CREATE TABLE dbo.Auth_Sesion (token_hash char(64) NOT NULL PRIMARY KEY, id_personal int NOT NULL REFERENCES dbo.Personal(id_personal), expira datetime2 NOT NULL, creada datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
CREATE INDEX IX_Auth_Sesion_Usuario ON dbo.Auth_Sesion(id_personal,expira);
CREATE TABLE dbo.Auth_Intento (clave char(64) NOT NULL PRIMARY KEY, inicio datetime2 NOT NULL, intentos int NOT NULL);
CREATE TABLE dbo.Auditoria (id_auditoria bigint IDENTITY PRIMARY KEY, id_personal int NULL, accion varchar(60) NOT NULL, entidad varchar(40) NOT NULL, id_entidad int NULL, fecha datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), datos nvarchar(max) NULL);
CREATE TABLE dbo.Credito_Cargo (id_cargo int IDENTITY PRIMARY KEY, id_cliente int NOT NULL REFERENCES dbo.Clientes(id_cliente), id_venta int NULL REFERENCES dbo.Venta(id_venta), monto decimal(18,2) NOT NULL CHECK(monto>0), saldo decimal(18,2) NOT NULL CHECK(saldo>=0), fecha date NOT NULL, vencimiento date NOT NULL, origen varchar(20) NOT NULL, CHECK(saldo<=monto));
CREATE UNIQUE INDEX UX_Cargo_Venta ON dbo.Credito_Cargo(id_venta) WHERE id_venta IS NOT NULL;
CREATE INDEX IX_Cargo_Cliente ON dbo.Credito_Cargo(id_cliente,vencimiento) INCLUDE(saldo);
CREATE TABLE dbo.Credito_Pago (id_pago int IDENTITY PRIMARY KEY, id_cliente int NOT NULL REFERENCES dbo.Clientes(id_cliente), id_personal int NOT NULL REFERENCES dbo.Personal(id_personal), monto decimal(18,2) NOT NULL CHECK(monto>0), fecha datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), fecha_negocio date NOT NULL, clave_idempotencia varchar(64) NOT NULL UNIQUE);
CREATE TABLE dbo.Credito_Aplicacion (id_pago int NOT NULL REFERENCES dbo.Credito_Pago(id_pago), id_cargo int NOT NULL REFERENCES dbo.Credito_Cargo(id_cargo), monto decimal(18,2) NOT NULL CHECK(monto>0), PRIMARY KEY(id_pago,id_cargo));
CREATE TABLE dbo.Notificacion (id_pago int NOT NULL PRIMARY KEY REFERENCES dbo.Credito_Pago(id_pago), estado varchar(20) NOT NULL DEFAULT 'pendiente', fecha datetime2 NULL);
CREATE TABLE dbo.Factura_Detalle (id_factura int NOT NULL REFERENCES dbo.Factura(id_factura), posicion int NOT NULL, nombre nvarchar(100) NOT NULL, cantidad int NOT NULL CHECK(cantidad>0), precio_unitario decimal(18,2) NOT NULL, total decimal(18,2) NOT NULL, PRIMARY KEY(id_factura,posicion));
GO
DECLARE @hoy date=CONVERT(date,SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time');
INSERT dbo.Credito_Cargo(id_cliente,monto,saldo,fecha,vencimiento,origen)
SELECT id_cliente,saldo_vencido,saldo_vencido,@hoy,DATEADD(day,-1,@hoy),'apertura' FROM dbo.Cliente_Credito WHERE saldo_vencido>0;
INSERT dbo.Credito_Cargo(id_cliente,monto,saldo,fecha,vencimiento,origen)
SELECT id_cliente,saldo_actual-saldo_vencido,saldo_actual-saldo_vencido,@hoy,DATEADD(day,dias_credito,@hoy),'apertura' FROM dbo.Cliente_Credito WHERE saldo_actual>saldo_vencido;
INSERT dbo.Factura_Detalle(id_factura,posicion,nombre,cantidad,precio_unitario,total)
SELECT f.id_factura,ROW_NUMBER() OVER(PARTITION BY f.id_factura ORDER BY d.id_detalle_venta),COALESCE(d.nombre_snapshot,'Producto histórico'),d.cantidad,d.subtotal/d.cantidad,d.subtotal FROM dbo.Factura f JOIN dbo.Detalle_Venta d ON f.id_venta=d.id_venta;
GO
CREATE UNIQUE INDEX UX_Personal_Usuario ON dbo.Personal(usuario);
CREATE UNIQUE INDEX UX_Producto_Codigo ON dbo.Producto(codigo);
CREATE UNIQUE INDEX UX_Inventario_Ruta_Producto ON dbo.Inventario_Ruta(id_ruta,id_producto);
CREATE UNIQUE INDEX UX_Credito_Cliente ON dbo.Cliente_Credito(id_cliente);
CREATE UNIQUE INDEX UX_Factura_Numero ON dbo.Factura(numero_factura);
CREATE UNIQUE INDEX UX_Factura_Venta_Activa ON dbo.Factura(id_venta) WHERE anulada=0;
CREATE UNIQUE INDEX UX_CAI_Activo ON dbo.CAI(activo) WHERE activo=1;
CREATE UNIQUE INDEX UX_Venta_Idempotencia ON dbo.Venta(clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
ALTER TABLE dbo.Inventario_Ruta ADD CONSTRAINT CK_Inventario_Cantidad CHECK(cantidad>=0 AND cantidad*2=FLOOR(cantidad*2));
ALTER TABLE dbo.Detalle_Venta ADD CONSTRAINT CK_Detalle_Valores CHECK(cantidad>0 AND subtotal>=0);
ALTER TABLE dbo.Venta ADD CONSTRAINT CK_Venta_Valores CHECK(total>=0 AND tipo_pago IN ('efectivo','credito'));
ALTER TABLE dbo.Cliente_Credito ADD CONSTRAINT CK_Credito_Saldos CHECK(saldo_actual>=0 AND saldo_vencido>=0 AND saldo_vencido<=saldo_actual AND saldo_actual<=limite_credito);
