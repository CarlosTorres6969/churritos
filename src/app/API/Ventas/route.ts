import { type NextRequest, NextResponse } from "next/server"
import { getConnection, closeConnection } from "@/lib/db"
import sql from "mssql"

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Unknown error occurred"
}

interface DetalleVenta {
  id_producto: number
  cantidad: number
  tipo_precio: "completo" | "medio" | "mayorista" | "mayorista2"
}

interface Venta {
  id_cliente: number
  id_personal: number
  tipo_pago: "efectivo" | "credito"
  efectivo_recibido?: number
  detalles_venta: DetalleVenta[]
}

export async function GET(req: NextRequest) {
  const pool = await getConnection()
  const { searchParams } = new URL(req.url)
  const id_venta = searchParams.get("id_venta")
  const id_vendedor = searchParams.get("id_vendedor")
  const fecha = searchParams.get("fecha")
  const id_cliente = searchParams.get("id_cliente")
  const page = Number.parseInt(searchParams.get("page") || "1")
  const pageSize = Number.parseInt(searchParams.get("pageSize") || "10")
  const sin_limite = searchParams.get("sin_limite") === "true" // Nuevo parámetro

  try {
    if (id_venta) {
      // Obtener una venta específica por ID
      const ventaRequest = await pool
        .request()
        .input("id_venta", sql.Int, id_venta)
        .query(
          `SELECT v.id_venta, v.id_cliente, c.nombre AS nombre_cliente, v.id_personal, p.nombre AS nombre_personal, v.fecha_venta, v.total, v.tipo_pago, v.cerrada, v.efectivo_recibido, cc.saldo_actual AS saldo_credito FROM Venta v JOIN clientes c ON v.id_cliente = c.id_cliente JOIN Personal p ON v.id_personal = p.id_personal LEFT JOIN Cliente_Credito cc ON v.id_cliente = cc.id_cliente WHERE v.id_venta = @id_venta`,
        )

      if (ventaRequest.recordset.length === 0) {
        return NextResponse.json({ success: false, error: "Venta no encontrada" }, { status: 404 })
      }

      const venta = ventaRequest.recordset[0]

      // Obtener detalles de la venta
      const detallesRequest = await pool
        .request()
        .input("id_venta", sql.Int, id_venta)
        .query(
          `SELECT dv.id_detalle, dv.id_producto, pr.nombre AS nombre_producto, dv.cantidad, dv.subtotal, CASE WHEN dv.subtotal / dv.cantidad = pr.precio_completo THEN 'completo' WHEN dv.subtotal / dv.cantidad = pr.precio_medio THEN 'medio' WHEN dv.subtotal / dv.cantidad = pr.precio_mayorista THEN 'mayorista' WHEN dv.subtotal / dv.cantidad = pr.precio_mayorista2 THEN 'mayorista2' END AS tipo_precio FROM Detalle_Venta dv JOIN Producto pr ON dv.id_producto = pr.id_producto WHERE dv.id_venta = @id_venta`,
        )

      return NextResponse.json({
        success: true,
        data: {
          ...venta,
          detalles_venta: detallesRequest.recordset,
        },
      })
    } else if (id_cliente) {
      // Obtener tipos de precios disponibles según tipo de cliente
      const clienteRequest = await pool
        .request()
        .input("id_cliente", sql.Int, id_cliente)
        .query(`SELECT tipo_cliente FROM clientes WHERE id_cliente = @id_cliente AND activo = 1`)

      if (clienteRequest.recordset.length === 0) {
        return NextResponse.json({ success: false, error: "Cliente no encontrado o inactivo" }, { status: 404 })
      }

      const { tipo_cliente } = clienteRequest.recordset[0]
      let availablePrices: string[] = []

      if (tipo_cliente.includes("mayorista")) {
        availablePrices = ["mayorista", "mayorista2"]
      } else {
        availablePrices = ["completo", "medio"]
      }

      return NextResponse.json({
        success: true,
        data: {
          id_cliente,
          tipo_cliente,
          availablePrices,
        },
      })
    } else {
      // Obtener listado de ventas con paginación Y FILTRADO
      let query = `SELECT v.id_venta, v.fecha_venta, v.total, v.tipo_pago, c.nombre AS nombre_cliente, p.nombre AS nombre_personal, v.id_personal, v.id_cliente, ISNULL(dv.total_productos, 0) AS total_productos, COUNT(*) OVER() AS total_count FROM Venta v JOIN clientes c ON v.id_cliente = c.id_cliente JOIN Personal p ON v.id_personal = p.id_personal LEFT JOIN (SELECT id_venta, SUM(cantidad) AS total_productos FROM Detalle_Venta GROUP BY id_venta) dv ON v.id_venta = dv.id_venta WHERE 1 = 1`

      const request = pool.request()

      if (id_vendedor) {
        query += " AND v.id_personal = @id_vendedor"
        request.input("id_vendedor", sql.Int, Number.parseInt(id_vendedor))
      }

      if (fecha) {
        query += " AND CONVERT(DATE, v.fecha_venta) = @fecha"
        request.input("fecha", sql.Date, new Date(fecha))
      }

      query += " ORDER BY v.fecha_venta DESC"

      // Solo aplicar paginación si no se solicita sin límite
      if (!sin_limite) {
        query += " OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY"
        request.input("pageSize", sql.Int, pageSize)
        request.input("offset", sql.Int, (page - 1) * pageSize)
      }

      const ventasRequest = await request.query(query)

      const totalCount = ventasRequest.recordset.length ? ventasRequest.recordset[0].total_count : 0

      return NextResponse.json({
        success: true,
        data: {
          ventas: ventasRequest.recordset,
          pagination: sin_limite
            ? null
            : {
              page,
              pageSize,
              total: totalCount,
              totalPages: Math.ceil(totalCount / pageSize),
            },
        },
      })
    }
  } catch (error) {
    console.error("Error fetching sales:", error)
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 })
  } finally {
    try {
      await closeConnection(pool)
    } catch (closeError) {
      console.error("Error closing connection:", closeError)
    }
  }
}

export async function POST(req: NextRequest) {
  const pool = await getConnection()

  try {
    const ventaData: Venta = await req.json()
    const { id_cliente, id_personal, tipo_pago, efectivo_recibido, detalles_venta } = ventaData

    // Validación de campos obligatorios
    if (!id_cliente || !id_personal || !tipo_pago || !detalles_venta || detalles_venta.length === 0) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    if (tipo_pago === "efectivo" && (efectivo_recibido === undefined || efectivo_recibido <= 0)) {
      return NextResponse.json(
        { success: false, error: "Efectivo recibido is required for cash payments" },
        { status: 400 },
      )
    }

    // Consulta para obtener el tipo de cliente y la ruta
    const customerQuery = `SELECT c.tipo_cliente, r.id_ruta FROM clientes c JOIN Ruta r ON c.id_ruta = r.id_ruta WHERE c.id_cliente = @id_cliente AND c.activo = 1`

    const customerResult = await pool.request().input("id_cliente", sql.Int, id_cliente).query(customerQuery)

    if (customerResult.recordset.length === 0) {
      return NextResponse.json({ success: false, error: "Cliente no encontrado o inactivo" }, { status: 404 })
    }

    const { tipo_cliente, id_ruta } = customerResult.recordset[0]

    // Validación de tipos de precio según tipo de cliente
    for (const detalle of detalles_venta) {
      if (tipo_cliente.includes("mayorista")) {
        if (detalle.tipo_precio !== "mayorista" && detalle.tipo_precio !== "mayorista2") {
          return NextResponse.json(
            { success: false, error: "Los clientes mayoristas solo pueden comprar con precio mayorista o mayorista2" },
            { status: 400 },
          )
        }
      } else {
        if (detalle.tipo_precio === "mayorista" || detalle.tipo_precio === "mayorista2") {
          return NextResponse.json(
            { success: false, error: "Solo los clientes mayoristas pueden usar precios mayoristas" },
            { status: 400 },
          )
        }
      }
    }

    // Inicia transacción
    const transaction = new sql.Transaction(pool)
    await transaction.begin()

    try {
      // Insertar la venta
      const insertVentaQuery = `INSERT INTO Venta (id_cliente, id_personal, fecha_venta, total, tipo_pago, cerrada, efectivo_recibido) OUTPUT INSERTED.id_venta VALUES (@id_cliente, @id_personal, GETDATE(), 0, @tipo_pago, 0, @efectivo_recibido)`

      const ventaRequest = new sql.Request(transaction)
      const ventaResult = await ventaRequest
        .input("id_cliente", sql.Int, id_cliente)
        .input("id_personal", sql.Int, id_personal)
        .input("tipo_pago", sql.VarChar(20), tipo_pago)
        .input("efectivo_recibido", sql.Decimal(18, 2), efectivo_recibido || 0)
        .query(insertVentaQuery)

      const id_venta = ventaResult.recordset[0].id_venta
      let totalVenta = 0

      // Inserción de los detalles de la venta
      for (const detalle of detalles_venta) {
        const { id_producto, cantidad, tipo_precio } = detalle

        const productRequest = new sql.Request(transaction)
        const productQuery = `SELECT precio_completo, precio_medio, precio_mayorista, precio_mayorista2 FROM Producto WHERE id_producto = @producto_id AND activo = 1`

        const productResult = await productRequest.input("producto_id", sql.Int, id_producto).query(productQuery)

        if (productResult.recordset.length === 0) {
          throw new Error(`Producto con id ${id_producto} no encontrado o inactivo`)
        }

        const product = productResult.recordset[0]
        let precioUnitario: number

        if (tipo_cliente.includes("mayorista")) {
          precioUnitario = tipo_precio === "mayorista2"
            ? Number.parseFloat(product.precio_mayorista2)
            : Number.parseFloat(product.precio_mayorista)
        } else {
          precioUnitario =
            tipo_precio === "medio"
              ? Number.parseFloat(product.precio_medio)
              : Number.parseFloat(product.precio_completo)
        }

        const subtotal = precioUnitario * cantidad
        totalVenta += subtotal

        // Insertar el detalle de venta
        const detailRequest = new sql.Request(transaction)
        await detailRequest
          .input("venta_id", sql.Int, id_venta)
          .input("producto_id", sql.Int, id_producto)
          .input("cantidad", sql.Int, cantidad)
          .input("subtotal", sql.Decimal(18, 2), subtotal)
          .query(
            `INSERT INTO Detalle_Venta (id_venta, id_producto, cantidad, subtotal) VALUES (@venta_id, @producto_id, @cantidad, @subtotal)`,
          )

        const cantidadARestar = tipo_precio === "medio" ? cantidad * 0.5 : cantidad

        // Actualizar el inventario
        const inventoryRequest = new sql.Request(transaction)
        await inventoryRequest
          .input("ruta_id", sql.Int, id_ruta)
          .input("inv_producto_id", sql.Int, id_producto)
          .input("cantidad_venta", sql.Decimal(18, 2), cantidadARestar)
          .query(
            `UPDATE Inventario_Ruta SET cantidad = cantidad - @cantidad_venta, fecha_actualizacion = GETDATE() WHERE id_ruta = @ruta_id AND id_producto = @inv_producto_id`,
          )
      }

      // Actualizar el total de la venta
      const totalRequest = new sql.Request(transaction)
      await totalRequest
        .input("venta_id", sql.Int, id_venta)
        .input("total_venta", sql.Decimal(18, 2), totalVenta)
        .query(`UPDATE Venta SET total = @total_venta WHERE id_venta = @venta_id`)

      // Manejo de pagos a crédito
      if (tipo_pago === "credito") {
        if (tipo_cliente.includes("credito")) {
          const creditRequest = new sql.Request(transaction)
          await creditRequest
            .input("cliente_id", sql.Int, id_cliente)
            .input("saldo_actual", sql.Decimal(18, 2), totalVenta)
            .query(
              `MERGE INTO Cliente_Credito AS target USING (SELECT @cliente_id AS id_cliente, @saldo_actual AS saldo_actual) AS source ON target.id_cliente = source.id_cliente WHEN MATCHED THEN UPDATE SET saldo_actual = target.saldo_actual + source.saldo_actual, fecha_actualizacion = GETDATE() WHEN NOT MATCHED THEN INSERT (id_cliente, saldo_actual, fecha_actualizacion) VALUES (source.id_cliente, source.saldo_actual, GETDATE());`,
            )
        } else {
          throw new Error("El cliente no está habilitado para compras a crédito")
        }
      }

      // Registrar visita del cliente
      const visitRequest = new sql.Request(transaction)
      await visitRequest
        .input("visita_venta_id", sql.Int, id_venta)
        .input("visita_cliente_id", sql.Int, id_cliente)
        .input("estado_visita", sql.VarChar(20), "compró")
        .query(
          `INSERT INTO Estado_Visita (id_venta, id_cliente, estado, fecha_visita) VALUES (@visita_venta_id, @visita_cliente_id, @estado_visita, GETDATE())`,
        )

      // Actualizar última visita del cliente
      const updateRequest = new sql.Request(transaction)
      await updateRequest
        .input("cliente_id", sql.Int, id_cliente)
        .query(`UPDATE clientes SET ultima_visita = GETDATE() WHERE id_cliente = @cliente_id`)

      // Manejo de facturación para TODOS los tipos de pago (efectivo y crédito)
      const invoiceRequest = new sql.Request(transaction)
      await invoiceRequest
        .input("factura_venta_id", sql.Int, id_venta)
        .input("monto_total_factura", sql.Decimal(18, 2), totalVenta)
        .query(
          `DECLARE @cai_id INT; SELECT TOP 1 @cai_id = id_cai FROM CAI WHERE activo = 1; INSERT INTO Factura (id_venta, id_cai, numero_factura, fecha_emision, monto_total, anulada) VALUES (@factura_venta_id, @cai_id, FORMAT(GETDATE(), 'yyyyMMdd') + '-' + CAST(@factura_venta_id AS VARCHAR), GETDATE(), @monto_total_factura, 0)`,
        )

      // Confirmar transacción
      await transaction.commit()

      return NextResponse.json({
        success: true,
        data: {
          id_venta,
          total: totalVenta,
          message: "Venta registrada exitosamente",
        },
      })
    } catch (error) {
      await transaction.rollback()
      console.error("Transaction error:", error)
      return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 })
    }
  } catch (error) {
    console.error("Database connection error:", error)
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 })
  } finally {
    try {
      await closeConnection(pool)
    } catch (closeError) {
      console.error("Error closing connection:", closeError)
    }
  }
}

export async function PUT(req: NextRequest) {
  const pool = await getConnection()

  try {
    const { id_venta, ...ventaData }: Venta & { id_venta: number } = await req.json()
    const { id_cliente, id_personal, tipo_pago, efectivo_recibido, detalles_venta } = ventaData

    // Validaciones básicas
    if (!id_venta || !id_cliente || !id_personal || !tipo_pago || !detalles_venta || detalles_venta.length === 0) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    if (tipo_pago === "efectivo" && (efectivo_recibido === undefined || efectivo_recibido <= 0)) {
      return NextResponse.json(
        { success: false, error: "Efectivo recibido is required for cash payments" },
        { status: 400 },
      )
    }

    // Verificar que la venta existe y no está cerrada
    const checkVenta = await pool
      .request()
      .input("id_venta", sql.Int, id_venta)
      .query("SELECT cerrada FROM Venta WHERE id_venta = @id_venta")

    if (checkVenta.recordset.length === 0) {
      return NextResponse.json({ success: false, error: "Venta no encontrada" }, { status: 404 })
    }

    if (checkVenta.recordset[0].cerrada) {
      return NextResponse.json({ success: false, error: "No se puede modificar una venta cerrada" }, { status: 400 })
    }

    // Obtener datos del cliente
    const customerResult = await pool
      .request()
      .input("id_cliente", sql.Int, id_cliente)
      .query(
        `SELECT c.tipo_cliente, r.id_ruta FROM clientes c JOIN Ruta r ON c.id_ruta = r.id_ruta WHERE c.id_cliente = @id_cliente AND c.activo = 1`,
      )

    if (customerResult.recordset.length === 0) {
      return NextResponse.json({ success: false, error: "Cliente no encontrado o inactivo" }, { status: 404 })
    }

    const { tipo_cliente, id_ruta } = customerResult.recordset[0]

    // Validación de tipos de precio según tipo de cliente
    for (const detalle of detalles_venta) {
      if (tipo_cliente.includes("mayorista") && detalle.tipo_precio !== "mayorista" && detalle.tipo_precio !== "mayorista2") {
        return NextResponse.json(
          { success: false, error: "Los clientes mayoristas solo pueden comprar con precio mayorista o mayorista2" },
          { status: 400 },
        )
      }

      if (!tipo_cliente.includes("mayorista") && (detalle.tipo_precio === "mayorista" || detalle.tipo_precio === "mayorista2")) {
        return NextResponse.json(
          { success: false, error: "Solo los clientes mayoristas pueden usar precios mayoristas" },
          { status: 400 },
        )
      }
    }

    // Iniciar transacción
    const transaction = new sql.Transaction(pool)
    await transaction.begin()

    try {
      // 1. Obtener detalles actuales para revertir cambios
      const currentDetails = await new sql.Request(transaction)
        .input("id_venta", sql.Int, id_venta)
        .query(
          `SELECT dv.id_producto, dv.cantidad, dv.subtotal, p.precio_completo, p.precio_medio, p.precio_mayorista, p.precio_mayorista2 FROM Detalle_Venta dv JOIN Producto p ON dv.id_producto = p.id_producto WHERE dv.id_venta = @id_venta`,
        )

      // 2. Revertir inventario y crédito si aplica
      for (const detalle of currentDetails.recordset) {
        // Determinar el tipo de precio usado para calcular la cantidad correcta
        let cantidadARevertir = detalle.cantidad
        const precioUnitario = detalle.subtotal / detalle.cantidad

        if (Math.abs(precioUnitario - detalle.precio_medio) < 0.01) {
          cantidadARevertir = detalle.cantidad * 0.5
        }

        await new sql.Request(transaction)
          .input("ruta_id", sql.Int, id_ruta)
          .input("producto_id", sql.Int, detalle.id_producto)
          .input("cantidad", sql.Decimal(18, 2), cantidadARevertir)
          .query(
            `UPDATE Inventario_Ruta SET cantidad = cantidad + @cantidad WHERE id_ruta = @ruta_id AND id_producto = @producto_id`,
          )
      }

      // 3. Revertir crédito si la venta era a crédito
      const ventaActual = await new sql.Request(transaction)
        .input("id_venta", sql.Int, id_venta)
        .query("SELECT tipo_pago, total FROM Venta WHERE id_venta = @id_venta")

      if (ventaActual.recordset[0].tipo_pago === "credito" && tipo_cliente.includes("credito")) {
        await new sql.Request(transaction)
          .input("cliente_id", sql.Int, id_cliente)
          .input("monto", sql.Decimal(18, 2), ventaActual.recordset[0].total)
          .query(`UPDATE Cliente_Credito SET saldo_actual = saldo_actual - @monto WHERE id_cliente = @cliente_id`)
      }

      // 4. Eliminar detalles actuales
      await new sql.Request(transaction)
        .input("id_venta", sql.Int, id_venta)
        .query("DELETE FROM Detalle_Venta WHERE id_venta = @id_venta")

      // 5. Actualizar datos principales de la venta
      await new sql.Request(transaction)
        .input("id_venta", sql.Int, id_venta)
        .input("id_cliente", sql.Int, id_cliente)
        .input("id_personal", sql.Int, id_personal)
        .input("tipo_pago", sql.VarChar(20), tipo_pago)
        .input("efectivo_recibido", sql.Decimal(18, 2), efectivo_recibido || 0)
        .query(
          `UPDATE Venta SET id_cliente = @id_cliente, id_personal = @id_personal, tipo_pago = @tipo_pago, efectivo_recibido = @efectivo_recibido, fecha_actualizacion = GETDATE() WHERE id_venta = @id_venta`,
        )

      // 6. Insertar nuevos detalles y calcular nuevo total
      let nuevoTotal = 0

      for (const detalle of detalles_venta) {
        const { id_producto, cantidad, tipo_precio } = detalle

        const productResult = await new sql.Request(transaction)
          .input("producto_id", sql.Int, id_producto)
          .query(
            `SELECT precio_completo, precio_medio, precio_mayorista, precio_mayorista2 FROM Producto WHERE id_producto = @producto_id AND activo = 1`,
          )

        if (productResult.recordset.length === 0) {
          throw new Error(`Producto con id ${id_producto} no encontrado o inactivo`)
        }

        const product = productResult.recordset[0]
        let precioUnitario: number

        if (tipo_cliente.includes("mayorista")) {
          precioUnitario = tipo_precio === "mayorista2"
            ? Number.parseFloat(product.precio_mayorista2)
            : Number.parseFloat(product.precio_mayorista)
        } else {
          precioUnitario =
            tipo_precio === "medio"
              ? Number.parseFloat(product.precio_medio)
              : Number.parseFloat(product.precio_completo)
        }

        const subtotal = precioUnitario * cantidad
        nuevoTotal += subtotal

        await new sql.Request(transaction)
          .input("venta_id", sql.Int, id_venta)
          .input("producto_id", sql.Int, id_producto)
          .input("cantidad", sql.Int, cantidad)
          .input("subtotal", sql.Decimal(18, 2), subtotal)
          .query(
            `INSERT INTO Detalle_Venta (id_venta, id_producto, cantidad, subtotal) VALUES (@venta_id, @producto_id, @cantidad, @subtotal)`,
          )

        const cantidadARestar = tipo_precio === "medio" ? cantidad * 0.5 : cantidad

        await new sql.Request(transaction)
          .input("ruta_id", sql.Int, id_ruta)
          .input("producto_id", sql.Int, id_producto)
          .input("cantidad", sql.Decimal(18, 2), cantidadARestar)
          .query(
            `UPDATE Inventario_Ruta SET cantidad = cantidad - @cantidad WHERE id_ruta = @ruta_id AND id_producto = @producto_id`,
          )
      }

      // 7. Actualizar total de la venta
      await new sql.Request(transaction)
        .input("id_venta", sql.Int, id_venta)
        .input("total", sql.Decimal(18, 2), nuevoTotal)
        .query(`UPDATE Venta SET total = @total WHERE id_venta = @id_venta`)

      // 8. Actualizar crédito si es necesario
      if (tipo_pago === "credito" && tipo_cliente.includes("credito")) {
        await new sql.Request(transaction)
          .input("cliente_id", sql.Int, id_cliente)
          .input("monto", sql.Decimal(18, 2), nuevoTotal)
          .query(
            `MERGE INTO Cliente_Credito AS target USING (SELECT @cliente_id AS id_cliente, @monto AS saldo_actual) AS source ON target.id_cliente = source.id_cliente WHEN MATCHED THEN UPDATE SET saldo_actual = target.saldo_actual + source.saldo_actual, fecha_actualizacion = GETDATE() WHEN NOT MATCHED THEN INSERT (id_cliente, saldo_actual, fecha_actualizacion) VALUES (source.id_cliente, source.saldo_actual, GETDATE());`,
          )
      }

      // 9. Actualizar factura para TODOS los tipos de pago
      await new sql.Request(transaction)
        .input("venta_id", sql.Int, id_venta)
        .input("monto", sql.Decimal(18, 2), nuevoTotal)
        .query(`
          UPDATE Factura
          SET monto_total = @monto
          WHERE id_venta = @venta_id
        `)

      await transaction.commit()

      return NextResponse.json({
        success: true,
        data: {
          id_venta,
          total: nuevoTotal,
          message: "Venta actualizada exitosamente",
        },
      })
    } catch (error) {
      await transaction.rollback()
      console.error("Error updating sale:", error)
      return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 })
    }
  } catch (error) {
    console.error("Database connection error:", error)
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 })
  } finally {
    try {
      await closeConnection(pool)
    } catch (closeError) {
      console.error("Error closing connection:", closeError)
    }
  }
}
