
"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, Plus, Edit, Trash2, Search, Users, MapPin, Phone, Mail } from "lucide-react"

interface Cliente {
  id_cliente?: number
  nombre: string
  apellido: string
  telefono?: string
  direccion: string
  email?: string
  id_ruta?: number
  dia_visita?: number
  tipo_cliente?: string
  ultima_visita?: string
  activo?: boolean
  limite_credito?: number
  saldo_actual?: number
}

interface Ruta {
  id_ruta: number
  nombre: string
}

export default function GestionClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clientesFiltrados, setClientesFiltrados] = useState<Cliente[]>([])
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [filtroTipo, setFiltroTipo] = useState<string>("todos")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [modalAbierto, setModalAbierto] = useState(false)
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null)
  const [formData, setFormData] = useState<Cliente>({
    nombre: "",
    apellido: "",
    telefono: "",
    direccion: "",
    email: "",
    id_ruta: undefined,
    dia_visita: undefined,
    tipo_cliente: "normal",
    activo: true,
    limite_credito: 0,
  })
  const router = useRouter()

  const diasSemana = [
    { valor: 1, nombre: "Lunes" },
    { valor: 2, nombre: "Martes" },
    { valor: 3, nombre: "Miércoles" },
    { valor: 4, nombre: "Jueves" },
    { valor: 5, nombre: "Viernes" },
    { valor: 6, nombre: "Sábado" },
    { valor: 0, nombre: "Domingo" },
  ]

  const tiposCliente = [
    { valor: "normal", nombre: "Normal" },
    { valor: "mayorista", nombre: "Mayorista" },
    { valor: "credito", nombre: "Crédito" },
    { valor: "mayorista-credito", nombre: "Mayorista con Crédito" },
  ]

  const filtrarClientes = useCallback(() => {
    let filtrados = clientes

    if (busqueda) {
      filtrados = filtrados.filter(
        (cliente) =>
          cliente.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          cliente.apellido.toLowerCase().includes(busqueda.toLowerCase()) ||
          cliente.direccion.toLowerCase().includes(busqueda.toLowerCase()),
      )
    }

    if (filtroTipo !== "todos") {
      filtrados = filtrados.filter((cliente) => cliente.tipo_cliente === filtroTipo)
    }

    setClientesFiltrados(filtrados)
  }, [clientes, busqueda, filtroTipo])

  useEffect(() => {
    cargarDatos()
  }, [])

  useEffect(() => {
    filtrarClientes()
  }, [clientes, busqueda, filtroTipo, filtrarClientes])

  const cargarDatos = async () => {
    try {
      const [clientesRes, rutasRes] = await Promise.all([fetch("/API/Clientes"), fetch("/API/rutas")])

      const clientesData = await clientesRes.json()
      const rutasData = await rutasRes.json()

      if (clientesData.success) {
        setClientes(clientesData.data)
      }

      if (rutasData.success) {
        setRutas(rutasData.data)
      }
    } catch (error) {
      setError("Error de conexión")
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const abrirModal = (cliente?: Cliente) => {
    if (cliente) {
      setClienteEditando(cliente)
      setFormData(cliente)
    } else {
      setClienteEditando(null)
      setFormData({
        nombre: "",
        apellido: "",
        telefono: "",
        direccion: "",
        email: "",
        id_ruta: undefined,
        dia_visita: undefined,
        tipo_cliente: "normal",
        activo: true,
        limite_credito: 0,
      })
    }
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setClienteEditando(null)
    setError("")
  }

  const guardarCliente = async () => {
    try {
      const url = "/API/Clientes"
      const method = clienteEditando ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (result.success) {
        await cargarDatos()
        cerrarModal()
      } else {
        setError(result.error || "Error al guardar cliente")
      }
    } catch (error) {
      setError("Error de conexión")
      console.error("Error:", error)
    }
  }

  const eliminarCliente = async (cliente: Cliente) => {
    if (!confirm(`¿Está seguro de eliminar a ${cliente.nombre} ${cliente.apellido}?`)) return

    try {
      const response = await fetch("/API/Clientes", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id_cliente: cliente.id_cliente }),
      })

      const result = await response.json()

      if (result.success) {
        await cargarDatos()
      } else {
        setError(result.error || "Error al eliminar cliente")
      }
    } catch (error) {
      setError("Error de conexión")
      console.error("Error:", error)
    }
  }

  const obtenerNombreRuta = (idRuta?: number) => {
    if (!idRuta) return "Sin ruta"
    const ruta = rutas.find((r) => r.id_ruta === idRuta)
    return ruta ? ruta.nombre : "Ruta no encontrada"
  }

  const obtenerNombreDia = (dia?: number) => {
    if (dia === undefined) return "Sin día asignado"
    const diaObj = diasSemana.find((d) => d.valor === dia)
    return diaObj ? diaObj.nombre : "Día no válido"
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>Cargando clientes...</div>
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
                <h1 className="text-2xl font-bold text-gray-900">Gestión de Clientes</h1>
                <p className="text-sm text-gray-600">Administra clientes y tipos de cliente</p>
              </div>
            </div>
            <Button onClick={() => abrirModal()}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Cliente
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filtros */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar clientes..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los tipos</SelectItem>
                  {tiposCliente.map((tipo) => (
                    <SelectItem key={tipo.valor} value={tipo.valor}>
                      {tipo.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{clientes.length}</div>
              <p className="text-xs text-muted-foreground">Total clientes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                {clientes.filter((c) => c.tipo_cliente === "normal").length}
              </div>
              <p className="text-xs text-muted-foreground">Normales</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {clientes.filter((c) => c.tipo_cliente?.includes("mayorista")).length}
              </div>
              <p className="text-xs text-muted-foreground">Mayoristas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-orange-600">
                {clientes.filter((c) => c.tipo_cliente?.includes("credito")).length}
              </div>
              <p className="text-xs text-muted-foreground">Con crédito</p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de clientes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clientesFiltrados.map((cliente) => (
            <Card key={cliente.id_cliente} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {cliente.nombre} {cliente.apellido}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge
                        variant={
                          cliente.tipo_cliente === "mayorista"
                            ? "default"
                            : cliente.tipo_cliente === "credito"
                              ? "secondary"
                              : cliente.tipo_cliente === "mayorista-credito"
                                ? "destructive"
                                : "outline"
                        }
                      >
                        {tiposCliente.find((t) => t.valor === cliente.tipo_cliente)?.nombre || cliente.tipo_cliente}
                      </Badge>
                      {!cliente.activo && <Badge variant="secondary">Inactivo</Badge>}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="h-4 w-4 mr-2" />
                  {cliente.direccion}
                </div>

                {cliente.telefono && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="h-4 w-4 mr-2" />
                    {cliente.telefono}
                  </div>
                )}

                {cliente.email && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="h-4 w-4 mr-2" />
                    {cliente.email}
                  </div>
                )}

                <div className="text-sm text-gray-600">
                  <p>
                    <strong>Ruta:</strong> {obtenerNombreRuta(cliente.id_ruta)}
                  </p>
                  <p>
                    <strong>Día de visita:</strong> {obtenerNombreDia(cliente.dia_visita)}
                  </p>
                  {cliente.ultima_visita && (
                    <p>
                      <strong>Última visita:</strong> {cliente.ultima_visita}
                    </p>
                  )}
                </div>

                {cliente.tipo_cliente?.includes("credito") && (
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-3 text-sm">
                    <p className="font-semibold text-orange-800 mb-1">Información de Crédito</p>
                    <p className="text-orange-700">
                      <strong>Límite:</strong> L. {(cliente.limite_credito || 0).toFixed(2)}
                    </p>
                    <p className="text-orange-700">
                      <strong>Saldo actual:</strong> L. {(cliente.saldo_actual || 0).toFixed(2)}
                    </p>
                    <p className="text-orange-700">
                      <strong>Disponible:</strong> L. {((cliente.limite_credito || 0) - (cliente.saldo_actual || 0)).toFixed(2)}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" size="sm" onClick={() => abrirModal(cliente)} className="flex-1">
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => eliminarCliente(cliente)} className="flex-1">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {clientesFiltrados.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron clientes</h3>
              <p className="text-gray-600">
                {busqueda || filtroTipo !== "todos"
                  ? "No hay clientes que coincidan con los filtros"
                  : "No hay clientes registrados"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Modal para crear/editar cliente */}
        <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{clienteEditando ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
              <DialogDescription>
                {clienteEditando ? "Modifica los datos del cliente" : "Ingresa los datos del nuevo cliente"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nombre">Nombre *</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Nombre"
                  />
                </div>
                <div>
                  <Label htmlFor="apellido">Apellido *</Label>
                  <Input
                    id="apellido"
                    value={formData.apellido}
                    onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                    placeholder="Apellido"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="direccion">Dirección *</Label>
                <Input
                  id="direccion"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  placeholder="Dirección completa"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    placeholder="Número de teléfono"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="tipo_cliente">Tipo de Cliente</Label>
                <Select
                  value={formData.tipo_cliente}
                  onValueChange={(value) => setFormData({ ...formData, tipo_cliente: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposCliente.map((tipo) => (
                      <SelectItem key={tipo.valor} value={tipo.valor}>
                        {tipo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.tipo_cliente?.includes("credito") && (
                <div>
                  <Label htmlFor="limite_credito">Límite de Crédito (L.)</Label>
                  <Input
                    id="limite_credito"
                    type="number"
                    step="0.01"
                    value={formData.limite_credito || 0}
                    onChange={(e) => setFormData({ ...formData, limite_credito: Number.parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">Monto máximo de crédito permitido para este cliente</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="id_ruta">Ruta</Label>
                  <Select
                    value={formData.id_ruta?.toString() || "0"}
                    onValueChange={(value) =>
                      setFormData({ ...formData, id_ruta: value ? Number.parseInt(value) : undefined })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar ruta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sin ruta</SelectItem>
                      {rutas.map((ruta) => (
                        <SelectItem key={ruta.id_ruta} value={ruta.id_ruta.toString()}>
                          {ruta.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="dia_visita">Día de Visita</Label>
                  <Select
                    value={formData.dia_visita?.toString() || "0"}
                    onValueChange={(value) =>
                      setFormData({ ...formData, dia_visita: value ? Number.parseInt(value) : undefined })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar día" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sin día asignado</SelectItem>
                      {diasSemana.map((dia) => (
                        <SelectItem key={dia.valor} value={dia.valor.toString()}>
                          {dia.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <Button onClick={guardarCliente}>{clienteEditando ? "Actualizar" : "Crear"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
