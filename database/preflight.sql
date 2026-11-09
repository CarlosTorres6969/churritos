-- Read-only. Counts problems in the original schema; does not print customer data.
SELECT 'usuarios_duplicados' problema, COUNT(*) cantidad FROM (SELECT usuario FROM dbo.Personal GROUP BY usuario HAVING COUNT(*)>1) d
UNION ALL SELECT 'codigos_duplicados',COUNT(*) FROM (SELECT codigo FROM dbo.Producto GROUP BY codigo HAVING COUNT(*)>1) d
UNION ALL SELECT 'inventarios_duplicados',COUNT(*) FROM (SELECT id_ruta,id_producto FROM dbo.Inventario_Ruta GROUP BY id_ruta,id_producto HAVING COUNT(*)>1) d
UNION ALL SELECT 'cuentas_duplicadas',COUNT(*) FROM (SELECT id_cliente FROM dbo.Cliente_Credito GROUP BY id_cliente HAVING COUNT(*)>1) d
UNION ALL SELECT 'numeros_factura_duplicados',COUNT(*) FROM (SELECT numero_factura FROM dbo.Factura GROUP BY numero_factura HAVING COUNT(*)>1) d
UNION ALL SELECT 'facturas_activas_duplicadas',COUNT(*) FROM (SELECT id_venta FROM dbo.Factura WHERE ISNULL(anulada,0)=0 GROUP BY id_venta HAVING COUNT(*)>1) d
UNION ALL SELECT 'inventarios_invalidos',COUNT(*) FROM dbo.Inventario_Ruta WHERE cantidad<0 OR cantidad*2<>FLOOR(cantidad*2)
UNION ALL SELECT 'saldos_invalidos',COUNT(*) FROM dbo.Cliente_Credito WHERE saldo_actual<0 OR saldo_vencido<0 OR saldo_vencido>saldo_actual OR limite_credito<saldo_actual
UNION ALL SELECT 'plazos_invalidos',COUNT(*) FROM dbo.Cliente_Credito WHERE dias_credito NOT BETWEEN 1 AND 365 OR tasa_interes<0
UNION ALL SELECT 'ventas_invalidas',COUNT(*) FROM dbo.Venta WHERE total<0 OR tipo_pago NOT IN('efectivo','credito')
UNION ALL SELECT 'detalles_invalidos',COUNT(*) FROM dbo.Detalle_Venta WHERE cantidad<=0 OR subtotal<0
UNION ALL SELECT 'precios_invalidos',COUNT(*) FROM dbo.Producto WHERE precio_completo<0 OR precio_medio<0 OR precio_mayorista<0 OR precio_mayorista2<0
UNION ALL SELECT 'clientes_invalidos',COUNT(*) FROM dbo.Clientes WHERE (dia_visita IS NOT NULL AND dia_visita NOT BETWEEN 0 AND 7) OR (tipo_cliente IS NOT NULL AND tipo_cliente NOT IN('normal','credito','mayorista','mayorista-credito'))
UNION ALL SELECT 'multiples_cai_activos',CASE WHEN COUNT(*)>1 THEN COUNT(*) ELSE 0 END FROM dbo.CAI WHERE activo=1
UNION ALL SELECT 'cai_invalidos',COUNT(*) FROM dbo.CAI WHERE rango_inicial<1 OR rango_final<=rango_inicial OR rango_final=2147483647 OR fecha_fin<=fecha_inicio
UNION ALL SELECT 'ventas_huerfanas',COUNT(*) FROM dbo.Venta v LEFT JOIN dbo.Clientes c ON v.id_cliente=c.id_cliente LEFT JOIN dbo.Personal p ON v.id_personal=p.id_personal WHERE c.id_cliente IS NULL OR p.id_personal IS NULL
UNION ALL SELECT 'detalles_huerfanos',COUNT(*) FROM dbo.Detalle_Venta d LEFT JOIN dbo.Venta v ON d.id_venta=v.id_venta LEFT JOIN dbo.Producto p ON d.id_producto=p.id_producto WHERE v.id_venta IS NULL OR p.id_producto IS NULL
UNION ALL SELECT 'inventarios_huerfanos',COUNT(*) FROM dbo.Inventario_Ruta i LEFT JOIN dbo.Ruta r ON i.id_ruta=r.id_ruta LEFT JOIN dbo.Producto p ON i.id_producto=p.id_producto WHERE r.id_ruta IS NULL OR p.id_producto IS NULL
UNION ALL SELECT 'cuentas_huerfanas',COUNT(*) FROM dbo.Cliente_Credito cc LEFT JOIN dbo.Clientes c ON cc.id_cliente=c.id_cliente WHERE c.id_cliente IS NULL
UNION ALL SELECT 'facturas_huerfanas',COUNT(*) FROM dbo.Factura f LEFT JOIN dbo.Venta v ON f.id_venta=v.id_venta LEFT JOIN dbo.CAI c ON f.id_cai=c.id_cai WHERE v.id_venta IS NULL OR c.id_cai IS NULL
UNION ALL SELECT 'rutas_clientes_huerfanas',COUNT(*) FROM dbo.Clientes c LEFT JOIN dbo.Ruta r ON c.id_ruta=r.id_ruta WHERE c.id_ruta IS NOT NULL AND r.id_ruta IS NULL
UNION ALL SELECT 'asignaciones_huerfanas',COUNT(*) FROM dbo.Ruta r LEFT JOIN dbo.Personal p ON r.id_personal_asignado=p.id_personal WHERE r.id_personal_asignado IS NOT NULL AND p.id_personal IS NULL
UNION ALL SELECT 'limites_huerfanos',COUNT(*) FROM dbo.Limite_Credito l LEFT JOIN dbo.Personal p ON l.id_personal=p.id_personal WHERE p.id_personal IS NULL
UNION ALL SELECT 'limites_invalidos',COUNT(*) FROM dbo.Limite_Credito WHERE monto_actual<0 OR monto_maximo<0 OR monto_actual>monto_maximo
UNION ALL SELECT 'roles_activos_invalidos',COUNT(*) FROM dbo.Personal WHERE activo=1 AND LOWER(LTRIM(RTRIM(rol))) NOT IN('admin','administrador','vendedor');
