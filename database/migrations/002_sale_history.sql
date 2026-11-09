ALTER TABLE dbo.Venta ADD anulada bit NOT NULL CONSTRAINT DF_Venta_Anulada DEFAULT 0, id_ruta_snapshot int NULL, fecha_negocio date NULL;
GO
UPDATE v SET fecha_negocio=CONVERT(date,v.fecha_venta),id_ruta_snapshot=c.id_ruta FROM dbo.Venta v JOIN dbo.Clientes c ON v.id_cliente=c.id_cliente;
ALTER TABLE dbo.Venta ALTER COLUMN fecha_negocio date NOT NULL;
CREATE INDEX IX_Venta_Negocio_Personal ON dbo.Venta(fecha_negocio,id_personal) INCLUDE(total,tipo_pago,cerrada,anulada);
