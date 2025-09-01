import { NextRequest, NextResponse } from "next/server";
import { getConnection, closeConnection } from "@/lib/db";
import sql from "mssql";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error occurred";
}

export async function GET(req: NextRequest) {
  const pool = await getConnection();
  const { searchParams } = new URL(req.url);
  const id_factura = searchParams.get('id_factura');
  const id_venta = searchParams.get('id_venta');
  const id_personal = searchParams.get('id_personal');

  try {
    if (id_factura) {
      // Obtener una factura específica por ID con detalles de productos
      const facturaRequest = await pool
        .request()
        .input("id_factura", sql.Int, id_factura)
        .query(`
          SELECT 
            f.id_factura,
            f.id_venta,
            f.id_cai,
            c.codigo_cai,
            f.numero_factura,
            f.fecha_emision,
            f.monto_total,
            f.anulada,
            v.tipo_pago,
            cl.nombre as nombre_cliente,
            v.id_personal,
            p.nombre as producto_nombre,
            dv.cantidad,
            p.precio_completo as precio_unitario,
            dv.subtotal as total_producto
          FROM Factura f
          JOIN CAI c ON f.id_cai = c.id_cai
          JOIN Venta v ON f.id_venta = v.id_venta
          JOIN Clientes cl ON v.id_cliente = cl.id_cliente
          JOIN Detalle_Venta dv ON v.id_venta = dv.id_venta
          JOIN Producto p ON dv.id_producto = p.id_producto
          WHERE f.id_factura = @id_factura
        `);

      if (facturaRequest.recordset.length === 0) {
        return NextResponse.json(
          { success: false, error: "Factura no encontrada" },
          { status: 404 }
        );
      }

      // Agrupar productos por factura
      const facturaData = {
        id_factura: facturaRequest.recordset[0].id_factura,
        id_venta: facturaRequest.recordset[0].id_venta,
        id_cai: facturaRequest.recordset[0].id_cai,
        codigo_cai: facturaRequest.recordset[0].codigo_cai,
        numero_factura: facturaRequest.recordset[0].numero_factura,
        fecha_emision: facturaRequest.recordset[0].fecha_emision,
        monto_total: facturaRequest.recordset[0].monto_total,
        anulada: facturaRequest.recordset[0].anulada,
        tipo_pago: facturaRequest.recordset[0].tipo_pago,
        nombre_cliente: facturaRequest.recordset[0].nombre_cliente,
        id_personal: facturaRequest.recordset[0].id_personal,
        productos: facturaRequest.recordset.map(row => ({
          nombre: row.producto_nombre,
          cantidad: row.cantidad,
          precio_unitario: row.precio_unitario,
          total: row.total_producto
        }))
      };

      return NextResponse.json({
        success: true,
        data: facturaData
      });
    } else if (id_venta) {
      // Obtener facturas por venta
      const facturasRequest = await pool
        .request()
        .input("id_venta", sql.Int, id_venta)
        .query(`
          SELECT 
            f.id_factura,
            f.numero_factura,
            f.fecha_emision,
            f.monto_total,
            f.anulada,
            c.codigo_cai,
            v.id_personal
          FROM Factura f
          JOIN CAI c ON f.id_cai = c.id_cai
          JOIN Venta v ON f.id_venta = v.id_venta
          WHERE f.id_venta = @id_venta
          ORDER BY f.fecha_emision DESC
        `);

      return NextResponse.json({
        success: true,
        data: facturasRequest.recordset
      });
    } else {
      // Obtener listado de facturas (con paginación y filtro por vendedor)
      const page = parseInt(searchParams.get('page') || '1');
      const pageSize = parseInt(searchParams.get('pageSize') || '10');
      const fechaInicio = searchParams.get('fechaInicio');
      const fechaFin = searchParams.get('fechaFin');

      let query = `
        SELECT 
          f.id_factura,
          f.numero_factura,
          f.fecha_emision,
          f.monto_total,
          f.anulada,
          v.id_venta,
          cl.nombre as nombre_cliente,
          c.codigo_cai,
          v.id_personal,
          COUNT(*) OVER() as total_count
        FROM Factura f
        JOIN Venta v ON f.id_venta = v.id_venta
        JOIN Clientes cl ON v.id_cliente = cl.id_cliente
        JOIN CAI c ON f.id_cai = c.id_cai
        WHERE 1=1
      `;

      const request = pool.request();

      // Filtrar por vendedor (id_personal)
      if (id_personal) {
        query += ` AND v.id_personal = @id_personal`;
        request.input("id_personal", sql.Int, id_personal);
      }

      // Filtrar por rango de fechas
      if (fechaInicio && fechaFin) {
        query += ` AND f.fecha_emision BETWEEN @fechaInicio AND @fechaFin`;
        request.input("fechaInicio", sql.DateTime, new Date(fechaInicio));
        request.input("fechaFin", sql.DateTime, new Date(fechaFin + 'T23:59:59'));
      }

      query += ` ORDER BY f.fecha_emision DESC
                 OFFSET @offset ROWS
                 FETCH NEXT @pageSize ROWS ONLY`;

      request.input("offset", sql.Int, (page - 1) * pageSize);
      request.input("pageSize", sql.Int, pageSize);

      const facturasRequest = await request.query(query);

      // Obtener detalles de productos para cada factura
      const facturasConProductos = await Promise.all(
        facturasRequest.recordset.map(async (factura) => {
          try {
            const productosRequest = await pool
              .request()
              .input("id_venta", sql.Int, factura.id_venta)
              .query(`
                SELECT TOP 3 
                  p.nombre,
                  dv.cantidad,
                  p.precio_completo as precio_unitario,
                  dv.subtotal as total
                FROM Detalle_Venta dv
                JOIN Producto p ON dv.id_producto = p.id_producto
                WHERE dv.id_venta = @id_venta
              `);

            return {
              ...factura,
              productos: productosRequest.recordset
            };
          } catch (error) {
            console.error("Error al cargar productos para factura:", factura.id_factura, error);
            return {
              ...factura,
              productos: []
            };
          }
        })
      );

      const totalCount = facturasRequest.recordset[0]?.total_count || 0;

      return NextResponse.json({
        success: true,
        data: {
          facturas: facturasConProductos,
          pagination: {
            page,
            pageSize,
            total: totalCount,
            totalPages: Math.ceil(totalCount / pageSize)
          }
        }
      });
    }
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  } finally {
    try {
      await closeConnection(pool);
    } catch (closeError) {
      console.error("Error closing connection:", closeError);
    }
  }
}

export async function POST(req: NextRequest) {
  const pool = await getConnection();

  try {
    const facturaData: {
      id_venta: number;
      monto_total: number;
    } = await req.json();
    
    const { id_venta, monto_total } = facturaData;

    // Validación de campos obligatorios
    if (!id_venta || !monto_total) {
      return NextResponse.json(
        { success: false, error: "Faltan campos obligatorios (id_venta, monto_total)" },
        { status: 400 }
      );
    }

    // Validar monto positivo
    if (monto_total <= 0) {
      return NextResponse.json(
        { success: false, error: "El monto total debe ser positivo" },
        { status: 400 }
      );
    }

    // Iniciar transacción
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Verificar que la venta existe
      const ventaRequest = new sql.Request(transaction);
      const ventaExists = await ventaRequest
        .input("id_venta", sql.Int, id_venta)
        .query("SELECT 1 FROM Venta WHERE id_venta = @id_venta");

      if (ventaExists.recordset.length === 0) {
        await transaction.rollback();
        return NextResponse.json(
          { success: false, error: "La venta especificada no existe" },
          { status: 404 }
        );
      }

      // 2. Obtener CAI activo (con rango disponible)
      const caiRequest = new sql.Request(transaction);
      const caiResult = await caiRequest.query(`
        SELECT TOP 1 
          id_cai, 
          codigo_cai,
          rango_inicial, 
          rango_final, 
          siguiente_numero
        FROM CAI 
        WHERE activo = 1 
          AND GETDATE() BETWEEN fecha_inicio AND fecha_fin
          AND siguiente_numero <= rango_final
        ORDER BY fecha_inicio DESC
      `);

      if (caiResult.recordset.length === 0) {
        await transaction.rollback();
        return NextResponse.json(
          { 
            success: false, 
            error: "No hay CAI activo disponible con rango válido" 
          },
          { status: 400 }
        );
      }

      const cai = caiResult.recordset[0];

      // 3. Generar número de factura (formato: AAAAMMDD-NNNNN)
      const fechaActual = new Date();
      const numeroFactura = `${fechaActual.getFullYear()}${(fechaActual.getMonth() + 1).toString().padStart(2, '0')}${fechaActual.getDate().toString().padStart(2, '0')}-${cai.siguiente_numero.toString().padStart(5, '0')}`;

      // 4. Insertar la factura
      const insertRequest = new sql.Request(transaction);
      const result = await insertRequest
        .input("id_venta", sql.Int, id_venta)
        .input("id_cai", sql.Int, cai.id_cai)
        .input("numero_factura", sql.VarChar(50), numeroFactura)
        .input("monto_total", sql.Decimal(18, 2), monto_total)
        .query(`
          INSERT INTO Factura (
            id_venta, id_cai, numero_factura, 
            fecha_emision, monto_total, anulada
          )
          OUTPUT INSERTED.id_factura, INSERTED.fecha_emision
          VALUES (
            @id_venta, @id_cai, @numero_factura,
            GETDATE(), @monto_total, 0
          )
        `);

      // 5. Actualizar siguiente número en CAI
      await new sql.Request(transaction)
        .input("id_cai", sql.Int, cai.id_cai)
        .query("UPDATE CAI SET siguiente_numero = siguiente_numero + 1 WHERE id_cai = @id_cai");

      await transaction.commit();

      return NextResponse.json({
        success: true,
        data: {
          id_factura: result.recordset[0].id_factura,
          numero_factura: numeroFactura,
          fecha_emision: result.recordset[0].fecha_emision,
          cai: cai.codigo_cai,
          message: "Factura generada exitosamente"
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.error("Transaction error:", error);
      return NextResponse.json(
        { success: false, error: "Error al generar factura" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      { success: false, error: "Error de conexión a la base de datos" },
      { status: 500 }
    );
  } finally {
    try {
      await closeConnection(pool);
    } catch (closeError) {
      console.error("Error closing connection:", closeError);
    }
  }
}