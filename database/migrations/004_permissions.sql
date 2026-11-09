SET XACT_ABORT ON;
IF EXISTS(SELECT 1 FROM dbo.Limite_Credito l LEFT JOIN dbo.Personal p ON l.id_personal=p.id_personal WHERE p.id_personal IS NULL OR l.monto_actual<0 OR l.monto_maximo<0 OR l.monto_actual>l.monto_maximo) THROW 51000,'Credit limits require reconciliation',1;
ALTER TABLE dbo.Limite_Credito ADD CONSTRAINT FK_Limite_Personal FOREIGN KEY(id_personal) REFERENCES dbo.Personal(id_personal), CONSTRAINT CK_Limite_Montos CHECK(monto_actual>=0 AND monto_maximo>=monto_actual);
IF DATABASE_PRINCIPAL_ID(N'churritos_app') IS NULL CREATE ROLE [churritos_app];
GRANT SELECT,INSERT,UPDATE,DELETE ON SCHEMA::dbo TO [churritos_app];
-- The runtime may append audit records, but cannot rewrite their history or migrations.
DENY UPDATE,DELETE ON OBJECT::dbo.Auditoria TO [churritos_app];
DENY INSERT,UPDATE,DELETE ON OBJECT::dbo.Schema_Migration TO [churritos_app];
