import { NextRequest, NextResponse } from "next/server";
import { getConnection, closeConnection } from "@/lib/db";
import sql from "mssql";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error occurred";
}

export interface Factura {
  id_factura?: number;
  id_venta: number;
  id_cai: number;
  numero_factura: string;
  fecha_emision?: Date;
  monto_total: number;
  anulada?: boolean;
}

export async function GET(req: NextRequest) {
  const pool = await getConnection();
  const { searchParams } = new URL(req.url);
  const id_factura = searchParams.get('id_factura');
  const id_venta = searchParams.get('id_venta');

  try {
    if (id_factura) {
      // Obtener una factura específica por ID
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
            cl.nombre as nombre_cliente
          FROM Factura f
          JOIN CAI c ON f.id_cai = c.id_cai
          JOIN Venta v ON f.id_venta = v.id_venta
          JOIN Clientes cl ON v.id_cliente = cl.id_cliente
          WHERE f.id_factura = @id_factura
        `);

      if (facturaRequest.recordset.length === 0) {
        return NextResponse.json(
          { success: false, error: "Factura no encontrada" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: facturaRequest.recordset[0]
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
            c.codigo_cai
          FROM Factura f
          JOIN CAI c ON f.id_cai = c.id_cai
          WHERE f.id_venta = @id_venta
          ORDER BY f.fecha_emision DESC
        `);

      return NextResponse.json({
        success: true,
        data: facturasRequest.recordset
      });
    } else {
      // Obtener listado de facturas (con paginación)
      const page = parseInt(searchParams.get('page') || '1');
      const pageSize = parseInt(searchParams.get('pageSize') || '10');

      const facturasRequest = await pool
        .request()
        .input("offset", sql.Int, (page - 1) * pageSize)
        .input("pageSize", sql.Int, pageSize)
        .query(`
          SELECT 
            f.id_factura,
            f.numero_factura,
            f.fecha_emision,
            f.monto_total,
            f.anulada,
            v.id_venta,
            cl.nombre as nombre_cliente,
            c.codigo_cai,
            COUNT(*) OVER() as total_count
          FROM Factura f
          JOIN Venta v ON f.id_venta = v.id_venta
          JOIN Clientes cl ON v.id_cliente = cl.id_cliente
          JOIN CAI c ON f.id_cai = c.id_cai
          ORDER BY f.fecha_emision DESC
          OFFSET @offset ROWS
          FETCH NEXT @pageSize ROWS ONLY
        `);

      const totalCount = facturasRequest.recordset[0]?.total_count || 0;

      return NextResponse.json({
        success: true,
        data: {
          facturas: facturasRequest.recordset,
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
          numero_factura:"",
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