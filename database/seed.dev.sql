IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'Development seed is only for ChurritosDev', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.Personal WHERE usuario = @adminUser)
  INSERT INTO dbo.Personal (nombre, apellido, telefono, direccion, email, usuario, contrasena, rol, fecha_contratacion, activo)
  VALUES ('Administrador', 'Pruebas', '0000-0000', 'Entorno local de pruebas', 'admin@example.invalid', @adminUser, @adminPassword, 'administrador', CAST(GETDATE() AS date), 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Personal WHERE usuario = @sellerUser)
  INSERT INTO dbo.Personal (nombre, apellido, telefono, direccion, email, usuario, contrasena, rol, fecha_contratacion, activo)
  VALUES ('Vendedor', 'Pruebas', '0000-0000', 'Entorno local de pruebas', 'vendedor@example.invalid', @sellerUser, @sellerPassword, 'vendedor', CAST(GETDATE() AS date), 1);

DECLARE @sellerId int = (SELECT TOP 1 id_personal FROM dbo.Personal WHERE usuario = @sellerUser ORDER BY id_personal);

IF NOT EXISTS (SELECT 1 FROM dbo.Ruta WHERE nombre = 'Ruta DEV ficticia')
  INSERT INTO dbo.Ruta (nombre, descripcion, id_personal_asignado, activa)
  VALUES ('Ruta DEV ficticia', 'Ruta sin clientes ni direcciones reales', @sellerId, 1);

DECLARE @routeId int = (SELECT TOP 1 id_ruta FROM dbo.Ruta WHERE nombre = 'Ruta DEV ficticia' ORDER BY id_ruta);

INSERT INTO dbo.Producto (codigo, nombre, descripcion, precio_completo, precio_medio, precio_mayorista, precio_mayorista2, activo)
SELECT p.codigo, p.nombre, p.descripcion, p.completo, p.medio, p.mayorista, p.mayorista2, 1
FROM (VALUES
  ('DEV-L4', 'Producto DEV L4', 'L4', 160.00, 80.00, 150.00, 154.00),
  ('DEV-L3', 'Producto DEV L3', 'L3', 120.00, 60.00, 110.00, 113.00),
  ('DEV-G', 'Producto DEV G', 'G', 40.00, 20.00, 38.50, 38.50),
  ('DEV-C', 'Producto DEV C', 'C', 40.00, 20.00, 38.50, 38.50)
) p(codigo, nombre, descripcion, completo, medio, mayorista, mayorista2)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Producto existing WHERE existing.codigo = p.codigo);

INSERT INTO dbo.Inventario_Ruta (id_ruta, id_producto, cantidad)
SELECT @routeId, p.id_producto, 50
FROM dbo.Producto p
WHERE p.codigo IN ('DEV-L4', 'DEV-L3', 'DEV-G', 'DEV-C')
AND NOT EXISTS (SELECT 1 FROM dbo.Inventario_Ruta ir WHERE ir.id_ruta = @routeId AND ir.id_producto = p.id_producto);

INSERT INTO dbo.Clientes (nombre, apellido, telefono, direccion, id_ruta, dia_visita, activo, tipo_cliente)
SELECT 'Cliente DEV ' + kinds.tipo + ' ' + CAST(days.dia AS varchar(1)), 'Ficticio', '0000-0000',
       'Datos ficticios para pruebas locales', @routeId, days.dia, 1, kinds.tipo
FROM (VALUES (1), (2), (3), (4), (5), (6), (7)) days(dia)
CROSS JOIN (VALUES ('normal'), ('credito'), ('mayorista'), ('mayorista-credito')) kinds(tipo)
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Clientes c WHERE c.id_ruta = @routeId
  AND c.nombre = 'Cliente DEV ' + kinds.tipo + ' ' + CAST(days.dia AS varchar(1))
);

INSERT INTO dbo.Cliente_Credito (id_cliente, limite_credito, saldo_actual, saldo_vencido, activo, dias_credito, tasa_interes)
SELECT c.id_cliente, 1000, 0, 0, 1, 30, 0
FROM dbo.Clientes c WHERE c.id_ruta = @routeId AND c.tipo_cliente LIKE '%credito%'
AND NOT EXISTS (SELECT 1 FROM dbo.Cliente_Credito cc WHERE cc.id_cliente = c.id_cliente);

IF NOT EXISTS (SELECT 1 FROM dbo.CAI WHERE codigo_cai = 'CAI-DEV-NO-FISCAL')
  INSERT INTO dbo.CAI (codigo_cai, fecha_inicio, fecha_fin, rango_inicial, rango_final, activo)
  VALUES ('CAI-DEV-NO-FISCAL', CAST(GETDATE() AS date), DATEADD(year, 1, CAST(GETDATE() AS date)), 1, 999999, 1);
