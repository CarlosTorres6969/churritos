"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Search, Users, MapPin, Phone, ShoppingCart, Calendar } from "lucide-react"
import { requireAuth, type UserData } from "@/lib/auth" // Importar el tipo desde auth

interface Cliente {
  id_cliente: number
  nombre: string
  apellido: string
  telefono?: string
  direccion: string
  email?: string
  tipo_cliente: string
  ultima_visita?: string
  dia_visita?: number
  id_ruta?: number
}

export default function GestionClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clientesFiltrados, setClientesFiltrados] = useState<Cliente[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [user, setUser] = useState<UserData | null>(null)
  const router = useRouter()

  const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

  useEffect(() => {
    // Verificar autenticación y obtener datos del usuario
    const obtenerUsuario = () => {
      try {
        const userData = requireAuth();
        if (userData.rol !== "vendedor") {
          router.push("/")
          return
        }

        setUser(userData)
        cargarClientes(userData.id_personal)
      } catch (error) {
        console.error("Error al obtener el usuario autenticado:", error);
        router.push("/login");
      }
    };
    
    obtenerUsuario();
  }, [router])

  const filtrarClientes = useCallback(() => {
    if (!busqueda) {
      setClientesFiltrados(clientes)
    } else {
      const filtrados = clientes.filter(
        (cliente) =>
          cliente.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          cliente.apellido.toLowerCase().includes(busqueda.toLowerCase()) ||
          cliente.direccion.toLowerCase().includes(busqueda.toLowerCase()),
      )
      setClientesFiltrados(filtrados)
    }
  }, [clientes, busqueda])

  useEffect(() => {
    filtrarClientes()
  }, [filtrarClientes])

  const cargarClientes = async (idPersonal: number) => {
    try {
      const response = await fetch(`/API/Clientes?id_personal=${idPersonal}`)
      if (!response.ok) {
        throw new Error("Error al cargar clientes")
      }

      const data = await response.json()

      if (data.success) {
        setClientes(data.data)
      } else {
        setError(data.error || "Error al cargar clientes")
      }
    } catch (error) {
      setError("Error de conexión")
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const seleccionarClienteParaVenta = (cliente: Cliente) => {
    localStorage.setItem("clienteVenta", JSON.stringify(cliente))
    router.push("/vendedor/ventas")
  }

  const obtenerColorTipoCliente = (tipo: string) => {
    switch (tipo) {
      case "mayorista":
        return "bg-green-100 text-green-800"
      case "credito":
        return "bg-orange-100 text-orange-800"
      case "mayorista-credito":
        return "bg-red-100 text-red-800"
      default:
        return "bg-blue-100 text-blue-800"
    }
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
                <p className="text-sm text-gray-600">
                  {user?.nombre ? `Clientes de ${user.nombre} ${user.apellido}` : "Mis clientes"}
                </p>
              </div>
            </div>
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
                placeholder="Buscar clientes por nombre o dirección..."
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
                    <Badge className={`mt-2 ${obtenerColorTipoCliente(cliente.tipo_cliente)}`}>
                      {cliente.tipo_cliente}
                    </Badge>
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

                {cliente.dia_visita !== undefined && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    Día de visita: {diasSemana[cliente.dia_visita]}
                  </div>
                )}

                {cliente.ultima_visita && (
                  <div className="text-sm text-gray-600">
                    <strong>Última visita:</strong> {cliente.ultima_visita}
                  </div>
                )}

                <div className="pt-4">
                  <Button onClick={() => seleccionarClienteParaVenta(cliente)} className="w-full">
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Realizar Venta
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
                {busqueda 
                  ? "No hay clientes que coincidan con tu búsqueda" 
                  : "No tienes clientes asignados a tu ruta"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}