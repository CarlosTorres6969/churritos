import { type NextRequest, NextResponse } from "next/server";
import { getConnection, closeConnection } from "@/lib/db";

interface ClienteCreditoDB {
  id_credito: number;
  id_cliente: number;
  limite_credito: number;
  saldo_actual: number;
  saldo_vencido: number;
  fecha_actualizacion: Date;
  activo: boolean;
  dias_credito: number;
  tasa_interes: number;
}

type ClienteCredito = {
  id_credito?: number;
  id_cliente: number;
  limite_credito: number;
  saldo_actual: number;
  saldo_vencido: number;
  fecha_actualizacion: Date | string;
  activo: boolean;
  dias_credito: number;
  tasa_interes: number;
};

// GET - Obtener créditos de clientes
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id_cliente = searchParams.get("id_cliente");
  const activo = searchParams.get("activo");

  let pool;
  try {
    pool = await getConnection();

    let query = `
      SELECT id_credito, id_cliente, limite_credito, saldo_actual, saldo_vencido, 
             fecha_actualizacion, activo, dias_credito, tasa_interes 
      FROM Cliente_Credito
    `;
    
    let conditions: string[] = [];
    let request = pool.request();

    if (id_cliente) {
      conditions.push("id_cliente = @id_cliente");
      request.input('id_cliente', parseInt(id_cliente));
    }

    if (activo) {
      conditions.push("activo = @activo");
      request.input('activo', activo === 'true' ? 1 : 0);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    const result = await request.query(query);

    const creditos = result.recordset.map((credito: ClienteCreditoDB) => ({
      id_credito: credito.id_credito,
      id_cliente: credito.id_cliente,
      limite_credito: credito.limite_credito,
      saldo_actual: credito.saldo_actual,
      saldo_vencido: credito.saldo_vencido,
      fecha_actualizacion: new Date(credito.fecha_actualizacion).toISOString().split('T')[0],
      activo: credito.activo,
      dias_credito: credito.dias_credito,
      tasa_interes: credito.tasa_interes
    }));

    return NextResponse.json(
      {
        success: true,
        data: creditos,
        message: "Créditos de clientes obtenidos correctamente",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al obtener créditos de clientes:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno al obtener créditos de clientes",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}

// POST - Crear crédito para cliente
export async function POST(req: NextRequest) {
  let pool;
  try {
    const requestData = await req.json();

    // Validación de campos requeridos
    if (!requestData?.id_cliente || typeof requestData.id_cliente !== 'number' || requestData.id_cliente <= 0) {
      return NextResponse.json(
        { success: false, error: "ID Cliente inválido", details: "El ID del cliente es requerido y debe ser un número positivo" },
        { status: 400 }
      );
    }

    if (!requestData?.limite_credito || isNaN(requestData.limite_credito) || requestData.limite_credito <= 0) {
      return NextResponse.json(
        { success: false, error: "Límite de crédito inválido", details: "El límite de crédito es requerido y debe ser un número positivo" },
        { status: 400 }
      );
    }

    if (requestData.dias_credito && (typeof requestData.dias_credito !== 'number' || requestData.dias_credito <= 0)) {
      return NextResponse.json(
        { success: false, error: "Días de crédito inválidos", details: "Los días de crédito deben ser un número positivo" },
        { status: 400 }
      );
    }

    // Validar saldos
    const saldo_actual = requestData.saldo_actual ? Number(requestData.saldo_actual) : 0;
    const saldo_vencido = requestData.saldo_vencido ? Number(requestData.saldo_vencido) : 0;
    const limite_credito = Number(requestData.limite_credito);

    if (saldo_actual < 0 || saldo_vencido < 0) {
      return NextResponse.json(
        { success: false, error: "Saldos inválidos", details: "Los saldos no pueden ser negativos" },
        { status: 400 }
      );
    }

    if (saldo_actual + saldo_vencido > limite_credito) {
      return NextResponse.json(
        { success: false, error: "Saldos exceden límite", details: "La suma de saldos no puede exceder el límite de crédito" },
        { status: 400 }
      );
    }

    // Preparar datos del crédito
    const creditoData: ClienteCredito = {
      id_cliente: requestData.id_cliente,
      limite_credito: limite_credito,
      saldo_actual: saldo_actual,
      saldo_vencido: saldo_vencido,
      fecha_actualizacion: requestData.fecha_actualizacion ? new Date(requestData.fecha_actualizacion) : new Date(),
      activo: requestData.activo !== undefined ? Boolean(requestData.activo) : true,
      dias_credito: requestData.dias_credito || 30,
      tasa_interes: requestData.tasa_interes || 0
    };

    pool = await getConnection();

    // Verificar si el cliente existe en la tabla "Clientes"
    const clienteCheck = await pool
      .request()
      .input('id_cliente', creditoData.id_cliente)
      .query('SELECT COUNT(*) as count FROM Clientes WHERE id_cliente = @id_cliente');

    if (clienteCheck.recordset[0].count === 0) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado", details: "El ID de cliente proporcionado no existe" },
        { status: 404 }
      );
    }

    // Verificar si ya existe un crédito para este cliente
    const creditoCheck = await pool
      .request()
      .input('id_cliente', creditoData.id_cliente)
      .query('SELECT COUNT(*) as count FROM Cliente_Credito WHERE id_cliente = @id_cliente');

    if (creditoCheck.recordset[0].count > 0) {
      return NextResponse.json(
        { success: false, error: "Crédito existente", details: "Ya existe un crédito para este cliente" },
        { status: 400 }
      );
    }

    // Crear el nuevo crédito
    const result = await pool
      .request()
      .input('id_cliente', creditoData.id_cliente)
      .input('limite_credito', creditoData.limite_credito)
      .input('saldo_actual', creditoData.saldo_actual)
      .input('saldo_vencido', creditoData.saldo_vencido)
      .input('fecha_actualizacion', creditoData.fecha_actualizacion)
      .input('activo', creditoData.activo ? 1 : 0)
      .input('dias_credito', creditoData.dias_credito)
      .input('tasa_interes', creditoData.tasa_interes)
      .query(`
        INSERT INTO Cliente_Credito (
          id_cliente, limite_credito, saldo_actual, saldo_vencido, 
          fecha_actualizacion, activo, dias_credito, tasa_interes
        )
        OUTPUT INSERTED.id_credito
        VALUES (
          @id_cliente, @limite_credito, @saldo_actual, @saldo_vencido,
          @fecha_actualizacion, @activo, @dias_credito, @tasa_interes
        )
      `);

    const nuevoCredito = {
      id_credito: result.recordset[0].id_credito,
      ...creditoData,
      fecha_actualizacion: creditoData.fecha_actualizacion instanceof Date 
        ? creditoData.fecha_actualizacion.toISOString().split('T')[0]
        : creditoData.fecha_actualizacion
    };

    return NextResponse.json(
      {
        success: true,
        data: nuevoCredito,
        message: "Crédito de cliente creado exitosamente",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al crear crédito de cliente:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al crear crédito de cliente",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}


// PUT - Actualizar crédito de cliente
export async function PUT(req: NextRequest) {
  let pool;
  try {
    const requestData = await req.json();

    // Validación básica de ID
    if (!requestData?.id_credito || typeof requestData.id_credito !== 'number' || requestData.id_credito <= 0) {
      return NextResponse.json(
        { success: false, error: "ID inválido", details: "El ID debe ser un número positivo" },
        { status: 400 }
      );
    }

    pool = await getConnection();

    // 1. Obtener crédito existente
    const existingCredito = await pool
      .request()
      .input('id_credito', requestData.id_credito)
      .query<ClienteCreditoDB>('SELECT * FROM Cliente_Credito WHERE id_credito = @id_credito');

    if (existingCredito.recordset.length === 0) {
      return NextResponse.json(
        { success: false, error: "Crédito no encontrado", details: "El ID proporcionado no existe" },
        { status: 404 }
      );
    }

    const creditoActual = existingCredito.recordset[0];

    // 2. Validar campos modificables
    if (requestData.limite_credito !== undefined) {
      const limite_credito = Number(requestData.limite_credito);
      if (isNaN(limite_credito) || limite_credito <= 0) {
        return NextResponse.json(
          { success: false, error: "Límite de crédito inválido", details: "Debe ser un número positivo" },
          { status: 400 }
        );
      }

      // Validar que los saldos no excedan el nuevo límite
      const saldo_actual = requestData.saldo_actual !== undefined 
        ? Number(requestData.saldo_actual) 
        : creditoActual.saldo_actual;
      
      const saldo_vencido = requestData.saldo_vencido !== undefined 
        ? Number(requestData.saldo_vencido) 
        : creditoActual.saldo_vencido;

      if (saldo_actual + saldo_vencido > limite_credito) {
        return NextResponse.json(
          { success: false, error: "Saldos exceden límite", details: "La suma de saldos no puede exceder el nuevo límite de crédito" },
          { status: 400 }
        );
      }
    }

    if (requestData.saldo_actual !== undefined) {
      const saldo_actual = Number(requestData.saldo_actual);
      if (isNaN(saldo_actual) || saldo_actual < 0) {
        return NextResponse.json(
          { success: false, error: "Saldo actual inválido", details: "Debe ser un número no negativo" },
          { status: 400 }
        );
      }
    }

    if (requestData.saldo_vencido !== undefined) {
      const saldo_vencido = Number(requestData.saldo_vencido);
      if (isNaN(saldo_vencido) || saldo_vencido < 0) {
        return NextResponse.json(
          { success: false, error: "Saldo vencido inválido", details: "Debe ser un número no negativo" },
          { status: 400 }
        );
      }
    }

    if (requestData.dias_credito !== undefined && 
        (typeof requestData.dias_credito !== 'number' || requestData.dias_credito <= 0)) {
      return NextResponse.json(
        { success: false, error: "Días de crédito inválidos", details: "Deben ser un número positivo" },
        { status: 400 }
      );
    }

    // 3. Preparar datos para actualización
    const creditoActualizado = {
      id_credito: requestData.id_credito,
      limite_credito: requestData.limite_credito !== undefined 
        ? Number(requestData.limite_credito) 
        : creditoActual.limite_credito,
      saldo_actual: requestData.saldo_actual !== undefined 
        ? Number(requestData.saldo_actual) 
        : creditoActual.saldo_actual,
      saldo_vencido: requestData.saldo_vencido !== undefined 
        ? Number(requestData.saldo_vencido) 
        : creditoActual.saldo_vencido,
      fecha_actualizacion: requestData.fecha_actualizacion 
        ? new Date(requestData.fecha_actualizacion) 
        : new Date(),
      activo: requestData.activo !== undefined 
        ? Boolean(requestData.activo) 
        : creditoActual.activo,
      dias_credito: requestData.dias_credito !== undefined 
        ? Number(requestData.dias_credito) 
        : creditoActual.dias_credito,
      tasa_interes: requestData.tasa_interes !== undefined 
        ? Number(requestData.tasa_interes) 
        : creditoActual.tasa_interes
    };

    // 4. Actualizar el crédito
    await pool
      .request()
      .input('id_credito', creditoActualizado.id_credito)
      .input('limite_credito', creditoActualizado.limite_credito)
      .input('saldo_actual', creditoActualizado.saldo_actual)
      .input('saldo_vencido', creditoActualizado.saldo_vencido)
      .input('fecha_actualizacion', creditoActualizado.fecha_actualizacion)
      .input('activo', creditoActualizado.activo ? 1 : 0)
      .input('dias_credito', creditoActualizado.dias_credito)
      .input('tasa_interes', creditoActualizado.tasa_interes)
      .query(`
        UPDATE Cliente_Credito SET
          limite_credito = @limite_credito,
          saldo_actual = @saldo_actual,
          saldo_vencido = @saldo_vencido,
          fecha_actualizacion = @fecha_actualizacion,
          activo = @activo,
          dias_credito = @dias_credito,
          tasa_interes = @tasa_interes
        WHERE id_credito = @id_credito
      `);

    // 5. Obtener y devolver el crédito actualizado
    const result = await pool
      .request()
      .input('id_credito', creditoActualizado.id_credito)
      .query<ClienteCreditoDB>('SELECT * FROM Cliente_Credito WHERE id_credito = @id_credito');

    const credito = result.recordset[0];
    
    return NextResponse.json({
      success: true,
      data: {
        ...credito,
        fecha_actualizacion: new Date(credito.fecha_actualizacion).toISOString().split('T')[0],
      },
      message: "Crédito de cliente actualizado correctamente"
    }, { status: 200 });

  } catch (error) {
    console.error("Error al actualizar crédito de cliente:", error);
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

// DELETE - Eliminar crédito de cliente por ID
export async function DELETE(req: NextRequest) {
  let pool;
  try {
    const { searchParams } = new URL(req.url);
    const id_credito = Number(searchParams.get("id"));

    // Validación de ID
    if (!id_credito || isNaN(id_credito) || id_credito <= 0) {
      return NextResponse.json(
        { success: false, error: "ID inválido", details: "El ID debe ser un número positivo" },
        { status: 400 }
      );
    }

    pool = await getConnection();

    // Verificar si el crédito existe
    const checkResult = await pool
      .request()
      .input('id_credito', id_credito)
      .query<{ count: number }>('SELECT COUNT(*) as count FROM Cliente_Credito WHERE id_credito = @id_credito');

    if (checkResult.recordset[0].count === 0) {
      return NextResponse.json(
        { success: false, error: "Crédito no encontrado", details: "El ID proporcionado no existe" },
        { status: 404 }
      );
    }

    // Verificar si hay saldos pendientes
    const saldoCheck = await pool
      .request()
      .input('id_credito', id_credito)
      .query<{ saldo_total: number }>('SELECT (saldo_actual + saldo_vencido) as saldo_total FROM Cliente_Credito WHERE id_credito = @id_credito');

    if (saldoCheck.recordset[0].saldo_total > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Crédito con saldo pendiente", 
          details: "No se puede eliminar un crédito con saldos pendientes" 
        },
        { status: 400 }
      );
    }

    // Eliminar el crédito
    await pool
      .request()
      .input('id_credito', id_credito)
      .query('DELETE FROM Cliente_Credito WHERE id_credito = @id_credito');

    return NextResponse.json(
      {
        success: true,
        message: "Crédito de cliente eliminado correctamente",
        deletedId: id_credito
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al eliminar crédito de cliente:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al eliminar crédito de cliente",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}