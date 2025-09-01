"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, BarChart3, DollarSign, Users, TrendingUp, Eye, X } from "lucide-react"

// Tipos
interface VentaVendedor {
  id_personal: number
  vendedor: string
  Ventas_dia: number
  efectivo_recaudado: number
  credito_otorgado: number
  clientes_atendidos: number
  total_vendido: number
}

interface ResumenGeneral {
  total_Ventas: number
  total_efectivo: number
  total_credito: number
  total_clientes: number
  vendedores_activos: number
}

interface VentaDetalle {
  id_venta: number
  fecha_venta: string
  total: number
  tipo_pago: string
  nombre_cliente: string
  nombre_personal: string
}

interface ApiResponse {
  success: boolean
  data: {
    Ventas?: VentaDetalle[]
    ventas?: VentaDetalle[]
    pagination?: {
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
  }
  error?: string
}

export default function RegistroVentas() {
  const [VentasPorVendedor, setVentasPorVendedor] = useState<VentaVendedor[]>([])
  const [resumenGeneral, setResumenGeneral] = useState<ResumenGeneral | null>(null)
  const [todasLasVentas, setTodasLasVentas] = useState<VentaDetalle[]>([]) // 👈 nuevo
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [detalleVendedor, setDetalleVendedor] = useState<VentaVendedor | null>(null)

  useEffect(() => {
    cargarDatosVentas()
  }, [])

  const cargarDatosVentas = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/API/Ventas?page=1&pageSize=1000`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: ApiResponse = await response.json()
      console.log("📌 Respuesta API:", result)

      if (!result.success) {
        throw new Error(result.error || "Error al cargar datos")
      }

      const ventas: VentaDetalle[] = result.data?.Ventas ?? result.data?.ventas ?? []
      if (!Array.isArray(ventas)) {
        throw new Error("Formato inesperado en los datos de ventas")
      }

      setTodasLasVentas(ventas) // 👈 guardamos TODAS las ventas

      const vendedoresMap = new Map<string, VentaVendedor>()
      let totalVentas = 0
      let totalEfectivo = 0
      let totalCredito = 0
      const clientesAtendidos = new Set<string>()

      ventas.forEach((venta) => {
        const vendedor = venta.nombre_personal
        totalVentas++
        clientesAtendidos.add(venta.nombre_cliente)

        if (venta.tipo_pago === "efectivo") {
          totalEfectivo += venta.total
        } else {
          totalCredito += venta.total
        }

        if (!vendedoresMap.has(vendedor)) {
          vendedoresMap.set(vendedor, {
            id_personal: Math.random(), // idealmente usar id_personal real si lo trae la API
            vendedor: vendedor,
            Ventas_dia: 0,
            efectivo_recaudado: 0,
            credito_otorgado: 0,
            clientes_atendidos: 0,
            total_vendido: 0,
          })
        }

        const vendedorData = vendedoresMap.get(vendedor)!
        vendedorData.Ventas_dia++
        vendedorData.total_vendido += venta.total

        if (venta.tipo_pago === "efectivo") {
          vendedorData.efectivo_recaudado += venta.total
        } else {
          vendedorData.credito_otorgado += venta.total
        }
      })

      const clientesPorVendedor = new Map<string, Set<string>>()
      ventas.forEach((venta) => {
        if (!clientesPorVendedor.has(venta.nombre_personal)) {
          clientesPorVendedor.set(venta.nombre_personal, new Set())
        }
        clientesPorVendedor.get(venta.nombre_personal)!.add(venta.nombre_cliente)
      })

      vendedoresMap.forEach((vendedor, nombre) => {
        vendedor.clientes_atendidos = clientesPorVendedor.get(nombre)?.size || 0
      })

      setVentasPorVendedor(Array.from(vendedoresMap.values()))
      setResumenGeneral({
        total_Ventas: totalVentas,
        total_efectivo: totalEfectivo,
        total_credito: totalCredito,
        total_clientes: clientesAtendidos.size,
        vendedores_activos: vendedoresMap.size,
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error desconocido")
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const verDetalleVendedor = (vendedor: VentaVendedor) => {
    setDetalleVendedor(vendedor)
  }

  const cerrarDetalle = () => {
    setDetalleVendedor(null)
  }

  const generarLiquidacion = async (idVendedor: number) => {
    try {
      alert(`Funcionalidad de liquidación pendiente de implementar para el vendedor ID: ${idVendedor}`)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error al generar liquidación")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>Cargando registro de Ventas...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => history.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Registro de Ventas</h1>
                <p className="text-sm text-gray-600">Monitorea todas las Ventas por vendedor y genera liquidaciones</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* CONTENIDO */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* RESUMEN GENERAL */}
        {resumenGeneral && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumenGeneral.total_Ventas}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Efectivo Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">L. {resumenGeneral.total_efectivo.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Crédito Otorgado</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">L. {resumenGeneral.total_credito.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clientes Atendidos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumenGeneral.total_clientes}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vendedores Activos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumenGeneral.vendedores_activos}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* VENTAS POR VENDEDOR */}
        <Card>
          <CardHeader>
            <CardTitle>Todas las Ventas por Vendedor</CardTitle>
          </CardHeader>
          <CardContent>
            {VentasPorVendedor.length > 0 ? (
              <div className="space-y-4">
                {VentasPorVendedor.map((v) => (
                  <div key={v.id_personal} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{v.vendedor}</h3>
                      <p className="text-xl font-bold text-green-700">L. {v.total_vendido.toFixed(2)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="text-sm">
                        <span className="font-medium">Ventas:</span> {v.Ventas_dia}
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Clientes:</span> {v.clientes_atendidos}
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Efectivo:</span> L. {v.efectivo_recaudado.toFixed(2)}
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Crédito:</span> L. {v.credito_otorgado.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 bg-transparent" onClick={() => verDetalleVendedor(v)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver Detalle
                      </Button>
                      <Button className="flex-1" onClick={() => generarLiquidacion(v.id_personal)}>
                        <DollarSign className="h-4 w-4 mr-2" />
                        Generar Liquidación
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500">No hay Ventas registradas</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* MODAL DETALLE */}
      {detalleVendedor && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl p-6 relative">
            <button onClick={cerrarDetalle} className="absolute top-3 right-3 text-gray-500 hover:text-gray-800">
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-bold mb-4">Detalle de {detalleVendedor.vendedor}</h2>

            {/* Resumen */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-500">Ventas realizadas</p>
                <p className="font-medium">{detalleVendedor.Ventas_dia}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Clientes atendidos</p>
                <p className="font-medium">{detalleVendedor.clientes_atendidos}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Efectivo recaudado</p>
                <p className="font-medium">L. {detalleVendedor.efectivo_recaudado.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Crédito otorgado</p>
                <p className="font-medium">L. {detalleVendedor.credito_otorgado.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total vendido</p>
                <p className="font-medium text-green-600">L. {detalleVendedor.total_vendido.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Promedio por venta</p>
                <p className="font-medium">
                  L. {(detalleVendedor.total_vendido / detalleVendedor.Ventas_dia).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Ventas individuales */}
            <h3 className="text-lg font-semibold mb-2">Ventas realizadas</h3>
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Tipo de pago</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {todasLasVentas
                    .filter((venta) => venta.nombre_personal === detalleVendedor.vendedor)
                    .map((venta) => (
                      <tr key={venta.id_venta} className="border-t">
                        <td className="p-2">{new Date(venta.fecha_venta).toLocaleDateString()}</td>
                        <td className="p-2">{venta.nombre_cliente}</td>
                        <td className="p-2 capitalize">{venta.tipo_pago}</td>
                        <td className="p-2 text-right">L. {venta.total.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4">
              <Button
                variant="outline"
                className="w-full bg-transparent"
                onClick={() => {
                  generarLiquidacion(detalleVendedor.id_personal)
                  cerrarDetalle()
                }}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Generar Liquidación
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
