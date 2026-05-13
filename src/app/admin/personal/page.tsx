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
import { ArrowLeft, Users, Plus, Edit, UserCheck, UserX, Shield } from "lucide-react"

interface Personal {
  id_personal: number
  nombre: string
  apellido: string
  telefono?: string
  direccion?: string
  email?: string
  fecha_registro: string
  usuario: string
  contrasena?: string
  rol: "vendedor" | "administrador"
  fecha_contratacion: string
  activo: boolean
}

export default function GestionPersonal() {
  const [Personal, setPersonal] = useState<Personal[]>([])
  const [modalAbierto, setModalAbierto] = useState(false)
  const [personalEditando, setPersonalEditando] = useState<Personal | null>(null)
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    usuario: "",
    contrasena: "",
    rol: "vendedor" as "vendedor" | "administrador",
    activo: true,
    telefono: "",
    direccion: "",
    email: "",
    fecha_contratacion: new Date().toISOString().split("T")[0],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const router = useRouter()

  useEffect(() => {
    cargarPersonal()
  }, [])

  const cargarPersonal = async () => {
    try {
      setLoading(true)
      const response = await fetch("/API/Personal")

      if (!response.ok) {
        throw new Error("Error al cargar Personal")
      }

      const data = await response.json()
      setPersonal(data)
      setError("")
    } catch (error) {
      setError("Error al cargar Personal")
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const abrirModal = (persona?: Personal) => {
    if (persona) {
      setPersonalEditando(persona)
      setFormData({
        nombre: persona.nombre,
        apellido: persona.apellido,
        usuario: persona.usuario,
        contrasena: "",
        rol: persona.rol,
        activo: persona.activo,
        telefono: persona.telefono || "",
        direccion: persona.direccion || "",
        email: persona.email || "",
        fecha_contratacion: persona.fecha_contratacion.split("T")[0],
      })
    } else {
      setPersonalEditando(null)
      setFormData({
        nombre: "",
        apellido: "",
        usuario: "",
        contrasena: "",
        rol: "vendedor",
        activo: true,
        telefono: "",
        direccion: "",
        email: "",
        fecha_contratacion: new Date().toISOString().split("T")[0],
      })
    }
    setModalAbierto(true)
    setError("")
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setPersonalEditando(null)
    setError("")
  }

  const guardarPersonal = async () => {
    try {
      if (!formData.nombre.trim() || !formData.apellido.trim() || !formData.usuario.trim()) {
        setError("Nombre, apellido y usuario son requeridos")
        return
      }

      if (!personalEditando && !formData.contrasena.trim()) {
        setError("La contraseña es requerida para nuevos usuarios")
        return
      }

      const payload = {
        ...formData,
        ...(personalEditando && { id_personal: personalEditando.id_personal }),
      }

      const url = "/API/Personal"
      const method = personalEditando ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al guardar Personal")
      }

      await cargarPersonal() // Reload the list
      cerrarModal()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al guardar Personal")
      console.error("Error:", error)
    }
  }

  const toggleEstadoPersonal = async (persona: Personal) => {
    try {
      const updatedPersona = { ...persona, activo: !persona.activo }

      const response = await fetch("/API/Personal", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedPersona),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al cambiar estado")
      }

      await cargarPersonal() // Reload the list
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al cambiar estado del Personal")
      console.error("Error:", error)
    }
  }

  const eliminarPersonal = async (persona: Personal) => {
    if (!confirm(`¿Está seguro de desactivar a ${persona.nombre} ${persona.apellido}?`)) return

    try {
      const response = await fetch("/API/Personal", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id_personal: persona.id_personal }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al desactivar Personal")
      }

      await cargarPersonal() // Reload the list
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al desactivar Personal")
      console.error("Error:", error)
    }
  }

  const resetearPassword = async (persona: Personal) => {
    if (!confirm(`¿Está seguro de resetear la contraseña de ${persona.nombre} ${persona.apellido}?`)) return

    try {
      // For password reset, we'll update with a default password
      const updatedPersona = { ...persona, contrasena: "123456" }

      const response = await fetch("/API/Personal", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedPersona),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al resetear contraseña")
      }

      alert(`Contraseña reseteada para ${persona.nombre} ${persona.apellido}. Nueva contraseña: 123456`)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al resetear contraseña")
      console.error("Error:", error)
    }
  }

  const totalPersonal = Personal.length
  const personalActivo = Personal.filter((p) => p.activo).length
  const vendedores = Personal.filter((p) => p.rol === "vendedor").length
  const administradores = Personal.filter((p) => p.rol === "administrador").length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>Cargando Personal...</div>
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
                <h1 className="text-2xl font-bold text-gray-900">Gestión de Personal</h1>
                <p className="text-sm text-gray-600">Administra usuarios y permisos del sistema</p>
              </div>
            </div>
            <Button onClick={() => abrirModal()}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Usuario
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
              <CardTitle className="text-sm font-medium">Total Personal</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPersonal}</div>
              <p className="text-xs text-muted-foreground">usuarios registrados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Personal Activo</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{personalActivo}</div>
              <p className="text-xs text-muted-foreground">usuarios activos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vendedores</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vendedores}</div>
              <p className="text-xs text-muted-foreground">vendedores</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administradores</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{administradores}</div>
              <p className="text-xs text-muted-foreground">administradores</p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Personal */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Personal.map((persona) => (
            <Card key={persona.id_personal} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {persona.rol === "administrador" && <Shield className="h-4 w-4 text-blue-600" />}
                      {persona.nombre} {persona.apellido}
                    </CardTitle>
                    <p className="text-sm text-gray-600">@{persona.usuario}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Badge variant={persona.activo ? "default" : "secondary"}>
                      {persona.activo ? "Activo" : "Inactivo"}
                    </Badge>
                    <Badge variant={persona.rol === "administrador" ? "destructive" : "outline"}>
                      {persona.rol === "administrador" ? "Admin" : "Vendedor"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Fecha Ingreso:</span>
                    <span>{new Date(persona.fecha_contratacion).toLocaleDateString("es-HN")}</span>
                  </div>
                  {persona.telefono && (
                    <div className="flex justify-between">
                      <span>Teléfono:</span>
                      <span>{persona.telefono}</span>
                    </div>
                  )}
                  {persona.email && (
                    <div className="flex justify-between">
                      <span>Email:</span>
                      <span className="text-xs">{persona.email}</span>
                    </div>
                  )}
                  {persona.direccion && (
                    <div className="flex justify-between">
                      <span>Dirección:</span>
                      <span className="text-xs">{persona.direccion}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => abrirModal(persona)} className="flex-1">
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button variant="outline" onClick={() => resetearPassword(persona)} className="flex-1">
                    Resetear
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={persona.activo ? "secondary" : "default"}
                    onClick={() => toggleEstadoPersonal(persona)}
                    className="flex-1"
                  >
                    {persona.activo ? (
                      <>
                        <UserX className="h-4 w-4 mr-2" />
                        Desactivar
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4 mr-2" />
                        Activar
                      </>
                    )}
                  </Button>
                  <Button variant="destructive" onClick={() => eliminarPersonal(persona)} className="flex-1">
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {Personal.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay Personal</h3>
              <p className="text-gray-600">Agrega el primer usuario al sistema</p>
            </CardContent>
          </Card>
        )}

        {/* Modal para agregar/editar Personal */}
        <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{personalEditando ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
              <DialogDescription>
                {personalEditando ? "Modifica los datos del usuario" : "Crea un nuevo usuario del sistema"}
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
                  placeholder="Juan"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="apellido" className="text-right">
                  Apellido
                </Label>
                <Input
                  id="apellido"
                  value={formData.apellido}
                  onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                  className="col-span-3"
                  placeholder="Pérez"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="usuario" className="text-right">
                  Usuario
                </Label>
                <Input
                  id="usuario"
                  value={formData.usuario}
                  onChange={(e) => setFormData({ ...formData, usuario: e.target.value })}
                  className="col-span-3"
                  placeholder="jperez"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="contrasena" className="text-right">
                  Contraseña
                </Label>
                <Input
                  id="contrasena"
                  type="password"
                  value={formData.contrasena}
                  onChange={(e) => setFormData({ ...formData, contrasena: e.target.value })}
                  className="col-span-3"
                  placeholder={personalEditando ? "Dejar vacío para no cambiar" : "Contraseña"}
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rol" className="text-right">
                  Rol
                </Label>
                <Select
                  value={formData.rol}
                  onValueChange={(value: "vendedor" | "administrador") => setFormData({ ...formData, rol: value })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="administrador">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="telefono" className="text-right">
                  Teléfono
                </Label>
                <Input
                  id="telefono"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="col-span-3"
                  placeholder="9999-9999"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="direccion" className="text-right">
                  Dirección
                </Label>
                <Input
                  id="direccion"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  className="col-span-3"
                  placeholder="Dirección completa"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="col-span-3"
                  placeholder="usuario@empresa.com"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="fecha_contratacion" className="text-right">
                  Fecha Contratación
                </Label>
                <Input
                  id="fecha_contratacion"
                  type="date"
                  value={formData.fecha_contratacion}
                  onChange={(e) => setFormData({ ...formData, fecha_contratacion: e.target.value })}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="activo" className="text-right">
                  Estado
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="activo"
                    checked={formData.activo}
                    onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="activo">Usuario activo</Label>
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
              <Button onClick={guardarPersonal}>{personalEditando ? "Actualizar" : "Crear"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}