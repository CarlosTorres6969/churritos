"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  CalendarCheck,
  Filter,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ShoppingCart,
  Users,
  ChevronDown,
  X,
  Printer,
} from "lucide-react"

interface Liquidacion {
  tipo: "DETALLE" | "TOTAL_VENDEDOR" | "TOTAL_GENERAL"
  id_personal: number | null
  nombre_vendedor: string
  descripcion: string | null
  category: string | null
  precio_mayorista: number | null
  total_unidades: number | null
  liquidacion_vendedor: number | null
  liquidacion_empresa: number | null
  total_unidades_vendedor: number | null
  total_liquidacion_vendedor: number | null
  total_liquidacion_empresa: number | null
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
  liquidacion?: Liquidacion[]
}

interface Personal {
  id_personal: number
  nombre: string
  apellido: string
  rol: string
  activo: boolean
}

const CustomSelect = ({
  value,
  onValueChange,
  options,
  placeholder,
}: {
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={value ? "" : "text-muted-foreground"}>
          {value ? options.find((opt) => opt.value === value)?.label || placeholder : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 w-full mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
            {options.map((option) => (
              <div
                key={option.value}
                className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
                  value === option.value ? "bg-accent text-accent-foreground" : ""
                }`}
                onClick={() => {
                  onValueChange(option.value)
                  setIsOpen(false)
                }}
              >
                {option.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const DetallesCierreModal = ({
  cierre,
  isOpen,
  onClose,
}: { cierre: CierreDia | null; isOpen: boolean; onClose: () => void }) => {
  if (!isOpen || !cierre) return null

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "-"
    return new Intl.NumberFormat("es-HN", {
      style: "currency",
      currency: "HNL",
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-HN", { timeZone: "America/Tegucigalpa" })
  }

  const detalles = cierre.liquidacion?.filter((item) => item.tipo === "DETALLE") || []
  const totalesVendedor = cierre.liquidacion?.filter((item) => item.tipo === "TOTAL_VENDEDOR") || []
  const totalGeneral = cierre.liquidacion?.find((item) => item.tipo === "TOTAL_GENERAL")

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Detalles del Cierre</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700">Información General</h3>
            <p>
              <span className="font-medium">Fecha:</span> {formatDate(cierre.fecha_cierre)}
            </p>
            <p>
              <span className="font-medium">Vendedor:</span> {cierre.nombre_personal}
            </p>
            <p>
              <span className="font-medium">Fecha de Registro:</span> {formatDate(cierre.fecha_registro)}
            </p>
            <p className="flex items-center">
              <span className="font-medium mr-2">Estado:</span>
              <Badge variant={cierre.cerrado ? "default" : "secondary"}>
                {cierre.cerrado ? "Cerrado" : "Pendiente"}
              </Badge>
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700">Resumen Financiero</h3>
            <p>
              <span className="font-medium">Monto Total:</span> {formatCurrency(cierre.monto_total)}
            </p>
            <p>
              <span className="font-medium">Efectivo Recaudado:</span> {formatCurrency(cierre.efectivo_recaudado)}
            </p>
            <p>
              <span className="font-medium">Crédito Pendiente:</span> {formatCurrency(cierre.total_credito)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700">Estadísticas de Ventas</h3>
            <p>
              <span className="font-medium">Total Ventas:</span> {cierre.total_ventas}
            </p>
            <p>
              <span className="font-medium">Ventas Efectivo:</span> {cierre.ventas_efectivo}
            </p>
            <p>
              <span className="font-medium">Ventas Crédito:</span> {cierre.ventas_credito}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700">Métricas Operativas</h3>
            <p>
              <span className="font-medium">Clientes Atendidos:</span> {cierre.clientes_atendidos}
            </p>
            <p>
              <span className="font-medium">Productos Vendidos:</span> {cierre.productos_vendidos}
            </p>
          </div>
        </div>

        {cierre.liquidacion && cierre.liquidacion.length > 0 ? (
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-4">Liquidación de Ventas</h3>

            {detalles.length > 0 && (
              <div className="mb-6">
                <h4 className="font-medium text-gray-600 mb-2">Detalle por Producto</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Tipo Precio</TableHead>
                      <TableHead className="text-right">Precio Mayorista</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Liquidación Vendedor</TableHead>
                      <TableHead className="text-right">Liquidación Empresa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalles.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.nombre_vendedor}</TableCell>
                        <TableCell>{item.descripcion || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.category || "-"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.precio_mayorista ? formatCurrency(item.precio_mayorista) : "-"}
                        </TableCell>
                        <TableCell className="text-right">{item.total_unidades || "-"}</TableCell>
                        <TableCell className="text-right">
                          {item.liquidacion_vendedor ? formatCurrency(item.liquidacion_vendedor) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.liquidacion_empresa ? formatCurrency(item.liquidacion_empresa) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalesVendedor.length > 0 && (
              <div className="mb-6">
                <h4 className="font-medium text-gray-600 mb-2">Totales por Vendedor</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Total Unidades</TableHead>
                      <TableHead className="text-right">Total Liquidación Vendedor</TableHead>
                      <TableHead className="text-right">Total Liquidación Empresa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {totalesVendedor.map((item, index) => (
                      <TableRow key={index} className="font-semibold bg-gray-50">
                        <TableCell>{item.nombre_vendedor}</TableCell>
                        <TableCell className="text-right">{item.total_unidades_vendedor || "-"}</TableCell>
                        <TableCell className="text-right">
                          {item.total_liquidacion_vendedor ? formatCurrency(item.total_liquidacion_vendedor) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.total_liquidacion_empresa ? formatCurrency(item.total_liquidacion_empresa) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalGeneral && (
              <div className="mb-6">
                <h4 className="font-medium text-gray-600 mb-2">Total General</h4>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Total Unidades</p>
                      <p className="text-lg font-bold">{totalGeneral.total_unidades_vendedor || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Total Liquidación Vendedores</p>
                      <p className="text-lg font-bold text-green-600">
                        {totalGeneral.total_liquidacion_vendedor
                          ? formatCurrency(totalGeneral.total_liquidacion_vendedor)
                          : formatCurrency(0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Total Liquidación Empresa</p>
                      <p className="text-lg font-bold text-blue-600">
                        {totalGeneral.total_liquidacion_empresa
                          ? formatCurrency(totalGeneral.total_liquidacion_empresa)
                          : formatCurrency(0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-6 text-center">
            <p className="text-gray-500">No hay datos de liquidación disponibles para este cierre.</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CierresPage() {
  const [cierres, setCierres] = useState<CierreDia[]>([])
  const [personal, setPersonal] = useState<Personal[]>([])
  const [loading, setLoading] = useState(true)
  const [fechaFilter, setFechaFilter] = useState("")
  const [vendedorFilter, setVendedorFilter] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedCierre, setSelectedCierre] = useState<CierreDia | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const pageSize = 10
  const router = useRouter()

  const loadCierres = useCallback(async () => {
    try {
      setLoading(true)
      let url = `/API/Cierre-dia?page=${currentPage}&pageSize=${pageSize}`

      if (fechaFilter) {
        url += `&fecha=${fechaFilter}`
      }

      if (vendedorFilter) {
        url += `&id_vendedor=${vendedorFilter}`
      }

      const response = await fetch(url)
      const data = await response.json()

      if (data.success) {
        if (fechaFilter) {
          setCierres(
            (data.data.cierres || []).map((cierre: CierreDia) => ({
              ...cierre,
              liquidacion: (data.data.liquidacion || []).filter(
                (item: Liquidacion) => item.id_personal === cierre.id_personal || item.id_personal === null,
              ),
            })),
          )
          setTotalPages(1)
          setTotalCount(data.data.cierres?.length || 0)
        } else {
          setCierres(data.data.cierres || [])
          setTotalPages(data.data.pagination?.totalPages || 1)
          setTotalCount(data.data.pagination?.total || 0)
        }
      } else {
        console.error("Error loading closures:", data.error)
        setCierres([])
        setTotalPages(1)
        setTotalCount(0)
      }
    } catch (error) {
      console.error("Error fetching closures:", error)
      setCierres([])
      setTotalPages(1)
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [currentPage, fechaFilter, vendedorFilter, pageSize])

  const loadPersonal = useCallback(async () => {
    try {
      const response = await fetch("/API/Personal")
      const data = await response.json()

      if (Array.isArray(data)) {
        setPersonal(data.filter((p: Personal) => p.rol === "vendedor" && p.activo))
      } else if (data.data && Array.isArray(data.data)) {
        setPersonal(data.data.filter((p: Personal) => p.rol === "vendedor" && p.activo))
      }
    } catch (error) {
      console.error("Error fetching personal:", error)
    }
  }, [])

  useEffect(() => {
    const userData = localStorage.getItem("user")
    if (!userData) {
      router.push("/")
      return
    }

    const parsedUser = JSON.parse(userData)
    if (parsedUser.rol !== "administrador" && parsedUser.rol !== "admin") {
      router.push("/")
      return
    }

    loadCierres()
    loadPersonal()
  }, [router, loadCierres, loadPersonal])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentPage(1)
    loadCierres()
  }

  const clearFilters = () => {
    setFechaFilter("")
    setVendedorFilter("")
    setCurrentPage(1)
    loadCierres()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-HN", {
      style: "currency",
      currency: "HNL",
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-HN", { timeZone: "America/Tegucigalpa" })
  }

  const handleExport = () => {
    const headers =
      "Fecha,Vendedor,Ventas Total,Ventas Efectivo,Ventas Crédito,Efectivo Recaudado,Crédito Pendiente,Clientes,Productos,Monto Total\n"
    const csvContent = cierres
      .map(
        (cierre) =>
          `"${formatDate(cierre.fecha_cierre)}","${cierre.nombre_personal}",${cierre.total_ventas},${cierre.ventas_efectivo},${cierre.ventas_credito},${cierre.efectivo_recaudado},${cierre.total_credito},${cierre.clientes_atendidos},${cierre.productos_vendidos},${cierre.monto_total}`,
      )
      .join("\n")

    const blob = new Blob([headers + csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cierres-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleViewDetails = async (cierreParam: CierreDia) => {
    let cierre = cierreParam
    if (!cierre.liquidacion || cierre.liquidacion.length === 0) {
      try {
        const response = await fetch(`/API/Cierre-dia?fecha=${cierre.fecha_cierre}&id_vendedor=${cierre.id_personal}`)
        const data = await response.json()
        if (data.success) {
          cierre = {
            ...cierre,
            liquidacion: data.data.liquidacion,
          }
        }
      } catch (error) {
        console.error("Error fetching liquidation:", error)
      }
    }
    setSelectedCierre(cierre)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedCierre(null)
  }

  const vendedorOptions = [
    { value: "", label: "Todos los vendedores" },
    ...personal.map((v) => ({
      value: v.id_personal.toString(),
      label: `${v.nombre} ${v.apellido}`,
    })),
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Gestión de Cierres Diarios</h1>
              <p className="text-sm text-gray-600">
                Administra y revisa los cierres de caja y liquidaciones de los vendedores
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button onClick={() => router.push("/admin")}>Volver al Dashboard</Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filtros de Búsqueda</CardTitle>
            <CardDescription>Filtra los cierres por fecha o vendedor</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <form onSubmit={handleSearch} className="flex-1 flex flex-col md:flex-row gap-4">
                <Input
                  type="date"
                  value={fechaFilter}
                  onChange={(e) => setFechaFilter(e.target.value)}
                  className="flex-1"
                />
                <CustomSelect
                  value={vendedorFilter}
                  onValueChange={setVendedorFilter}
                  options={vendedorOptions}
                  placeholder="Filtrar por vendedor"
                />
                <div className="flex gap-2">
                  <Button type="submit">
                    <Filter className="h-4 w-4 mr-2" />
                    Filtrar
                  </Button>
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Limpiar
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cierres</CardTitle>
              <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
              <p className="text-xs text-muted-foreground">Cierres registrados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(cierres.reduce((sum, cierre) => sum + cierre.monto_total, 0))}
              </div>
              <p className="text-xs text-muted-foreground">En todos los cierres</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas Totales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{cierres.reduce((sum, cierre) => sum + cierre.total_ventas, 0)}</div>
              <p className="text-xs text-muted-foreground">Transacciones realizadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes Atendidos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {cierres.reduce((sum, cierre) => sum + cierre.clientes_atendidos, 0)}
              </div>
              <p className="text-xs text-muted-foreground">Clientes en total</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Registros de Cierres</CardTitle>
              <CardDescription>{totalCount} cierres encontrados</CardDescription>
            </div>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Cierres
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : cierres.length === 0 ? (
              <div className="text-center py-12">
                <CalendarCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No hay cierres registrados</h3>
                <p className="text-gray-500 mt-2">No se encontraron cierres con los filtros aplicados.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Ventas Total</TableHead>
                      <TableHead className="text-right">Ventas Efectivo</TableHead>
                      <TableHead className="text-right">Ventas Crédito</TableHead>
                      <TableHead className="text-right">Efectivo Recaudado</TableHead>
                      <TableHead className="text-right">Crédito Pendiente</TableHead>
                      <TableHead className="text-right">Clientes</TableHead>
                      <TableHead className="text-right">Productos</TableHead>
                      <TableHead className="text-right">Monto Total</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cierres.map((cierre) => (
                      <TableRow key={cierre.id_cierre}>
                        <TableCell className="font-medium">{formatDate(cierre.fecha_cierre)}</TableCell>
                        <TableCell>{cierre.nombre_personal}</TableCell>
                        <TableCell className="text-right">{cierre.total_ventas}</TableCell>
                        <TableCell className="text-right">{cierre.ventas_efectivo}</TableCell>
                        <TableCell className="text-right">{cierre.ventas_credito}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cierre.efectivo_recaudado)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cierre.total_credito)}</TableCell>
                        <TableCell className="text-right">{cierre.clientes_atendidos}</TableCell>
                        <TableCell className="text-right">{cierre.productos_vendidos}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(cierre.monto_total)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(cierre)}
                            title="Ver detalles"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {(currentPage - 1) * pageSize + 1} a {Math.min(currentPage * pageSize, totalCount)} de{" "}
                      {totalCount} resultados
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum
                        if (totalPages <= 5) {
                          pageNum = i + 1
                        } else if (currentPage <= 3) {
                          pageNum = i + 1
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i
                        } else {
                          pageNum = currentPage - 2 + i
                        }

                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        )
                      })}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <DetallesCierreModal cierre={selectedCierre} isOpen={isModalOpen} onClose={closeModal} />
      </div>
    </div>
  )
}