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
import { posprinter, type POSPrintOptions, A7_CONFIG } from "@/lib/pos-printer"

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

// Interface para APIs de impresión POS
interface POSPrinterAPI {
  printText?: (text: string) => Promise<boolean>
  printReceipt?: (text: string) => Promise<boolean>
  getPrinterStatus?: () => Promise<string>
  connectPrinter?: () => Promise<boolean>
  isConnected?: () => boolean
}

// Interfaces para APIs específicas de fabricantes
interface StarWebPrintAPI {
  print: (commands: { append: string }[]) => void
}

interface EpsonAPI {
  append: (text: string) => void
  print: () => void
}

// Extender Window para incluir APIs POS
declare global {
  interface Window {
    POS?: {
      printer?: POSPrinterAPI
    }
    printerAPI?: POSPrinterAPI
    StarWebPrint?: StarWebPrintAPI
    Epson?: EpsonAPI
    Print?: {
      printText: (text: string) => void
    }
    bluetoothPrint?: (text: string) => void
    printToTerminal?: (text: string) => void
    getPrinterStatus?: () => Promise<string>
    checkPrinter?: () => Promise<string>
  }
}

// AbortController para cancelar solicitudes pendientes
let abortController = new AbortController()

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

  const cargarFacturas = useCallback(
    async (idPersonal: number) => {
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
          signal: abortController.signal,
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
        if (error instanceof Error && error.name === "AbortError") {
          console.log("Solicitud cancelada")
        } else {
          setError("Error de conexión al cargar facturas")
          console.error("Error:", error)
        }
      } finally {
        setLoading(false)
      }
    },
    [currentPage, filtroActivo, fechaInicio, fechaFin],
  )

  useEffect(() => {
    const obtenerUsuario = () => {
      try {
        const user = requireAuth()
        setUsuarioAutenticado(user)
      } catch (error) {
        console.error("Error al obtener el usuario autenticado:", error)
        router.push("/login")
      }
    }

    obtenerUsuario()
  }, [router])

  useEffect(() => {
    if (usuarioAutenticado && usuarioAutenticado.id_personal) {
      cargarFacturas(usuarioAutenticado.id_personal)
    }
  }, [usuarioAutenticado, currentPage, filtroActivo, fechaInicio, fechaFin, cargarFacturas])

  useEffect(() => {
    if (terminoBusqueda) {
      const termino = terminoBusqueda.toLowerCase()
      const filtradas = facturas.filter(
        (factura) =>
          factura.numero_factura.toLowerCase().includes(termino) ||
          factura.nombre_cliente.toLowerCase().includes(termino),
      )
      setFacturasFiltradas(filtradas)
    } else {
      setFacturasFiltradas(facturas)
    }
  }, [terminoBusqueda, facturas])

  // Formatear texto para impresión POS
  const formatearParaPOSA7 = (factura: Factura | FacturaDetalle): string => {
    const lineLength = A7_CONFIG.charactersPerLine

    const centerText = (text: string): string => {
      if (text.length >= lineLength) return text.substring(0, lineLength)
      const spaces = Math.floor((lineLength - text.length) / 2)
      return " ".repeat(spaces) + text
    }

    const line = "=".repeat(lineLength)
    const dashLine = "-".repeat(lineLength)

    let contenido = `${line}
${centerText("INVERSIONES MEJIA")}
${centerText("FACTURA POS")}
${line}
No: ${factura.numero_factura}
Fecha: ${formatearFecha(factura.fecha_emision).substring(0, 14)}
${dashLine}
Cliente:
${(factura.nombre_cliente || "N/A").substring(0, lineLength)}
${dashLine}
PRODUCTO${" ".repeat(Math.max(0, lineLength - 16))}CANT  TOTAL
${dashLine}`

    if (factura.productos && factura.productos.length > 0) {
      factura.productos.forEach((p) => {
        const nombre = p.nombre.length > 20 ? p.nombre.substring(0, 17) + "..." : p.nombre
        const cantStr = p.cantidad.toString().padStart(2)
        const totalStr = `${p.total.toFixed(2)}`
        const espacios = Math.max(1, lineLength - nombre.length - cantStr.length - totalStr.length - 2)
        contenido += `${nombre}${" ".repeat(espacios)}${cantStr} ${totalStr}\n`
      })
    } else {
      contenido += `${centerText("Sin productos")}\n`
    }

    contenido += `${dashLine}
TOTAL: L. ${factura.monto_total.toFixed(2)}
${dashLine}
CAI: ${(factura.codigo_cai || "N/A").substring(0, lineLength)}
Estado: ${factura.anulada ? "ANULADA" : "ACTIVA"}
${line}
${centerText("Gracias por su compra")}
${centerText("Sistema POS A7")}
${line}
\n\n\n` // Avanzar papel para cortar

    return contenido
  }

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
      // Generar contenido para POS en formato ISO A7
      const contenidoPOS = formatearParaPOSA7(factura);
      
      // Verificar disponibilidad de APIs de impresión
      const apisDisponibles = detectarAPIsImpresion();
      
      if (apisDisponibles.length === 0) {
        // No hay APIs de impresión disponibles, usar vista previa
        await mostrarVistaPreviaA7(factura, contenidoPOS);
        return;
      }

      // Intentar con cada API disponible
      let impresionExitosa = false;
      
      for (const api of apisDisponibles) {
        try {
          switch (api) {
            case 'usb':
              impresionExitosa = await intentarImpresionUSB(contenidoPOS);
              break;
            case 'serial':
              impresionExitosa = await intentarImpresionSerial(contenidoPOS);
              break;
            case 'posPrinter':
              impresionExitosa = await intentarImpresionPOS(contenidoPOS, factura);
              break;
            case 'starWebPrint':
              impresionExitosa = await intentarImpresionStar(contenidoPOS);
              break;
            case 'epson':
              impresionExitosa = await intentarImpresionEpson(contenidoPOS);
              break;
            case 'printerAPI':
              impresionExitosa = await intentarImpresionAPI(contenidoPOS);
              break;
          }
          
          if (impresionExitosa) {
            alert("Factura impresa correctamente");
            return;
          }
        } catch (error) {
          console.error(`Error con API ${api}:`, error);
          // Continuar con la siguiente API
        }
      }

      // Si ninguna API funcionó, mostrar vista previa
      if (!impresionExitosa) {
        await mostrarVistaPreviaA7(factura, contenidoPOS);
      }
    } catch (error) {
      console.error("Error al imprimir factura:", error);
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      alert(`Error al intentar imprimir: ${errorMessage}. Por favor, verifica la conexión de la impresora.`);
    } finally {
      setImprimiendo(null);
      await posprinter.disconnect();
    }
  };

  // Función para detectar APIs de impresión disponibles
  const detectarAPIsImpresion = (): string[] => {
    const apis: string[] = [];
    
    // Detectar APIs específicas
    if (typeof window.POS?.printer?.printText === 'function') apis.push('posPrinter');
    if (typeof window.printerAPI?.printText === 'function') apis.push('printerAPI');
    if (typeof window.StarWebPrint?.print === 'function') apis.push('starWebPrint');
    if (typeof window.Epson?.append === 'function') apis.push('epson');
    if (typeof window.Print?.printText === 'function') apis.push('printText');
    if (typeof window.bluetoothPrint === 'function') apis.push('bluetooth');
    if (typeof window.printToTerminal === 'function') apis.push('terminal');
    
    // APIs de la librería posprinter
    if (typeof posprinter.initUSB === 'function') apis.push('usb');
    if (typeof posprinter.initSerial === 'function') apis.push('serial');
    
    return apis;
  };

  // Función para intentar impresión USB
  const intentarImpresionUSB = async (contenido: string): Promise<boolean> => {
    try {
      const connected = await posprinter.initUSB();
      if (!connected) return false;
      
      const printOptions: POSPrintOptions = {
        fontSize: "small",
        alignment: "left",
        bold: false,
        cutPaper: true,
        feedLines: 3
      };
      
      return await posprinter.printReceipt(contenido, printOptions);
    } catch {
      return false;
    }
  };

  // Función para intentar impresión Serial/Bluetooth
  const intentarImpresionSerial = async (contenido: string): Promise<boolean> => {
    try {
      const connected = await posprinter.initSerial();
      if (!connected) return false;
      
      const printOptions: POSPrintOptions = {
        fontSize: "small",
        alignment: "left",
        bold: false,
        cutPaper: true,
        feedLines: 3
      };
      
      return await posprinter.printReceipt(contenido, printOptions);
    } catch {
      return false;
    }
  };

  // Función para intentar impresión con API POS
  const intentarImpresionPOS = async (contenido: string, factura: Factura | FacturaDetalle): Promise<boolean> => {
    if (!window.POS?.printer?.printText) return false;
    
    try {
      // Agregar QR code si está disponible en la API
      const contenidoConQR = await agregarQRCodeSiEsPosible(contenido, factura);
      return await window.POS.printer.printText(contenidoConQR);
    } catch {
      return await window.POS.printer.printText(contenido);
    }
  };

  // Función para intentar impresión con StarWebPrint
  const intentarImpresionStar = async (contenido: string): Promise<boolean> => {
    if (!window.StarWebPrint) return false;
    
    try {
      window.StarWebPrint.print([{ append: contenido }]);
      return true;
    } catch {
      return false;
    }
  };

  // Función para intentar impresión con Epson
  const intentarImpresionEpson = async (contenido: string): Promise<boolean> => {
    if (!window.Epson) return false;
    
    try {
      window.Epson.append(contenido);
      window.Epson.print();
      return true;
    } catch {
      return false;
    }
  };

  // Función para intentar impresión con printerAPI
  const intentarImpresionAPI = async (contenido: string): Promise<boolean> => {
    if (!window.printerAPI?.printText) return false;
    
    try {
      return await window.printerAPI.printText(contenido);
    } catch {
      return false;
    }
  };

  // Función para mostrar vista previa A7
  const mostrarVistaPreviaA7 = async (factura: Factura | FacturaDetalle, contenido: string): Promise<void> => {
    console.log("Usando fallback de vista previa optimizada para A7");
    
    // Generar QR para la vista previa
    let qrDataURL = "";
    try {
      qrDataURL = await posprinter.generateQRCode(`FACT-${factura.numero_factura}-${factura.monto_total}`);
    } catch (qrError) {
      console.error("Error al generar QR para vista previa:", qrError);
    }

    const ventanaImpresion = window.open("", "_blank");
    if (!ventanaImpresion) {
      throw new Error("No se pudo abrir la ventana de impresión. Verifica los bloqueadores de ventanas emergentes.");
    }

    ventanaImpresion.document.write(`
      <html>
        <head>
          <title>Factura ${factura.numero_factura} - Vista Previa A7</title>
          <style>
            body { 
              font-family: 'Courier New', monospace; 
              font-size: 8px; 
              width: ${A7_CONFIG.width}mm;
              margin: 0;
              padding: ${A7_CONFIG.marginLeft}mm;
              background: white;
              line-height: 1.2;
            }
            @media print {
              @page { 
                margin: 0; 
                size: ${A7_CONFIG.width}mm ${A7_CONFIG.height}mm;
              }
              body { 
                width: ${A7_CONFIG.printableWidth}mm;
                font-size: 7px;
              }
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
              margin: 0;
              font-size: inherit;
              font-family: inherit;
            }
            .print-controls {
              margin-top: 5px;
              text-align: center;
            }
            @media screen {
              .print-controls {
                display: block;
              }
            }
            @media print {
              .print-controls {
                display: none;
              }
            }
            .qr-code {
              text-align: center;
              margin: 2mm 0;
            }
            .qr-code img {
              width: 20mm;
              height: 20mm;
            }
            .status-message {
              padding: 10px;
              margin: 10px 0;
              border-radius: 5px;
              background-color: #f8f9fa;
              border-left: 4px solid #ffc107;
            }
          </style>
        </head>
        <body>
          <div class="status-message">
            <strong>Modo Vista Previa</strong><br>
            No se detectó una impresora POS conectada.<br>
            Use esta vista para imprimir en cualquier impresora configurada en su sistema.
          </div>
          <pre>${contenido}</pre>
          <div class="qr-code">
            ${qrDataURL ? `<img src="${qrDataURL}" alt="QR Code" />` : `<small>QR: FACT-${factura.numero_factura}</small>`}
          </div>
          <div class="print-controls">
            <button onclick="window.print()" style="font-size: 10px; padding: 4px 8px; margin-right: 8px;">Imprimir en POS</button>
            <button onclick="window.close()" style="font-size: 10px; padding: 4px 8px;">Cancelar</button>
          </div>
          <script>
            // Intentar imprimir automáticamente si está en un entorno específico
            if (window.location.search.includes('autoPrint=true')) {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    ventanaImpresion.document.close();
    alert("Ventana de vista previa A7 abierta. Selecciona tu impresora POS y confirma la impresión.");
  };

  // Función para agregar QR code si es posible
  const agregarQRCodeSiEsPosible = async (contenido: string, factura: Factura | FacturaDetalle): Promise<string> => {
    try {
      const qrData = `FACT-${factura.numero_factura}-${factura.monto_total}`;
      const qrCode = await posprinter.generateQRCode(qrData);
      
      // Si tenemos un código QR, agregarlo al contenido
      if (qrCode) {
        return contenido + `\n\n[QR Code: ${qrData}]`;
      }
    } catch (error) {
      console.error("Error al generar QR code:", error);
    }
    
    return contenido;
  };

  const descargarFactura = (factura: Factura | FacturaDetalle) => {
    console.log("Descargando factura:", factura.numero_factura)

    const contenido = `FACTURA: ${factura.numero_factura}
FECHA: ${formatearFecha(factura.fecha_emision)}
CLIENTE: ${factura.nombre_cliente || "N/A"}
${
  factura.productos && factura.productos.length > 0
    ? factura.productos
        .map(
          (p) =>
            `${p.nombre} - Cant: ${p.cantidad} - Precio: L.${p.precio_unitario.toFixed(2)} - Total: L.${p.total.toFixed(2)}`,
        )
        .join("\n")
    : "No hay productos"
}
TOTAL: L. ${factura.monto_total.toFixed(2)}
CAI: ${factura.codigo_cai || "N/A"}
Estado: ${factura.anulada ? "ANULADA" : "ACTIVA"}`.trim()

    const blob = new Blob([contenido], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `factura-${factura.numero_factura}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatearFecha = (fechaString: string) => {
    try {
      const regex = /(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/
      const match = fechaString.match(regex)

      if (match) {
        const [, anio, mes, dia, horas, minutos] = match
        return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${anio} ${horas.padStart(2, "0")}:${minutos.padStart(2, "0")}`
      }

      const fechaSimpleRegex = /(\d{4})-(\d{2})-(\d{2})/
      const simpleMatch = fechaString.match(fechaSimpleRegex)

      if (simpleMatch) {
        const [, anio, mes, dia] = simpleMatch
        return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${anio} 00:00`
      }

      return fechaString
    } catch (error) {
      console.error("Error al formatear fecha:", error, fechaString)
      return fechaString
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
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between py-4">
            <div className="flex items-center space-x-4 w-full sm:w-auto">
              <Button variant="ghost" onClick={() => router.back()} className="flex-shrink-0">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mis Facturas</h1>
                <p className="text-xs sm:text-sm text-gray-600">Facturas generadas por mí</p>
                {usuarioAutenticado && (
                  <p className="text-xs text-gray-500">
                    Vendedor: {usuarioAutenticado.nombre} {usuarioAutenticado.apellido}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Buscador */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Search className="h-4 w-4 sm:h-5 sm:w-5" />
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
                className="pl-10 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
              Filtrar por Fecha de Emisión
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha Inicio</label>
                  <Input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha Fin</label>
                  <Input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="w-full text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button onClick={aplicarFiltroFecha} disabled={!fechaInicio || !fechaFin} className="w-full sm:w-auto">
                  Filtrar
                </Button>
                {filtroActivo && (
                  <Button variant="outline" onClick={limpiarFiltro} className="w-full sm:w-auto bg-transparent">
                    <X className="h-4 w-4 mr-2" />
                    Limpiar
                  </Button>
                )}
              </div>
            </div>
            {filtroActivo && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs sm:text-sm text-blue-700">
                  Mostrando facturas del {new Date(fechaInicio).toLocaleDateString("es-HN")} al{" "}
                  {new Date(fechaFin).toLocaleDateString("es-HN")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Facturas Emitidas</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{facturasActivas}</div>
              <p className="text-xs text-muted-foreground">facturas activas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Facturado</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">L. {totalFacturado.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">monto total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promedio por Factura</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">
                L. {facturasActivas > 0 ? (totalFacturado / facturasActivas).toFixed(2) : "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">promedio</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Mis Facturas Emitidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {facturasFiltradas.map((factura) => (
                <div
                  key={factura.id_factura}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1 mb-2 sm:mb-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-sm sm:text-base">{factura.numero_factura}</h4>
                      <Badge variant={factura.anulada ? "destructive" : "default"} className="text-xs">
                        {factura.anulada ? "Anulada" : "Activa"}
                      </Badge>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600">{factura.nombre_cliente}</p>

                    {factura.productos && factura.productos.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        <p className="font-medium">Productos:</p>
                        <div className="ml-2">
                          {factura.productos.slice(0, 2).map((producto, index) => (
                            <div key={index} className="flex justify-between">
                              <span>
                                {producto.nombre} x {producto.cantidad}
                              </span>
                              <span>L. {producto.total.toFixed(2)}</span>
                            </div>
                          ))}
                          {factura.productos.length > 2 && <p>y {factura.productos.length - 2} más...</p>}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-500 mt-1">{formatearFecha(factura.fecha_emision)}</p>
                    <p className="text-xs text-gray-500">CAI: {factura.codigo_cai}</p>
                  </div>

                  <div className="flex items-center justify-between w-full sm:w-auto sm:flex-col sm:items-end gap-2 sm:gap-4">
                    <p className="text-base sm:text-lg font-bold sm:mr-4">L. {factura.monto_total.toFixed(2)}</p>
                    <div className="flex gap-1 sm:gap-2">
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
                </div>
              ))}
            </div>

            {facturasFiltradas.length === 0 && !loading && (
              <div className="text-center py-8">
                <FileText className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No hay facturas</h3>
                <p className="text-sm text-gray-600">
                  {filtroActivo || terminoBusqueda
                    ? "No se encontraron facturas con los filtros aplicados"
                    : "No has generado ninguna factura aún"}
                </p>
              </div>
            )}

            {facturasFiltradas.length > 0 && (
              <div className="mt-4 text-xs sm:text-sm text-gray-600 text-center">
                Mostrando {facturasFiltradas.length} de {facturas.length} facturas en esta página
                {totalPages > 1 && ` (Página ${currentPage} de ${totalPages})`}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-center gap-2 mt-4 sm:mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="w-full sm:w-auto"
                >
                  Anterior
                </Button>
                <span className="flex items-center px-4 text-xs sm:text-sm">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="w-full sm:w-auto"
                >
                  Siguiente
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Detalle de Factura</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">Información completa de la factura</DialogDescription>
            </DialogHeader>

            {facturaSeleccionada && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
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
                    <Badge variant={facturaSeleccionada.anulada ? "destructive" : "default"} className="text-xs">
                      {facturaSeleccionada.anulada ? "Anulada" : "Activa"}
                    </Badge>
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <strong>Monto Total:</strong>
                    <p className="text-base sm:text-lg font-bold">L. {facturaSeleccionada.monto_total.toFixed(2)}</p>
                  </div>
                </div>

                {facturaSeleccionada.productos && facturaSeleccionada.productos.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2 text-sm sm:text-base">Detalles de la Venta:</h4>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-xs sm:text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left p-2 font-medium">Producto</th>
                            <th className="text-right p-2 font-medium">Cantidad</th>
                            <th className="text-right p-2 font-medium hidden sm:table-cell">Precio Unitario</th>
                            <th className="text-right p-2 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {facturaSeleccionada.productos.map((producto, index) => (
                            <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <td className="p-2">{producto.nombre}</td>
                              <td className="p-2 text-right">{producto.cantidad}</td>
                              <td className="p-2 text-right hidden sm:table-cell">
                                L. {producto.precio_unitario.toFixed(2)}
                              </td>
                              <td className="p-2 text-right">L. {producto.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-100">
                          <tr>
                            <td colSpan={3} className="p-2 text-right font-medium sm:col-span-3">
                              Total:
                            </td>
                            <td className="p-2 text-right font-medium">
                              L. {facturaSeleccionada.monto_total.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-4">
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