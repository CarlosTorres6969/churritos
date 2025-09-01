// app/api/inventario-ruta/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getConnection, closeConnection } from "@/lib/db";
import sql from "mssql";

// Tipos TypeScript
interface InventarioRuta {
  id_inventario_ruta?: number;
  id_ruta: number;
  id_producto: number;
  cantidad: number;
  fecha_actualizacion?: string;
}

// GET - Obtener todo el inventario por rutas
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id_ruta = searchParams.get('id_ruta');
  const id_producto = searchParams.get('id_producto');

  let pool;
  try {
    pool = await getConnection();

    let query = `
      SELECT 
        ir.id_inventario_ruta,
        ir.id_ruta,
        r.nombre AS ruta_nombre,
        ir.id_producto,
        p.codigo AS producto_codigo,
        p.nombre AS producto_nombre,
        ir.cantidad,
        ir.fecha_actualizacion
      FROM Inventario_Ruta ir
      JOIN Ruta r ON ir.id_ruta = r.id_ruta
      JOIN Producto p ON ir.id_producto = p.id_producto
      WHERE 1=1
    `;

    if (id_ruta) {
      query += ` AND ir.id_ruta = @id_ruta`;
    }
    if (id_producto) {
      query += ` AND ir.id_producto = @id_producto`;
    }

    query += ` ORDER BY r.nombre, p.nombre`;

    const request = pool.request();
    if (id_ruta) request.input('id_ruta', sql.Int, id_ruta);
    if (id_producto) request.input('id_producto', sql.Int, id_producto);

    const result = await request.query(query);

    return NextResponse.json({
      success: true,
      data: result.recordset,
      message: "Inventario obtenido correctamente"
    });
  } catch (error) {
    console.error("Error al obtener inventario:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno al obtener inventario",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}

// POST - Crear nuevo registro de inventario
export async function POST(req: NextRequest) {
  let pool;
  try {
    const requestData: InventarioRuta = await req.json();

    // Validación
    if (!requestData.id_ruta || !requestData.id_producto || requestData.cantidad === undefined) {
      return NextResponse.json(
        { success: false, error: "Datos incompletos", details: "id_ruta, id_producto y cantidad son requeridos" },
        { status: 400 }
      );
    }

    if (requestData.cantidad < 0) {
      return NextResponse.json(
        { success: false, error: "Cantidad inválida", details: "La cantidad debe ser un número positivo" },
        { status: 400 }
      );
    }

    pool = await getConnection();

    // Verificar si ya existe
    const checkResult = await pool.request()
      .input('id_ruta', sql.Int, requestData.id_ruta)
      .input('id_producto', sql.Int, requestData.id_producto)
      .query(`
        SELECT id_inventario_ruta 
        FROM Inventario_Ruta 
        WHERE id_ruta = @id_ruta AND id_producto = @id_producto
      `);

    if (checkResult.recordset.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Registro duplicado", 
          details: "Ya existe un registro para este producto en esta ruta" 
        },
        { status: 400 }
      );
    }

    // Crear nuevo registro
    const result = await pool.request()
      .input('id_ruta', sql.Int, requestData.id_ruta)
      .input('id_producto', sql.Int, requestData.id_producto)
      .input('cantidad', sql.Int, requestData.cantidad)
      .query(`
        INSERT INTO Inventario_Ruta (id_ruta, id_producto, cantidad, fecha_actualizacion)
        OUTPUT INSERTED.id_inventario_ruta
        VALUES (@id_ruta, @id_producto, @cantidad, GETDATE())
      `);

    // Obtener datos completos del nuevo registro
    const newRecord = await pool.request()
      .input('id', sql.Int, result.recordset[0].id_inventario_ruta)
      .query(`
        SELECT 
          ir.id_inventario_ruta,
          ir.id_ruta,
          r.nombre AS ruta_nombre,
          ir.id_producto,
          p.codigo AS producto_codigo,
          p.nombre AS producto_nombre,
          ir.cantidad,
          ir.fecha_actualizacion
        FROM Inventario_Ruta ir
        JOIN Ruta r ON ir.id_ruta = r.id_ruta
        JOIN Producto p ON ir.id_producto = p.id_producto
        WHERE ir.id_inventario_ruta = @id
      `);

    return NextResponse.json({
      success: true,
      data: newRecord.recordset[0],
      message: "Registro de inventario creado correctamente"
    }, { status: 201 });

  } catch (error) {
    console.error("Error al crear registro de inventario:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno al crear registro",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}

// PUT - Actualizar registro de inventario
export async function PUT(req: NextRequest) {
  let pool;
  try {
    const requestData: InventarioRuta = await req.json();

    // Validación
    if (!requestData.id_inventario_ruta) {
      return NextResponse.json(
        { success: false, error: "ID requerido", details: "id_inventario_ruta es requerido para actualizar" },
        { status: 400 }
      );
    }

    if (requestData.cantidad !== undefined && requestData.cantidad < 0) {
      return NextResponse.json(
        { success: false, error: "Cantidad inválida", details: "La cantidad debe ser un número positivo" },
        { status: 400 }
      );
    }

    pool = await getConnection();

    // Verificar existencia
    const checkResult = await pool.request()
      .input('id', sql.Int, requestData.id_inventario_ruta)
      .query('SELECT id_inventario_ruta FROM Inventario_Ruta WHERE id_inventario_ruta = @id');

    if (checkResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, error: "Registro no encontrado", details: "El ID proporcionado no existe" },
        { status: 404 }
      );
    }

    // Actualizar registro
    await pool.request()
      .input('id', sql.Int, requestData.id_inventario_ruta)
      .input('cantidad', sql.Int, requestData.cantidad)
      .query(`
        UPDATE Inventario_Ruta 
        SET 
          cantidad = @cantidad,
          fecha_actualizacion = GETDATE()
        WHERE id_inventario_ruta = @id
      `);

    // Obtener datos actualizados
    const updatedRecord = await pool.request()
      .input('id', sql.Int, requestData.id_inventario_ruta)
      .query(`
        SELECT 
          ir.id_inventario_ruta,
          ir.id_ruta,
          r.nombre AS ruta_nombre,
          ir.id_producto,
          p.codigo AS producto_codigo,
          p.nombre AS producto_nombre,
          ir.cantidad,
          ir.fecha_actualizacion
        FROM Inventario_Ruta ir
        JOIN Ruta r ON ir.id_ruta = r.id_ruta
        JOIN Producto p ON ir.id_producto = p.id_producto
        WHERE ir.id_inventario_ruta = @id
      `);

    return NextResponse.json({
      success: true,
      data: updatedRecord.recordset[0],
      message: "Registro de inventario actualizado correctamente"
    });

  } catch (error) {
    console.error("Error al actualizar registro de inventario:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno al actualizar registro",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}

// DELETE - Eliminar registro de inventario
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  let pool;
  try {
    // Validación
    if (!id || isNaN(Number(id))) {
      return NextResponse.json(
        { success: false, error: "ID inválido", details: "Se requiere un ID válido" },
        { status: 400 }
      );
    }

    pool = await getConnection();

    // Verificar existencia
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT id_inventario_ruta FROM Inventario_Ruta WHERE id_inventario_ruta = @id');

    if (checkResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, error: "Registro no encontrado", details: "El ID proporcionado no existe" },
        { status: 404 }
      );
    }

    // Eliminar registro
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Inventario_Ruta WHERE id_inventario_ruta = @id');

    return NextResponse.json({
      success: true,
      message: "Registro de inventario eliminado correctamente",
      deletedId: Number(id)
    });

  } catch (error) {
    console.error("Error al eliminar registro de inventario:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno al eliminar registro",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}