import { type NextRequest, NextResponse } from "next/server"
import { getConnection, closeConnection } from "@/lib/db"

// Tipos para TypeScript
type Ruta = {
  id_ruta?: number
  nombre: string
  descripcion?: string | null
  id_personal_asignado?: number | null
  activa?: boolean
}

// GET - Obtener todas las rutas activas con opción de incluir inactivas
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const includeInactive = searchParams.get('inactivas') === 'true'
  
  let pool
  try {
    pool = await getConnection()

    const query = includeInactive 
      ? `SELECT id_ruta, nombre, descripcion, id_personal_asignado, activa FROM Ruta`
      : `SELECT id_ruta, nombre, descripcion, id_personal_asignado FROM Ruta WHERE activa = 1`

    const result = await pool.request().query(query)

    const rutas = result.recordset.map(ruta => ({
      ...ruta,
      activa: ruta.activa === undefined ? undefined : Boolean(ruta.activa)
    }))

    return NextResponse.json({
      success: true,
      data: rutas,
      message: "Rutas obtenidas correctamente"
    }, { status: 200 })
  } catch (error) {
    console.error("Error al obtener rutas:", error)
    return NextResponse.json({
      success: false,
      error: "Error interno al obtener rutas",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  } finally {
    if (pool) await closeConnection(pool)
  }
}

// POST - Crear una nueva ruta
export async function POST(req: NextRequest) {
  let pool
  try {
    const requestData = await req.json()
    
    // Validación básica
    if (!requestData?.nombre) {
      return NextResponse.json({
        success: false,
        error: "Validación fallida",
        details: "El nombre de la ruta es requerido"
      }, { status: 400 })
    }

    const rutaData: Ruta = {
      nombre: requestData.nombre,
      descripcion: requestData.descripcion || null,
      id_personal_asignado: requestData.id_personal_asignado || null,
      activa: requestData.activa !== false // Default true
    }

    pool = await getConnection()

    const result = await pool
      .request()
      .input("nombre", rutaData.nombre)
      .input("descripcion", rutaData.descripcion)
      .input("id_personal_asignado", rutaData.id_personal_asignado)
      .input("activa", rutaData.activa ? 1 : 0)
      .query(`
        INSERT INTO Ruta (nombre, descripcion, id_personal_asignado, activa)
        OUTPUT INSERTED.id_ruta
        VALUES (@nombre, @descripcion, @id_personal_asignado, @activa)
      `)

    const nuevaRuta = {
      id_ruta: result.recordset[0].id_ruta,
      ...rutaData
    }

    return NextResponse.json({
      success: true,
      data: nuevaRuta,
      message: "Ruta creada exitosamente"
    }, { status: 201 })
  } catch (error) {
    console.error("Error al crear ruta:", error)
    return NextResponse.json({
      success: false,
      error: "Error interno al crear ruta",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  } finally {
    if (pool) await closeConnection(pool)
  }
}

// PUT - Actualizar una ruta existente
export async function PUT(req: NextRequest) {
  let pool
  try {
    const requestData = await req.json()
    
    // Validación
    if (!requestData?.id_ruta || !requestData?.nombre) {
      return NextResponse.json({
        success: false,
        error: "Validación fallida",
        details: "ID de ruta y nombre son requeridos"
      }, { status: 400 })
    }

    const rutaData: Ruta = {
      id_ruta: requestData.id_ruta,
      nombre: requestData.nombre,
      descripcion: requestData.descripcion || null,
      id_personal_asignado: requestData.id_personal_asignado || null,
      activa: requestData.activa !== false // Default true
    }

    pool = await getConnection()

    await pool
      .request()
      .input("id_ruta", rutaData.id_ruta)
      .input("nombre", rutaData.nombre)
      .input("descripcion", rutaData.descripcion)
      .input("id_personal_asignado", rutaData.id_personal_asignado)
      .input("activa", rutaData.activa ? 1 : 0)
      .query(`
        UPDATE Ruta 
        SET nombre = @nombre,
            descripcion = @descripcion,
            id_personal_asignado = @id_personal_asignado,
            activa = @activa
        WHERE id_ruta = @id_ruta
      `)

    return NextResponse.json({
      success: true,
      data: rutaData,
      message: "Ruta actualizada correctamente"
    }, { status: 200 })
  } catch (error) {
    console.error("Error al actualizar ruta:", error)
    return NextResponse.json({
      success: false,
      error: "Error interno al actualizar ruta",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  } finally {
    if (pool) await closeConnection(pool)
  }
}

// DELETE - Desactivar una ruta (borrado lógico)
export async function DELETE(req: NextRequest) {
  let pool
  try {
    const { id_ruta } = await req.json()
    
    if (!id_ruta) {
      return NextResponse.json({
        success: false,
        error: "Validación fallida",
        details: "ID de ruta es requerido"
      }, { status: 400 })
    }

    pool = await getConnection()

    const result = await pool
      .request()
      .input("id_ruta", id_ruta)
      .query(`
        UPDATE Ruta 
        SET activa = 0
        WHERE id_ruta = @id_ruta
        SELECT @@ROWCOUNT as affectedRows
      `)

    if (result.recordset[0].affectedRows === 0) {
      return NextResponse.json({
        success: false,
        error: "No encontrado",
        details: "No se encontró la ruta con el ID proporcionado"
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: "Ruta desactivada correctamente",
      data: { id_ruta }
    }, { status: 200 })
  } catch (error) {
    console.error("Error al desactivar ruta:", error)
    return NextResponse.json({
      success: false,
      error: "Error interno al desactivar ruta",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  } finally {
    if (pool) await closeConnection(pool)
  }
}