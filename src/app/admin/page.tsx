"use client"

import { useState, useEffect, useCallback } from "react"
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
  MapPin,
  UserCheck,
  TrendingUp,
  BarChart3,
  Clock,
  CalendarCheck,
} from "lucide-react"

// Definición de tipos para las interfaces
interface User {
  id_personal: number
  nombre: string
  apellido: string
  rol: string
  usuario: string
}

interface AdminStats {
  totalVentas: number
  totalClientes: number
  totalProductos: number
  montoTotal: number
  ventasHoy: number
  creditosPendientes: number
  facturasPendientes: number
  vendedoresActivos: number
  rutasActivas: number
  cierresPendientes: number
}

interface CierreDia {
  id_cierre: number
  fecha_cierre: string
  id_personal: number
  nombre_personal: string
  total_ventas: number
  ventas_efectivo: number
  ventas_credito: number
  efectivo_recaudado: number
  total_credito: number
  clientes_atendidos: number
  productos_vendidos: number
  monto_total: number
  fecha_registro: string
  cerrado: boolean
}

// Nuevas interfaces para tipar los datos de las APIs
interface Venta {
  fecha_venta: string
  total: number
}

interface Cliente {
  activo: boolean
}

interface Producto {
  activo: boolean
}

interface Credito {
  saldo_pendiente: number
}

interface Factura {
  estado: string
}

interface Personal {
  id_personal: number
  nombre: string
  activo: boolean
  rol: string
}

interface Ruta {
  activo: boolean
}

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState<AdminStats>({
    totalVentas: 0,
    totalClientes: 0,
    totalProductos: 0,
    montoTotal: 0,
    ventasHoy: 0,
    creditosPendientes: 0,
    facturasPendientes: 0,
    vendedoresActivos: 0,
    rutasActivas: 0,
    cierresPendientes: 0,
  })
  const [recentCierres, setRecentCierres] = useState<CierreDia[]>([])
  // El estado 'loading' no se utiliza, por lo que se ha eliminado para corregir el error.
  const router = useRouter()

  // ✅ Función para normalizar cualquier respuesta de API en un array, ahora genérica y tipada
  const normalizeData = useCallback(<T,>(data: unknown): T[] => {
    if (!data) return []
    if (Array.isArray(data)) return data as T[]
    if (typeof data === "object") {
      if (data && "data" in data && Array.isArray(data.data)) return data.data as T[]
      if (data && "ventas" in data && Array.isArray(data.ventas)) return data.ventas as T[]
      return [data] as T[] // si es un objeto único, lo convertimos en array
    }
    return []
  }, [])

  const checkCierresPendientes = useCallback(async (vendedores: Personal[], hoy: string): Promise<number> => {
    try {
      let pendientes = 0
      for (const vendedor of vendedores) {
        const res = await fetch(`/API/Cierre-dia?fecha=${hoy}&id_vendedor=${vendedor.id_personal}`)
        // 404 significa que no hay cierre para ese vendedor hoy, es un caso esperado
        if (res.status === 404 || !res.ok) {
          pendientes++
        } else {
          const data = await res.json()
          if (!data.success || !data.data) {
            pendientes++
          }
        }
      }
      return pendientes
    } catch (error) {
      console.error("Error verificando cierres pendientes:", error)
      return 0
    }
  }, [])

  const loadDashboardData = useCallback(async () => {
    try {
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Tegucigalpa" })

      // Cargar ventas de hoy y el resto en paralelo
      const [
        ventasRes,
        clientesRes,
        productosRes,
        creditosRes,
        facturasRes,
        personalRes,
        rutasRes,
        cierresRes
      ] = await Promise.all([
        fetch(`/API/Ventas?fecha=${hoy}&sin_limite=true`),
        fetch("/API/Clientes"),
        fetch("/API/Productos"),
        fetch("/API/Cliente-Credito"),
        fetch(`/API/Factura?page=1&pageSize=1&fechaInicio=${hoy}&fechaFin=${hoy}`),
        fetch("/API/Personal"),
        fetch("/API/rutas"),
        fetch("/API/Cierre-dia?page=1&pageSize=5"),
      ])

      const [
        ventasRaw,
        clientesRaw,
        productosRaw,
        creditosRaw,
        facturasRaw,
        personalRaw,
        rutasRaw,
        cierresRaw
      ] = await Promise.all([
        ventasRes.json(),
        clientesRes.json(),
        productosRes.json(),
        creditosRes.json(),
        facturasRes.json(),
        personalRes.json(),
        rutasRes.json(),
        cierresRes.json(),
      ])

      const ventas = ventasRaw.success && Array.isArray(ventasRaw.data?.ventas) ? ventasRaw.data.ventas as Venta[] : []
      const clientes = normalizeData<Cliente>(clientesRaw)
      const productos = normalizeData<Producto>(productosRaw)
      const creditos = normalizeData<Credito>(creditosRaw)
      const personal = normalizeData<Personal>(personalRaw)
      const rutas = normalizeData<Ruta>(rutasRaw)
      const cierres = normalizeData<CierreDia>(cierresRaw.data?.cierres || cierresRaw)

      // Total de facturas del día desde paginación
      const totalFacturasHoy = facturasRaw.success ? (facturasRaw.data?.pagination?.total || 0) : 0

      const vendedoresActivos = personal.filter((p: Personal) => p.activo && p.rol === "vendedor")
      const rutasActivas = rutas.filter((r: Ruta) => r.activo)

      // Obtener cierres pendientes
      const vendedoresSinCierre = await checkCierresPendientes(vendedoresActivos, hoy)

      setStats({
        totalVentas: ventas.length,
        totalClientes: clientes.filter((c: Cliente) => c.activo).length,
        totalProductos: productos.filter((p: Producto) => p.activo).length,
        montoTotal: ventas.reduce((sum: number, v: Venta) => sum + (v.total || 0), 0),
        ventasHoy: ventas.length,
        creditosPendientes: creditos.filter((c: Credito) => c.saldo_pendiente > 0).length,
        facturasPendientes: totalFacturasHoy,
        vendedoresActivos: vendedoresActivos.length,
        rutasActivas: rutasActivas.length,
        cierresPendientes: vendedoresSinCierre,
      })

      setRecentCierres(cierres.slice(0, 5))
    } catch (error) {
      console.error("Error cargando datos del dashboard:", error)
    }
  }, [normalizeData, checkCierresPendientes])

  useEffect(() => {
    const userData = localStorage.getItem("user")
    if (!userData) {
      router.push("/")
      return
    }

    const parsedUser: User = JSON.parse(userData)
    if (parsedUser.rol !== "administrador" && parsedUser.rol !== "admin") {
      router.push("/")
      return
    }

    setUser(parsedUser)
    loadDashboardData()
  }, [router, loadDashboardData]) // Se agregó loadDashboardData a las dependencias

  const handleLogout = () => {
    localStorage.removeItem("user")
    router.push("/")
  }

  const menuItems = [
    {
      title: "Gestión de Productos",
      description: "Administrar catálogo de productos",
      icon: Package,
      href: "/admin/productos",
      color: "bg-blue-500",
      stats: stats.totalProductos,
    },
    {
      title: "Gestión de Clientes",
      description: "Administrar base de clientes",
      icon: Users,
      href: "/admin/clientes",
      color: "bg-green-500",
      stats: stats.totalClientes,
    },
    {
      title: "Registro de Ventas",
      description: "Reportes y análisis de ventas",
      icon: BarChart3,
      href: "/admin/ventas",
      color: "bg-purple-500",
      stats: stats.totalVentas,
    },
    {
      title: "Inventario por Ruta",
      description: "Control de stock por ruta",
      icon: Package,
      href: "/admin/inventario",
      color: "bg-orange-500",
      stats: "Stock",
    },
    {
      title: "Gestión de Créditos",
      description: "Administrar créditos y cobros",
      icon: CreditCard,
      href: "/admin/creditos",
      color: "bg-red-500",
      stats: stats.creditosPendientes,
    },
    {
      title: "Sistema de Facturas",
      description: "Control fiscal y CAI",
      icon: FileText,
      href: "/admin/facturas",
      color: "bg-indigo-500",
      stats: stats.facturasPendientes,
    },
    {
      title: "Gestión de Rutas",
      description: "Administrar rutas de venta",
      icon: MapPin,
      href: "/admin/rutas",
      color: "bg-teal-500",
      stats: stats.rutasActivas,
    },
    {
      title: "Gestión de Personal",
      description: "Administrar vendedores y usuarios",
      icon: UserCheck,
      href: "/admin/personal",
      color: "bg-gray-500",
      stats: stats.vendedoresActivos,
    },
    {
      title: "Cierres Diarios",
      description: "Revisar cierres de vendedores",
      icon: CalendarCheck,
      href: "/admin/Cierre-dia",
      color: "bg-amber-500",
      stats: stats.cierresPendientes,
    },
  ]

  if (!user) {
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
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
              <p className="text-sm text-gray-600">
                Bienvenido, {user.nombre} {user.apellido}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date().toLocaleDateString("es-HN")}
              </Badge>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar Sesión
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Estadísticas generales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas Hoy</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.ventasHoy}</div>
              <p className="text-xs text-muted-foreground">Transacciones del día</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Ventas Históricas</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalVentas}</div>
              <p className="text-xs text-muted-foreground">Todas las transacciones históricas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes Activos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalClientes}</div>
              <p className="text-xs text-muted-foreground">Base de clientes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ingresos Históricos</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">L. {stats.montoTotal.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Total acumulado histórico</p>
            </CardContent>
          </Card>
        </div>

        {/* Menú de administración */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {menuItems.map((item, index) => (
            <Card
              key={index}
              className="hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-105"
              onClick={() => router.push(item.href)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${item.color}`}>
                      <item.icon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription className="text-xs">{item.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="ml-2">
                    {item.stats}
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Panel de control rápido */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Panel de Control</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="h-16 flex-col bg-transparent"
                onClick={() => router.push("/admin/productos")}
              >
                <Package className="h-6 w-6 mb-1" />
                Productos
              </Button>
              <Button
                variant="outline"
                className="h-16 flex-col bg-transparent"
                onClick={() => router.push("/admin/ventas")}
              >
                <BarChart3 className="h-6 w-6 mb-1" />
                Reportes
              </Button>
              <Button
                variant="outline"
                className="h-16 flex-col bg-transparent"
                onClick={() => router.push("/admin/personal")}
              >
                <UserCheck className="h-6 w-6 mb-1" />
                Personal
              </Button>
              <Button
                variant="outline"
                className="h-16 flex-col bg-transparent"
                onClick={() => router.push("/admin/Cierre-dia")}
              >
                <CalendarCheck className="h-6 w-6 mb-1" />
                Cierres
              </Button>
            </div>
          </div>

          {/* Sección de cierres recientes */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Cierres Recientes</h3>
              <Button variant="ghost" size="sm" onClick={() => router.push("/admin/Cierre-dia")}>
                Ver todos
              </Button>
            </div>
            {recentCierres.length > 0 ? (
              <div className="space-y-3">
                {recentCierres.map((cierre) => (
                  <div key={cierre.id_cierre} className="flex justify-between items-center p-2 border rounded">
                    <div>
                      <p className="font-medium">{cierre.nombre_personal}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(cierre.fecha_cierre).toLocaleDateString("es-HN")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">L. {cierre.monto_total.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">{cierre.total_ventas} ventas</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <CalendarCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay cierres recientes</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}