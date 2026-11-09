"use client"
import { useRouter } from "next/navigation"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, BarChart3, DollarSign, Users, TrendingUp, Eye, X } from "lucide-react"
import { MonthlySales } from "@/components/monthly-sales"

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
  id_personal: number
  id_venta: number
  fecha_venta: string
  total: number
  tipo_pago: string
  nombre_cliente: string
  nombre_personal: string
}

export default function RegistroVentas() {
  const [VentasPorVendedor, setVentasPorVendedor] = useState<VentaVendedor[]>([])
  const [resumenGeneral, setResumenGeneral] = useState<ResumenGeneral | null>(null)
  const [todasLasVentas, setTodasLasVentas] = useState<VentaDetalle[]>([]) // 👈 nuevo
  const [loading, setLoading] = useState(true)
  const router=useRouter()
  const [paginaDetalle,setPaginaDetalle]=useState(1)
  const [paginasDetalle,setPaginasDetalle]=useState(1)
  const cargarDetalle=async(id:number,page:number)=>{const response=await fetch("/API/Ventas?id_vendedor="+id+"&page="+page+"&pageSize=100");const result=await response.json();if(!response.ok){setError(result.error);return}setTodasLasVentas(result.data.ventas);setPaginaDetalle(page);setPaginasDetalle(result.data.pagination.totalPages||1)}
  const [error, setError] = useState("")
  const [detalleVendedor, setDetalleVendedor] = useState<VentaVendedor | null>(null)

  const cargarDatosVentas = async () => {
  try {const response=await fetch("/API/resumen");const result=await response.json();if(!response.ok)throw new Error(result.error);const d=result.data;setVentasPorVendedor(d.ventas_por_vendedor);setResumenGeneral({total_Ventas:d.ventas_historicas,total_efectivo:d.efectivo_historico,total_credito:d.credito_historico,total_clientes:d.clientes_historicos,vendedores_activos:d.ventas_por_vendedor.length})}catch(failure){setError(failure instanceof Error?failure.message:"No se pudo cargar el resumen")}finally{setLoading(false)}
}

  const verDetalleVendedor = async (vendedor: VentaVendedor) => {setDetalleVendedor(vendedor);await cargarDetalle(vendedor.id_personal,1)}

  const cerrarDetalle = () => {
    setDetalleVendedor(null)
  }

  const generarLiquidacion = (idVendedor: number) => { router.push("/admin/Cierre-dia?vendedor="+idVendedor) }


  useEffect(() => {
    cargarDatosVentas()
  }, [])


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

        <MonthlySales />
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
                    .filter((venta) => venta.id_personal === detalleVendedor.id_personal)
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

            <div className="flex justify-between items-center py-3"><Button disabled={paginaDetalle<=1} onClick={()=>cargarDetalle(detalleVendedor.id_personal,paginaDetalle-1)}>Anterior</Button><span>Página {paginaDetalle} de {paginasDetalle}</span><Button disabled={paginaDetalle>=paginasDetalle} onClick={()=>cargarDetalle(detalleVendedor.id_personal,paginaDetalle+1)}>Siguiente</Button></div>
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
