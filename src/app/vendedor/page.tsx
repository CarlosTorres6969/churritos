"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Users,
  ShoppingCart,
  Package,
  DollarSign,
  FileText,
  CreditCard,
  LogOut,
  TrendingUp,
  BarChart3,
} from "lucide-react"

interface User {
  id_personal: number
  nombre: string
  apellido: string
  rol: string
  usuario: string
}

interface VendedorStats {
  totalVentas: number
  totalClientesAtendidos: number
  totalProductosVendidos: number
  montoTotal: number
  creditosPendientes: number
  facturasPendientes: number
}

// Interfaces for API data
interface Venta {
  id_personal: number
  id_cliente: number
  total_productos: number
  total: number
}

interface Credito {
  saldo_pendiente: number
}

interface Factura {
  estado: "pendiente" | "pagada"
}

export default function VendedorDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState<VendedorStats>({
    totalVentas: 0,
    totalClientesAtendidos: 0,
    totalProductosVendidos: 0,
    montoTotal: 0,
    creditosPendientes: 0,
    facturasPendientes: 0,
  })
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const userData = localStorage.getItem("user")
    if (!userData) {
      router.push("/")
      return
    }

    const parsedUser = JSON.parse(userData)
    if (parsedUser.rol !== "vendedor") {
      router.push("/")
      return
    }

    setUser(parsedUser)
    loadDashboardData(parsedUser.id_personal)
  }, [router])

  const loadDashboardData = async (idPersonal: number) => {
    try {
      setLoading(true)

      // Cargar ventas del vendedor del día actual
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Tegucigalpa" })
      const ventasResponse = await fetch(`/API/Ventas?id_vendedor=${idPersonal}&fecha=${today}&sin_limite=true`)
      const ventasData = await ventasResponse.json()
      const ventas: Venta[] = ventasData.success && Array.isArray(ventasData.data?.ventas) 
        ? ventasData.data.ventas 
        : []
      const ventasVendedor = ventas

      // Cargar créditos pendientes
      const creditosResponse = await fetch("/API/Cliente-Credito?all=true")
      const creditosData = await creditosResponse.json()
      const creditos: Credito[] = creditosData.success && Array.isArray(creditosData.data)
        ? creditosData.data
        : Array.isArray(creditosData) ? creditosData : []
      const creditosPendientes = creditos.filter((c: Credito) => c.saldo_pendiente > 0)

      // Cargar facturas del vendedor del día actual
      const facturasResponse = await fetch(`/API/Factura?id_personal=${idPersonal}&page=1&pageSize=1000&fechaInicio=${today}&fechaFin=${today}`)
      const facturasData = await facturasResponse.json()
      const facturas: Factura[] = facturasData.success && Array.isArray(facturasData.data?.facturas)
        ? facturasData.data.facturas
        : []
      const facturasPendientes = facturas.filter((f: Factura) => f.estado === "pendiente")

      setStats({
        totalVentas: ventasVendedor.length,
        totalClientesAtendidos: new Set(ventasVendedor.map((v: Venta) => v.id_cliente)).size,
        totalProductosVendidos: ventasVendedor.reduce((sum: number, v: Venta) => sum + (v.total_productos || 0), 0),
        montoTotal: ventasVendedor.reduce((sum: number, v: Venta) => sum + (v.total || 0), 0),
        creditosPendientes: creditosPendientes.length,
        facturasPendientes: facturasPendientes.length,
      })
    } catch (error) {
      console.error("Error cargando datos del dashboard:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("user")
    router.push("/")
  }

  const menuItems = [
    {
      title: "Gestión de Clientes",
      description: "Ver y administrar clientes de la ruta",
      icon: Users,
      href: "/vendedor/clientes",
      color: "bg-blue-500",
      stats: stats.totalClientesAtendidos,
    },
    {
      title: "Realizar Ventas",
      description: "Procesar nuevas ventas y transacciones",
      icon: ShoppingCart,
      href: "/vendedor/ventas",
      color: "bg-green-500",
      stats: stats.totalVentas,
    },
    {
      title: "Inventario",
      description: "Consultar productos disponibles",
      icon: Package,
      href: "/vendedor/inventario",
      color: "bg-purple-500",
      stats: stats.totalProductosVendidos,
    },
    {
      title: "Cierre del Día",
      description: "Cerrar jornada y generar reporte",
      icon: BarChart3,
      href: "/vendedor/cierre",
      color: "bg-orange-500",
      stats: `L. ${stats.montoTotal.toFixed(2)}`,
    },
    {
      title: "Facturas",
      description: "Ver y generar facturas",
      icon: FileText,
      href: "/vendedor/facturas",
      color: "bg-indigo-500",
      stats: stats.facturasPendientes,
    },
    {
      title: "Créditos",
      description: "Gestionar créditos pendientes",
      icon: CreditCard,
      href: "/vendedor/creditos",
      color: "bg-red-500",
      stats: stats.creditosPendientes,
    },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center py-4 gap-4">
            <div className="text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Panel del Vendedor</h1>
              <p className="text-sm text-gray-600">
                Bienvenido, {user?.nombre} {user?.apellido}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <Badge variant="secondary" className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                Datos Históricos
              </Badge>
              <Button variant="outline" onClick={handleLogout} className="w-full sm:w-auto">
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar Sesión
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Estadísticas generales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{stats.totalVentas}</div>
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="inline h-3 w-3 mr-1" />
                Todas las transacciones realizadas
              </p>
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes Atendidos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{stats.totalClientesAtendidos}</div>
              <p className="text-xs text-muted-foreground">Total de clientes únicos atendidos</p>
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">L. {stats.montoTotal.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Ingresos totales históricos</p>
            </CardContent>
          </Card>
        </div>

        {/* Menú de opciones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {menuItems.map((item, index) => (
            <Card
              key={index}
              className="w-full hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-105"
              onClick={() => router.push(item.href)}
            >
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${item.color}`}>
                      <item.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base sm:text-lg truncate">{item.title}</CardTitle>
                      <CardDescription className="text-xs sm:text-sm truncate">{item.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="ml-2 shrink-0">
                    {item.stats}
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Accesos rápidos */}
        <div className="mt-6 sm:mt-8 bg-white rounded-lg shadow p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Accesos Rápidos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <Button
              variant="outline"
              className="h-12 sm:h-16 flex-col bg-transparent p-1 sm:p-2"
              onClick={() => router.push("/vendedor/ventas")}
            >
              <ShoppingCart className="h-4 w-4 sm:h-6 sm:w-6 mb-1" />
              <span className="text-xs sm:text-sm">Nueva Venta</span>
            </Button>
            <Button
              variant="outline"
              className="h-12 sm:h-16 flex-col bg-transparent p-1 sm:p-2"
              onClick={() => router.push("/vendedor/clientes")}
            >
              <Users className="h-4 w-4 sm:h-6 sm:w-6 mb-1" />
              <span className="text-xs sm:text-sm">Ver Clientes</span>
            </Button>
            <Button
              variant="outline"
              className="h-12 sm:h-16 flex-col bg-transparent p-1 sm:p-2"
              onClick={() => router.push("/vendedor/inventario")}
            >
              <Package className="h-4 w-4 sm:h-6 sm:w-6 mb-1" />
              <span className="text-xs sm:text-sm">Inventario</span>
            </Button>
            <Button
              variant="outline"
              className="h-12 sm:h-16 flex-col bg-transparent p-1 sm:p-2"
              onClick={() => router.push("/vendedor/cierre")}
            >
              <BarChart3 className="h-4 w-4 sm:h-6 sm:w-6 mb-1" />
              <span className="text-xs sm:text-sm">Cerrar Día</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}