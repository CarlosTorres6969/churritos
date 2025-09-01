"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import {
  ArrowLeft,
  DollarSign,
  ShoppingCart,
  Users,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Calendar,
  Package,
  Loader2,
} from "lucide-react"
import { format } from "date-fns"
import { getLoggedUser, requireAuth } from "@/lib/auth"

interface ResumenVenta {
  id_venta: number
  nombre_cliente: string
  total: number
  tipo_pago: string
  fecha_venta: string
  hora: string
  id_personal: number
  total_productos: number
}

interface ResumenDia {
  totalVentas: number
  ventasEfectivo: number
  ventasCredito: number
  efectivoRecaudado: number
  totalCredito: number
  clientesAtendidos: number
  productosVendidos: number
  montoTotal: number
  ventas: ResumenVenta[]
}

interface VentaAPI {
  id_venta: number
  id_personal: number
  id_cliente: number
  nombre_cliente: string
  total: number
  tipo_pago: string
  fecha_venta: string
  total_productos: number
}

export default function CierreDia() {
  const [resumen, setResumen] = useState<ResumenDia | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")
  const [cierreProcesado, setCierreProcesado] = useState(false)
  const [fecha, setFecha] = useState<string>(format(new Date(), "yyyy-MM-dd"))
  const router = useRouter()

  const cargarResumenDia = useCallback(async () => {
    try {
      setLoading(true)
      setError("")

      const loggedUser = getLoggedUser()
      const idVendedor = loggedUser?.id_personal

      console.log("[DEBUG] Usuario logueado:", loggedUser)
      console.log("[DEBUG] ID Vendedor para filtrar:", idVendedor)

      if (!idVendedor) {
        throw new Error("No se pudo identificar al vendedor. Por favor, inicie sesión nuevamente.")
      }

      const cierreUrl = `/API/Cierre-dia?fecha=${fecha}&id_vendedor=${idVendedor}`

      const cierreResponse = await fetch(cierreUrl)
      if (cierreResponse.ok) {
        const cierreData = await cierreResponse.json()
        if (cierreData.success && cierreData.data) {
          setCierreProcesado(true)
        }
      }

      const response = await fetch(`/API/Ventas?fecha=${fecha}`)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Error HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Error al cargar datos del servidor")
      }

      if (!data.data || !data.data.ventas) {
        throw new Error("Formato de datos inválido desde el servidor")
      }

      console.log("[DEBUG] Total ventas recibidas de la API:", data.data.ventas.length)
      console.log("[DEBUG] Primeras 3 ventas:", data.data.ventas.slice(0, 3))

      const ventasDelVendedor = data.data.ventas.filter((v: VentaAPI) => {
        return v.id_personal === idVendedor
      })

      console.log("[DEBUG] Ventas del vendedor después de filtrar:", ventasDelVendedor.length)

      const ventasDelDia = ventasDelVendedor.filter((v: VentaAPI) => {
        try {
          const ventaDate = new Date(v.fecha_venta).toISOString().split("T")[0]
          return ventaDate === fecha
        } catch {
          console.error("Error procesando fecha de venta:", v.fecha_venta)
          return false
        }
      })

      console.log("[DEBUG] Ventas después de filtrar por fecha:", ventasDelDia.length)

      const ventasEfectivo = ventasDelDia.filter((v: VentaAPI) => v.tipo_pago === "efectivo").length
      const ventasCredito = ventasDelDia.filter((v: VentaAPI) => v.tipo_pago === "credito").length
      const efectivoRecaudado = ventasDelDia
        .filter((v: VentaAPI) => v.tipo_pago === "efectivo")
        .reduce((sum: number, v: VentaAPI) => sum + (v.total || 0), 0)

      const totalCredito = ventasDelDia
        .filter((v: VentaAPI) => v.tipo_pago === "credito")
        .reduce((sum: number, v: VentaAPI) => sum + (v.total || 0), 0)

      const productosVendidos = ventasDelDia.reduce((sum: number, v: VentaAPI) => {
        return sum + (v.total_productos || 0)
      }, 0)

      console.log("[DEBUG] Productos vendidos calculados:", productosVendidos)

      const clientesAtendidos = [...new Set(ventasDelDia.map((v: VentaAPI) => v.id_cliente))].length

      const resumenCalculado: ResumenDia = {
        totalVentas: ventasDelDia.length,
        ventasEfectivo,
        ventasCredito,
        efectivoRecaudado,
        totalCredito,
        clientesAtendidos,
        productosVendidos,
        montoTotal: efectivoRecaudado + totalCredito,
        ventas: ventasDelDia.map((v: VentaAPI) => ({
          id_venta: v.id_venta,
          nombre_cliente: v.nombre_cliente || "Cliente no especificado",
          total: v.total || 0,
          tipo_pago: v.tipo_pago || "desconocido",
          fecha_venta: v.fecha_venta,
          hora: new Date(v.fecha_venta).toLocaleTimeString("es-HN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          id_personal: v.id_personal,
          total_productos: v.total_productos || 0
        })),
      }

      setResumen(resumenCalculado)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido"
      setError(`Error al cargar resumen del día: ${errorMessage}`)
      console.error("Error en cargarResumenDia:", error)
    } finally {
      setLoading(false)
    }
  }, [fecha])

  useEffect(() => {
    cargarResumenDia()
  }, [cargarResumenDia])

  const procesarCierre = async () => {
    try {
      setProcessing(true)
      setError("")

      if (!resumen) {
        throw new Error("No hay datos de resumen para procesar")
      }

      const loggedUser = requireAuth()

      const response = await fetch("/API/Cierre-dia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fecha_cierre: fecha,
          id_personal: loggedUser.id_personal,
          total_ventas: resumen.totalVentas,
          ventas_efectivo: resumen.ventasEfectivo,
          ventas_credito: resumen.ventasCredito,
          efectivo_recaudado: resumen.efectivoRecaudado,
          total_credito: resumen.totalCredito,
          clientes_atendidos: resumen.clientesAtendidos,
          productos_vendidos: resumen.productosVendidos,
          monto_total: resumen.montoTotal,
        }),
      })

      const responseText = await response.text()
      console.log("Respuesta del servidor:", responseText)

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${responseText}`)
      }

      let data
      try {
        data = JSON.parse(responseText)
      } catch {
        throw new Error("Respuesta del servidor no es JSON válido")
      }

      if (!data.success) {
        throw new Error(data.error || "Error al procesar cierre")
      }

      setCierreProcesado(true)
      alert("Cierre del día procesado exitosamente")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido"
      setError(`Error al procesar cierre: ${errorMessage}`)
      console.error("Error en procesarCierre:", error)
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <div>Cargando resumen del día...</div>
        </div>
      </div>
    )
  }

  if (error && !resumen) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-4">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error al cargar el resumen</h2>
          <p className="text-gray-600 mb-4 text-sm">{error}</p>
          <div className="space-y-2">
            <Button onClick={cargarResumenDia}>Reintentar</Button>
            <Button variant="outline" onClick={() => router.back()}>
              Volver atrás
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Cierre del Día</h1>
                <p className="text-sm text-gray-600">Resumen de actividades y ventas del día</p>
              </div>
            </div>
            {cierreProcesado && (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle className="h-4 w-4 mr-1" />
                Cierre Procesado
              </Badge>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4 mr-2" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            <label htmlFor="fecha" className="text-sm font-medium">
              Fecha:
            </label>
          </div>
          <input
            type="date"
            id="fecha"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <Button onClick={cargarResumenDia} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Actualizar
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resumen?.totalVentas || 0}</div>
              <p className="text-xs text-muted-foreground">
                {resumen?.ventasEfectivo || 0} efectivo, {resumen?.ventasCredito || 0} crédito
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Efectivo Recaudado</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">L. {(resumen?.efectivoRecaudado || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">dinero en efectivo</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas a Crédito</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">L. {(resumen?.totalCredito || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">pendiente de cobro</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Productos Vendidos</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resumen?.productosVendidos || 0}</div>
              <p className="text-xs text-muted-foreground">total de unidades</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Detalle de Ventas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {resumen?.ventas.map((venta) => (
                  <div key={venta.id_venta} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{venta.nombre_cliente}</p>
                      <p className="text-sm text-gray-600">{venta.hora}</p>
                      <p className="text-xs text-gray-500">{venta.total_productos} productos</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">L. {venta.total.toFixed(2)}</p>
                      <Badge variant={venta.tipo_pago === "efectivo" ? "default" : "secondary"}>
                        {venta.tipo_pago}
                      </Badge>
                    </div>
                  </div>
                ))}
                {(!resumen?.ventas || resumen.ventas.length === 0) && (
                  <p className="text-center text-gray-500 py-4">No hay ventas para esta fecha</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumen del Día</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    <span>Clientes atendidos</span>
                  </div>
                  <Badge variant="default">{resumen?.clientesAtendidos || 0}</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-green-600" />
                    <span>Ventas realizadas</span>
                  </div>
                  <Badge variant="secondary">{resumen?.totalVentas || 0}</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-purple-600" />
                    <span>Productos vendidos</span>
                  </div>
                  <Badge variant="outline">{resumen?.productosVendidos || 0}</Badge>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Totales del Día</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Total en Efectivo:</span>
                    <span className="font-medium">L. {(resumen?.efectivoRecaudado || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total en Crédito:</span>
                    <span className="font-medium">L. {(resumen?.totalCredito || 0).toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Total General:</span>
                    <span>L. {(resumen?.montoTotal || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {!cierreProcesado && (
                <Button
                  onClick={procesarCierre}
                  className="w-full"
                  disabled={processing || !resumen || resumen.totalVentas === 0}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Procesando...
                    </>
                  ) : (
                    "Procesar Cierre del Día"
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}