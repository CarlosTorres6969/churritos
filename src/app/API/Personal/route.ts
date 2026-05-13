import { type NextRequest, NextResponse } from "next/server"
import { getConnection, closeConnection } from "@/lib/db"
import type { Personal } from "@/lib/types"

// GET - Obtener todo el personal activo
export async function GET() {
  let pool
  try {
    pool = await getConnection()

    const result = await pool.request().query(`
      SELECT id_personal, nombre, apellido, telefono, direccion, email,
             fecha_registro, usuario, contrasena, rol, fecha_contratacion, activo
      FROM Personal
    `)

    // Log genérico y seguro
    console.log(`Se realizó una petición GET a /API/Personal. Usuarios obtenidos: ${result.recordset.length}`)

    return NextResponse.json(result.recordset, { status: 200 })
  } catch {
    console.error("Error al obtener personal (detalles censurados)")
    return NextResponse.json({ error: "Error al obtener personal" }, { status: 500 })
  } finally {
    if (pool) await closeConnection(pool)
  }
}

// POST - Crear nuevo personal
export async function POST(req: NextRequest) {
  let pool
  try {
    const personalData: Omit<Personal, "id_personal"> = await req.json()

    if (!personalData.nombre || !personalData.apellido || !personalData.usuario || !personalData.contrasena) {
      return NextResponse.json({ error: "Nombre, apellido, usuario y contraseña son requeridos" }, { status: 400 })
    }

    pool = await getConnection()

    const result = await pool
      .request()
      .input("nombre", personalData.nombre)
      .input("apellido", personalData.apellido)
      .input("telefono", personalData.telefono || null)
      .input("direccion", personalData.direccion || null)
      .input("email", personalData.email || null)
      .input("usuario", personalData.usuario)
      .input("contrasena", personalData.contrasena)
      .input("rol", personalData.rol || "vendedor")
      .input("fecha_contratacion", personalData.fecha_contratacion || new Date())
      .query(`
        INSERT INTO Personal (
          nombre, apellido, telefono, direccion, email, usuario, 
          contrasena, rol, fecha_contratacion, activo, fecha_registro
        )
        VALUES (
          @nombre, @apellido, @telefono, @direccion, @email, @usuario,
          @contrasena, @rol, @fecha_contratacion, 1, GETDATE()
        )
        SELECT SCOPE_IDENTITY() AS id_personal
      `)

    console.log(`Nuevo personal creado (ID: ${result.recordset[0].id_personal})`) // log seguro

    return NextResponse.json(
      {
        id_personal: result.recordset[0].id_personal,
        ...personalData,
        activo: true,
        fecha_registro: new Date(),
      },
      { status: 201 },
    )
  } catch {
    console.error("Error al crear personal (detalles censurados)")
    return NextResponse.json({ error: "Error al crear personal" }, { status: 500 })
  } finally {
    if (pool) await closeConnection(pool)
  }
}

// PUT - Actualizar personal existente
export async function PUT(req: NextRequest) {
  let pool
  try {
    const personalData: Personal = await req.json()

    if (!personalData.id_personal) {
      return NextResponse.json({ error: "ID de personal es requerido" }, { status: 400 })
    }

    pool = await getConnection()

    await pool
      .request()
      .input("id_personal", personalData.id_personal)
      .input("nombre", personalData.nombre)
      .input("apellido", personalData.apellido)
      .input("telefono", personalData.telefono || null)
      .input("direccion", personalData.direccion || null)
      .input("email", personalData.email || null)
      .input("usuario", personalData.usuario)
      .input("rol", personalData.rol)
      .input("fecha_contratacion", personalData.fecha_contratacion)
      .input("activo", personalData.activo ? 1 : 0)
      .query(`
        UPDATE Personal SET
          nombre = @nombre,
          apellido = @apellido,
          telefono = @telefono,
          direccion = @direccion,
          email = @email,
          usuario = @usuario,
          rol = @rol,
          fecha_contratacion = @fecha_contratacion,
          activo = @activo
        WHERE id_personal = @id_personal
      `)

    console.log(`Personal actualizado (ID: ${personalData.id_personal})`) // log seguro

    return NextResponse.json(personalData, { status: 200 })
  } catch {
    console.error("Error al actualizar personal (detalles censurados)")
    return NextResponse.json({ error: "Error al actualizar personal" }, { status: 500 })
  } finally {
    if (pool) await closeConnection(pool)
  }
}

// DELETE - Desactivar personal (borrado lógico)
export async function DELETE(req: NextRequest) {
  let pool
  try {
    const { id_personal } = await req.json()

    if (!id_personal) {
      return NextResponse.json({ error: "ID de personal es requerido" }, { status: 400 })
    }

    pool = await getConnection()

    await pool
      .request()
      .input("id_personal", id_personal)
      .query(`
        UPDATE Personal 
        SET activo = 0 
        WHERE id_personal = @id_personal
      `)

    console.log(`Personal desactivado (ID: ${id_personal})`) // log seguro

    return NextResponse.json({ message: "Personal desactivado correctamente" }, { status: 200 })
  } catch {
    console.error("Error al desactivar personal (detalles censurados)")
    return NextResponse.json({ error: "Error al desactivar personal" }, { status: 500 })
  } finally {
    if (pool) await closeConnection(pool)
  }
}