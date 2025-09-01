"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ArrowLeft, CreditCard, DollarSign, Calendar, AlertTriangle, CheckCircle } from "lucide-react"
import { requireAuth } from "@/lib/auth"

interface CreditoPendiente {
  id_credito: number
  id_cliente: number
  limite_credito: number
  saldo_actual: number
  saldo_vencido: number
  fecha_actualizacion: string
  activo: boolean
  dias_credito: number
  tasa_interes: number
  cliente?: string
  telefono?: string
  ultima_compra?: string
  id_ruta?: number
}

interface RutaUsuario {
  id_ruta: number
  id_personal_asignado: number
  activa: boolean
  nombre: string
}

export default function CreditosPendientes() {
  const [creditos, setCreditos] = useState<CreditoPendiente[]>([])
  const [creditoSeleccionado, setCreditoSeleccionado] = useState<CreditoPendiente | null>(null)
  const [modalPagoAbierto, setModalPagoAbierto] = useState(false)
  const [montoPago, setMontoPago] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
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
            cargarCreditosPendientes(rutaDelUsuario.id_ruta);
          } else {
            const rutaAsignada = data.data.find((ruta: RutaUsuario) => 
              ruta.id_personal_asignado === idPersonal
            );
            
            if (rutaAsignada) {
              setRutaUsuario(rutaAsignada);
              cargarCreditosPendientes(rutaAsignada.id_ruta);
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

  const cargarCreditosPendientes = async (idRuta: number) => {
    try {
      setLoading(true)
      const response = await fetch(`/API/Cliente-Credito?id_ruta=${idRuta}&activo=true`)

      if (!response.ok) {
        throw new Error("Error al obtener créditos pendientes")
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || "Error al obtener créditos")
      }

      const creditosConSaldo = result.data.filter(
        (credito: CreditoPendiente) => credito.saldo_actual > 0 || credito.saldo_vencido > 0,
      )

      setCreditos(creditosConSaldo)
    } catch (error) {
      setError("Error al cargar créditos pendientes")
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const obtenerUsuario = async () => {
      try {
        const user = requireAuth();
        await obtenerRutaUsuario(user.id_personal);
      } catch (error) {
        console.error("Error al obtener el usuario autenticado:", error);
        router.push("/login");
      }
    };
    
    obtenerUsuario();
  }, [obtenerRutaUsuario, router])

  const abrirModalPago = (credito: CreditoPendiente) => {
    setCreditoSeleccionado(credito)
    setMontoPago(0)
    setModalPagoAbierto(true)
    setError("")
    setSuccess("")
  }

  const procesarPago = async () => {
    if (!creditoSeleccionado || montoPago <= 0) {
      setError("Ingrese un monto válido")
      return
    }

    if (montoPago > creditoSeleccionado.saldo_actual) {
      setError("El monto no puede ser mayor al saldo actual")
      return
    }

    try {
      const nuevoSaldoActual = creditoSeleccionado.saldo_actual - montoPago
      let nuevoSaldoVencido = creditoSeleccionado.saldo_vencido

      if (montoPago > creditoSeleccionado.saldo_actual - creditoSeleccionado.saldo_vencido) {
        const pagoVencido = montoPago - (creditoSeleccionado.saldo_actual - creditoSeleccionado.saldo_vencido)
        nuevoSaldoVencido = Math.max(0, creditoSeleccionado.saldo_vencido - pagoVencido)
      }

      const response = await fetch("/API/Cliente-Credito", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id_credito: creditoSeleccionado.id_credito,
          saldo_actual: nuevoSaldoActual,
          saldo_vencido: nuevoSaldoVencido,
          fecha_actualizacion: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        throw new Error("Error al procesar el pago")
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || "Error al procesar el pago")
      }

      setCreditos((prev) =>
        prev.map((credito) =>
          credito.id_credito === creditoSeleccionado.id_credito
            ? {
                ...credito,
                saldo_actual: result.data.saldo_actual,
                saldo_vencido: result.data.saldo_vencido,
                fecha_actualizacion: result.data.fecha_actualizacion,
              }
            : credito,
        ),
      )

      setSuccess(`Pago de L. ${montoPago.toFixed(2)} procesado exitosamente`)
      setMontoPago(0)

      setTimeout(() => {
        setModalPagoAbierto(false)
        setSuccess("")
      }, 2000)
    } catch (error) {
      setError("Error al procesar el pago")
      console.error("Error:", error)
    }
  }

  const calcularDiasVencido = (fechaActualizacion: string, diasCredito: number): number => {
    const fechaBase = new Date(fechaActualizacion)
    const fechaVencimiento = new Date(fechaBase.getTime() + diasCredito * 24 * 60 * 60 * 1000)
    const hoy = new Date()
    const diferencia = Math.floor((hoy.getTime() - fechaVencimiento.getTime()) / (24 * 60 * 60 * 1000))
    return Math.max(0, diferencia)
  }

  const obtenerEstadoCredito = (credito: CreditoPendiente) => {
    const diasVencido = calcularDiasVencido(credito.fecha_actualizacion, credito.dias_credito)

    if (credito.saldo_vencido > 0 || diasVencido > 0) {
      return { estado: "vencido", color: "destructive" as const, texto: "Vencido" }
    }

    const fechaBase = new Date(credito.fecha_actualizacion)
    const fechaVencimiento = new Date(fechaBase.getTime() + credito.dias_credito * 24 * 60 * 60 * 1000)
    const hoy = new Date()
    const diasRestantes = Math.floor((fechaVencimiento.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000))

    if (diasRestantes <= 3) {
      return { estado: "por_vencer", color: "secondary" as const, texto: "Por vencer" }
    }

    return { estado: "vigente", color: "default" as const, texto: "Vigente" }
  }

  const totalCreditos = creditos.reduce((sum, c) => sum + c.saldo_actual, 0)
  const totalVencido = creditos.reduce((sum, c) => sum + c.saldo_vencido, 0)
  const creditosVencidos = creditos.filter((c) => c.saldo_vencido > 0).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>Cargando créditos pendientes...</div>
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
                <h1 className="text-2xl font-bold text-gray-900">Créditos Pendientes</h1>
                <p className="text-sm text-gray-600">Gestiona los cobros de crédito de tu ruta</p>
                {rutaUsuario && (
                  <p className="text-xs text-gray-500">Ruta: {rutaUsuario.nombre}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Créditos</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">L. {totalCreditos.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">saldo pendiente</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Créditos Vencidos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">L. {totalVencido.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{creditosVencidos} clientes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes con Crédito</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creditos.length}</div>
              <p className="text-xs text-muted-foreground">clientes activos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promedio por Cliente</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                L. {creditos.length > 0 ? (totalCreditos / creditos.length).toFixed(2) : "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">promedio</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {creditos.map((credito) => {
            const estadoCredito = obtenerEstadoCredito(credito)
            const diasVencido = calcularDiasVencido(credito.fecha_actualizacion, credito.dias_credito)

            return (
              <Card key={credito.id_credito} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{credito.cliente || `Cliente #${credito.id_cliente}`}</CardTitle>
                      {credito.telefono && <p className="text-sm text-gray-600">{credito.telefono}</p>}
                    </div>
                    <Badge variant={estadoCredito.color}>{estadoCredito.texto}</Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Límite de Crédito:</span>
                      <span className="font-medium">L. {credito.limite_credito.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Saldo Actual:</span>
                      <span className="font-bold">L. {credito.saldo_actual.toFixed(2)}</span>
                    </div>
                    {credito.saldo_vencido > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Saldo Vencido:</span>
                        <span className="font-bold">L. {credito.saldo_vencido.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Días de Crédito:</span>
                      <span>{credito.dias_credito} días</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Última Actualización:</span>
                      <span>{new Date(credito.fecha_actualizacion).toLocaleDateString("es-HN")}</span>
                    </div>
                    {diasVencido > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Días Vencido:</span>
                        <span className="font-bold">{diasVencido} días</span>
                      </div>
                    )}
                    {credito.tasa_interes > 0 && (
                      <div className="flex justify-between">
                        <span>Tasa de Interés:</span>
                        <span>{credito.tasa_interes}%</span>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => abrirModalPago(credito)}
                    className="w-full"
                    disabled={credito.saldo_actual === 0}
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Cobrar Crédito
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {creditos.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay créditos pendientes</h3>
              <p className="text-gray-600">No tienes clientes con créditos pendientes en tu ruta</p>
            </CardContent>
          </Card>
        )}

        <Dialog open={modalPagoAbierto} onOpenChange={setModalPagoAbierto}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Cobrar Crédito</DialogTitle>
              <DialogDescription>Procesar pago de crédito del cliente</DialogDescription>
            </DialogHeader>

            {creditoSeleccionado && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">
                    {creditoSeleccionado.cliente || `Cliente #${creditoSeleccionado.id_cliente}`}
                  </h4>
                  <div className="text-sm text-gray-600">
                    <p>Límite: L. {creditoSeleccionado.limite_credito.toFixed(2)}</p>
                    <p>Saldo actual: L. {creditoSeleccionado.saldo_actual.toFixed(2)}</p>
                    {creditoSeleccionado.saldo_vencido > 0 && (
                      <p className="text-red-600">Saldo vencido: L. {creditoSeleccionado.saldo_vencido.toFixed(2)}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="monto">Monto a Cobrar</Label>
                  <Input
                    id="monto"
                    type="number"
                    step="0.01"
                    value={montoPago}
                    onChange={(e) => setMontoPago(Number.parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    max={creditoSeleccionado.saldo_actual}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMontoPago(creditoSeleccionado.saldo_vencido)}
                      disabled={creditoSeleccionado.saldo_vencido === 0}
                    >
                      Saldo Vencido
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setMontoPago(creditoSeleccionado.saldo_actual)}>
                      Saldo Total
                    </Button>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">{success}</AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModalPagoAbierto(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={procesarPago} disabled={montoPago <= 0}>
                    Procesar Pago
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}