import { type NextRequest, NextResponse } from "next/server";
import { getConnection, closeConnection } from "@/lib/db";

interface LimiteCreditoDB {
  id_limite_credito: number;
  id_personal: number;
  monto_maximo: number;
  monto_actual: number;
  fecha_asignacion: Date;
}

type LimiteCredito = {
  id_limite_credito?: number;
  id_personal: number;
  monto_maximo: number;
  monto_actual: number;
  fecha_asignacion: Date | string;
};

// GET - Obtener límites de crédito
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id_personal = searchParams.get("id_personal");

  let pool;
  try {
    pool = await getConnection();

    let query = `
      SELECT id_limite_credito, id_personal, monto_maximo, monto_actual, fecha_asignacion 
      FROM Limite_Credito
    `;
    
    let request = pool.request();

    if (id_personal) {
      query += " WHERE id_personal = @id_personal";
      request.input('id_personal', parseInt(id_personal));
    }

    const result = await request.query(query);

    const limites = result.recordset.map((limite: LimiteCreditoDB) => ({
      id_limite_credito: limite.id_limite_credito,
      id_personal: limite.id_personal,
      monto_maximo: limite.monto_maximo,
      monto_actual: limite.monto_actual,
      fecha_asignacion: new Date(limite.fecha_asignacion).toISOString().split('T')[0],
    }));

    return NextResponse.json(
      {
        success: true,
        data: limites,
        message: "Límites de crédito obtenidos correctamente",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al obtener límites de crédito:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno al obtener límites de crédito",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}

// POST - Crear límite de crédito
export async function POST(req: NextRequest) {
  let pool;
  try {
    const requestData = await req.json();

    // Validación de campos requeridos
    if (!requestData?.id_personal || typeof requestData.id_personal !== 'number' || requestData.id_personal <= 0) {
      return NextResponse.json(
        { success: false, error: "ID Personal inválido", details: "El ID del personal es requerido y debe ser un número positivo" },
        { status: 400 }
      );
    }

    if (!requestData?.monto_maximo || isNaN(requestData.monto_maximo) || requestData.monto_maximo <= 0) {
      return NextResponse.json(
        { success: false, error: "Monto máximo inválido", details: "El monto máximo es requerido y debe ser un número positivo" },
        { status: 400 }
      );
    }

    // Validar que monto_actual no sea mayor que monto_maximo
    const monto_actual = requestData.monto_actual ? Number(requestData.monto_actual) : 0;
    const monto_maximo = Number(requestData.monto_maximo);

    if (monto_actual < 0) {
      return NextResponse.json(
        { success: false, error: "Monto actual inválido", details: "El monto actual no puede ser negativo" },
        { status: 400 }
      );
    }

    if (monto_actual > monto_maximo) {
      return NextResponse.json(
        { success: false, error: "Montos inválidos", details: "El monto actual no puede ser mayor que el monto máximo" },
        { status: 400 }
      );
    }

    // Validar fecha de asignación (si se proporciona)
    const fecha_asignacion = requestData.fecha_asignacion 
      ? new Date(requestData.fecha_asignacion)
      : new Date();

    if (isNaN(fecha_asignacion.getTime())) {
      return NextResponse.json(
        { success: false, error: "Fecha inválida", details: "La fecha de asignación no es válida" },
        { status: 400 }
      );
    }

    // Preparar datos del límite de crédito
    const limiteData: LimiteCredito = {
      id_personal: requestData.id_personal,
      monto_maximo: monto_maximo,
      monto_actual: monto_actual,
      fecha_asignacion: fecha_asignacion,
    };

    pool = await getConnection();

    // Verificar si ya existe un límite para este personal
    const checkResult = await pool
      .request()
      .input('id_personal', limiteData.id_personal)
      .query('SELECT COUNT(*) as count FROM Limite_Credito WHERE id_personal = @id_personal');

    if (checkResult.recordset[0].count > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Límite existente",
          details: "Ya existe un límite de crédito para este personal",
        },
        { status: 400 }
      );
    }

    // Crear el nuevo límite de crédito
    const result = await pool
      .request()
      .input('id_personal', limiteData.id_personal)
      .input('monto_maximo', limiteData.monto_maximo)
      .input('monto_actual', limiteData.monto_actual)
      .input('fecha_asignacion', limiteData.fecha_asignacion)
      .query(`
        INSERT INTO Limite_Credito (id_personal, monto_maximo, monto_actual, fecha_asignacion)
        OUTPUT INSERTED.id_limite_credito
        VALUES (@id_personal, @monto_maximo, @monto_actual, @fecha_asignacion)
      `);

    const nuevoLimite = {
      id_limite_credito: result.recordset[0].id_limite_credito,
      ...limiteData,
      fecha_asignacion: fecha_asignacion.toISOString().split('T')[0],
    };

    return NextResponse.json(
      {
        success: true,
        data: nuevoLimite,
        message: "Límite de crédito creado exitosamente",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al crear límite de crédito:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al crear límite de crédito",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}

// PUT - Actualizar límite de crédito
export async function PUT(req: NextRequest) {
  let pool;
  try {
    const requestData = await req.json();

    // Validación básica de ID
    if (!requestData?.id_limite_credito || typeof requestData.id_limite_credito !== 'number' || requestData.id_limite_credito <= 0) {
      return NextResponse.json(
        { success: false, error: "ID inválido", details: "El ID debe ser un número positivo" },
        { status: 400 }
      );
    }

    pool = await getConnection();

    // 1. Obtener límite existente
    const existingLimite = await pool
      .request()
      .input('id_limite_credito', requestData.id_limite_credito)
      .query<LimiteCreditoDB>('SELECT * FROM Limite_Credito WHERE id_limite_credito = @id_limite_credito');

    if (existingLimite.recordset.length === 0) {
      return NextResponse.json(
        { success: false, error: "Límite no encontrado", details: "El ID proporcionado no existe" },
        { status: 404 }
      );
    }

    const limiteActual = existingLimite.recordset[0];

    // 2. Validar campos modificables
    if (requestData.monto_maximo !== undefined) {
      const monto_maximo = Number(requestData.monto_maximo);
      if (isNaN(monto_maximo)) {
        return NextResponse.json(
          { success: false, error: "Monto máximo inválido", details: "Debe ser un número" },
          { status: 400 }
        );
      }

      if (monto_maximo <= 0) {
        return NextResponse.json(
          { success: false, error: "Monto máximo inválido", details: "Debe ser un número positivo" },
          { status: 400 }
        );
      }

      // Validar que el monto actual no sea mayor que el nuevo máximo
      if (limiteActual.monto_actual > monto_maximo) {
        return NextResponse.json(
          { success: false, error: "Monto inválido", details: "El monto actual no puede ser mayor que el nuevo monto máximo" },
          { status: 400 }
        );
      }
    }

    if (requestData.monto_actual !== undefined) {
      const monto_actual = Number(requestData.monto_actual);
      if (isNaN(monto_actual)) {
        return NextResponse.json(
          { success: false, error: "Monto actual inválido", details: "Debe ser un número" },
          { status: 400 }
        );
      }

      if (monto_actual < 0) {
        return NextResponse.json(
          { success: false, error: "Monto actual inválido", details: "No puede ser negativo" },
          { status: 400 }
        );
      }

      const maximo = requestData.monto_maximo !== undefined 
        ? Number(requestData.monto_maximo) 
        : limiteActual.monto_maximo;

      if (monto_actual > maximo) {
        return NextResponse.json(
          { success: false, error: "Monto inválido", details: "El monto actual no puede ser mayor que el monto máximo" },
          { status: 400 }
        );
      }
    }

    // 3. Preparar datos para actualización
    const limiteActualizado = {
      id_limite_credito: requestData.id_limite_credito,
      monto_maximo: requestData.monto_maximo !== undefined 
        ? Number(requestData.monto_maximo) 
        : limiteActual.monto_maximo,
      monto_actual: requestData.monto_actual !== undefined 
        ? Number(requestData.monto_actual) 
        : limiteActual.monto_actual,
      fecha_asignacion: requestData.fecha_asignacion 
        ? new Date(requestData.fecha_asignacion) 
        : new Date(limiteActual.fecha_asignacion),
    };

    // Validar fecha
    if (isNaN(limiteActualizado.fecha_asignacion.getTime())) {
      return NextResponse.json(
        { success: false, error: "Fecha inválida", details: "La fecha de asignación no es válida" },
        { status: 400 }
      );
    }

    // 4. Actualizar el límite de crédito
    await pool
      .request()
      .input('id_limite_credito', limiteActualizado.id_limite_credito)
      .input('monto_maximo', limiteActualizado.monto_maximo)
      .input('monto_actual', limiteActualizado.monto_actual)
      .input('fecha_asignacion', limiteActualizado.fecha_asignacion)
      .query(`
        UPDATE Limite_Credito SET
          monto_maximo = @monto_maximo,
          monto_actual = @monto_actual,
          fecha_asignacion = @fecha_asignacion
        WHERE id_limite_credito = @id_limite_credito
      `);

    // 5. Obtener y devolver el límite actualizado
    const result = await pool
      .request()
      .input('id_limite_credito', limiteActualizado.id_limite_credito)
      .query<LimiteCreditoDB>('SELECT * FROM Limite_Credito WHERE id_limite_credito = @id_limite_credito');

    const limite = result.recordset[0];
    
    return NextResponse.json({
      success: true,
      data: {
        ...limite,
        fecha_asignacion: new Date(limite.fecha_asignacion).toISOString().split('T')[0],
      },
      message: "Límite de crédito actualizado correctamente"
    }, { status: 200 });

  } catch (error) {
    console.error("Error al actualizar límite de crédito:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error en la actualización",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}

// DELETE - Eliminar límite de crédito por ID
export async function DELETE(req: NextRequest) {
  let pool;
  try {
    const { searchParams } = new URL(req.url);
    const id_limite_credito = Number(searchParams.get("id"));

    // Validación de ID
    if (!id_limite_credito || isNaN(id_limite_credito) || id_limite_credito <= 0) {
      return NextResponse.json(
        { success: false, error: "ID inválido", details: "El ID debe ser un número positivo" },
        { status: 400 }
      );
    }

    pool = await getConnection();

    // Verificar si el límite existe
    const checkResult = await pool
      .request()
      .input('id_limite_credito', id_limite_credito)
      .query<{ count: number }>('SELECT COUNT(*) as count FROM Limite_Credito WHERE id_limite_credito = @id_limite_credito');

    if (checkResult.recordset[0].count === 0) {
      return NextResponse.json(
        { success: false, error: "Límite no encontrado", details: "El ID proporcionado no existe" },
        { status: 404 }
      );
    }

    // Eliminar el límite
    await pool
      .request()
      .input('id_limite_credito', id_limite_credito)
      .query('DELETE FROM Limite_Credito WHERE id_limite_credito = @id_limite_credito');

    return NextResponse.json(
      {
        success: true,
        message: "Límite de crédito eliminado correctamente",
        deletedId: id_limite_credito
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al eliminar límite de crédito:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al eliminar límite de crédito",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}