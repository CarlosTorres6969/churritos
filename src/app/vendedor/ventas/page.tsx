"use client"

import { useState, useEffect, useCallback, Suspense, use } from "react"
import React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Plus, Minus, Trash2, ShoppingCart, User, Package, Loader2, Calendar, MapPin, Search } from "lucide-react"
import { requireAuth } from "@/lib/auth"

interface Producto {
  id_producto: number
  codigo: string
  nombre: string
  precio_completo: number
  precio_medio: number
  precio_mayorista: number
  precio_mayorista2: number
  stock: number
  id_ruta?: number | null
}

interface Cliente {
  id_cliente: number
  nombre: string
  apellido: string
  tipo_cliente: string
  direccion?: string
  telefono?: string
  dia_visita?: number | null
  id_ruta?: number | null
  activo?: boolean
}

interface Ruta {
  id_ruta: number
  nombre: string
  descripcion: string
  id_personal_asignado: number
  activa: boolean
}

interface DetalleVenta {
  id_producto: number
  producto: Producto
  cantidad: number
  tipo_precio: "completo" | "medio" | "mayorista" | "mayorista2"
  subtotal: number
}

interface PriceTypeResponse {
  success: boolean
  data: {
    id_cliente: number
    tipo_cliente: string
    availablePrices: string[]
  }
}

interface InventarioRuta {
  id_inventario_ruta: number
  id_ruta: number
  id_producto: number
  cantidad: number
  fecha_actualizacion: string
  producto_codigo?: string
  producto_nombre?: string
  precio_completo?: number
  precio_medio?: number
  precio_mayorista?: number
  precio_mayorista2?: number
}

interface UsuarioAutenticado {
  id_personal: number
  nombre: string
  apellido: string
  rol: string
  usuario: string
}

interface RealizarVentaProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

interface RealizarVentaContentProps {
  resolvedSearchParams: { [key: string]: string | string[] | undefined }
}

const DIAS_SEMANA_MAP: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
}

function RealizarVentaContent({ resolvedSearchParams }: RealizarVentaContentProps) {
  const [productosDisponibles, setProductosDisponibles] = useState<Producto[]>([])
  const [productosFiltrados, setProductosFiltrados] = useState<Producto[]>([])
  const [clientesDisponibles, setClientesDisponibles] = useState<Cliente[]>([])
  const [clientesFiltrados, setClientesFiltrados] = useState<Cliente[]>([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [availablePrices, setAvailablePrices] = useState<string[]>([])
  const [detallesVenta, setDetallesVenta] = useState<DetalleVenta[]>([])
  const [tipoPago, setTipoPago] = useState<"efectivo" | "credito">("efectivo")
  const [efectivoRecibido, setEfectivoRecibido] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [cargandoProductos, setCargandoProductos] = useState(false)
  const [cargandoClientes, setCargandoClientes] = useState(false)
  const [cargandoRuta, setCargandoRuta] = useState(false)
  const [error, setError] = useState("")
  const [rutaUsuario, setRutaUsuario] = useState<Ruta | null>(null)
  const [usuarioAutenticado, setUsuarioAutenticado] = useState<UsuarioAutenticado | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [terminoBusqueda, setTerminoBusqueda] = useState("")
  const router = useRouter()

  const esStockMedio = (stock: number): boolean => {
    return Math.abs(stock - 0.5) < 0.1
  }

  const fetchClientAndPrices = useCallback(
    async (clientId: string) => {
      try {
        const response = await fetch(`/API/Ventas?id_cliente=${clientId}`)
        const data: PriceTypeResponse = await response.json()
        if (data.success) {
          const clienteCompleto = clientesDisponibles.find((c) => c.id_cliente === Number.parseInt(clientId))
          if (clienteCompleto) {
            setClienteSeleccionado(clienteCompleto)
          } else {
            setClienteSeleccionado({
              id_cliente: data.data.id_cliente,
              nombre: "Cliente",
              apellido: "",
              tipo_cliente: data.data.tipo_cliente,
            })
          }
          setAvailablePrices(data.data.availablePrices)
        } else {
          setError("Error al cargar información del cliente")
        }
      } catch (error) {
        console.error("Error al obtener precios del cliente:", error)
        setError("Error al cargar precios disponibles")
      }
    },
    [clientesDisponibles],
  )

  const obtenerDiaActualNumero = (): number => {
    return new Date().getDay() === 0 ? 7 : new Date().getDay()
  }

  // Función para filtrar clientes por término de búsqueda y día actual
  const filtrarClientes = useCallback(() => {
    const diaActual = obtenerDiaActualNumero()
    let clientesFiltradosPorDia = clientesDisponibles.filter(
      (cliente) => cliente.activo !== false && cliente.dia_visita === diaActual
    )

    if (rutaUsuario) {
      clientesFiltradosPorDia = clientesFiltradosPorDia.filter(
        (cliente) => cliente.id_ruta === rutaUsuario.id_ruta
      )
    }

    if (terminoBusqueda.trim()) {
      const termino = terminoBusqueda.toLowerCase().trim()
      return clientesFiltradosPorDia.filter((cliente) => {
        return (
          cliente.nombre.toLowerCase().includes(termino) ||
          cliente.apellido.toLowerCase().includes(termino) ||
          (cliente.telefono && cliente.telefono.includes(termino)) ||
          (cliente.direccion && cliente.direccion.toLowerCase().includes(termino))
        )
      })
    }

    return clientesFiltradosPorDia
  }, [clientesDisponibles, rutaUsuario, terminoBusqueda])

  useEffect(() => {
    const clientesFiltrados = filtrarClientes()
    setClientesFiltrados(clientesFiltrados)
  }, [filtrarClientes])

  const fetchClientes = useCallback(async () => {
    if (!rutaUsuario) return

    try {
      setCargandoClientes(true)
      const response = await fetch(`/API/Clientes?id_ruta=${rutaUsuario.id_ruta}`)
      if (response.ok) {
        const data = await response.json()
        const clientesData = Array.isArray(data) ? data : data.data || data.clientes || []
        const clientesProcesados = clientesData.map((cliente: unknown) => {
          const clienteObj = cliente as Record<string, unknown>
          return {
            id_cliente: clienteObj.id_cliente as number,
            nombre: clienteObj.nombre as string,
            apellido: clienteObj.apellido as string,
            telefono: clienteObj.telefono as string,
            direccion: clienteObj.direccion as string,
            tipo_cliente: clienteObj.tipo_cliente as string,
            dia_visita:
              clienteObj.dia_visita !== null && clienteObj.dia_visita !== undefined
                ? Number(clienteObj.dia_visita)
                : null,
            id_ruta: clienteObj.id_ruta as number,
            activo: clienteObj.activo !== false,
          }
        })
        setClientesDisponibles(clientesProcesados)
      } else {
        setError("Error al cargar clientes")
      }
    } catch (error) {
      console.error("Error al cargar clientes:", error)
      setError("Error de conexión al cargar clientes")
    } finally {
      setCargandoClientes(false)
    }
  }, [rutaUsuario])

  const fetchProductos = useCallback(async () => {
    if (!rutaUsuario) return

    try {
      setCargandoProductos(true)
      setError("")

      const responseProductos = await fetch("/API/Productos")
      let todosLosProductos: Producto[] = []

      if (responseProductos.ok) {
        const dataProductos = await responseProductos.json()
        if (dataProductos.success && dataProductos.data) {
          todosLosProductos = dataProductos.data
        }
      }

      const response = await fetch(`/API/inventario-ruta?id_ruta=${rutaUsuario.id_ruta}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const productosData: Producto[] = data.data.map((item: InventarioRuta) => {
            const productoCompleto = todosLosProductos.find((p) => p.id_producto === item.id_producto)

            return {
              id_producto: item.id_producto,
              codigo: productoCompleto?.codigo || item.producto_codigo || "",
              nombre: productoCompleto?.nombre || item.producto_nombre || "Producto sin nombre",
              precio_completo: productoCompleto?.precio_completo || item.precio_completo || 0,
              precio_medio: productoCompleto?.precio_medio || item.precio_medio || 0,
              precio_mayorista: productoCompleto?.precio_mayorista || item.precio_mayorista || 0,
              precio_mayorista2: productoCompleto?.precio_mayorista2 || item.precio_mayorista2 || 0,
              stock: item.cantidad,
              id_ruta: item.id_ruta,
            }
          })

          const productosOrdenados = productosData.sort((a, b) => a.id_producto - b.id_producto)
          setProductosDisponibles(productosOrdenados)
        } else {
          setError("Error al cargar inventario de la ruta")
        }
      } else {
        setError("Error al cargar inventario de la ruta")
      }
    } catch (error) {
      console.error("Error al cargar productos:", error)
      setError("Error de conexión al cargar productos")
    } finally {
      setCargandoProductos(false)
    }
  }, [rutaUsuario])

  useEffect(() => {
    const obtenerUsuario = async () => {
      try {
        const user = requireAuth()
        setUsuarioAutenticado(user as UsuarioAutenticado)
        await fetchRutaUsuario(user.id_personal)
      } catch (error) {
        console.error("Error al obtener el usuario autenticado:", error)
        router.push("/login")
      }
    }

    obtenerUsuario()
  }, [router])

  useEffect(() => {
    if (rutaUsuario) {
      fetchProductos()
      fetchClientes()
    }
  }, [rutaUsuario, fetchProductos, fetchClientes])

  useEffect(() => {
    if (rutaUsuario) {
      const productosFiltrados = productosDisponibles
        .filter((producto) => producto.id_ruta === rutaUsuario.id_ruta)
        .sort((a, b) => a.id_producto - b.id_producto)
      setProductosFiltrados(productosFiltrados)
    } else {
      const productosOrdenados = productosDisponibles.sort((a, b) => a.id_producto - b.id_producto)
      setProductosFiltrados(productosOrdenados)
    }
  }, [productosDisponibles, rutaUsuario])

  useEffect(() => {
    if (isInitialLoad && resolvedSearchParams && usuarioAutenticado) {
      const clientId = resolvedSearchParams?.clientId as string | undefined
      if (clientId && !clienteSeleccionado) {
        fetchClientAndPrices(clientId)
      }
      setIsInitialLoad(false)
    }
  }, [resolvedSearchParams, clienteSeleccionado, fetchClientAndPrices, isInitialLoad, usuarioAutenticado])

  const fetchRutaUsuario = async (idPersonal: number) => {
    try {
      setCargandoRuta(true)

      const response = await fetch("/API/rutas")
      if (response.ok) {
        const data = await response.json()

        if (data.success && data.data && data.data.length > 0) {
          const rutaDelUsuario = data.data.find((ruta: Ruta) => ruta.id_personal_asignado === idPersonal && ruta.activa)

          if (rutaDelUsuario) {
            setRutaUsuario(rutaDelUsuario)
          } else {
            const rutaAsignada = data.data.find((ruta: Ruta) => ruta.id_personal_asignado === idPersonal)

            if (rutaAsignada) {
              setRutaUsuario(rutaAsignada)
            } else {
              setError("No tienes una ruta asignada. Contacta al administrador.")
            }
          }
        } else {
          setError("No hay rutas disponibles en el sistema")
        }
      } else {
        setError("Error al cargar las rutas")
      }
    } catch (error) {
      console.error("Error al obtener rutas:", error)
      setError("Error de conexión al cargar rutas")
    } finally {
      setCargandoRuta(false)
    }
  }

  const obtenerNombreDia = (numeroDia: number | null | undefined): string => {
    if (!numeroDia || numeroDia < 1 || numeroDia > 7) return "Sin asignar"
    return DIAS_SEMANA_MAP[numeroDia] || "Sin asignar"
  }

  const seleccionarCliente = async (cliente: Cliente) => {
    setClienteSeleccionado(cliente)
    setError("")
    try {
      const response = await fetch(`/API/Ventas?id_cliente=${cliente.id_cliente}`)
      const data: PriceTypeResponse = await response.json()
      if (data.success) {
        setAvailablePrices(data.data.availablePrices)
      } else {
        setError("Error al cargar precios disponibles")
        setAvailablePrices([])
      }
    } catch (error) {
      console.error("Error al obtener tipos de precio:", error)
      setError("Error al cargar precios disponibles")
      setAvailablePrices([])
    }
  }

  const obtenerPrecio = (producto: Producto, tipoPrecio: "completo" | "medio" | "mayorista" | "mayorista2"): number => {
    switch (tipoPrecio) {
      case "mayorista":
        return producto.precio_mayorista
      case "mayorista2":
        return producto.precio_mayorista2
      case "medio":
        return producto.precio_medio
      default:
        return producto.precio_completo
    }
  }

  const agregarProducto = (producto: Producto) => {
    if (!clienteSeleccionado) {
      setError("Debe seleccionar un cliente primero")
      return
    }

    const stockDisponible = Math.abs(producto.stock) < 0.01 ? 0 : producto.stock
    if (stockDisponible < 0.5) {
      setError(`No hay stock suficiente para ${producto.nombre} (stock: ${stockDisponible})`)
      return
    }

    let precioTipo: "completo" | "medio" | "mayorista" | "mayorista2" = clienteSeleccionado.tipo_cliente.includes("mayorista")
      ? "mayorista"
      : "completo"

    if (esStockMedio(stockDisponible)) {
      if (!availablePrices.includes("medio")) {
        setError(`No se puede vender ${producto.nombre} con stock de 0.5 a este cliente, ya que no permite precio medio`)
        return
      }
      precioTipo = "medio"
    }

    const precio = obtenerPrecio(producto, precioTipo)
    const detalleExistente = detallesVenta.find(
      (d) => d.id_producto === producto.id_producto && d.tipo_precio === precioTipo,
    )

    if (detalleExistente) {
      if (esStockMedio(stockDisponible) && detalleExistente.cantidad >= 1) {
        setError(`Solo puedes agregar 1 unidad de ${producto.nombre} (stock: ${stockDisponible})`)
        return
      }

      if (detalleExistente.cantidad + 1 > stockDisponible) {
        setError(`No hay suficiente stock para ${producto.nombre}. Stock disponible: ${stockDisponible}`)
        return
      }

      actualizarCantidad(detalleExistente, detalleExistente.cantidad + 1)
    } else {
      const nuevoDetalle: DetalleVenta = {
        id_producto: producto.id_producto,
        producto,
        cantidad: 1,
        tipo_precio: precioTipo,
        subtotal: precio,
      }
      setDetallesVenta([...detallesVenta, nuevoDetalle])
    }
  }

  const actualizarCantidad = (detalle: DetalleVenta, nuevaCantidad: number) => {
    if (nuevaCantidad <= 0) {
      eliminarDetalle(detalle)
      return
    }

    const stockDisponible = Math.abs(detalle.producto.stock) < 0.01 ? 0 : detalle.producto.stock

    if (nuevaCantidad > stockDisponible) {
      setError(`No hay suficiente stock para ${detalle.producto.nombre}. Stock disponible: ${stockDisponible}`)
      return
    }

    let nuevoTipoPrecio = detalle.tipo_precio
    if (esStockMedio(stockDisponible)) {
      if (!availablePrices.includes("medio")) {
        setError(`No se puede vender ${detalle.producto.nombre} con stock de 0.5 a este cliente, ya que no permite precio medio`)
        return
      }
      nuevoTipoPrecio = "medio"
      if (nuevaCantidad > 1) {
        setError(`Solo puedes vender 1 unidad de ${detalle.producto.nombre} (stock: ${stockDisponible})`)
        return
      }
    }

    const precio = obtenerPrecio(detalle.producto, nuevoTipoPrecio)
    const nuevoSubtotal = precio * nuevaCantidad

    setDetallesVenta((prev) =>
      prev.map((d) =>
        d === detalle
          ? { ...d, cantidad: nuevaCantidad, tipo_precio: nuevoTipoPrecio, subtotal: nuevoSubtotal }
          : d
      ),
    )
  }

  const cambiarTipoPrecio = (detalle: DetalleVenta, nuevoTipo: "completo" | "medio" | "mayorista" | "mayorista2") => {
    if (!availablePrices.includes(nuevoTipo)) {
      setError(`El tipo de precio ${nuevoTipo} no está disponible para este cliente`)
      return
    }

    const stockDisponible = Math.abs(detalle.producto.stock) < 0.01 ? 0 : detalle.producto.stock

    if (esStockMedio(stockDisponible) && nuevoTipo !== "medio") {
      setError(`Solo se puede usar precio medio para ${detalle.producto.nombre} con stock de 0.5`)
      return
    }

    const precio = obtenerPrecio(detalle.producto, nuevoTipo)
    const nuevoSubtotal = precio * detalle.cantidad
    setDetallesVenta((prev) =>
      prev.map((d) => (d === detalle ? { ...d, tipo_precio: nuevoTipo, subtotal: nuevoSubtotal } : d)),
    )
  }

  const eliminarDetalle = (detalle: DetalleVenta) => {
    setDetallesVenta((prev) => prev.filter((d) => d !== detalle))
  }

  const calcularTotal = (): number => {
    return detallesVenta.reduce((total, detalle) => total + detalle.subtotal, 0)
  }

  const procesarVenta = async () => {
    if (!clienteSeleccionado || detallesVenta.length === 0) {
      setError("Seleccione un cliente y agregue productos")
      return
    }
    if (tipoPago === "efectivo" && efectivoRecibido < calcularTotal()) {
      setError("El efectivo recibido debe ser mayor o igual al total")
      return
    }
    setLoading(true)
    setError("")
    try {
      if (!usuarioAutenticado) {
        throw new Error("Usuario no autenticado")
      }

      const ventaData = {
        id_cliente: clienteSeleccionado.id_cliente,
        id_personal: usuarioAutenticado.id_personal,
        tipo_pago: tipoPago,
        efectivo_recibido: tipoPago === "efectivo" ? efectivoRecibido : 0,
        detalles_venta: detallesVenta.map((detalle) => ({
          id_producto: detalle.id_producto,
          cantidad: detalle.cantidad,
          tipo_precio: detalle.tipo_precio,
        })),
      }
      
      const response = await fetch("/API/Ventas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ventaData),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status}: ${response.statusText}`)
      }
      
      if (result.success) {
        await fetchProductos()
        setDetallesVenta([])
        setEfectivoRecibido(0)
        setError("")
        alert(`¡Venta procesada exitosamente! ID: ${result.data.id_venta}`)
        router.push("/vendedor")
      } else {
        setError(result.error || "Error al procesar la venta")
      }
    } catch (error) {
      console.error("Error al procesar la venta:", error)
      setError(error instanceof Error ? `Error al procesar la venta: ${error.message}` : "Error al procesar la venta")
    } finally {
      setLoading(false)
    }
  }

  const total = calcularTotal()
  const cambio = tipoPago === "efectivo" ? Math.max(0, efectivoRecibido - total) : 0

  if (!usuarioAutenticado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
          <p className="mt-2">Verificando autenticación...</p>
        </div>
      </div>
    )
  }

  if (cargandoRuta) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
          <p className="mt-2">Cargando información de tu ruta...</p>
        </div>
      </div>
    )
  }

  if (!rutaUsuario) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-md">
          <MapPin className="h-12 w-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">No tienes una ruta asignada</h2>
          <p className="text-gray-600 mb-4">Contacta al administrador para que te asigne una ruta de ventas.</p>
          <Button onClick={() => router.push("/vendedor")}>Volver al panel de vendedor</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 gap-4">
            <div className="flex items-center space-x-4 w-full sm:w-auto">
              <Button variant="ghost" onClick={() => router.push("/vendedor")} className="p-2 sm:p-0">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Volver</span>
              </Button>
              <div className="flex-1 sm:flex-none">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Realizar Venta</h1>
                <p className="text-sm text-gray-600">Procesa una nueva venta</p>
                <div className="flex items-center mt-1 text-xs text-blue-600">
                  <MapPin className="h-3 w-3 mr-1" />
                  <span>
                    Ruta: {rutaUsuario.nombre} (ID: {rutaUsuario.id_ruta}) - Asignada a:{" "}
                    {rutaUsuario.id_personal_asignado}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
              <div className="text-sm text-gray-600">
                Vendedor: {usuarioAutenticado.nombre} {usuarioAutenticado.apellido} (ID:{" "}
                {usuarioAutenticado.id_personal})
              </div>
              <div className="flex space-x-2">
                <Button onClick={fetchClientes} variant="outline" disabled={cargandoClientes} size="sm">
                  {cargandoClientes ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Actualizar Clientes
                </Button>
                <Button onClick={fetchProductos} variant="outline" disabled={cargandoProductos} size="sm">
                  {cargandoProductos ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Actualizar Productos
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Seleccionar Cliente
                  {cargandoClientes && <Loader2 className="h-4 w-4 animate-spin" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {clienteSeleccionado ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-lg">
                          {clienteSeleccionado.nombre} {clienteSeleccionado.apellido}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline">{clienteSeleccionado.tipo_cliente}</Badge>
                          {clienteSeleccionado.dia_visita && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {obtenerNombreDia(clienteSeleccionado.dia_visita)}
                            </Badge>
                          )}
                        </div>
                        {clienteSeleccionado.telefono && (
                          <p className="text-sm text-gray-600 mt-1">Tel: {clienteSeleccionado.telefono}</p>
                        )}
                        {clienteSeleccionado.direccion && (
                          <p className="text-sm text-gray-600">Dir: {clienteSeleccionado.direccion}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-sm font-medium">Precios disponibles:</span>
                          {availablePrices.map((price) => (
                            <Badge key={price} variant="secondary">
                              {price}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setClienteSeleccionado(null)
                          setAvailablePrices([])
                        }}
                      >
                        Cambiar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Buscar cliente</Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar por nombre, teléfono, dirección..."
                          className="pl-8"
                          value={terminoBusqueda}
                          onChange={(e) => setTerminoBusqueda(e.target.value)}
                        />
                      </div>
                    </div>

                    {cargandoClientes ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : clientesFiltrados.length > 0 ? (
                      <div className="grid gap-2 max-h-60 overflow-y-auto">
                        {clientesFiltrados.map((cliente) => (
                          <div
                            key={cliente.id_cliente}
                            className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => seleccionarCliente(cliente)}
                          >
                            <p className="font-medium">
                              {cliente.nombre} {cliente.apellido}
                            </p>
                            <div className="flex justify-between items-center text-sm text-gray-600 mt-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{cliente.tipo_cliente}</Badge>
                                {cliente.dia_visita && (
                                  <Badge variant="secondary" className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {obtenerNombreDia(cliente.dia_visita)}
                                  </Badge>
                                )}
                              </div>
                              {cliente.telefono && <span>{cliente.telefono}</span>}
                            </div>
                            {cliente.direccion && (
                              <p className="text-xs text-gray-500 mt-1 truncate">{cliente.direccion}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">
                        {terminoBusqueda.trim()
                          ? "No se encontraron clientes que coincidan con la búsqueda para hoy"
                          : `No hay clientes con visita hoy (${obtenerNombreDia(obtenerDiaActualNumero())})`}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Carrito de Venta
                  {detallesVenta.length > 0 && <Badge>{detallesVenta.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {detallesVenta.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hay productos en el carrito</p>
                ) : (
                  <>
                    {detallesVenta.map((detalle, index) => {
                      const stockDisponible = Math.abs(detalle.producto.stock) < 0.01 ? 0 : detalle.producto.stock
                      const esStockMedioProducto = esStockMedio(stockDisponible)
                      
                      return (
                        <div key={index} className="border rounded-lg p-3 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{detalle.producto.nombre}</p>
                              <p className="text-sm text-gray-600">{detalle.producto.codigo}</p>
                              <p className={`text-sm ${esStockMedioProducto ? 'text-orange-600 font-bold' : 'text-gray-600'}`}>
                                Stock disponible: {stockDisponible}
                                {esStockMedioProducto && ' (Última unidad)'}
                              </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => eliminarDetalle(detalle)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => actualizarCantidad(detalle, detalle.cantidad - 1)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{detalle.cantidad}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => actualizarCantidad(detalle, detalle.cantidad + 1)}
                              disabled={detalle.cantidad >= stockDisponible || esStockMedioProducto}
                              title={
                                detalle.cantidad >= stockDisponible
                                  ? "No hay más stock disponible"
                                  : esStockMedioProducto
                                    ? "Solo se puede vender 1 unidad con stock de 0.5"
                                    : "Aumentar cantidad"
                              }
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <Label>Tipo de Precio</Label>
                            <Select
                              value={detalle.tipo_precio}
                              onValueChange={(value: "completo" | "medio" | "mayorista" | "mayorista2") =>
                                cambiarTipoPrecio(detalle, value)
                              }
                              disabled={esStockMedioProducto}
                            >
                              <SelectTrigger>
                                <SelectValue />
                                {esStockMedioProducto && " (Forzado a medio)"}
                              </SelectTrigger>
                              <SelectContent>
                                {availablePrices.map((price) => (
                                  <SelectItem key={price} value={price} disabled={esStockMedioProducto && price !== "medio"}>
                                    {price === "mayorista2" ? "Mayorista 2" : price.charAt(0).toUpperCase() + price.slice(1)}
                                    {esStockMedioProducto && price !== "medio" && " (No disponible)"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {esStockMedioProducto && (
                              <p className="text-xs text-orange-600">
                                Precio medio forzado por stock bajo (0.5 unidades)
                              </p>
                            )}
                          </div>

                          <div className="text-right">
                            <p className="font-medium">L. {detalle.subtotal.toFixed(2)}</p>
                            <p className="text-sm text-gray-600">
                              {detalle.tipo_precio} - L. {obtenerPrecio(detalle.producto, detalle.tipo_precio).toFixed(2)}{" "}
                              c/u
                            </p>
                          </div>
                        </div>
                      )
                    })}

                    <Separator />

                    <div className="space-y-4">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total:</span>
                        <span>L. {total.toFixed(2)}</span>
                      </div>

                      <div className="space-y-2">
                        <Label>Tipo de Pago</Label>
                        <Select value={tipoPago} onValueChange={(value: "efectivo" | "credito") => setTipoPago(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            {clienteSeleccionado?.tipo_cliente.includes("credito") && (
                              <SelectItem value="credito">Crédito</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {tipoPago === "efectivo" && (
                        <div className="space-y-2">
                          <Label>Efectivo Recibido</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={efectivoRecibido}
                            onChange={(e) => setEfectivoRecibido(Number.parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                          />
                          {cambio > 0 && (
                            <p className="text-sm text-green-600 font-medium">Cambio: L. {cambio.toFixed(2)}</p>
                          )}
                        </div>
                      )}

                      {error && (
                        <Alert variant="destructive">
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      )}

                      <Button
                        onClick={procesarVenta}
                        className="w-full"
                        size="lg"
                        disabled={loading || detallesVenta.length === 0 || !clienteSeleccionado}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Procesando...
                          </>
                        ) : (
                          `Procesar Venta - L. ${total.toFixed(2)}`
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Productos Disponibles en tu Ruta
                  {cargandoProductos && <Loader2 className="h-4 w-4 animate-spin" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cargandoProductos ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : productosFiltrados.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {productosFiltrados.map((producto) => {
                      const stockDisponible = Math.abs(producto.stock) < 0.01 ? 0 : producto.stock
                      const esStockMedioProducto = esStockMedio(stockDisponible)
                      const precioMostrar = clienteSeleccionado?.tipo_cliente.includes("mayorista")
                        ? esStockMedioProducto
                          ? producto.precio_medio
                          : producto.precio_mayorista
                        : esStockMedioProducto
                          ? producto.precio_medio
                          : producto.precio_completo

                      return (
                        <div
                          key={producto.id_producto}
                          className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                          <p className="font-medium">{producto.nombre}</p>
                          <p className="text-sm text-gray-600">{producto.codigo}</p>
                          <p className={`text-sm ${esStockMedioProducto ? 'text-orange-600 font-bold' : 'text-gray-600'}`}>
                            Stock: {stockDisponible}
                            {esStockMedioProducto && ' (Última unidad)'}
                          </p>
                          <p className="text-sm font-medium mt-1">
                            Precio: L. {precioMostrar.toFixed(2)} ({esStockMedioProducto ? 'medio' : clienteSeleccionado?.tipo_cliente.includes("mayorista") ? 'mayorista' : 'completo'})
                          </p>
                          <Button
                            onClick={() => agregarProducto(producto)}
                            className="mt-2 w-full"
                            disabled={stockDisponible < 0.5}
                            title={stockDisponible < 0.5 ? "No hay stock disponible" : "Agregar al carrito"}
                          >
                            Agregar
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">
                    No hay productos disponibles en tu ruta
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RealizarVenta({ searchParams }: RealizarVentaProps) {
  const resolvedSearchParams = use(searchParams)
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <RealizarVentaContent resolvedSearchParams={resolvedSearchParams} />
    </Suspense>
  )
}