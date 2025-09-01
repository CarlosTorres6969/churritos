
"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Search, Package, AlertTriangle } from "lucide-react"
import { requireAuth } from "@/lib/auth"

interface ProductoInventario {
  id_producto: number
  codigo: string
  nombre: string
  cantidad: number
  precio_completo: number
  precio_medio: number
  precio_mayorista: number
  id_ruta?: number
}

interface ProductoAPI {
  id_producto: number
  codigo: string
  nombre: string
  descripcion?: string
  precio_completo: number
  precio_medio: number
  precio_mayorista: number
  activo: boolean
  id_ruta?: number
}

interface RutaUsuario {
  id_ruta: number
  nombre: string
  id_personal_asignado: number
  activa: boolean
}

export default function InventarioVendedor() {
  const [productos, setProductos] = useState<ProductoInventario[]>([])
  const [productosFiltrados, setProductosFiltrados] = useState<ProductoInventario[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rutaUsuario, setRutaUsuario] = useState<RutaUsuario | null>(null)
  const router = useRouter()

  const obtenerRutaUsuario = useCallback(async (idPersonal: number) => {
    try {
      const response = await fetch('/API/rutas');
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.data && data.data.length > 0) {
          const rutaDelUsuario = data.data.find((ruta: RutaUsuario) => 
            ruta.id_personal_asignado === idPersonal && ruta.activa
          );
          
          if (rutaDelUsuario) {
            setRutaUsuario(rutaDelUsuario);
            cargarInventario(rutaDelUsuario.id_ruta);
          } else {
            const rutaAsignada = data.data.find((ruta: RutaUsuario) => 
              ruta.id_personal_asignado === idPersonal
            );
            
            if (rutaAsignada) {
              setRutaUsuario(rutaAsignada);
              cargarInventario(rutaAsignada.id_ruta);
            } else {
              setError("No tienes una ruta asignada. Contacta al administrador.");
              setLoading(false);
            }
          }
        } else {
          setError("No hay rutas disponibles en el sistema");
          setLoading(false);
        }
      } else {
        setError("Error al cargar la información de tu ruta");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching user route:", error);
      setError("Error de conexión al cargar la información de tu ruta");
      setLoading(false);
    }
  }, [])

  useEffect(() => {
    const obtenerUsuario = () => {
      try {
        const userData = requireAuth();
        if (userData.rol !== "vendedor") {
          router.push("/")
          return
        }

        obtenerRutaUsuario(userData.id_personal);
      } catch (error) {
        console.error("Error al obtener el usuario autenticado:", error);
        router.push("/login");
      }
    };
    
    obtenerUsuario();
  }, [router, obtenerRutaUsuario])

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

  const cargarInventario = async (idRuta: number) => {
    try {
      // Obtener inventario de la ruta específica del vendedor
      const response = await fetch(`/API/inventario-ruta?id_ruta=${idRuta}`)
      if (!response.ok) {
        throw new Error("Error al cargar inventario")
      }

      const data = await response.json()

      if (data.success) {
        // Si hay datos de inventario, usarlos
        if (data.data && data.data.length > 0) {
          const inventarioRuta = data.data.map((item: {id_producto: number, producto_codigo: string, producto_nombre: string, cantidad: number, precio_completo: number, precio_medio: number, precio_mayorista: number, id_ruta: number}) => ({
            id_producto: item.id_producto,
            codigo: item.producto_codigo || "",
            nombre: item.producto_nombre || "",
            cantidad: item.cantidad || 0,
            precio_completo: item.precio_completo || 0,
            precio_medio: item.precio_medio || 0,
            precio_mayorista: item.precio_mayorista || 0,
            id_ruta: item.id_ruta
          }))
          setProductos(inventarioRuta)
        } else {
          // Si no hay inventario, obtener productos de la ruta
          const productosResponse = await fetch(`/API/Productos?id_ruta=${idRuta}`)
          const productosData = await productosResponse.json()

          if (productosData.success) {
            const inventarioSimulado = productosData.data.map((producto: ProductoAPI) => ({
              ...producto,
              cantidad: 0, // Stock cero si no hay inventario registrado
            }))
            setProductos(inventarioSimulado)
          } else {
            setError("Error al cargar productos de la ruta")
          }
        }
      } else {
        setError("Error al cargar inventario")
      }
    } catch (error) {
      setError("Error de conexión")
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const obtenerEstadoStock = (cantidad: number) => {
    if (cantidad === 0) return { estado: "agotado", color: "destructive" as const }
    if (cantidad <= 5) return { estado: "bajo", color: "secondary" as const }
    if (cantidad <= 10) return { estado: "medio", color: "outline" as const }
    return { estado: "alto", color: "default" as const }
  }

  const productosAgotados = productos.filter((p) => p.cantidad === 0).length
  const productosBajoStock = productos.filter((p) => p.cantidad > 0 && p.cantidad <= 5).length

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
                <h1 className="text-2xl font-bold text-gray-900">Mi Inventario</h1>
                <p className="text-sm text-gray-600">Productos disponibles en mi ruta</p>
                {rutaUsuario && (
                  <p className="text-xs text-gray-500">Ruta: {rutaUsuario.nombre}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alertas de stock */}
        {(productosAgotados > 0 || productosBajoStock > 0) && (
          <div className="space-y-4 mb-6">
            {productosAgotados > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Tienes {productosAgotados} producto(s) agotado(s). Contacta al administrador para reabastecimiento.
                </AlertDescription>
              </Alert>
            )}
            {productosBajoStock > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Tienes {productosBajoStock} producto(s) con stock bajo (≤5 unidades).
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{productos.length}</div>
              <p className="text-xs text-muted-foreground">Total productos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{productos.filter((p) => p.cantidad > 10).length}</div>
              <p className="text-xs text-muted-foreground">Stock alto</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{productosBajoStock}</div>
              <p className="text-xs text-muted-foreground">Stock bajo</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{productosAgotados}</div>
              <p className="text-xs text-muted-foreground">Agotados</p>
            </CardContent>
          </Card>
        </div>

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
          {productosFiltrados.map((producto) => {
            const stockInfo = obtenerEstadoStock(producto.cantidad)
            return (
              <Card key={producto.id_producto} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{producto.nombre}</CardTitle>
                      <p className="text-sm text-gray-600">{producto.codigo}</p>
                    </div>
                    <Badge variant={stockInfo.color}>{producto.cantidad} unidades</Badge>
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
                  </div>

                  <div className="pt-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Estado del stock:</span>
                      <Badge variant={stockInfo.color}>
                        {stockInfo.estado === "agotado" && "Agotado"}
                        {stockInfo.estado === "bajo" && "Stock Bajo"}
                        {stockInfo.estado === "medio" && "Stock Medio"}
                        {stockInfo.estado === "alto" && "Stock Alto"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {productosFiltrados.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron productos</h3>
              <p className="text-gray-600">
                {busqueda 
                  ? "No hay productos que coincidan con tu búsqueda" 
                  : "No hay productos en tu inventario"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
