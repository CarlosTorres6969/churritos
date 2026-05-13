"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, MapPin, Plus, Edit, Users, Trash2 } from "lucide-react"

interface Ruta {
  id_ruta: number
  nombre: string
  descripcion?: string | null
  id_personal_asignado?: number | null
  activa?: boolean
  clientes_asignados?: number // Optional for display purposes
  vendedor_asignado?: string // Optional for display purposes
}

interface APIResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
  details?: string
}

export default function GestionRutas() {
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [modalAbierto, setModalAbierto] = useState(false)
  const [rutaEditando, setRutaEditando] = useState<Ruta | null>(null)
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    activa: true,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const router = useRouter()

  useEffect(() => {
    cargarRutas()
  }, [])

  const cargarRutas = async () => {
    try {
      setLoading(true)
      const response = await fetch("/API/rutas?inactivas=true")
      const result: APIResponse<Ruta[]> = await response.json()

      if (result.success && result.data) {
        // Add default values for display purposes
        const rutasConDefaults = result.data.map((ruta) => ({
          ...ruta,
          clientes_asignados: ruta.clientes_asignados || 0,
          vendedor_asignado: ruta.id_personal_asignado ? `Personal ${ruta.id_personal_asignado}` : undefined,
        }))
        setRutas(rutasConDefaults)
        setError("")
      } else {
        setError(result.error || "Error al cargar rutas")
      }
    } catch (error) {
      setError("Error de conexión al cargar rutas")
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const abrirModal = (ruta?: Ruta) => {
    if (ruta) {
      setRutaEditando(ruta)
      setFormData({
        nombre: ruta.nombre,
        descripcion: ruta.descripcion || "",
        activa: ruta.activa !== false,
      })
    } else {
      setRutaEditando(null)
      setFormData({
        nombre: "",
        descripcion: "",
        activa: true,
      })
    }
    setModalAbierto(true)
    setError("")
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setRutaEditando(null)
    setError("")
  }

  const guardarRuta = async () => {
    try {
      if (!formData.nombre.trim()) {
        setError("El nombre de la ruta es requerido")
        return
      }

      const url = "/API/rutas"
      const method = rutaEditando ? "PUT" : "POST"
      const body = rutaEditando ? { id_ruta: rutaEditando.id_ruta, ...formData } : formData

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      const result: APIResponse<Ruta> = await response.json()

      if (result.success) {
        await cargarRutas() // Reload data from server
        cerrarModal()
        setError("")
      } else {
        setError(result.error || "Error al guardar ruta")
      }
    } catch (error) {
      setError("Error de conexión al guardar ruta")
      console.error("Error:", error)
    }
  }

  const toggleEstadoRuta = async (ruta: Ruta) => {
    try {
      const response = await fetch("/API/rutas", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id_ruta: ruta.id_ruta,
          nombre: ruta.nombre,
          descripcion: ruta.descripcion,
          id_personal_asignado: ruta.id_personal_asignado,
          activa: !ruta.activa,
        }),
      })

      const result: APIResponse<Ruta> = await response.json()

      if (result.success) {
        await cargarRutas() // Reload data from server
        setError("")
      } else {
        setError(result.error || "Error al cambiar estado de la ruta")
      }
    } catch (error) {
      setError("Error de conexión al cambiar estado")
      console.error("Error:", error)
    }
  }

  const eliminarRuta = async (ruta: Ruta) => {
    if (!confirm(`¿Está seguro de eliminar la ruta "${ruta.nombre}"?`)) return

    if ((ruta.clientes_asignados || 0) > 0) {
      alert("No se puede eliminar una ruta con clientes asignados")
      return
    }

    try {
      const response = await fetch("/API/rutas", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id_ruta: ruta.id_ruta }),
      })

      const result: APIResponse<{ id_ruta: number }> = await response.json()

      if (result.success) {
        await cargarRutas() // Reload data from server
        setError("")
      } else {
        setError(result.error || "Error al eliminar ruta")
      }
    } catch (error) {
      setError("Error de conexión al eliminar ruta")
      console.error("Error:", error)
    }
  }

  const verClientesRuta = (ruta: Ruta) => {
    // Navegar a la gestión de clientes filtrada por ruta
    router.push(`/admin/clientes?ruta=${ruta.id_ruta}`)
  }

  const rutasActivas = rutas.filter((r) => r.activa).length
  const totalClientes = rutas.reduce((sum, r) => sum + (r.clientes_asignados || 0), 0)
  const rutasConVendedor = rutas.filter((r) => r.vendedor_asignado).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>Cargando rutas...</div>
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
                <h1 className="text-2xl font-bold text-gray-900">Gestión de Rutas</h1>
                <p className="text-sm text-gray-600">Administra las rutas de distribución</p>
              </div>
            </div>
            <Button onClick={() => abrirModal()}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Ruta
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

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Rutas</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rutas.length}</div>
              <p className="text-xs text-muted-foreground">rutas registradas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rutas Activas</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{rutasActivas}</div>
              <p className="text-xs text-muted-foreground">en operación</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClientes}</div>
              <p className="text-xs text-muted-foreground">clientes asignados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Con Vendedor</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rutasConVendedor}</div>
              <p className="text-xs text-muted-foreground">rutas asignadas</p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de rutas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rutas.map((ruta) => (
            <Card key={ruta.id_ruta} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{ruta.nombre}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">{ruta.descripcion || "Sin descripción"}</p>
                  </div>
                  <Badge variant={ruta.activa ? "default" : "secondary"}>{ruta.activa ? "Activa" : "Inactiva"}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-blue-600 font-bold text-lg">{ruta.clientes_asignados || 0}</p>
                    <p className="text-blue-600">Clientes</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-green-600 font-bold text-lg">{ruta.vendedor_asignado ? "1" : "0"}</p>
                    <p className="text-green-600">Vendedor</p>
                  </div>
                </div>

                {ruta.vendedor_asignado && (
                  <div className="text-sm">
                    <p className="text-gray-600">Vendedor asignado:</p>
                    <p className="font-medium">{ruta.vendedor_asignado}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => abrirModal(ruta)} className="flex-1">
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button variant="outline" onClick={() => verClientesRuta(ruta)} className="flex-1">
                    <Users className="h-4 w-4 mr-2" />
                    Clientes
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={ruta.activa ? "secondary" : "default"}
                    onClick={() => toggleEstadoRuta(ruta)}
                    className="flex-1"
                  >
                    {ruta.activa ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => eliminarRuta(ruta)}
                    disabled={(ruta.clientes_asignados || 0) > 0}
                    className="flex-1"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {rutas.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay rutas</h3>
              <p className="text-gray-600">Crea tu primera ruta para comenzar</p>
            </CardContent>
          </Card>
        )}

        {/* Modal para agregar/editar ruta */}
        <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{rutaEditando ? "Editar Ruta" : "Nueva Ruta"}</DialogTitle>
              <DialogDescription>
                {rutaEditando ? "Modifica los datos de la ruta" : "Crea una nueva ruta de distribución"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="nombre" className="text-right">
                  Nombre
                </Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="col-span-3"
                  placeholder="Ruta Centro"
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
                  placeholder="Descripción de la ruta"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="activa" className="text-right">
                  Estado
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="activa"
                    checked={formData.activa}
                    onChange={(e) => setFormData({ ...formData, activa: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="activa">Ruta activa</Label>
                </div>
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
              <Button onClick={guardarRuta}>{rutaEditando ? "Actualizar" : "Crear"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
