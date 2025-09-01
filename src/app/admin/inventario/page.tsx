"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, Package, MapPin, Plus, Edit, AlertTriangle } from "lucide-react"

interface InventarioRuta {
  id_inventario_ruta: number
  id_ruta: number
  ruta_nombre: string
  id_producto: number
  producto_codigo: string
  producto_nombre: string
  cantidad: number
  fecha_actualizacion: string
}

interface Ruta {
  id_ruta: number
  nombre: string
}

interface Producto {
  id_producto: number
  codigo: string
  nombre: string
}

export default function InventarioPorRutaPage() {
  const [inventarios, setInventarios] = useState<InventarioRuta[]>([])
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [rutaSeleccionada, setRutaSeleccionada] = useState<string>("todas")
  const [modalAbierto, setModalAbierto] = useState(false)
  const [inventarioEditando, setInventarioEditando] = useState<InventarioRuta | null>(null)
  const [formData, setFormData] = useState({
    id_ruta: 0,
    id_producto: 0,
    cantidad: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const router = useRouter()

  // Cargar datos iniciales
  useEffect(() => {
    const cargarDatos = async () => {
      setLoading(true)
      setError("")
      try {
        // Cargar rutas
        const rutasRes = await fetch('/API/rutas')
        if (!rutasRes.ok) throw new Error("Error al cargar rutas")
        const rutasData = await rutasRes.json()
        setRutas(rutasData.data || [])

        // Cargar Productos
        const productosRes = await fetch('/API/Productos')
        if (!productosRes.ok) throw new Error("Error al cargar productos")
        const productosData = await productosRes.json()
        setProductos(productosData.data || [])

        // Cargar inventario
        const inventarioRes = await fetch('/API/inventario-ruta')
        if (!inventarioRes.ok) throw new Error("Error al cargar inventario")
        const inventarioData = await inventarioRes.json()
        setInventarios(inventarioData.data || [])
      } catch (error) {
        setError(error instanceof Error ? error.message : "Error desconocido")
      } finally {
        setLoading(false)
      }
    }

    cargarDatos()
  }, [])

  // Filtrar inventarios por ruta seleccionada
  const inventariosFiltrados = rutaSeleccionada === "todas" 
    ? inventarios 
    : inventarios.filter(inv => inv.id_ruta.toString() === rutaSeleccionada)

  // Agrupar inventarios por ruta
  const inventariosPorRuta = inventariosFiltrados.reduce((acc, inv) => {
    if (!acc[inv.ruta_nombre]) {
      acc[inv.ruta_nombre] = []
    }
    acc[inv.ruta_nombre].push(inv)
    return acc
  }, {} as Record<string, InventarioRuta[]>)

  // Manejar apertura/cierre del modal
  const abrirModal = (inventario?: InventarioRuta) => {
    if (inventario) {
      setInventarioEditando(inventario)
      setFormData({
        id_ruta: inventario.id_ruta,
        id_producto: inventario.id_producto,
        cantidad: inventario.cantidad,
      })
    } else {
      setInventarioEditando(null)
      setFormData({
        id_ruta: rutas[0]?.id_ruta || 0,
        id_producto: productos[0]?.id_producto || 0,
        cantidad: 0,
      })
    }
    setModalAbierto(true)
    setError("")
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setInventarioEditando(null)
    setError("")
  }

  // Guardar cambios en el inventario
  const guardarInventario = async () => {
    try {
      // Validación básica
      if (formData.cantidad < 0) {
        setError("La cantidad debe ser un número positivo")
        return
      }

      if (formData.id_ruta === 0 || formData.id_producto === 0) {
        setError("Debe seleccionar una ruta y un producto")
        return
      }

      const endpoint = '/API/inventario-ruta'
      const method = inventarioEditando ? 'PUT' : 'POST'

      // Preparar datos para enviar
      const requestData = inventarioEditando
        ? {
            id_inventario_ruta: inventarioEditando.id_inventario_ruta,
            cantidad: formData.cantidad
          }
        : {
            id_ruta: formData.id_ruta,
            id_producto: formData.id_producto,
            cantidad: formData.cantidad
          }

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al guardar")
      }

      // Recargar datos
      const inventarioRes = await fetch('/API/inventario-ruta')
      const inventarioData = await inventarioRes.json()
      setInventarios(inventarioData.data || [])

      cerrarModal()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error al guardar")
    }
  }

  // Eliminar registro de inventario
  const eliminarInventario = async (id: number) => {
    if (!confirm("¿Está seguro de que desea eliminar este registro de inventario?")) {
      return
    }

    try {
      const response = await fetch(`/API/inventario-ruta`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id_inventario_ruta: id })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al eliminar")
      }

      // Actualizar lista
      setInventarios(prev => prev.filter(inv => inv.id_inventario_ruta !== id))
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error al eliminar")
    }
  }

  // Determinar estado del stock
  const obtenerEstadoStock = (cantidad: number) => {
    if (cantidad === 0) return { estado: "agotado", color: "destructive" }
    if (cantidad <= 5) return { estado: "bajo", color: "secondary" }
    if (cantidad <= 10) return { estado: "medio", color: "outline" }
    return { estado: "alto", color: "default" }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>Cargando inventario...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Inventario por Ruta</h1>
                <p className="text-sm text-gray-600">Gestiona el inventario de cada ruta</p>
              </div>
            </div>
            <Button onClick={() => abrirModal()}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Inventario
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Filtros */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label>Filtrar por ruta:</Label>
              <Select value={rutaSeleccionada} onValueChange={setRutaSeleccionada}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Seleccionar ruta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las rutas</SelectItem>
                  {rutas.map((ruta) => (
                    <SelectItem key={ruta.id_ruta} value={ruta.id_ruta.toString()}>
                      {ruta.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Inventarios por ruta */}
        <div className="space-y-8">
          {Object.entries(inventariosPorRuta).map(([rutaNombre, inventariosRuta]) => (
            <Card key={rutaNombre}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {rutaNombre}
                  <Badge variant="outline">{inventariosRuta.length} Productos</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inventariosRuta.map((inventario) => {
                    const stockInfo = obtenerEstadoStock(inventario.cantidad)
                    return (
                      <Card key={inventario.id_inventario_ruta} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-medium">{inventario.producto_nombre}</h4>
                              <p className="text-sm text-gray-600">{inventario.producto_codigo}</p>
                            </div>
                            <Badge variant={stockInfo.color as "default" | "destructive" | "outline" | "secondary" | null | undefined}>
                              {inventario.cantidad}
                            </Badge>
                          </div>

                          <div className="space-y-2 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              {stockInfo.estado === "agotado" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                              {stockInfo.estado === "bajo" && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                              <span>
                                Estado: {stockInfo.estado === "agotado" && "Agotado"}
                                {stockInfo.estado === "bajo" && "Stock Bajo"}
                                {stockInfo.estado === "medio" && "Stock Medio"}
                                {stockInfo.estado === "alto" && "Stock Alto"}
                              </span>
                            </div>
                            <p>Actualizado: {new Date(inventario.fecha_actualizacion).toLocaleDateString("es-HN")}</p>
                          </div>

                          <div className="flex gap-2 mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => abrirModal(inventario)}
                              className="flex-1"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => eliminarInventario(inventario.id_inventario_ruta)}
                              className="flex-1"
                            >
                              Eliminar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {Object.keys(inventariosPorRuta).length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay inventario</h3>
              <p className="text-gray-600">
                {rutaSeleccionada === "todas"
                  ? "No hay inventario registrado"
                  : "No hay inventario para la ruta seleccionada"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Modal para agregar/editar inventario */}
        <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{inventarioEditando ? "Editar Inventario" : "Agregar Inventario"}</DialogTitle>
              <DialogDescription>
                {inventarioEditando ? "Modifica la cantidad del producto" : "Agrega un producto al inventario de ruta"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {!inventarioEditando && (
                <>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="ruta" className="text-right">
                      Ruta
                    </Label>
                    <Select
                      value={formData.id_ruta.toString()}
                      onValueChange={(value) => setFormData({ ...formData, id_ruta: Number(value) })}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Seleccionar ruta" />
                      </SelectTrigger>
                      <SelectContent>
                        {rutas.map((ruta) => (
                          <SelectItem key={ruta.id_ruta} value={ruta.id_ruta.toString()}>
                            {ruta.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="producto" className="text-right">
                      Producto
                    </Label>
                    <Select
                      value={formData.id_producto.toString()}
                      onValueChange={(value) => setFormData({ ...formData, id_producto: Number(value) })}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {productos.map((producto) => (
                          <SelectItem key={producto.id_producto} value={producto.id_producto.toString()}>
                            {producto.nombre} ({producto.codigo})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cantidad" className="text-right">
                  Cantidad
                </Label>
                <Input
                  id="cantidad"
                  type="number"
                  value={formData.cantidad}
                  onChange={(e) => setFormData({ ...formData, cantidad: Number(e.target.value) || 0 })}
                  className="col-span-3"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cerrarModal}>
                Cancelar
              </Button>
              <Button onClick={guardarInventario}>{inventarioEditando ? "Actualizar" : "Agregar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}