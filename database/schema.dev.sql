-- Development schema only. No production data or credentials are included.

-- Captured before application fixes so development can reproduce the current schema.

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Estado_Visita] (
  [id_estado_visita] int IDENTITY(1,1) NOT NULL,
  [id_venta] int NULL,
  [id_cliente] int NOT NULL,
  [estado] varchar(20) NOT NULL,
  [fecha_visita] datetime NOT NULL CONSTRAINT [DF__Estado_Vi__fecha__02FC7413] DEFAULT (getdate()),
  [observaciones] text NULL
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Inventario_Ruta] (
  [id_inventario_ruta] int IDENTITY(1,1) NOT NULL,
  [id_ruta] int NOT NULL,
  [id_producto] int NOT NULL,
  [cantidad] decimal(18,2) NOT NULL CONSTRAINT [DF__Inventari__canti__05D8E0BE] DEFAULT ((0)),
  [fecha_actualizacion] datetime NULL CONSTRAINT [DF__Inventari__fecha__06CD04F7] DEFAULT (getdate())
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Limite_Credito] (
  [id_limite_credito] int IDENTITY(1,1) NOT NULL,
  [id_personal] int NOT NULL,
  [monto_maximo] decimal(10,2) NOT NULL,
  [monto_actual] decimal(10,2) NOT NULL,
  [fecha_asignacion] date NOT NULL CONSTRAINT [DF__Limite_Cr__fecha__09A971A2] DEFAULT (getdate())
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Cierre_Dia] (
  [id_cierre] int IDENTITY(1,1) NOT NULL,
  [fecha_cierre] date NOT NULL,
  [id_personal] int NOT NULL,
  [total_ventas] int NOT NULL,
  [ventas_efectivo] int NOT NULL,
  [ventas_credito] int NOT NULL,
  [efectivo_recaudado] decimal(18,2) NOT NULL,
  [total_credito] decimal(18,2) NOT NULL,
  [clientes_atendidos] int NOT NULL,
  [productos_vendidos] int NOT NULL,
  [monto_total] decimal(18,2) NOT NULL,
  [fecha_registro] datetime NOT NULL CONSTRAINT [DF__Cierre_Di__fecha__160F4887] DEFAULT (getdate()),
  [cerrado] bit NOT NULL CONSTRAINT [DF__Cierre_Di__cerra__17036CC0] DEFAULT ((0))
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[CAI] (
  [id_cai] int IDENTITY(1,1) NOT NULL,
  [codigo_cai] varchar(50) NOT NULL,
  [fecha_inicio] date NOT NULL,
  [fecha_fin] date NOT NULL,
  [rango_inicial] int NOT NULL,
  [rango_final] int NOT NULL,
  [activo] bit NULL CONSTRAINT [DF__CAI__activo__5CD6CB2B] DEFAULT ((1))
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Personal] (
  [id_personal] int IDENTITY(1,1) NOT NULL,
  [nombre] varchar(100) NOT NULL,
  [apellido] varchar(100) NOT NULL,
  [telefono] varchar(20) NULL,
  [direccion] varchar(200) NULL,
  [email] varchar(100) NULL,
  [fecha_registro] date NOT NULL CONSTRAINT [DF__Personal__fecha___5FB337D6] DEFAULT (getdate()),
  [usuario] varchar(50) NOT NULL,
  [contrasena] varchar(255) NOT NULL,
  [rol] varchar(20) NOT NULL,
  [fecha_contratacion] date NOT NULL,
  [activo] bit NULL CONSTRAINT [DF__Personal__activo__60A75C0F] DEFAULT ((1))
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Ruta] (
  [id_ruta] int IDENTITY(1,1) NOT NULL,
  [nombre] varchar(100) NOT NULL,
  [descripcion] text NULL,
  [id_personal_asignado] int NULL,
  [activa] bit NULL CONSTRAINT [DF__Ruta__activa__6383C8BA] DEFAULT ((1))
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Producto] (
  [id_producto] int IDENTITY(1,1) NOT NULL,
  [codigo] varchar(50) NOT NULL,
  [nombre] varchar(100) NOT NULL,
  [descripcion] text NULL,
  [precio_completo] decimal(10,2) NOT NULL,
  [precio_medio] decimal(10,2) NOT NULL,
  [precio_mayorista] decimal(10,2) NOT NULL,
  [activo] bit NULL CONSTRAINT [DF__Producto__activo__66603565] DEFAULT ((1)),
  [precio_mayorista2] decimal(10,2) NULL
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Clientes] (
  [id_cliente] int IDENTITY(1,1) NOT NULL,
  [nombre] varchar(100) NOT NULL,
  [apellido] varchar(100) NOT NULL,
  [telefono] varchar(20) NULL,
  [direccion] varchar(200) NOT NULL,
  [email] varchar(100) NULL,
  [fecha_registro] date NOT NULL CONSTRAINT [DF__Clientes__fecha___693CA210] DEFAULT (getdate()),
  [id_ruta] int NULL,
  [dia_visita] int NULL,
  [activo] bit NULL CONSTRAINT [DF__Clientes__activo__6A30C649] DEFAULT ((1)),
  [tipo_cliente] varchar(20) NULL CONSTRAINT [DF__Clientes__tipo_c__6B24EA82] DEFAULT ('normal'),
  [ultima_visita] date NULL
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Venta] (
  [id_venta] int IDENTITY(1,1) NOT NULL,
  [id_cliente] int NOT NULL,
  [id_personal] int NOT NULL,
  [fecha_venta] datetime NOT NULL CONSTRAINT [DF__Venta__fecha_ven__6E01572D] DEFAULT (getdate()),
  [total] decimal(10,2) NOT NULL,
  [tipo_pago] varchar(20) NOT NULL,
  [cerrada] bit NULL CONSTRAINT [DF__Venta__cerrada__6EF57B66] DEFAULT ((0)),
  [efectivo_recibido] decimal(10,2) NULL
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Detalle_Venta] (
  [id_detalle_venta] int IDENTITY(1,1) NOT NULL,
  [id_venta] int NOT NULL,
  [id_producto] int NOT NULL,
  [cantidad] int NOT NULL,
  [subtotal] decimal(10,2) NOT NULL
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Cliente_Credito] (
  [id_credito] int IDENTITY(1,1) NOT NULL,
  [id_cliente] int NOT NULL,
  [limite_credito] decimal(18,2) NOT NULL,
  [saldo_actual] decimal(18,2) NOT NULL CONSTRAINT [DF__Cliente_C__saldo__73BA3083] DEFAULT ((0)),
  [saldo_vencido] decimal(18,2) NOT NULL CONSTRAINT [DF__Cliente_C__saldo__74AE54BC] DEFAULT ((0)),
  [fecha_actualizacion] datetime NOT NULL CONSTRAINT [DF__Cliente_C__fecha__75A278F5] DEFAULT (getdate()),
  [activo] bit NOT NULL CONSTRAINT [DF__Cliente_C__activ__76969D2E] DEFAULT ((1)),
  [dias_credito] int NOT NULL CONSTRAINT [DF__Cliente_C__dias___778AC167] DEFAULT ((30)),
  [tasa_interes] decimal(5,2) NOT NULL CONSTRAINT [DF__Cliente_C__tasa___787EE5A0] DEFAULT ((0))
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Factura] (
  [id_factura] int IDENTITY(1,1) NOT NULL,
  [id_venta] int NOT NULL,
  [id_cai] int NOT NULL,
  [numero_factura] varchar(50) NOT NULL,
  [fecha_emision] date NOT NULL CONSTRAINT [DF__Factura__fecha_e__7B5B524B] DEFAULT (getdate()),
  [monto_total] decimal(10,2) NOT NULL,
  [anulada] bit NULL CONSTRAINT [DF__Factura__anulada__7C4F7684] DEFAULT ((0))
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE TABLE [dbo].[Venta_Credito] (
  [id_venta] int IDENTITY(1,1) NOT NULL,
  [id_cliente] int NOT NULL,
  [id_credito] int NOT NULL,
  [fecha_venta] datetime NOT NULL CONSTRAINT [DF__Venta_Cre__fecha__7F2BE32F] DEFAULT (getdate()),
  [fecha_vencimiento] datetime NOT NULL,
  [monto_total] decimal(18,2) NOT NULL,
  [saldo_pendiente] decimal(18,2) NOT NULL,
  [estado] varchar(20) NOT NULL CONSTRAINT [DF__Venta_Cre__estad__00200768] DEFAULT ('Pendiente'),
  [detalles] text NULL
);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Estado_Visita] ADD CONSTRAINT [PK__Estado_V__74F7E661952F86CB] PRIMARY KEY CLUSTERED ([id_estado_visita] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Inventario_Ruta] ADD CONSTRAINT [PK__Inventar__3D3CDB3E30729544] PRIMARY KEY CLUSTERED ([id_inventario_ruta] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_InventarioRuta_Ruta_Producto] ON [dbo].[Inventario_Ruta] ([id_ruta] ASC, [id_producto] ASC) INCLUDE ([cantidad], [fecha_actualizacion]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Limite_Credito] ADD CONSTRAINT [PK__Limite_C__CB3094465B364C5F] PRIMARY KEY CLUSTERED ([id_limite_credito] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Cierre_Dia] ADD CONSTRAINT [PK__Cierre_D__A16CC5BB61975CC6] PRIMARY KEY CLUSTERED ([id_cierre] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE UNIQUE NONCLUSTERED INDEX [UQ_Cierre_Dia_Personal_Fecha] ON [dbo].[Cierre_Dia] ([id_personal] ASC, [fecha_cierre] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_CierreDia_Fecha] ON [dbo].[Cierre_Dia] ([fecha_cierre] DESC) INCLUDE ([id_personal], [total_ventas], [monto_total], [cerrado]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[CAI] ADD CONSTRAINT [PK__CAI__D54686C345D5DD2C] PRIMARY KEY CLUSTERED ([id_cai] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Personal] ADD CONSTRAINT [PK__Personal__418FB808550A16A6] PRIMARY KEY CLUSTERED ([id_personal] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_Personal_Rol_Activo] ON [dbo].[Personal] ([rol] ASC, [activo] ASC) INCLUDE ([nombre], [apellido]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Ruta] ADD CONSTRAINT [PK__Ruta__33C9344F7453F1DD] PRIMARY KEY CLUSTERED ([id_ruta] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_Ruta_Personal_Activa] ON [dbo].[Ruta] ([id_personal_asignado] ASC, [activa] ASC) INCLUDE ([nombre]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Producto] ADD CONSTRAINT [PK__Producto__FF341C0DF25C4F9D] PRIMARY KEY CLUSTERED ([id_producto] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_Producto_Activo_Nombre] ON [dbo].[Producto] ([activo] ASC, [nombre] ASC) INCLUDE ([codigo], [precio_completo], [precio_medio], [precio_mayorista], [precio_mayorista2]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Clientes] ADD CONSTRAINT [PK__Clientes__677F38F530641D2A] PRIMARY KEY CLUSTERED ([id_cliente] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_Clientes_Ruta_Activo] ON [dbo].[Clientes] ([id_ruta] ASC, [activo] ASC) INCLUDE ([nombre], [apellido], [tipo_cliente], [dia_visita], [ultima_visita], [telefono]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Venta] ADD CONSTRAINT [PK__Venta__459533BFF647A9AC] PRIMARY KEY CLUSTERED ([id_venta] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_Venta_FechaVenta] ON [dbo].[Venta] ([fecha_venta] DESC) INCLUDE ([id_personal], [id_cliente], [total], [tipo_pago], [cerrada]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_Venta_Personal_FechaVenta] ON [dbo].[Venta] ([id_personal] ASC, [fecha_venta] DESC) INCLUDE ([id_cliente], [total], [tipo_pago], [cerrada]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_Venta_Cliente_FechaVenta] ON [dbo].[Venta] ([id_cliente] ASC, [fecha_venta] DESC) INCLUDE ([id_personal], [total], [tipo_pago], [cerrada]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Detalle_Venta] ADD CONSTRAINT [PK__Detalle___5B265D47533E7F81] PRIMARY KEY CLUSTERED ([id_detalle_venta] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_DetalleVenta_Venta] ON [dbo].[Detalle_Venta] ([id_venta] ASC) INCLUDE ([id_producto], [cantidad], [subtotal]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Cliente_Credito] ADD CONSTRAINT [PK__Cliente___7A60C0974C5A1C4A] PRIMARY KEY CLUSTERED ([id_credito] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_ClienteCredito_Cliente] ON [dbo].[Cliente_Credito] ([id_cliente] ASC) INCLUDE ([activo], [saldo_actual], [saldo_vencido], [limite_credito], [fecha_actualizacion]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Factura] ADD CONSTRAINT [PK__Factura__6C08ED53CBED9206] PRIMARY KEY CLUSTERED ([id_factura] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_Factura_FechaEmision] ON [dbo].[Factura] ([fecha_emision] DESC) INCLUDE ([id_venta], [id_cai], [numero_factura], [monto_total], [anulada]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

CREATE NONCLUSTERED INDEX [IX_Factura_Venta] ON [dbo].[Factura] ([id_venta] ASC) INCLUDE ([id_cai], [numero_factura], [fecha_emision], [monto_total], [anulada]);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Venta_Credito] ADD CONSTRAINT [PK__Venta_Cr__459533BF36B1538A] PRIMARY KEY CLUSTERED ([id_venta] ASC);

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Cierre_Dia] WITH CHECK ADD CONSTRAINT [CK_Cierre_Dia_Fecha] CHECK ([fecha_cierre]<=CONVERT([date],getdate()));

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Cierre_Dia] WITH CHECK ADD CONSTRAINT [CK_Cierre_Dia_Valores_Positivos] CHECK ([total_ventas]>=(0) AND [ventas_efectivo]>=(0) AND [ventas_credito]>=(0) AND [efectivo_recaudado]>=(0) AND [total_credito]>=(0) AND [clientes_atendidos]>=(0) AND [productos_vendidos]>=(0) AND [monto_total]>=(0));

GO

IF DB_NAME() <> N'ChurritosDev' THROW 51000, 'This schema is only for ChurritosDev', 1;

ALTER TABLE [dbo].[Cierre_Dia] WITH CHECK ADD CONSTRAINT [FK_Cierre_Dia_Personal] FOREIGN KEY ([id_personal]) REFERENCES [dbo].[Personal] ([id_personal]) ON UPDATE CASCADE;
