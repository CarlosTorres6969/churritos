import { type NextRequest, NextResponse } from "next/server"
import { getConnection, closeConnection } from "@/lib/db"
import sql from "mssql"

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Unknown error occurred"
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get("fecha")
  const idVendedor = searchParams.get("id_vendedor")
  const page = Number.parseInt(searchParams.get("page") || "1")
  const pageSize = Number.parseInt(searchParams.get("pageSize") || "10")

  let pool
  try {
    pool = await getConnection()

    if (fecha) {
      // Query for daily closure
      let cierreQuery = `
        SELECT cd.*, p.nombre as nombre_personal 
        FROM Cierre_Dia cd 
        JOIN Personal p ON cd.id_personal = p.id_personal 
        WHERE cd.fecha_cierre = @fecha
      `

      const cierreRequest = pool.request().input("fecha", sql.Date, new Date(fecha))

      if (idVendedor) {
        cierreQuery += " AND cd.id_personal = @idVendedor"
        cierreRequest.input("idVendedor", sql.Int, Number.parseInt(idVendedor))
      }

      const cierreResult = await cierreRequest.query(cierreQuery)

      if (!cierreResult.recordset.length) {
        return NextResponse.json(
          {
            success: false,
            error: "Cierre no encontrado para esta fecha" + (idVendedor ? " y este vendedor" : ""),
          },
          { status: 404 },
        )
      }

      // Consulta de liquidación corregida
      const liquidacionQuery = `
        DECLARE @fecha DATE = @fechaParam;
        WITH VentasDetalle AS (
            SELECT 
                v.id_personal,
                CAST(p.descripcion AS NVARCHAR(255)) AS descripcion,
                p.precio_completo,
                p.precio_medio,
                p.precio_mayorista,
                dv.cantidad,
                dv.subtotal,
                CASE 
                    WHEN ABS(dv.subtotal/dv.cantidad - p.precio_mayorista) < 0.01 THEN 'mayorista'
                    WHEN ABS(dv.subtotal/dv.cantidad - p.precio_medio) < 0.01 THEN 'medio'
                    WHEN ABS(dv.subtotal/dv.cantidad - p.precio_completo) < 0.01 THEN 'completo'
                    ELSE 'otro'
                END AS tipo_precio
            FROM Detalle_Venta dv
            INNER JOIN Producto p ON dv.id_producto = p.id_producto
            INNER JOIN Venta v ON dv.id_venta = v.id_venta
            INNER JOIN Personal per ON v.id_personal = per.id_personal
            WHERE CAST(v.fecha_venta AS DATE) = @fechaParam
            AND per.rol = 'vendedor'
            ${idVendedor ? "AND v.id_personal = @idVendedorParam" : ""}
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
                            WHEN tipo_precio = 'mayorista' THEN 'mayorista'
                            WHEN tipo_precio IN ('medio', 'completo') THEN 'bolsas'
                            ELSE 'otros'
                        END
                    WHEN descripcion LIKE '%L3%' THEN
                        CASE 
                            WHEN tipo_precio = 'mayorista' THEN 'mayorista'
                            WHEN tipo_precio IN ('medio', 'completo') THEN 'bolsas'
                            ELSE 'otros'
                        END
                    WHEN descripcion LIKE '%G%' THEN 'completo'
                    ELSE 
                        CASE WHEN tipo_precio = 'completo' THEN 'completo' ELSE 'otros' END
                END AS category,
                CASE 
                    WHEN descripcion LIKE '%L4%' AND tipo_precio = 'medio' THEN cantidad / 2.0
                    WHEN descripcion LIKE '%L4%' AND tipo_precio = 'completo' THEN cantidad
                    WHEN descripcion LIKE '%L3%' AND tipo_precio = 'medio' THEN cantidad / 2.0
                    WHEN descripcion LIKE '%L3%' AND tipo_precio = 'completo' THEN cantidad
                    WHEN descripcion LIKE '%G%' THEN 
                        CASE 
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
            orden_descripcion
      `

      const liquidacionRequest = pool.request()
        .input("fechaParam", sql.Date, new Date(fecha))
        
      if (idVendedor) {
        liquidacionRequest.input("idVendedorParam", sql.Int, Number.parseInt(idVendedor))
      }

      const liquidacionResult = await liquidacionRequest.query(liquidacionQuery)

      return NextResponse.json({
        success: true,
        data: {
          cierre: cierreResult.recordset[0],
          liquidacion: liquidacionResult.recordset,
        },
      })
    } else {
      // Existing logic for listing closures
      let query = `
        SELECT cd.*, p.nombre as nombre_personal, COUNT(*) OVER() AS total_count 
        FROM Cierre_Dia cd 
        JOIN Personal p ON cd.id_personal = p.id_personal 
      `

      const request = pool.request()

      if (idVendedor) {
        query += " WHERE cd.id_personal = @idVendedor"
        request.input("idVendedor", sql.Int, Number.parseInt(idVendedor))
      }

      query += " ORDER BY cd.fecha_cierre DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY"

      request.input("pageSize", sql.Int, pageSize)
      request.input("offset", sql.Int, (page - 1) * pageSize)

      const cierresRequest = await request.query(query)

      const totalCount = cierresRequest.recordset.length ? cierresRequest.recordset[0].total_count : 0

      return NextResponse.json({
        success: true,
        data: {
          cierres: cierresRequest.recordset,
          pagination: {
            page,
            pageSize,
            total: totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
          },
        },
      })
    }
  } catch (error) {
    console.error("Error fetching daily closures or liquidation:", error)
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 })
  } finally {
    if (pool) {
      try {
        await closeConnection(pool)
      } catch (closeError) {
        console.error("Error closing connection:", closeError)
      }
    }
  }
}

// El código POST permanece igual
export async function POST(req: NextRequest) {
  let pool
  try {
    pool = await getConnection()
    const {
      fecha_cierre,
      id_personal,
      total_ventas,
      ventas_efectivo,
      ventas_credito,
      efectivo_recaudado,
      total_credito,
      clientes_atendidos,
      productos_vendidos,
      monto_total,
    } = await req.json()

    if (!fecha_cierre) {
      return NextResponse.json({ success: false, error: "Fecha de cierre es requerida" }, { status: 400 })
    }

    if (!id_personal) {
      return NextResponse.json({ success: false, error: "ID del personal es requerido" }, { status: 400 })
    }

    const fechaObj = new Date(fecha_cierre)

    // Verificar si ya existe un cierre para esta fecha y este vendedor
    const checkCierre = await pool
      .request()
      .input("fecha_cierre", sql.Date, fechaObj)
      .input("id_personal", sql.Int, id_personal)
      .query("SELECT id_cierre FROM Cierre_Dia WHERE fecha_cierre = @fecha_cierre AND id_personal = @id_personal")

    if (checkCierre.recordset.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Ya existe un cierre para esta fecha y este vendedor",
        },
        { status: 400 },
      )
    }

    // Validar que todos los campos requeridos estén presentes
    const camposRequeridos = {
      total_ventas,
      ventas_efectivo,
      ventas_credito,
      efectivo_recaudado,
      total_credito,
      clientes_atendidos,
      productos_vendidos,
      monto_total,
    }

    for (const [campo, valor] of Object.entries(camposRequeridos)) {
      if (valor === undefined || valor === null) {
        return NextResponse.json({ success: false, error: `Campo requerido: ${campo}` }, { status: 400 })
      }
    }

    const insertQuery = `
      INSERT INTO Cierre_Dia (
        fecha_cierre, 
        id_personal, 
        total_ventas, 
        ventas_efectivo, 
        ventas_credito, 
        efectivo_recaudado, 
        total_credito, 
        clientes_atendidos, 
        productos_vendidos, 
        monto_total, 
        fecha_registro,
        cerrado
      )
      OUTPUT INSERTED.id_cierre
      VALUES (
        @fecha_cierre, 
        @id_personal, 
        @total_ventas, 
        @ventas_efectivo,
        @ventas_credito, 
        @efectivo_recaudado, 
        @total_credito,
        @clientes_atendidos, 
        @productos_vendidos, 
        @monto_total, 
        GETDATE(),
        1
      )
    `

    const insertResult = await pool
      .request()
      .input("fecha_cierre", sql.Date, fechaObj)
      .input("id_personal", sql.Int, id_personal)
      .input("total_ventas", sql.Int, total_ventas)
      .input("ventas_efectivo", sql.Int, ventas_efectivo)
      .input("ventas_credito", sql.Int, ventas_credito)
      .input("efectivo_recaudado", sql.Decimal(18, 2), efectivo_recaudado)
      .input("total_credito", sql.Decimal(18, 2), total_credito)
      .input("clientes_atendidos", sql.Int, clientes_atendidos)
      .input("productos_vendidos", sql.Int, productos_vendidos)
      .input("monto_total", sql.Decimal(18, 2), monto_total)
      .query(insertQuery)

    return NextResponse.json({
      success: true,
      data: {
        id_cierre: insertResult.recordset[0].id_cierre,
        message: "Cierre del día registrado exitosamente",
        resumen: {
          total_ventas,
          ventas_efectivo,
          ventas_credito,
          efectivo_recaudado,
          total_credito,
          clientes_atendidos,
          productos_vendidos,
          monto_total,
        },
      },
    })
  } catch (error) {
    console.error("Error processing daily closure:", error)
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 })
  } finally {
    if (pool) {
      try {
        await closeConnection(pool)
      } catch (closeError) {
        console.error("Error closing connection:", closeError)
      }
    }
  }
}