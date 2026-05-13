import { type NextRequest, NextResponse } from "next/server"
import { getConnection, closeConnection } from "@/lib/db"
import sql from "mssql"

interface Clientes {
  id_cliente?: number
  nombre: string
  apellido: string
  telefono?: string | null
  direccion: string
  email?: string | null
  id_ruta?: number | null
  dia_visita?: number | null
  tipo_cliente?: "normal" | "mayorista-credito" | "mayorista"|"credito"
  ultima_visita?: string | null
  activo?: boolean
}

interface ValidationResult {
  isValid: boolean
  error?: {
    success: boolean
    error: string
    details: string
  }
}

// Función para manejar errores
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return "Error desconocido"
}

// Función para convertir string de fecha a formato SQL Server (sin problemas de zona horaria)
function parseDateToSQLFormat(dateString: string | null | undefined): string | null {
  if (!dateString) return null

  // Aceptar formatos DD/MM/YYYY o DD/MM/YY
  const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/
  if (!dateRegex.test(dateString)) {
    return null
  }

  const [day, month, yearPart] = dateString.split("/")
  const year = yearPart.length === 2 ? `20${yearPart}` : yearPart

  // Validar que la fecha sea válida
  const dateObj = new Date(`${year}-${month}-${day}`)
  if (isNaN(dateObj.getTime())) {
    return null
  }

  // Devolver en formato YYYY-MM-DD para SQL Server (sin conversión a Date)
  return `${year}-${month}-${day}`
}

// Función para validar datos del cliente
function validateClientesData(clientesData: Clientes): ValidationResult {
  if (!clientesData.nombre?.trim() || !clientesData.apellido?.trim() || !clientesData.direccion?.trim()) {
    return {
      isValid: false,
      error: {
        success: false,
        error: "Datos incompletos",
        details: "Nombre, apellido y dirección son campos requeridos",
      },
    }
  }

  if (clientesData.ultima_visita) {
    const sqlDate = parseDateToSQLFormat(clientesData.ultima_visita)
    if (!sqlDate) {
      return {
        isValid: false,
        error: {
          success: false,
          error: "Fecha inválida",
          details: "El formato de fecha debe ser DD/MM/YYYY o DD/MM/YY",
        },
      }
    }
  }

  if (clientesData.dia_visita && (clientesData.dia_visita < 1 || clientesData.dia_visita > 7)) {
    return {
      isValid: false,
      error: {
        success: false,
        error: "Día de visita inválido",
        details: "El día de visita debe ser entre 1 (Lunes) y 7 (Domingo)",
      },
    }
  }

  return { isValid: true }
}

// GET - Obtener clientes según la ruta del vendedor
export async function GET(req: NextRequest) {
  let pool
  try {
    const { searchParams } = new URL(req.url);
    const idRuta = searchParams.get('id_ruta');
    const idPersonal = searchParams.get('id_personal'); // Nuevo parámetro para el vendedor logeado
    
    pool = await getConnection()

    let query = `
      SELECT 
        c.id_cliente, c.nombre, c.apellido, c.telefono, c.direccion, c.email, 
        c.fecha_registro, c.id_ruta, c.dia_visita, c.activo, c.tipo_cliente,
        CASE 
          WHEN c.ultima_visita IS NOT NULL 
          THEN FORMAT(c.ultima_visita, 'dd/MM/yyyy') 
          ELSE NULL 
        END as ultima_visita,
        r.nombre as nombre_ruta,
        cc.limite_credito,
        cc.saldo_actual
      FROM Clientes c
      LEFT JOIN Ruta r ON c.id_ruta = r.id_ruta
      LEFT JOIN Cliente_Credito cc ON c.id_cliente = cc.id_cliente
      WHERE c.activo = 1 
    `;
    
    const request = pool.request();
    
    // Filtrar por ruta si se proporciona el parámetro
    if (idRuta) {
      query += ` AND c.id_ruta = @id_ruta `;
      request.input('id_ruta', sql.Int, parseInt(idRuta));
    }
    
    // Filtrar por vendedor (personal) si se proporciona el parámetro
    if (idPersonal) {
      query += ` AND r.id_personal_asignado = @id_personal `;
      request.input('id_personal', sql.Int, parseInt(idPersonal));
    }
    
    query += ` ORDER BY c.nombre, c.apellido ASC `;

    const result = await request.query(query);

    return NextResponse.json(
      {
        success: true,
        data: result.recordset,
        message: "Clientes obtenidos exitosamente",
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Error al obtener clientes:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Error interno al obtener clientes",
        details: process.env.NODE_ENV === "development" ? getErrorMessage(error) : undefined,
      },
      { status: 500 },
    )
  } finally {
    if (pool) await closeConnection(pool)
  }
}

// POST - Crear un nuevo cliente
export async function POST(req: NextRequest) {
  let pool
  try {
    const clientesData: Clientes & { limite_credito?: number } = await req.json()

    const validation = validateClientesData(clientesData)
    if (!validation.isValid) {
      return NextResponse.json(validation.error, { status: 400 })
    }

    pool = await getConnection()
    const transaction = new sql.Transaction(pool)
    await transaction.begin()

    try {
      // Convertir la fecha a formato SQL sin usar Date
      const sqlDateString = clientesData.ultima_visita ? parseDateToSQLFormat(clientesData.ultima_visita) : null

      // Usamos una consulta parametrizada con la fecha en formato string
      const query = `
        INSERT INTO Clientes (
          nombre, apellido, telefono, direccion, email,
          fecha_registro, id_ruta, dia_visita, activo, tipo_cliente, ultima_visita
        )
        OUTPUT 
          INSERTED.id_cliente, 
          FORMAT(INSERTED.fecha_registro, 'dd/MM/yyyy') as fecha_registro,
          FORMAT(INSERTED.ultima_visita, 'dd/MM/yyyy') as ultima_visita
        VALUES (
          @nombre, @apellido, @telefono, @direccion, @email,
          GETDATE(), @id_ruta, @dia_visita, 1, @tipo_cliente, 
          ${sqlDateString ? "CAST(@ultima_visita AS DATE)" : "NULL"}
        )
      `

      const request = new sql.Request(transaction)
        .input("nombre", sql.NVarChar(100), clientesData.nombre.trim())
        .input("apellido", sql.NVarChar(100), clientesData.apellido.trim())
        .input("telefono", sql.NVarChar(20), clientesData.telefono?.trim() || null)
        .input("direccion", sql.NVarChar(200), clientesData.direccion.trim())
        .input("email", sql.NVarChar(100), clientesData.email?.trim() || null)
        .input("id_ruta", sql.Int, clientesData.id_ruta || null)
        .input("dia_visita", sql.Int, clientesData.dia_visita || null)
        .input("tipo_cliente", sql.NVarChar(20), clientesData.tipo_cliente || "normal")

      if (sqlDateString) {
        request.input("ultima_visita", sql.VarChar(10), sqlDateString)
      }

      const result = await request.query(query)
      const id_cliente = result.recordset[0].id_cliente

      // Si el cliente tiene crédito, crear el registro en Cliente_Credito
      if (clientesData.tipo_cliente?.includes("credito")) {
        const limiteCredito = clientesData.limite_credito || 0
        
        await new sql.Request(transaction)
          .input("id_cliente", sql.Int, id_cliente)
          .input("limite_credito", sql.Decimal(18, 2), limiteCredito)
          .query(`
            INSERT INTO Cliente_Credito (id_cliente, limite_credito, saldo_actual, fecha_actualizacion)
            VALUES (@id_cliente, @limite_credito, 0, GETDATE())
          `)
      }

      await transaction.commit()

      // Usar la fecha formateada directamente desde SQL Server
      const formattedDate = result.recordset[0].ultima_visita || clientesData.ultima_visita || null

      return NextResponse.json(
        {
          success: true,
          data: {
            id_cliente,
            ...clientesData,
            ultima_visita: formattedDate,
            fecha_registro: result.recordset[0].fecha_registro,
          },
          message: "Cliente creado exitosamente" + (clientesData.tipo_cliente?.includes("credito") ? " con límite de crédito" : ""),
        },
        { status: 201 },
      )
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error("Error al crear cliente:", error)

    // Manejar error de clave duplicada
    if (error instanceof sql.RequestError && error.number === 2627) {
      return NextResponse.json(
        {
          success: false,
          error: "Error de duplicación",
          details: "Ya existe un cliente con ese ID",
        },
        { status: 400 },
      )
    }

    // Manejar error de clave foránea (si id_ruta no existe)
    if (error instanceof sql.RequestError && error.number === 547) {
      return NextResponse.json(
        {
          success: false,
          error: "Error de referencia",
          details: "El ID de ruta proporcionado no existe en la tabla de rutas",
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: "Error interno al crear cliente",
        details: process.env.NODE_ENV === "development" ? getErrorMessage(error) : undefined,
      },
      { status: 500 },
    )
  } finally {
    if (pool) await closeConnection(pool)
  }
}

// PUT - Actualizar un cliente existente
export async function PUT(req: NextRequest) {
  let pool
  try {
    const clientesData: Clientes & { limite_credito?: number } = await req.json()

    if (!clientesData.id_cliente) {
      return NextResponse.json(
        {
          success: false,
          error: "ID de cliente no proporcionado",
          details: "Se requiere el id_cliente para actualizar un cliente",
        },
        { status: 400 },
      )
    }

    const validation = validateClientesData(clientesData)
    if (!validation.isValid) {
      return NextResponse.json(validation.error, { status: 400 })
    }

    pool = await getConnection()
    const transaction = new sql.Transaction(pool)
    await transaction.begin()

    try {
      // Verificar si el cliente existe
      const clienteExistente = await new sql.Request(transaction)
        .input("id_cliente", sql.Int, clientesData.id_cliente)
        .query("SELECT COUNT(*) AS count FROM Clientes WHERE id_cliente = @id_cliente")

      if (clienteExistente.recordset[0].count === 0) {
        await transaction.rollback()
        return NextResponse.json(
          {
            success: false,
            error: "Cliente no encontrado",
            details: `No existe un cliente con ID ${clientesData.id_cliente}`,
          },
          { status: 404 },
        )
      }

      // Convertir la fecha a formato SQL sin usar Date
      const sqlDateString = clientesData.ultima_visita ? parseDateToSQLFormat(clientesData.ultima_visita) : null

      // Usamos una consulta parametrizada con la fecha en formato string
      const query = `
        UPDATE Clientes SET
          nombre = @nombre,
          apellido = @apellido,
          telefono = @telefono,
          direccion = @direccion,
          email = @email,
          id_ruta = @id_ruta,
          dia_visita = @dia_visita,
          tipo_cliente = @tipo_cliente,
          ultima_visita = ${sqlDateString ? "CAST(@ultima_visita AS DATE)" : "NULL"}
        OUTPUT 
          FORMAT(INSERTED.ultima_visita, 'dd/MM/yyyy') as ultima_visita
        WHERE id_cliente = @id_cliente
      `

      const request = new sql.Request(transaction)
        .input("id_cliente", sql.Int, clientesData.id_cliente)
        .input("nombre", sql.NVarChar(100), clientesData.nombre.trim())
        .input("apellido", sql.NVarChar(100), clientesData.apellido.trim())
        .input("telefono", sql.NVarChar(20), clientesData.telefono?.trim() || null)
        .input("direccion", sql.NVarChar(200), clientesData.direccion.trim())
        .input("email", sql.NVarChar(100), clientesData.email?.trim() || null)
        .input("id_ruta", sql.Int, clientesData.id_ruta || null)
        .input("dia_visita", sql.Int, clientesData.dia_visita || null)
        .input("tipo_cliente", sql.NVarChar(20), clientesData.tipo_cliente || "normal")

      if (sqlDateString) {
        request.input("ultima_visita", sql.VarChar(10), sqlDateString)
      }

      const result = await request.query(query)

      // Manejar el límite de crédito
      if (clientesData.tipo_cliente?.includes("credito")) {
        const limiteCredito = clientesData.limite_credito || 0
        
        // Verificar si ya existe un registro de crédito
        const creditoExistente = await new sql.Request(transaction)
          .input("id_cliente", sql.Int, clientesData.id_cliente)
          .query("SELECT COUNT(*) AS count FROM Cliente_Credito WHERE id_cliente = @id_cliente")

        if (creditoExistente.recordset[0].count > 0) {
          // Actualizar el límite de crédito existente
          await new sql.Request(transaction)
            .input("id_cliente", sql.Int, clientesData.id_cliente)
            .input("limite_credito", sql.Decimal(18, 2), limiteCredito)
            .query(`
              UPDATE Cliente_Credito 
              SET limite_credito = @limite_credito, fecha_actualizacion = GETDATE()
              WHERE id_cliente = @id_cliente
            `)
        } else {
          // Crear nuevo registro de crédito
          await new sql.Request(transaction)
            .input("id_cliente", sql.Int, clientesData.id_cliente)
            .input("limite_credito", sql.Decimal(18, 2), limiteCredito)
            .query(`
              INSERT INTO Cliente_Credito (id_cliente, limite_credito, saldo_actual, fecha_actualizacion)
              VALUES (@id_cliente, @limite_credito, 0, GETDATE())
            `)
        }
      } else {
        // Si el cliente ya no tiene crédito, eliminar el registro (opcional)
        // Comentado para mantener el historial
        // await new sql.Request(transaction)
        //   .input("id_cliente", sql.Int, clientesData.id_cliente)
        //   .query("DELETE FROM Cliente_Credito WHERE id_cliente = @id_cliente")
      }

      await transaction.commit()

      // Usar la fecha formateada directamente desde SQL Server
      const formattedDate = result.recordset[0].ultima_visita || clientesData.ultima_visita || null

      return NextResponse.json(
        {
          success: true,
          data: {
            ...clientesData,
            ultima_visita: formattedDate,
          },
          message: "Cliente actualizado exitosamente",
        },
        { status: 200 },
      )
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error("Error al actualizar cliente:", error)

    // Manejar error de clave foránea (si id_ruta no existe)
    if (error instanceof sql.RequestError && error.number === 547) {
      return NextResponse.json(
        {
          success: false,
          error: "Error de referencia",
          details: "El ID de ruta proporcionado no existe en la tabla de rutas",
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: "Error interno al actualizar cliente",
        details: process.env.NODE_ENV === "development" ? getErrorMessage(error) : undefined,
      },
      { status: 500 },
    )
  } finally {
    if (pool) await closeConnection(pool)
  }
}

// DELETE - Eliminar (desactivar) un cliente
export async function DELETE(req: NextRequest) {
  let pool
  try {
    const { id_cliente } = await req.json()

    if (!id_cliente) {
      return NextResponse.json(
        {
          success: false,
          error: "ID de cliente no proporcionado",
          details: "Se requiere el id_cliente para eliminar un cliente",
        },
        { status: 400 },
      )
    }

    pool = await getConnection()

    // Verificar si el cliente existe
    const clienteExistente = await pool
      .request()
      .input("id_cliente", sql.Int, id_cliente)
      .query("SELECT COUNT(*) AS count FROM Clientes WHERE id_cliente = @id_cliente")

    if (clienteExistente.recordset[0].count === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cliente no encontrado",
          details: `No existe un cliente con ID ${id_cliente}`,
        },
        { status: 404 },
      )
    }

    await pool
      .request()
      .input("id_cliente", sql.Int, id_cliente)
      .query("UPDATE Clientes SET activo = 0 WHERE id_cliente = @id_cliente")

    return NextResponse.json(
      {
        success: true,
        message: "Cliente desactivado exitosamente",
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Error al desactivar cliente:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Error interno al desactivar cliente",
        details: process.env.NODE_ENV === "development" ? getErrorMessage(error) : undefined,
      },
      { status: 500 },
    )
  } finally {
    if (pool) await closeConnection(pool)
  }
}