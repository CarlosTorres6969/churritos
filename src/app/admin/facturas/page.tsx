"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge, type badgeVariants } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, FileText, Settings, Edit, Eye, Plus } from "lucide-react"
import type { VariantProps } from "class-variance-authority"

interface CAI {
  id_cai: number
  codigo_cai: string
  fecha_inicio: string
  fecha_fin: string
  rango_inicial: number
  rango_final: number
  siguiente_numero?: number
  activo: boolean
  facturas_emitidas?: number
  estadisticas?: {
    facturas_emitidas: number
    primer_numero: string
    ultimo_numero: string
    facturas_anuladas: number
  }
}

interface Factura {
  id_factura: number
  numero_factura: string
  nombre_cliente?: string
  cliente?: string
  vendedor?: string
  fecha_emision: string
  monto_total: number | string
  codigo_cai?: string
  cai?: string
  anulada: boolean
}

interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
  errors?: string[]
}

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === "string" ? error : "Unknown error occurred"
}

export default function FacturasYCAI() {
  const [cais, setCais] = useState<CAI[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [modalCAIAbierto, setModalCAIAbierto] = useState(false)
  const [caiEditando, setCaiEditando] = useState<CAI | null>(null)
  const [formDataCAI, setFormDataCAI] = useState({
    codigo_cai: "",
    fecha_inicio: "",
    fecha_fin: "",
    rango_inicial: 0,
    rango_final: 0,
    activo: false,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const router = useRouter()

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    try {
      setLoading(true)
      setError("")

      const [resCais, resFacturas] = await Promise.all([
        fetch("/API/CAI", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }),
        fetch("/API/Factura", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ])

      if (!resCais.ok) {
        const errorText = await resCais.text()
        throw new Error(`Error al cargar CAI: ${resCais.status} - ${errorText}`)
      }
      if (!resFacturas.ok) {
        const errorText = await resFacturas.text()
        throw new Error(`Error al cargar facturas: ${resFacturas.status} - ${errorText}`)
      }

      const caisResponse: APIResponse<{ items: CAI[] }> = await resCais.json()
      const facturasResponse: APIResponse<{ facturas: Factura[] }> = await resFacturas.json()

      // Handle API response structure
      if (!caisResponse.success) {
        throw new Error(caisResponse.error || "Error al cargar CAI")
      }
      if (!facturasResponse.success) {
        throw new Error(facturasResponse.error || "Error al cargar facturas")
      }

      const caisData = caisResponse.data?.items || []
      const facturasData = facturasResponse.data?.facturas || []

      setCais(Array.isArray(caisData) ? caisData : [])
      setFacturas(Array.isArray(facturasData) ? facturasData : [])
    } catch (err) {
      console.error("Error en cargarDatos:", err)
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Helpers
  const toNumber = (v: number | string | null | undefined) => Number(v ?? 0)
  const fmtHNL = (n: number) => new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" }).format(n)
  const fmtDate = (s: string) => {
    const ms = Date.parse(s)
    return isNaN(ms) ? s : new Date(ms).toLocaleDateString("es-HN")
  }

  const obtenerEstadoCAI = (cai: CAI): { estado: string; color: BadgeVariant } => {
    const hoy = new Date()
    const fechaFin = new Date(cai.fecha_fin)
    const totalRango = Math.max(1, cai.rango_final - cai.rango_inicial)
    const siguienteNumero = cai.siguiente_numero || cai.rango_inicial
    const porcentaje = ((siguienteNumero - cai.rango_inicial) / totalRango) * 100

    if (!cai.activo) return { estado: "Inactivo", color: "secondary" }
    if (fechaFin < hoy) return { estado: "Vencido", color: "destructive" }
    if (porcentaje >= 90) return { estado: "Agotándose", color: "destructive" }
    if (porcentaje >= 70) return { estado: "Advertencia", color: "secondary" }
    return { estado: "Activo", color: "default" }
  }

  const totalFacturas = facturas.length
  const totalFacturado = facturas.reduce((sum, f) => sum + toNumber(f.monto_total), 0)
  const facturasAnuladas = facturas.filter((f) => f.anulada).length

  const guardarCAI = async () => {
    try {
      setError("")
      const url = caiEditando ? `/API/CAI?id_cai=${caiEditando.id_cai}` : "/API/CAI"
      const method = caiEditando ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formDataCAI),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Error al guardar CAI: ${response.status} - ${errorText}`)
      }

      const result: APIResponse<CAI> = await response.json()

      if (!result.success) {
        if (result.errors && Array.isArray(result.errors)) {
          throw new Error(result.errors.join(", "))
        }
        throw new Error(result.error || "Error al guardar CAI")
      }

      await cargarDatos() // Reload data
      setModalCAIAbierto(false)
      setCaiEditando(null)
      setFormDataCAI({
        codigo_cai: "",
        fecha_inicio: "",
        fecha_fin: "",
        rango_inicial: 0,
        rango_final: 0,
        activo: false,
      })
    } catch (err) {
      console.error("Error al guardar CAI:", err)
      setError(getErrorMessage(err))
    }
  }

  const activarCAI = async (caiId: number) => {
    try {
      setError("")
      const response = await fetch(`/API/CAI?id_cai=${caiId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ activo: true }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Error al activar CAI: ${response.status} - ${errorText}`)
      }

      const result: APIResponse<CAI> = await response.json()

      if (!result.success) {
        throw new Error(result.error || "Error al activar CAI")
      }

      await cargarDatos() // Reload data
    } catch (err) {
      console.error("Error al activar CAI:", err)
      setError(getErrorMessage(err))
    }
  }

  const handleInputChange = (field: string, value: unknown) => {
    setFormDataCAI((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const abrirModalNuevoCAI = () => {
    setCaiEditando(null)
    setFormDataCAI({
      codigo_cai: "",
      fecha_inicio: "",
      fecha_fin: "",
      rango_inicial: 0,
      rango_final: 0,
      activo: false,
    })
    setModalCAIAbierto(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando datos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Button variant="ghost" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Volver
      </Button>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="facturas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="facturas">
            <FileText className="mr-2 h-4 w-4" /> Facturas
          </TabsTrigger>
          <TabsTrigger value="cai">
            <Settings className="mr-2 h-4 w-4" /> CAI
          </TabsTrigger>
        </TabsList>

        {/* FACTURAS */}
        <TabsContent value="facturas">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card>
              <CardHeader>
                <CardTitle>Total Facturas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalFacturas}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Total Facturado</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmtHNL(totalFacturado)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Anuladas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{facturasAnuladas}</p>
              </CardContent>
            </Card>
          </div>

          {facturas.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">No hay facturas.</CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {facturas.map((factura) => (
                <Card key={factura.id_factura}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{factura.numero_factura ?? "—"}</span>
                      <div className="flex items-center gap-2">
                        {factura.anulada ? (
                          <Badge variant="destructive">Anulada</Badge>
                        ) : (
                          <Badge variant="default">Vigente</Badge>
                        )}
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" /> Ver
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p>
                      <strong>Cliente:</strong> {factura.nombre_cliente || factura.cliente || "—"}
                    </p>
                    <p>
                      <strong>Vendedor:</strong> {factura.vendedor ?? "—"}
                    </p>
                    <p>
                      <strong>Fecha:</strong> {fmtDate(factura.fecha_emision)}
                    </p>
                    <p>
                      <strong>Monto:</strong> {fmtHNL(toNumber(factura.monto_total))}
                    </p>
                    <p>
                      <strong>CAI:</strong> {factura.codigo_cai || factura.cai || "—"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CAI */}
        <TabsContent value="cai">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Gestión de CAI</h2>
            <Button onClick={abrirModalNuevoCAI}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo CAI
            </Button>
          </div>

          {cais.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No hay CAI configurados.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {cais.map((cai) => {
                const estado = obtenerEstadoCAI(cai)
                const facturas_emitidas = cai.estadisticas?.facturas_emitidas || cai.facturas_emitidas || 0
                const siguiente_numero = cai.siguiente_numero || cai.rango_inicial

                return (
                  <Card key={cai.id_cai}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{cai.codigo_cai}</span>
                        <Badge variant={estado.color}>{estado.estado}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <p>
                        <strong>Vigencia:</strong> {fmtDate(cai.fecha_inicio)} — {fmtDate(cai.fecha_fin)}
                      </p>
                      <p>
                        <strong>Rango:</strong> {cai.rango_inicial} - {cai.rango_final}
                      </p>
                      <p>
                        <strong>Siguiente número:</strong> {siguiente_numero}
                      </p>
                      <p>
                        <strong>Facturas emitidas:</strong> {facturas_emitidas}
                      </p>
                      {cai.estadisticas && (
                        <p>
                          <strong>Facturas anuladas:</strong> {cai.estadisticas.facturas_anuladas}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCaiEditando(cai)
                            setFormDataCAI({
                              codigo_cai: cai.codigo_cai,
                              fecha_inicio: cai.fecha_inicio,
                              fecha_fin: cai.fecha_fin,
                              rango_inicial: cai.rango_inicial,
                              rango_final: cai.rango_final,
                              activo: cai.activo,
                            })
                            setModalCAIAbierto(true)
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" /> Editar
                        </Button>
                        {!cai.activo && (
                          <Button variant="default" size="sm" onClick={() => activarCAI(cai.id_cai)}>
                            Activar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* CAI creation/editing modal */}
      <Dialog open={modalCAIAbierto} onOpenChange={setModalCAIAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{caiEditando ? "Editar CAI" : "Crear CAI"}</DialogTitle>
            <DialogDescription>
              {caiEditando ? "Modifica los datos del CAI" : "Ingresa los datos del nuevo CAI"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="codigo_cai">Código CAI</Label>
              <Input
                id="codigo_cai"
                value={formDataCAI.codigo_cai}
                onChange={(e) => handleInputChange("codigo_cai", e.target.value)}
                placeholder="Ingresa el código CAI"
              />
            </div>
            <div>
              <Label htmlFor="fecha_inicio">Fecha Inicio</Label>
              <Input
                id="fecha_inicio"
                type="date"
                value={formDataCAI.fecha_inicio}
                onChange={(e) => handleInputChange("fecha_inicio", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fecha_fin">Fecha Fin</Label>
              <Input
                id="fecha_fin"
                type="date"
                value={formDataCAI.fecha_fin}
                onChange={(e) => handleInputChange("fecha_fin", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="rango_inicial">Rango Inicial</Label>
              <Input
                id="rango_inicial"
                type="number"
                value={formDataCAI.rango_inicial}
                onChange={(e) => handleInputChange("rango_inicial", Number.parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="rango_final">Rango Final</Label>
              <Input
                id="rango_final"
                type="number"
                value={formDataCAI.rango_final}
                onChange={(e) => handleInputChange("rango_final", Number.parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={guardarCAI}>{caiEditando ? "Actualizar" : "Crear"}</Button>
              <Button variant="outline" onClick={() => setModalCAIAbierto(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
