-- Formula supplied by the owner, matching 7567c2a.
-- Only scope is adapted: business date, non-annulled historical rows and vendor parameter.

        DECLARE @fecha DATE = @fechaParam;
        WITH VentasDetalle AS (
            SELECT
                v.id_personal,
                CAST(p.descripcion AS NVARCHAR(255)) AS descripcion,
                p.precio_completo,
                p.precio_medio,
                p.precio_mayorista,
                p.precio_mayorista2,
                dv.cantidad,
                dv.subtotal,
                CASE
                    WHEN ABS(dv.subtotal/dv.cantidad - p.precio_mayorista2) < 0.01 THEN 'mayorista2'
                    WHEN ABS(dv.subtotal/dv.cantidad - p.precio_mayorista) < 0.01 THEN 'mayorista'
                    WHEN ABS(dv.subtotal/dv.cantidad - p.precio_medio) < 0.01 THEN 'medio'
                    WHEN ABS(dv.subtotal/dv.cantidad - p.precio_completo) < 0.01 THEN 'completo'
                    ELSE 'otro'
                END AS tipo_precio
            FROM Detalle_Venta dv
            INNER JOIN Producto p ON dv.id_producto = p.id_producto
            INNER JOIN Venta v ON dv.id_venta = v.id_venta
            INNER JOIN Personal per ON v.id_personal = per.id_personal
            WHERE v.fecha_negocio = @fechaParam
            AND per.rol = 'vendedor' AND v.anulada=0 AND dv.historico_reconstruido=1 AND dv.unidades_liquidas IS NULL AND dv.liquidacion_vendedor IS NULL AND dv.liquidacion_empresa IS NULL
            AND (@idVendedorParam IS NULL OR v.id_personal = @idVendedorParam)
        ),
        Categorized AS (
            SELECT
                id_personal,
                descripcion,
                tipo_precio,
                precio_mayorista,
                precio_completo,
                cantidad,
                CASE
                    WHEN descripcion LIKE '%L4%' THEN
                        CASE
                            WHEN tipo_precio IN ('mayorista', 'mayorista2') THEN 'mayorista'
                            WHEN tipo_precio IN ('medio', 'completo') THEN 'bolsas'
                            ELSE 'otros'
                        END
                    WHEN descripcion LIKE '%L3%' THEN
                        CASE
                            WHEN tipo_precio IN ('mayorista', 'mayorista2') THEN 'mayorista'
                            WHEN tipo_precio IN ('medio', 'completo') THEN 'bolsas'
                            ELSE 'otros'
                        END
                    WHEN descripcion LIKE '%G%' THEN 'completo'
                    WHEN descripcion LIKE '%C%' THEN 'completo'
                    ELSE
                        CASE WHEN tipo_precio = 'completo' THEN 'completo' ELSE 'otros' END
                END AS category,
                CASE
                    WHEN descripcion LIKE '%L4%' THEN
                        CASE
                            WHEN tipo_precio = 'medio' THEN cantidad / 2.0
                            WHEN tipo_precio IN ('completo', 'mayorista', 'mayorista2') THEN cantidad
                            ELSE 0
                        END
                    WHEN descripcion LIKE '%L3%' THEN
                        CASE
                            WHEN tipo_precio = 'medio' THEN cantidad / 2.0
                            WHEN tipo_precio IN ('completo', 'mayorista', 'mayorista2') THEN cantidad
                            ELSE 0
                        END
                    WHEN descripcion LIKE '%G%' THEN
                        CASE
                            WHEN tipo_precio IN ('mayorista', 'mayorista2') AND precio_mayorista = 38.50 THEN cantidad * 2
                            WHEN tipo_precio IN ('mayorista', 'mayorista2') AND precio_mayorista = 18.80 THEN cantidad
                            WHEN precio_completo = 20 THEN cantidad / 2.0
                            WHEN precio_completo = 40 THEN cantidad
                            ELSE cantidad
                        END
                    WHEN descripcion LIKE '%C%' THEN
                        CASE
                            WHEN tipo_precio IN ('mayorista', 'mayorista2') AND precio_mayorista = 38.50 THEN cantidad * 2
                            WHEN precio_completo = 20 THEN cantidad / 2.0
                            WHEN precio_completo = 40 THEN cantidad
                            ELSE cantidad
                        END
                    ELSE
                        CASE WHEN tipo_precio = 'completo' THEN cantidad ELSE 0 END
                END AS unidades_liquidas
            FROM VentasDetalle
        ),
        Grouped AS (
            SELECT
                id_personal,
                descripcion,
                category,
                precio_mayorista,
                SUM(unidades_liquidas) AS total_unidades
            FROM Categorized
            WHERE category <> 'otros'
            GROUP BY id_personal, descripcion, category, precio_mayorista
        ),
        LiquidacionPorVendedor AS (
            SELECT
                id_personal,
                descripcion,
                category,
                precio_mayorista,
                total_unidades,
                total_unidades *
                    CASE
                        -- Nuevas reglas para productos con precio mayorista
                        WHEN descripcion LIKE '%G%' AND precio_mayorista = 38.50 THEN 2
                        WHEN descripcion LIKE '%C%' AND precio_mayorista = 38.50 THEN 2
                        WHEN descripcion LIKE '%G%' AND precio_mayorista = 18.80 THEN 1

                        -- Reglas existentes
                        WHEN category = 'mayorista' AND descripcion LIKE '%L4%' AND precio_mayorista = 150 THEN 4
                        WHEN category = 'mayorista' AND descripcion LIKE '%L4%' AND precio_mayorista = 154 THEN 4
                        WHEN category = 'mayorista' AND descripcion LIKE '%L3%' AND precio_mayorista = 110 THEN 3
                        WHEN category = 'mayorista' AND descripcion LIKE '%L3%' AND precio_mayorista = 113 THEN 3
                        WHEN category = 'bolsas' AND descripcion LIKE '%L4%' THEN 6
                        WHEN category = 'bolsas' AND descripcion LIKE '%L3%' THEN 5
                        WHEN category = 'completo' AND descripcion LIKE '%G%' THEN 2
                        WHEN category = 'completo' AND descripcion LIKE '%C%' THEN 2
                        WHEN category = 'completo' AND descripcion LIKE '%CHF%' THEN 1.49
                        WHEN category = 'completo' AND descripcion LIKE '%CF%' THEN 1.2
                        WHEN category = 'completo' AND descripcion LIKE '%ORI%' THEN 1
                        WHEN category = 'completo' AND descripcion LIKE '%MINIORI%' THEN 1
                        WHEN category = 'completo' AND descripcion LIKE '%MEGA%' THEN 2
                        WHEN category = 'completo' AND descripcion LIKE '%CCP%' THEN 1
                        ELSE 0
                    END AS liquidacion_vendedor,
                total_unidades *
                    CASE
                        -- Nuevas reglas para productos con precio mayorista
                        WHEN descripcion LIKE '%G%' AND precio_mayorista = 38.50 THEN 3.412
                        WHEN descripcion LIKE '%C%' AND precio_mayorista = 38.50 THEN 3.412
                        WHEN descripcion LIKE '%G%' AND precio_mayorista = 18.80 THEN 1.46

                        -- Reglas existentes
                        WHEN category = 'mayorista' AND descripcion LIKE '%L4%' AND precio_mayorista = 150 THEN 13.648
                        WHEN category = 'mayorista' AND descripcion LIKE '%L4%' AND precio_mayorista = 154 THEN 17.648
                        WHEN category = 'mayorista' AND descripcion LIKE '%L3%' AND precio_mayorista = 110 THEN 7.736
                        WHEN category = 'mayorista' AND descripcion LIKE '%L3%' AND precio_mayorista = 113 THEN 10.736
                        WHEN category = 'bolsas' AND descripcion LIKE '%L4%' THEN 21.648
                        WHEN category = 'bolsas' AND descripcion LIKE '%L3%' THEN 15.736
                        WHEN category = 'completo' AND descripcion LIKE '%G%' THEN 4.9
                        WHEN category = 'completo' AND descripcion LIKE '%C%' THEN 4.9
                        WHEN category = 'completo' AND descripcion LIKE '%CHF%' THEN 3
                        WHEN category = 'completo' AND descripcion LIKE '%CF%' THEN 3
                        WHEN category = 'completo' AND descripcion LIKE '%ORI%' THEN 1.4
                        WHEN category = 'completo' AND descripcion LIKE '%MINIORI%' THEN 1.4
                        WHEN category = 'completo' AND descripcion LIKE '%MEGA%' THEN 3.184
                        WHEN category = 'completo' AND descripcion LIKE '%CCP%' THEN 1.4
                        ELSE 0
                    END AS liquidacion_empresa
            FROM Grouped
        ),
        TotalesPorVendedor AS (
            SELECT
                id_personal,
                SUM(total_unidades) AS total_unidades_vendedor,
                SUM(liquidacion_vendedor) AS total_liquidacion_vendedor,
                SUM(liquidacion_empresa) AS total_liquidacion_empresa
            FROM LiquidacionPorVendedor
            GROUP BY id_personal
        )

        -- Detalle por vendedor y producto
        SELECT
            'DETALLE' AS tipo,
            lv.id_personal,
            per.nombre + ' ' + per.apellido AS nombre_vendedor,
            lv.descripcion,
            lv.category,
            lv.precio_mayorista,
            lv.total_unidades,
            lv.liquidacion_vendedor,
            lv.liquidacion_empresa,
            NULL AS total_unidades_vendedor,
            NULL AS total_liquidacion_vendedor,
            NULL AS total_liquidacion_empresa,
            -- Columnas para ordenamiento
            lv.id_personal AS orden_id_personal,
            1 AS orden_tipo,
            lv.descripcion AS orden_descripcion
        FROM LiquidacionPorVendedor lv
        INNER JOIN Personal per ON lv.id_personal = per.id_personal

        UNION ALL

        -- Totales por vendedor
        SELECT
            'TOTAL_VENDEDOR' AS tipo,
            tv.id_personal,
            per.nombre + ' ' + per.apellido AS nombre_vendedor,
            NULL AS descripcion,
            NULL AS category,
            NULL AS precio_mayorista,
            NULL AS total_unidades,
            NULL AS liquidacion_vendedor,
            NULL AS liquidacion_empresa,
            tv.total_unidades_vendedor,
            tv.total_liquidacion_vendedor,
            tv.total_liquidacion_empresa,
            -- Columnas para ordenamiento
            tv.id_personal AS orden_id_personal,
            2 AS orden_tipo,
            NULL AS orden_descripcion
        FROM TotalesPorVendedor tv
        INNER JOIN Personal per ON tv.id_personal = per.id_personal

        UNION ALL

        -- Total general de todos los vendedores
        SELECT
            'TOTAL_GENERAL' AS tipo,
            NULL AS id_personal,
            'TODOS LOS VENDEDORES' AS nombre_vendedor,
            NULL AS descripcion,
            NULL AS category,
            NULL AS precio_mayorista,
            NULL AS total_unidades,
            NULL AS liquidacion_vendedor,
            NULL AS liquidacion_empresa,
            SUM(tv.total_unidades_vendedor) AS total_unidades_vendedor,
            SUM(tv.total_liquidacion_vendedor) AS total_liquidacion_vendedor,
            SUM(tv.total_liquidacion_empresa) AS total_liquidacion_empresa,
            -- Columnas para ordenamiento
            0 AS orden_id_personal,
            3 AS orden_tipo,
            NULL AS orden_descripcion
        FROM TotalesPorVendedor tv

        ORDER BY
            orden_id_personal,
            orden_tipo,
            orden_descripcion OPTION(RECOMPILE)
