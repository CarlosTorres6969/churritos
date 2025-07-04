import { type NextRequest, NextResponse } from "next/server";
import { getConnection, closeConnection } from "@/lib/db";
import sql from "mssql";

// Función mejorada para manejo de errores
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error occurred";
}

// Interfaz con validaciones adicionales
export interface CAI {
  id_cai?: number;
  codigo_cai: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  rango_inicial: number;
  rango_final: number;
  activo?: boolean;
}

// Validaciones comunes
const validateCAIData = (caiData: Partial<CAI>) => {
  const errors: string[] = [];

  if (caiData.codigo_cai && caiData.codigo_cai.length < 5) {
    errors.push("El código CAI debe tener al menos 5 caracteres");
  }

  if (caiData.fecha_inicio && caiData.fecha_fin) {
    const fechaInicio = new Date(caiData.fecha_inicio);
    const fechaFin = new Date(caiData.fecha_fin);
    
    if (fechaInicio >= fechaFin) {
      errors.push("La fecha de inicio debe ser anterior a la fecha de fin");
    }
  }

  if (caiData.rango_inicial !== undefined && caiData.rango_final !== undefined) {
    if (caiData.rango_inicial >= caiData.rango_final) {
      errors.push("El rango inicial debe ser menor al rango final");
    }
  }

  return errors;
};

export async function GET(req: NextRequest) {
  const pool = await getConnection();
  const { searchParams } = new URL(req.url);
  const id_cai_param = searchParams.get('id_cai');
  const id_cai = id_cai_param ? parseInt(id_cai_param) : null;
  const activo = searchParams.get('activo');

  try {
    if (id_cai) {
      if (isNaN(id_cai)) {
        return NextResponse.json(
          { success: false, error: "El parámetro id_cai debe ser un número válido" },
          { status: 400 }
        );
      }

      // Consulta mejorada con manejo de errores específico
      const caiRequest = await pool
        .request()
        .input("id_cai", sql.Int, id_cai)
        .query(`
          SELECT 
            id_cai,
            codigo_cai,
            CONVERT(varchar, fecha_inicio, 23) as fecha_inicio,
            CONVERT(varchar, fecha_fin, 23) as fecha_fin,
            rango_inicial,
            rango_final,
            activo
          FROM CAI
          WHERE id_cai = @id_cai
        `);

      if (caiRequest.recordset.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: "CAI no encontrado" 
        }, { status: 404 });
      }

      const caiData = caiRequest.recordset[0];

      // Estadísticas mejoradas con manejo de errores
      const statsRequest = await pool
        .request()
        .input("id_cai", sql.Int, id_cai)
        .query(`
          SELECT 
            COUNT(*) as facturas_emitidas,
            MIN(numero_factura) as primer_numero,
            MAX(numero_factura) as ultimo_numero,
            SUM(CASE WHEN anulada = 1 THEN 1 ELSE 0 END) as facturas_anuladas
          FROM Factura
          WHERE id_cai = @id_cai
        `);

      return NextResponse.json({
        success: true,
        data: {
          ...caiData,
          estadisticas: statsRequest.recordset[0]
        }
      });
    } else {
      // Consulta paginada y filtrada mejorada
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '10');
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          id_cai,
          codigo_cai,
          CONVERT(varchar, fecha_inicio, 23) as fecha_inicio,
          CONVERT(varchar, fecha_fin, 23) as fecha_fin,
          rango_inicial,
          rango_final,
          activo,
          (SELECT COUNT(*) FROM Factura WHERE Factura.id_cai = CAI.id_cai) as facturas_emitidas
        FROM CAI
      `;

      const request = pool.request();
      const whereClauses = [];

      if (activo !== null && (activo === "true" || activo === "false")) {
        whereClauses.push("activo = @activo");
        request.input("activo", sql.Bit, activo === 'true');
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }

      query += ` 
        ORDER BY activo DESC, fecha_fin DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `;

      request.input("offset", sql.Int, offset);
      request.input("limit", sql.Int, limit);

      // Consulta para el total de registros
      let countQuery = "SELECT COUNT(*) as total FROM CAI";
      if (whereClauses.length > 0) {
        countQuery += ` WHERE ${whereClauses.join(" AND ")}`;
      }

      const countRequest = pool.request();
      if (activo !== null && (activo === "true" || activo === "false")) {
        countRequest.input("activo", sql.Bit, activo === 'true');
      }

      const [caisResult, totalResult] = await Promise.all([
        request.query(query),
        countRequest.query(countQuery)
      ]);

      return NextResponse.json({
        success: true,
        data: {
          items: caisResult.recordset,
          total: totalResult.recordset[0].total,
          page,
          limit,
          totalPages: Math.ceil(totalResult.recordset[0].total / limit)
        }
      });
    }
  } catch (error) {
    console.error("Error fetching CAIs:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: getErrorMessage(error),
        details: process.env.NODE_ENV === "development" ? error : undefined
      },
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
    const caiData: Omit<CAI, 'id_cai'> = await req.json();
    
    // Validación mejorada
    const validationErrors = validateCAIData(caiData);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, errors: validationErrors },
        { status: 400 }
      );
    }

    const { 
      codigo_cai, 
      fecha_inicio, 
      fecha_fin, 
      rango_inicial, 
      rango_final,
      activo = false
    } = caiData;

    // Verificar duplicados mejorado
    const checkCAI = await pool
      .request()
      .input("codigo_cai", sql.VarChar(50), codigo_cai.trim())
      .query(`
        SELECT id_cai FROM CAI 
        WHERE LOWER(TRIM(codigo_cai)) = LOWER(TRIM(@codigo_cai))
      `);

    if (checkCAI.recordset.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Ya existe un CAI con este código",
          existingId: checkCAI.recordset[0].id_cai
        },
        { status: 400 }
      );
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      if (activo) {
        const deactivateRequest = new sql.Request(transaction);
        await deactivateRequest.query(`
          UPDATE CAI SET activo = 0 
          WHERE activo = 1
        `);
      }

      const insertRequest = new sql.Request(transaction);
      const insertResult = await insertRequest
        .input("codigo_cai", sql.VarChar(50), codigo_cai.trim())
        .input("fecha_inicio", sql.Date, new Date(fecha_inicio))
        .input("fecha_fin", sql.Date, new Date(fecha_fin))
        .input("rango_inicial", sql.Int, rango_inicial)
        .input("rango_final", sql.Int, rango_final)
        .input("activo", sql.Bit, activo)
        .query(`
          INSERT INTO CAI (
            codigo_cai, fecha_inicio, fecha_fin, rango_inicial, 
            rango_final, activo
          )
          OUTPUT INSERTED.id_cai, INSERTED.codigo_cai
          VALUES (
            @codigo_cai, @fecha_inicio, @fecha_fin, @rango_inicial,
            @rango_final, @activo
          )
        `);

      await transaction.commit();

      return NextResponse.json({
        success: true,
        data: {
          ...insertResult.recordset[0],
          message: "CAI registrado exitosamente"
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.error("Transaction error:", error);
      return NextResponse.json(
        { 
          success: false, 
          error: "Error al registrar el CAI",
          details: process.env.NODE_ENV === "development" ? error : undefined
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Error de conexión con la base de datos",
        details: process.env.NODE_ENV === "development" ? error : undefined
      },
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

export async function PUT(req: NextRequest) {
  const pool = await getConnection();
  const { searchParams } = new URL(req.url);
  const id_cai_param = searchParams.get('id_cai');
  const id_cai = id_cai_param ? parseInt(id_cai_param) : null;

  if (!id_cai || isNaN(id_cai)) {
    return NextResponse.json(
      { success: false, error: "Se requiere el parámetro id_cai como número válido" },
      { status: 400 }
    );
  }

  try {
    const caiData: Partial<Omit<CAI, 'id_cai'>> = await req.json();
    
    // Validación mejorada
    const validationErrors = validateCAIData(caiData);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, errors: validationErrors },
        { status: 400 }
      );
    }

    const { 
      codigo_cai, 
      fecha_inicio, 
      fecha_fin, 
      rango_inicial, 
      rango_final,
      activo
    } = caiData;

    if (!codigo_cai && !fecha_inicio && !fecha_fin && 
        rango_inicial === undefined && rango_final === undefined && 
        activo === undefined) {
      return NextResponse.json(
        { success: false, error: "Se requiere al menos un campo para actualizar" },
        { status: 400 }
      );
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const currentCAIRequest = new sql.Request(transaction);
      const currentCAI = await currentCAIRequest
        .input("id_cai", sql.Int, id_cai)
        .query(`
          SELECT codigo_cai, activo, rango_inicial, rango_final 
          FROM CAI 
          WHERE id_cai = @id_cai
        `);

      if (currentCAI.recordset.length === 0) {
        await transaction.rollback();
        return NextResponse.json(
          { success: false, error: "CAI no encontrado" },
          { status: 404 }
        );
      }

      const currentData = currentCAI.recordset[0];

      // Verificación de duplicados mejorada
      if (codigo_cai && codigo_cai.trim() !== currentData.codigo_cai.trim()) {
        const checkDuplicateRequest = new sql.Request(transaction);
        const duplicateCheck = await checkDuplicateRequest
          .input("codigo_cai", sql.VarChar(50), codigo_cai.trim())
          .input("id_cai", sql.Int, id_cai)
          .query(`
            SELECT id_cai FROM CAI 
            WHERE LOWER(TRIM(codigo_cai)) = LOWER(TRIM(@codigo_cai))
            AND id_cai != @id_cai
          `);

        if (duplicateCheck.recordset.length > 0) {
          await transaction.rollback();
          return NextResponse.json(
            { 
              success: false, 
              error: "Ya existe otro CAI con este código",
              existingId: duplicateCheck.recordset[0].id_cai
            },
            { status: 400 }
          );
        }
      }

      // Validación de rangos si se están modificando
      if ((rango_inicial !== undefined || rango_final !== undefined) && 
          currentData.facturas_emitidas > 0) {
        const facturasCheck = await new sql.Request(transaction)
          .input("id_cai", sql.Int, id_cai)
          .query(`
            SELECT 
              MIN(numero_factura) as min_numero,
              MAX(numero_factura) as max_numero
            FROM Factura
            WHERE id_cai = @id_cai AND anulada = 0
          `);

        const facturasData = facturasCheck.recordset[0];
        const newRangoInicial = rango_inicial ?? currentData.rango_inicial;
        const newRangoFinal = rango_final ?? currentData.rango_final;

        if (facturasData.min_numero < newRangoInicial || 
            facturasData.max_numero > newRangoFinal) {
          await transaction.rollback();
          return NextResponse.json(
            { 
              success: false, 
              error: "No se puede modificar el rango para que no incluya las facturas existentes"
            },
            { status: 400 }
          );
        }
      }

      // Manejo de activación/desactivación mejorado
      if (activo !== undefined && activo !== currentData.activo) {
        if (activo) {
          await new sql.Request(transaction)
            .input("current_id", sql.Int, id_cai)
            .query(`
              UPDATE CAI SET activo = 0 
              WHERE activo = 1 AND id_cai != @current_id
            `);
        } else if (currentData.activo) {
          const facturasCheck = await new sql.Request(transaction)
            .input("id_cai", sql.Int, id_cai)
            .query(`
              SELECT COUNT(*) as total 
              FROM Factura
              WHERE id_cai = @id_cai AND anulada = 0
            `);

          if (facturasCheck.recordset[0].total > 0) {
            await transaction.rollback();
            return NextResponse.json(
              { 
                success: false, 
                error: "No se puede desactivar un CAI con facturas pendientes"
              },
              { status: 400 }
            );
          }
        }
      }

      // Construcción dinámica de la consulta de actualización
      const updateFields = [];
      const updateRequest = new sql.Request(transaction);

      if (codigo_cai) {
        updateFields.push("codigo_cai = @codigo_cai");
        updateRequest.input("codigo_cai", sql.VarChar(50), codigo_cai.trim());
      }
      
      if (fecha_inicio) {
        updateFields.push("fecha_inicio = @fecha_inicio");
        updateRequest.input("fecha_inicio", sql.Date, new Date(fecha_inicio));
      }
      
      if (fecha_fin) {
        updateFields.push("fecha_fin = @fecha_fin");
        updateRequest.input("fecha_fin", sql.Date, new Date(fecha_fin));
      }
      
      if (rango_inicial !== undefined) {
        updateFields.push("rango_inicial = @rango_inicial");
        updateRequest.input("rango_inicial", sql.Int, rango_inicial);
      }
      
      if (rango_final !== undefined) {
        updateFields.push("rango_final = @rango_final");
        updateRequest.input("rango_final", sql.Int, rango_final);
      }
      
      if (activo !== undefined) {
        updateFields.push("activo = @activo");
        updateRequest.input("activo", sql.Bit, activo);
      }

      if (updateFields.length > 0) {
        updateRequest.input("id_cai", sql.Int, id_cai);
        
        const updateQuery = `
          UPDATE CAI 
          SET ${updateFields.join(", ")} 
          WHERE id_cai = @id_cai
        `;

        await updateRequest.query(updateQuery);
      }

      await transaction.commit();

      // Obtener el CAI actualizado para devolverlo
      const updatedCAI = await pool
        .request()
        .input("id_cai", sql.Int, id_cai)
        .query(`
          SELECT 
            id_cai,
            codigo_cai,
            CONVERT(varchar, fecha_inicio, 23) as fecha_inicio,
            CONVERT(varchar, fecha_fin, 23) as fecha_fin,
            rango_inicial,
            rango_final,
            activo
          FROM CAI
          WHERE id_cai = @id_cai
        `);

      return NextResponse.json({
        success: true,
        data: {
          ...updatedCAI.recordset[0],
          message: "CAI actualizado exitosamente"
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.error("Transaction error:", error);
      return NextResponse.json(
        { 
          success: false, 
          error: "Error al actualizar el CAI",
          details: process.env.NODE_ENV === "development" ? error : undefined
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Error de conexión con la base de datos",
        details: process.env.NODE_ENV === "development" ? error : undefined
      },
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

export async function DELETE(req: NextRequest) {
  const pool = await getConnection();
  const { searchParams } = new URL(req.url);
  const id_cai_param = searchParams.get('id_cai');
  const id_cai = id_cai_param ? parseInt(id_cai_param) : null;

  if (!id_cai || isNaN(id_cai)) {
    return NextResponse.json(
      { success: false, error: "Se requiere el parámetro id_cai como número válido" },
      { status: 400 }
    );
  }

  try {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Verificación mejorada en una sola consulta
      const checkRequest = new sql.Request(transaction)
        .input("id_cai", sql.Int, id_cai)
        .query(`
          SELECT 
            c.activo, 
            c.codigo_cai,
            COUNT(f.id_factura) as total_facturas,
            SUM(CASE WHEN f.anulada = 0 THEN 1 ELSE 0 END) as facturas_activas
          FROM CAI c
          LEFT JOIN Factura f ON f.id_cai = c.id_cai
          WHERE c.id_cai = @id_cai
          GROUP BY c.activo, c.codigo_cai
        `);

      const checkResult = await checkRequest;

      if (checkResult.recordset.length === 0) {
        await transaction.rollback();
        return NextResponse.json(
          { success: false, error: "CAI no encontrado" },
          { status: 404 }
        );
      }

      const caiInfo = checkResult.recordset[0];

      if (caiInfo.activo) {
        await transaction.rollback();
        return NextResponse.json(
          { 
            success: false, 
            error: "No se puede eliminar un CAI activo. Desactívelo primero."
          },
          { status: 400 }
        );
      }

      if (caiInfo.facturas_activas > 0) {
        await transaction.rollback();
        return NextResponse.json(
          { 
            success: false, 
            error: "No se puede eliminar un CAI con facturas activas asociadas"
          },
          { status: 400 }
        );
      }

      // Eliminación del CAI
      await new sql.Request(transaction)
        .input("id_cai", sql.Int, id_cai)
        .query("DELETE FROM CAI WHERE id_cai = @id_cai");

      await transaction.commit();

      return NextResponse.json({
        success: true,
        data: {
          id_cai,
          codigo_cai: caiInfo.codigo_cai,
          message: "CAI eliminado exitosamente"
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.error("Transaction error:", error);
      return NextResponse.json(
        { 
          success: false, 
          error: "Error al eliminar el CAI",
          details: process.env.NODE_ENV === "development" ? error : undefined
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Error de conexión con la base de datos",
        details: process.env.NODE_ENV === "development" ? error : undefined
      },
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