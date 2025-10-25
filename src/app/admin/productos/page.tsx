"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, Plus, Edit, Trash2, Search, Package } from "lucide-react"

interface Producto {
  id_producto?: number
  codigo: string
  nombre: string
  descripcion?: string
  precio_completo: number
  precio_medio: number
  precio_mayorista: number
  precio_mayorista2: number
  activo?: boolean
}

export default function GestionProductos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [productosFiltrados, setProductosFiltrados] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [modalAbierto, setModalAbierto] = useState(false)
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null)
  const [formData, setFormData] = useState<Producto>({
    codigo: "",
    nombre: "",
    descripcion: "",
    precio_completo: 0,
    precio_medio: 0,
    precio_mayorista: 0,
    precio_mayorista2: 0,
    activo: true,
  })
  const router = useRouter()

  useEffect(() => {
    cargarProductos()
  }, [])

  const filtrarProductos = useCallback(() => {
    if (!busqueda) {
      setProductosFiltrados(productos)
    } else {
      const filtrados = productos.filter(
        (producto) =>
          producto.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          producto.codigo.toLowerCase().includes(busqueda.toLowerCase()),
      )
      setProductosFiltrados(filtrados)
    }
  }, [productos, busqueda])

  useEffect(() => {
    filtrarProductos()
  }, [filtrarProductos])

  const cargarProductos = async () => {
    try {
      const response = await fetch("/API/Productos?inactivos=true")
      const data = await response.json()

      if (data.success) {
        setProductos(data.data)
      } else {
        setError("Error al cargar productos")
      }
    } catch (error) {
      setError("Error de conexión")
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const abrirModal = (producto?: Producto) => {
    if (producto) {
      setProductoEditando(producto)
      setFormData(producto)
    } else {
      setProductoEditando(null)
      setFormData({
        codigo: "",
        nombre: "",
        descripcion: "",
        precio_completo: 0,
        precio_medio: 0,
        precio_mayorista: 0,
        precio_mayorista2: 0,
        activo: true,
      })
    }
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setProductoEditando(null)
    setError("")
  }

  const guardarProducto = async () => {
    try {
      const url = productoEditando ? "/API/Productos" : "/API/Productos"
      const method = productoEditando ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (result.success) {
        await cargarProductos()
        cerrarModal()
      } else {
        setError(result.error || "Error al guardar producto")
      }
    } catch (error) {
      setError("Error de conexión")
      console.error("Error:", error)
    }
  }

  const eliminarProducto = async (id: number) => {
    if (!confirm("¿Está seguro de eliminar este producto?")) return

    try {
      const response = await fetch(`/API/Productos?id=${id}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (result.success) {
        await cargarProductos()
      } else {
        setError(result.error || "Error al eliminar producto")
      }
    } catch (error) {
      setError("Error de conexión")
      console.error("Error:", error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>Cargando productos...</div>
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
                <h1 className="text-2xl font-bold text-gray-900">Gestión de Productos</h1>
                <p className="text-sm text-gray-600">Administra el catálogo de productos</p>
              </div>
            </div>
            <Button onClick={() => abrirModal()}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Producto
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Barra de búsqueda */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar productos por nombre o código..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Lista de productos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {productosFiltrados.map((producto) => (
            <Card key={producto.id_producto} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{producto.nombre}</CardTitle>
                    <p className="text-sm text-gray-600">{producto.codigo}</p>
                    {producto.descripcion && <p className="text-sm text-gray-500 mt-1">{producto.descripcion}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={producto.activo ? "default" : "secondary"}>
                      {producto.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span>Precio Completo:</span>
                    <span className="font-medium">L. {producto.precio_completo.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Precio Medio:</span>
                    <span className="font-medium">L. {producto.precio_medio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Precio Mayorista:</span>
                    <span className="font-medium">L. {producto.precio_mayorista.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Precio Mayorista 2:</span>
                    <span className="font-medium">L. {producto.precio_mayorista2.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" size="sm" onClick={() => abrirModal(producto)} className="flex-1">
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => eliminarProducto(producto.id_producto!)}
                    className="flex-1"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {productosFiltrados.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron productos</h3>
              <p className="text-gray-600">
                {busqueda ? "No hay productos que coincidan con tu búsqueda" : "No hay productos registrados"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Modal para crear/editar producto */}
        <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{productoEditando ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
              <DialogDescription>
                {productoEditando ? "Modifica los datos del producto" : "Ingresa los datos del nuevo producto"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="codigo" className="text-right">
                  Código
                </Label>
                <Input
                  id="codigo"
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  className="col-span-3"
                  placeholder="Código del producto"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="nombre" className="text-right">
                  Nombre
                </Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="col-span-3"
                  placeholder="Nombre del producto"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="descripcion" className="text-right">
                  Descripción
                </Label>
                <Input
                  id="descripcion"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="col-span-3"
                  placeholder="Descripción (opcional)"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="precio_completo" className="text-right">
                  Precio Completo
                </Label>
                <Input
                  id="precio_completo"
                  type="number"
                  step="0.01"
                  value={formData.precio_completo}
                  onChange={(e) =>
                    setFormData({ ...formData, precio_completo: Number.parseFloat(e.target.value) || 0 })
                  }
                  className="col-span-3"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="precio_medio" className="text-right">
                  Precio Medio
                </Label>
                <Input
                  id="precio_medio"
                  type="number"
                  step="0.01"
                  value={formData.precio_medio}
                  onChange={(e) => setFormData({ ...formData, precio_medio: Number.parseFloat(e.target.value) || 0 })}
                  className="col-span-3"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="precio_mayorista" className="text-right">
                  Precio Mayorista
                </Label>
                <Input
                  id="precio_mayorista"
                  type="number"
                  step="0.01"
                  value={formData.precio_mayorista}
                  onChange={(e) =>
                    setFormData({ ...formData, precio_mayorista: Number.parseFloat(e.target.value) || 0 })
                  }
                  className="col-span-3"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="precio_mayorista2" className="text-right">
                  Precio Mayorista 2
                </Label>
                <Input
                  id="precio_mayorista2"
                  type="number"
                  step="0.01"
                  value={formData.precio_mayorista2}
                  onChange={(e) =>
                    setFormData({ ...formData, precio_mayorista2: Number.parseFloat(e.target.value) || 0 })
                  }
                  className="col-span-3"
                  placeholder="0.00"
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
              <Button onClick={guardarProducto}>{productoEditando ? "Actualizar" : "Crear"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}