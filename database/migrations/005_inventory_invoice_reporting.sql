-- Preserve the issuing seller on new invoices. For existing invoices the available
-- name is the current staff record; the original spelling cannot be reconstructed.
ALTER TABLE dbo.Factura ADD nombre_vendedor_snapshot nvarchar(205) NULL;
GO
UPDATE f SET nombre_vendedor_snapshot=p.nombre+' '+p.apellido
FROM dbo.Factura f JOIN dbo.Venta v ON f.id_venta=v.id_venta
JOIN dbo.Personal p ON v.id_personal=p.id_personal;

CREATE INDEX IX_Auditoria_Entidad_Registro ON dbo.Auditoria(entidad,id_entidad,id_auditoria DESC);
CREATE INDEX IX_Venta_Reporte_Mensual ON dbo.Venta(fecha_negocio,id_personal)
INCLUDE(tipo_pago,total,anulada);
