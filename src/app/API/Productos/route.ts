import { type NextRequest, NextResponse } from "next/server";
import { getConnection, closeConnection } from "@/lib/db";

type Producto = {
  id_producto?: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  precio_completo: number;
  precio_medio: number;
  precio_mayorista: number;
  activo?: boolean;
};

// GET - Obtener productos
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("inactivos") === "true";

  let pool;
  try {
    pool = await getConnection();

    const query = includeInactive
      ? `SELECT id_producto, codigo, nombre, descripcion, precio_completo, precio_medio, precio_mayorista, activo FROM Producto`
      : `SELECT id_producto, codigo, nombre, descripcion, precio_completo, precio_medio, precio_mayorista FROM Producto WHERE activo = 1`;

    const result = await pool.request().query(query);

    const productos = result.recordset.map((producto) => ({
      ...producto,
      activo: producto.activo === undefined ? undefined : Boolean(producto.activo),
    }));

    return NextResponse.json(
      {
        success: true,
        data: productos,
        message: "Productos obtenidos correctamente",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al obtener productos:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno al obtener productos",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}

// POST - Crear producto
export async function POST(req: NextRequest) {
  let pool;
  try {
    const requestData = await req.json();

    // Validación de campos requeridos
    if (!requestData?.codigo || typeof requestData.codigo !== 'string' || requestData.codigo.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Código inválido", details: "El código es requerido y debe ser texto" },
        { status: 400 }
      );
    }

    if (!requestData?.nombre || typeof requestData.nombre !== 'string' || requestData.nombre.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Nombre inválido", details: "El nombre es requerido y debe ser texto" },
        { status: 400 }
      );
    }

    // Validación de precios
    const validarPrecio = (precio: unknown, campo: string) => {
      const num = Number(precio);
      if (isNaN(num) || num < 0) {
        throw new Error(`El ${campo} debe ser un número positivo`);
      }
      return num;
    };

    const precios = {
      completo: validarPrecio(requestData.precio_completo, "precio completo"),
      medio: validarPrecio(requestData.precio_medio, "precio medio"),
      mayorista: validarPrecio(requestData.precio_mayorista, "precio mayorista")
    };

    // Validación de longitudes máximas
    const codigo = requestData.codigo.trim();
    const nombre = requestData.nombre.trim();

    if (codigo.length > 50) {
      return NextResponse.json(
        { success: false, error: "Código demasiado largo", details: "Máximo 50 caracteres" },
        { status: 400 }
      );
    }

    if (nombre.length > 100) {
      return NextResponse.json(
        { success: false, error: "Nombre demasiado largo", details: "Máximo 100 caracteres" },
        { status: 400 }
      );
    }

    // Preparar datos del producto
    const productoData: Producto = {
      codigo,
      nombre,
      descripcion: requestData.descripcion ? String(requestData.descripcion).trim() : null,
      precio_completo: precios.completo,
      precio_medio: precios.medio,
      precio_mayorista: precios.mayorista,
      activo: requestData.activo !== false,
    };

    pool = await getConnection();

    // Verificar si el código ya existe
    const checkResult = await pool
      .request()
      .input('codigo', productoData.codigo)
      .query('SELECT COUNT(*) as count FROM Producto WHERE codigo = @codigo');

    if (checkResult.recordset[0].count > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Código duplicado",
          details: "El código ya está siendo usado por otro producto",
        },
        { status: 400 }
      );
    }

    // Crear el nuevo producto
    const result = await pool
      .request()
      .input('codigo', productoData.codigo)
      .input('nombre', productoData.nombre)
      .input('descripcion', productoData.descripcion)
      .input('precio_completo', productoData.precio_completo)
      .input('precio_medio', productoData.precio_medio)
      .input('precio_mayorista', productoData.precio_mayorista)
      .input('activo', productoData.activo ? 1 : 0)
      .query(`
        INSERT INTO Producto (codigo, nombre, descripcion, precio_completo, precio_medio, precio_mayorista, activo)
        OUTPUT INSERTED.id_producto
        VALUES (@codigo, @nombre, @descripcion, @precio_completo, @precio_medio, @precio_mayorista, @activo)
      `);

    const nuevoProducto = {
      id_producto: result.recordset[0].id_producto,
      ...productoData,
    };

    return NextResponse.json(
      {
        success: true,
        data: nuevoProducto,
        message: "Producto creado exitosamente",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al crear producto:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al crear producto",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}

// PUT - Actualizar producto (sin modificar código)
export async function PUT(req: NextRequest) {
  let pool;
  try {
    const requestData = await req.json();

    // Validación básica de ID
    if (!requestData?.id_producto || typeof requestData.id_producto !== 'number' || requestData.id_producto <= 0) {
      return NextResponse.json(
        { success: false, error: "ID inválido", details: "El ID debe ser un número positivo" },
        { status: 400 }
      );
    }

    pool = await getConnection();

    // 1. Obtener producto existente para validar y mantener código original
    const existingProduct = await pool
      .request()
      .input('id_producto', requestData.id_producto)
      .query('SELECT codigo, activo FROM Producto WHERE id_producto = @id_producto');

    if (existingProduct.recordset.length === 0) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado", details: "El ID proporcionado no existe" },
        { status: 404 }
      );
    }

    const codigoOriginal = existingProduct.recordset[0].codigo;
    const activoActual = existingProduct.recordset[0].activo;

    // 2. Validar campos modificables
    if (!requestData.nombre || typeof requestData.nombre !== 'string' || requestData.nombre.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Nombre inválido", details: "El nombre es requerido" },
        { status: 400 }
      );
    }

    const nombre = requestData.nombre.trim();
    if (nombre.length > 100) {
      return NextResponse.json(
        { success: false, error: "Nombre demasiado largo", details: "Máximo 100 caracteres" },
        { status: 400 }
      );
    }

    // Validación de precios
    const validarPrecio = (precio: unknown, campo: string) => {
      const num = Number(precio);
      if (isNaN(num) || num < 0) {
        throw new Error(`El ${campo} debe ser un número positivo`);
      }
      return num;
    };

    const precios = {
      completo: validarPrecio(requestData.precio_completo, "precio completo"),
      medio: validarPrecio(requestData.precio_medio, "precio medio"),
      mayorista: validarPrecio(requestData.precio_mayorista, "precio mayorista")
    };

    // 3. Preparar datos para actualización (excluyendo código)
    const productoActualizado = {
      id_producto: requestData.id_producto,
      codigo: requestData.codigo ? String(requestData.codigo).trim() : codigoOriginal, 
      nombre,
      descripcion: requestData.descripcion ? String(requestData.descripcion).trim() : null,
      precio_completo: precios.completo,
      precio_medio: precios.medio,
      precio_mayorista: precios.mayorista,
      activo: requestData.activo !== undefined ? Boolean(requestData.activo) : activoActual,
    };

    // 4. Actualizar el producto
    await pool
      .request()
      .input('id_producto', productoActualizado.id_producto)
      .input('codigo', productoActualizado.codigo) 
      .input('nombre', productoActualizado.nombre)
      .input('descripcion', productoActualizado.descripcion)
      .input('precio_completo', productoActualizado.precio_completo)
      .input('precio_medio', productoActualizado.precio_medio)
      .input('precio_mayorista', productoActualizado.precio_mayorista)
      .input('activo', productoActualizado.activo ? 1 : 0)
      .query(`
        UPDATE Producto SET
          nombre = @nombre,
          codigo = @codigo, 
          descripcion = @descripcion,
          precio_completo = @precio_completo,
          precio_medio = @precio_medio,
          precio_mayorista = @precio_mayorista,
          activo = @activo
        WHERE id_producto = @id_producto
      `);

    // 5. Obtener y devolver el producto actualizado
    const result = await pool
      .request()
      .input('id_producto', productoActualizado.id_producto)
      .query('SELECT * FROM Producto WHERE id_producto = @id_producto');

    const producto = result.recordset[0];
    
    return NextResponse.json({
      success: true,
      data: {
        ...producto,
        activo: Boolean(producto.activo)
      },
      message: "Producto actualizado correctamente"
    }, { status: 200 });

  } catch (error) {
    console.error("Error al actualizar producto:", error);
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

// DELETE - Eliminar producto por ID
export async function DELETE(req: NextRequest) {
  let pool;
  try {
    const { searchParams } = new URL(req.url);
    const id_producto = Number(searchParams.get("id"));

    // Validación de ID
    if (!id_producto || isNaN(id_producto) || id_producto <= 0) {
      return NextResponse.json(
        { success: false, error: "ID inválido", details: "El ID debe ser un número positivo" },
        { status: 400 }
      );
    }

    pool = await getConnection();

    // Verificar si el producto existe
    const checkResult = await pool
      .request()
      .input('id_producto', id_producto)
      .query('SELECT COUNT(*) as count FROM Producto WHERE id_producto = @id_producto');

    if (checkResult.recordset[0].count === 0) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado", details: "El ID proporcionado no existe" },
        { status: 404 }
      );
    }

    // Eliminar el producto
    await pool
      .request()
      .input('id_producto', id_producto)
      .query('DELETE FROM Producto WHERE id_producto = @id_producto');

    return NextResponse.json(
      {
        success: true,
        message: "Producto eliminado correctamente",
        deletedId: id_producto
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al eliminar producto",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (pool) await closeConnection(pool);
  }
}