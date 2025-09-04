"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ArrowLeft, FileText, Eye, Printer, Download, Calendar, X, Search, Loader2 } from "lucide-react"
import { requireAuth } from "@/lib/auth"

interface Factura {
  id_factura: number
  numero_factura: string
  nombre_cliente: string
  fecha_emision: string
  monto_total: number
  codigo_cai: string
  anulada: boolean
  id_personal?: number
  productos?: Producto[]
}

interface Producto {
  nombre: string
  cantidad: number
  precio_unitario: number
  total: number
}

interface FacturaDetalle {
  id_factura: number
  numero_factura: string
  nombre_cliente: string
  fecha_emision: string
  monto_total: number
  codigo_cai: string
  anulada: boolean
  tipo_pago: string
  id_personal?: number
  productos?: Producto[]
}

interface UsuarioAutenticado {
  id_personal: number
  nombre: string
  apellido: string
}

// Interface for printer functions that might be available on window
interface PrinterAPI {
  Print?: {
    printText: (text: string) => void;
  };
  bluetoothPrint?: (text: string) => void;
  printToTerminal?: (text: string) => void;
  getPrinterStatus?: () => Promise<string>;
  checkPrinter?: () => Promise<string>;
}

// Extend Window interface to include printer functions
declare global {
  interface Window {
    Print?: PrinterAPI['Print'];
    bluetoothPrint?: PrinterAPI['bluetoothPrint'];
    printToTerminal?: PrinterAPI['printToTerminal'];
    getPrinterStatus?: PrinterAPI['getPrinterStatus'];
    checkPrinter?: PrinterAPI['checkPrinter'];
  }
}

// AbortController para cancelar solicitudes pendientes
let abortController = new AbortController();

export default function FacturasVendedor() {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [facturasFiltradas, setFacturasFiltradas] = useState<Factura[]>([])
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<FacturaDetalle | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [fechaInicio, setFechaInicio] = useState("")
  const [fechaFin, setFechaFin] = useState("")
  const [filtroActivo, setFiltroActivo] = useState(false)
  const [usuarioAutenticado, setUsuarioAutenticado] = useState<UsuarioAutenticado | null>(null)
  const [terminoBusqueda, setTerminoBusqueda] = useState("")
  const [cargandoFactura, setCargandoFactura] = useState<number | null>(null)
  const [imprimiendo, setImprimiendo] = useState<number | null>(null)
  const router = useRouter()

  const cargarFacturas = useCallback(async (idPersonal: number) => {
    // Cancelar solicitud anterior si existe
    abortController.abort()
    abortController = new AbortController()
    
    try {
      setLoading(true)
      setError("")
      let url = `/API/Factura?page=${currentPage}&pageSize=10&id_personal=${idPersonal}`

      if (filtroActivo && fechaInicio && fechaFin) {
        url += `&fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`
      }

      const response = await fetch(url, { 
        signal: abortController.signal 
      })
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`)
      }
      
      const result = await response.json()

      if (result.success) {
        setFacturas(result.data.facturas || [])
        setFacturasFiltradas(result.data.facturas || [])
        setTotalPages(result.data.pagination?.totalPages || 1)
      } else {
        setError(result.error || "Error al cargar facturas")
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Solicitud cancelada')
      } else {
        setError("Error de conexión al cargar facturas")
        console.error("Error:", error)
      }
    } finally {
      setLoading(false)
    }
  }, [currentPage, filtroActivo, fechaInicio, fechaFin])

  useEffect(() => {
    const obtenerUsuario = () => {
      try {
        const user = requireAuth();
        setUsuarioAutenticado(user);
      } catch (error) {
        console.error("Error al obtener el usuario autenticado:", error);
        router.push("/login");
      }
    };
    
    obtenerUsuario();
  }, [router])

  // Cargar facturas cuando el usuario esté disponible o cambien los filtros
  useEffect(() => {
    if (usuarioAutenticado && usuarioAutenticado.id_personal) {
      cargarFacturas(usuarioAutenticado.id_personal);
    }
  }, [usuarioAutenticado, currentPage, filtroActivo, fechaInicio, fechaFin, cargarFacturas])

  // Filtrar facturas según término de búsqueda (solo para la visualización)
  useEffect(() => {
    if (terminoBusqueda) {
      const termino = terminoBusqueda.toLowerCase();
      const filtradas = facturas.filter(factura => 
        factura.numero_factura.toLowerCase().includes(termino) ||
        factura.nombre_cliente.toLowerCase().includes(termino)
      );
      setFacturasFiltradas(filtradas);
    } else {
      setFacturasFiltradas(facturas);
    }
  }, [terminoBusqueda, facturas])

  const verFactura = async (factura: Factura) => {
    try {
      setCargandoFactura(factura.id_factura)
      const response = await fetch(`/API/Factura?id_factura=${factura.id_factura}`)
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`)
      }
      
      const result = await response.json()

      if (result.success) {
        setFacturaSeleccionada(result.data)
        setModalAbierto(true)
      } else {
        setError("Error al cargar detalles de la factura")
      }
    } catch (error) {
      setError("Error de conexión al cargar factura")
      console.error("Error:", error)
    } finally {
      setCargandoFactura(null)
    }
  }

  const imprimirFactura = async (factura: Factura | FacturaDetalle) => {
    setImprimiendo(factura.id_factura);
    try {
      // Crear contenido optimizado para impresora térmica de 58mm
      const contenido = `
${'='.repeat(32)}
      INVERSIONES MEJIA
${'='.repeat(32)}
FACTURA: ${factura.numero_factura}
FECHA: ${formatearFecha(factura.fecha_emision)}
${'-'.repeat(32)}
CLIENTE: ${factura.nombre_cliente || "N/A"}
${'-'.repeat(32)}
${'Producto'.padEnd(16)}Cant  Total
${'-'.repeat(32)}
${factura.productos && factura.productos.length > 0 
  ? factura.productos.map(p => 
      `${p.nombre.substring(0, 16).padEnd(16)}${p.cantidad.toString().padStart(3)}  L.${p.total.toFixed(2)}`
    ).join('\n')
  : 'No hay productos'
}
${'-'.repeat(32)}
TOTAL: L. ${factura.monto_total.toFixed(2)}
${'-'.repeat(32)}
CAI: ${factura.codigo_cai || "N/A"}
Estado: ${factura.anulada ? "ANULADA" : "ACTIVA"}
${'='.repeat(32)}
¡Gracias por su compra!
      `.trim();

      console.log("Contenido para impresión:", contenido);

      // Intentar diferentes métodos de impresión para dispositivos POS
      let impresionExitosa = false;

      // Método 1: Usando la API nativa del dispositivo POS
      if (typeof window.Print !== 'undefined' && window.Print?.printText) {
        try {
          window.Print.printText(contenido);
          impresionExitosa = true;
          console.log("Impresión exitosa usando API nativa");
        } catch (error) {
          console.error("Error con API nativa:", error);
        }
      }

      // Método 2: Usando Bluetooth (común en dispositivos Android POS)
      if (!impresionExitosa && typeof window.bluetoothPrint === 'function') {
        try {
          window.bluetoothPrint(contenido);
          impresionExitosa = true;
          console.log("Impresión exitosa usando Bluetooth");
        } catch (error) {
          console.error("Error con Bluetooth:", error);
        }
      }

      // Método 3: Usando impresora térmica integrada
      if (!impresionExitosa && typeof window.printToTerminal === 'function') {
        try {
          window.printToTerminal(contenido);
          impresionExitosa = true;
          console.log("Impresión exitosa en terminal");
        } catch (error) {
          console.error("Error con terminal print:", error);
        }
      }

      // Método 4: Fallback - intentar con ventana de impresión estándar
      if (!impresionExitosa) {
        console.log("Usando fallback de impresión estándar");
        const ventanaImpression = window.open('', '_blank');
        if (ventanaImpression) {
          ventanaImpression.document.write(`
            <html>
              <head>
                <title>Factura ${factura.numero_factura}</title>
                <style>
                  body { 
                    font-family: 'Courier New', monospace; 
                    font-size: 12px; 
                    width: 80mm;
                    margin: 0;
                    padding: 2mm;
                    background: white;
                  }
                  @media print {
                    @page { 
                      margin: 0; 
                      size: 80mm auto;
                    }
                    body { 
                      width: 80mm;
                    }
                  }
                  pre {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                  }
                </style>
              </head>
              <body onload="setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 100); }, 50);">
                <pre>${contenido}</pre>
              </body>
            </html>
          `);
          ventanaImpression.document.close();
          impresionExitosa = true;
        }
      }

      if (!impresionExitosa) {
        throw new Error("No se pudo acceder a ningún método de impresión");
      }

    } catch (error) {
      console.error("Error al imprimir factura:", error);
      alert("Error al imprimir. Verifique que la impresora esté conectada y encendida.");
    } finally {
      setImprimiendo(null);
    }
  };

  const descargarFactura = (factura: Factura | FacturaDetalle) => {
    console.log("Descargando factura:", factura.numero_factura);
    
    // Crear contenido para descarga
    const contenido = `
FACTURA: ${factura.numero_factura}
FECHA: ${formatearFecha(factura.fecha_emision)}
CLIENTE: ${factura.nombre_cliente || "N/A"}
${factura.productos && factura.productos.length > 0 
  ? factura.productos.map(p => 
      `${p.nombre} - Cant: ${p.cantidad} - Precio: L.${p.precio_unitario.toFixed(2)} - Total: L.${p.total.toFixed(2)}`
    ).join('\n')
  : 'No hay productos'
}
TOTAL: L. ${factura.monto_total.toFixed(2)}
CAI: ${factura.codigo_cai || "N/A"}
Estado: ${factura.anulada ? "ANULADA" : "ACTIVA"}
    `.trim();

    // Crear blob y descargar
    const blob = new Blob([contenido], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factura-${factura.numero_factura}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const formatearFecha = (fechaString: string) => {
    try {
      const regex = /(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/;
      const match = fechaString.match(regex);
      
      if (match) {
        const [, anio, mes, dia, horas, minutos] = match;
        return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${anio} ${horas.padStart(2, '0')}:${minutos.padStart(2, '0')}`;
      }
      
      const fechaSimpleRegex = /(\d{4})-(\d{2})-(\d{2})/;
      const simpleMatch = fechaString.match(fechaSimpleRegex);
      
      if (simpleMatch) {
        const [, anio, mes, dia] = simpleMatch;
        return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${anio} 00:00`;
      }
      
      return fechaString;
    } catch (error) {
      console.error("Error al formatear fecha:", error, fechaString);
      return fechaString;
    }
  }

  const totalFacturado = facturasFiltradas.reduce((sum, f) => sum + f.monto_total, 0)
  const facturasActivas = facturasFiltradas.filter((f) => !f.anulada).length

  const aplicarFiltroFecha = () => {
    if (!fechaInicio || !fechaFin) {
      setError("Por favor selecciona ambas fechas")
      return
    }

    if (new Date(fechaInicio) > new Date(fechaFin)) {
      setError("La fecha de inicio no puede ser mayor que la fecha de fin")
      return
    }

    setCurrentPage(1)
    setFiltroActivo(true)
    setTerminoBusqueda("")
    setError("")
  }

  const limpiarFiltro = () => {
    setFechaInicio("")
    setFechaFin("")
    setFiltroActivo(false)
    setCurrentPage(1)
    setTerminoBusqueda("")
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
          <p>Cargando facturas...</p>
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
                <h1 className="text-2xl font-bold text-gray-900">Mis Facturas</h1>
                <p className="text-sm text-gray-600">Facturas generadas por mí</p>
                {usuarioAutenticado && (
                  <p className="text-xs text-gray-500">Vendedor: {usuarioAutenticado.nombre} {usuarioAutenticado.apellido}</p>
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

        {/* Buscador */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Buscar Facturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Buscar por número de factura o nombre de cliente..."
                value={terminoBusqueda}
                onChange={(e) => setTerminoBusqueda(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filtrar por Fecha de Emisión
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Fecha Inicio</label>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Fecha Fin</label>
                <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full" />
              </div>
              <div className="flex gap-2">
                <Button onClick={aplicarFiltroFecha} disabled={!fechaInicio || !fechaFin}>
                  Filtrar
                </Button>
                {filtroActivo && (
                  <Button variant="outline" onClick={limpiarFiltro}>
                    <X className="h-4 w-4 mr-2" />
                    Limpiar
                  </Button>
                )}
              </div>
            </div>
            {filtroActivo && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  Mostrando facturas del {new Date(fechaInicio).toLocaleDateString("es-HN")} al{" "}
                  {new Date(fechaFin).toLocaleDateString("es-HN")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Facturas Emitidas</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{facturasActivas}</div>
              <p className="text-xs text-muted-foreground">facturas activas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Facturado</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">L. {totalFacturado.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">monto total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promedio por Factura</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                L. {facturasActivas > 0 ? (totalFacturado / facturasActivas).toFixed(2) : "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">promedio</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mis Facturas Emitidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {facturasFiltradas.map((factura) => (
                <div key={factura.id_factura} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium">{factura.numero_factura}</h4>
                      <Badge variant={factura.anulada ? "destructive" : "default"}>
                        {factura.anulada ? "Anulada" : "Activa"}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">{factura.nombre_cliente}</p>
                    
                    {factura.productos && factura.productos.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        <p className="font-medium">Productos:</p>
                        <div className="ml-2">
                          {factura.productos.slice(0, 2).map((producto, index) => (
                            <div key={index} className="flex justify-between">
                              <span>{producto.nombre} x {producto.cantidad}</span>
                              <span>L. {producto.total.toFixed(2)}</span>
                            </div>
                          ))}
                          {factura.productos.length > 2 && (
                            <p>y {factura.productos.length - 2} más...</p>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-1">{formatearFecha(factura.fecha_emision)}</p>
                    <p className="text-xs text-gray-500">CAI: {factura.codigo_cai}</p>
                  </div>

                  <div className="text-right mr-4">
                    <p className="text-lg font-bold">L. {factura.monto_total.toFixed(2)}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => verFactura(factura)}
                      disabled={cargandoFactura === factura.id_factura}
                    >
                      {cargandoFactura === factura.id_factura ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => imprimirFactura(factura)}
                      disabled={imprimiendo === factura.id_factura}
                    >
                      {imprimiendo === factura.id_factura ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => descargarFactura(factura)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {facturasFiltradas.length === 0 && !loading && (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No hay facturas</h3>
                <p className="text-gray-600">
                  {filtroActivo || terminoBusqueda
                    ? "No se encontraron facturas con los filtros aplicados"
                    : "No has generado ninguna factura aún"}
                </p>
              </div>
            )}

            {/* Información de paginación */}
            {facturasFiltradas.length > 0 && (
              <div className="mt-4 text-sm text-gray-600 text-center">
                Mostrando {facturasFiltradas.length} de {facturas.length} facturas en esta página
                {totalPages > 1 && ` (Página ${currentPage} de ${totalPages})`}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="flex items-center px-4">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalle de Factura</DialogTitle>
              <DialogDescription>Información completa de la factura</DialogDescription>
            </DialogHeader>

            {facturaSeleccionada && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Número:</strong>
                    <p>{facturaSeleccionada.numero_factura}</p>
                  </div>
                  <div>
                    <strong>CAI:</strong>
                    <p>{facturaSeleccionada.codigo_cai}</p>
                  </div>
                  <div>
                    <strong>Cliente:</strong>
                    <p>{facturaSeleccionada.nombre_cliente}</p>
                  </div>
                  <div>
                    <strong>Fecha:</strong>
                    <p>{formatearFecha(facturaSeleccionada.fecha_emision)}</p>
                  </div>
                  <div>
                    <strong>Tipo de Pago:</strong>
                    <p>{facturaSeleccionada.tipo_pago}</p>
                  </div>
                  <div>
                    <strong>Estado:</strong>
                    <Badge variant={facturaSeleccionada.anulada ? "destructive" : "default"}>
                      {facturaSeleccionada.anulada ? "Anulada" : "Activa"}
                    </Badge>
                  </div>
                  <div className="col-span-2">
                    <strong>Monto Total:</strong>
                    <p className="text-lg font-bold">L. {facturaSeleccionada.monto_total.toFixed(2)}</p>
                  </div>
                </div>

                {facturaSeleccionada.productos && facturaSeleccionada.productos.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Detalles de la Venta:</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left p-2 font-medium">Producto</th>
                            <th className="text-right p-2 font-medium">Cantidad</th>
                            <th className="text-right p-2 font-medium">Precio Unitario</th>
                            <th className="text-right p-2 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {facturaSeleccionada.productos.map((producto, index) => (
                            <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <td className="p-2">{producto.nombre}</td>
                              <td className="p-2 text-right">{producto.cantidad}</td>
                              <td className="p-2 text-right">L. {producto.precio_unitario.toFixed(2)}</td>
                              <td className="p-2 text-right">L. {producto.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-100">
                          <tr>
                            <td colSpan={3} className="p-2 text-right font-medium">Total:</td>
                            <td className="p-2 text-right font-medium">L. {facturaSeleccionada.monto_total.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => imprimirFactura(facturaSeleccionada)} 
                    className="flex-1"
                    disabled={imprimiendo === facturaSeleccionada.id_factura}
                  >
                    {imprimiendo === facturaSeleccionada.id_factura ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Printer className="h-4 w-4 mr-2" />
                    )}
                    Imprimir
                  </Button>
                  <Button variant="outline" onClick={() => descargarFactura(facturaSeleccionada)} className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    Descargar
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