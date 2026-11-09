"use client"

import { useEffect, useId, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { today } from "@/lib/business"

interface Seller { id_personal: number; vendedor: string; activo: boolean }
interface Month { id_personal: number; mes: number; ventas: number; efectivo: number; credito: number }
interface Report { anio: number; vendedores: Seller[]; meses: Month[] }
const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const money = (value: number) => new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" }).format(value)

function SellerChart({ seller, rows, maximum, year }: { seller: Seller; rows: Month[]; maximum: number; year: number }) {
  const id = useId(), [selected, setSelected] = useState<number | null>(null)
  const values = months.map((_, index) => rows.find(row => row.mes === index + 1) ?? { mes: index + 1, ventas: 0, efectivo: 0, credito: 0 })
  const totalCash = values.reduce((sum, row) => sum + row.efectivo, 0), totalCredit = values.reduce((sum, row) => sum + row.credito, 0)
  const detail = selected == null ? null : values[selected]
  return <article className="rounded-xl border p-4 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-semibold">{seller.vendedor}{!seller.activo && <span className="ml-2 text-xs text-gray-500">Inactivo</span>}</h3><p className="text-sm">Efectivo: <strong>{money(totalCash)}</strong> · Crédito: <strong>{money(totalCredit)}</strong></p></div>
    <div className="overflow-x-auto">
      <svg viewBox="0 0 840 270" className="w-full min-w-[660px]" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>Ventas mensuales de {seller.vendedor} en {year}</title>
        <desc id={`${id}-description`}>Barras verdes para efectivo y azules para crédito, en lempiras. Seleccione un mes para consultar los importes.</desc>
        {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="80" x2="830" y1={220 - tick * 50} y2={220 - tick * 50} stroke="#e5e7eb"/><text x="72" y={224 - tick * 50} textAnchor="end" fontSize="11" fill="#4b5563">{new Intl.NumberFormat("es-HN", { notation: "compact", maximumFractionDigits: 1 }).format(maximum * tick / 4)}</text></g>)}
        <text x="10" y="14" fontSize="11" fill="#4b5563">Lempiras</text>
        {values.map((row, index) => {
          const x = 90 + index * 62, cashHeight = row.efectivo / maximum * 200, creditHeight = row.credito / maximum * 200
          return <g key={row.mes} role="button" tabIndex={0} aria-label={`${months[index]}: efectivo ${money(row.efectivo)}, crédito ${money(row.credito)}`} aria-pressed={selected === index} className="cursor-pointer outline-none focus:stroke-gray-900" onClick={() => setSelected(index)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setSelected(index) } }}>
            <title>{months[index]} · Efectivo {money(row.efectivo)} · Crédito {money(row.credito)}</title>
            <rect x={x - 5} y="20" width="58" height="205" rx="4" fill={selected === index ? "#f1f5f9" : "transparent"}/>
            <rect x={x} y={220 - cashHeight} width="20" height={cashHeight} rx="2" fill="#15803d"/>
            <rect x={x + 24} y={220 - creditHeight} width="20" height={creditHeight} rx="2" fill="#2563eb"/>
            <text x={x + 22} y="245" textAnchor="middle" fontSize="12" fill="#374151">{months[index]}</text>
          </g>
        })}
      </svg>
    </div>
    {detail && <p role="status" className="rounded-md bg-gray-50 p-3 text-sm">{months[detail.mes - 1]} {year}: {detail.ventas} ventas · Efectivo <strong>{money(detail.efectivo)}</strong> · Crédito <strong>{money(detail.credito)}</strong></p>}
    {totalCash + totalCredit === 0 && <p className="text-sm text-gray-500">Sin ventas vigentes en este año.</p>}
    <details><summary className="cursor-pointer text-sm font-medium">Ver importes de los 12 meses</summary><div className="overflow-x-auto mt-3"><table className="w-full text-sm text-right"><caption className="sr-only">Ventas mensuales de {seller.vendedor}</caption><thead><tr className="border-b"><th scope="col" className="text-left py-2">Mes</th><th scope="col">Efectivo</th><th scope="col">Crédito</th><th scope="col">Total</th></tr></thead><tbody>{values.map(row => <tr key={row.mes} className="border-b"><th scope="row" className="text-left py-2 font-normal">{months[row.mes - 1]}</th><td>{money(row.efectivo)}</td><td>{money(row.credito)}</td><td>{money(row.efectivo + row.credito)}</td></tr>)}</tbody></table></div></details>
  </article>
}

export function MonthlySales() {
  const id = useId(), currentYear = Number(today().slice(0, 4))
  const [year, setYear] = useState(currentYear), [draft, setDraft] = useState(String(currentYear)), [seller, setSeller] = useState("todos")
  const [report, setReport] = useState<Report | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(""); setReport(null)
    void (async () => {
      try {
        const response = await fetch(`/API/reportes/ventas-mensuales?anio=${year}`, { signal: controller.signal, cache: "no-store" })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "No se pudo cargar el reporte mensual")
        if (!controller.signal.aborted) { setReport(result.data); setSeller("todos") }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Error de conexión") }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [year])
  const maximumValue = Math.max(1, ...(report?.meses.flatMap(row => [row.efectivo, row.credito]) ?? []))
  const magnitude = 10 ** Math.floor(Math.log10(maximumValue)), maximum = Math.ceil(maximumValue / magnitude) * magnitude
  const sellers = report?.vendedores.filter(item => seller === "todos" || String(item.id_personal) === seller) ?? []
  return <Card className="mb-8"><CardHeader><CardTitle>Ventas mensuales por vendedor</CardTitle><p className="text-sm text-gray-600">Ventas en efectivo y crédito otorgado por mes. Las ventas anuladas se excluyen.</p></CardHeader><CardContent className="space-y-5">
    <div className="flex flex-wrap gap-4 items-end">
      <form className="flex gap-2 items-end" onSubmit={event => { event.preventDefault(); if (/^\d{4}$/.test(draft) && Number(draft) >= 2000 && Number(draft) <= 9998) setYear(Number(draft)) }}><div className="space-y-1"><Label htmlFor={`${id}-year`}>Año</Label><Input id={`${id}-year`} type="number" min={2000} max={9998} step={1} required value={draft} onChange={event => setDraft(event.target.value)} className="w-28"/></div><Button type="submit">Consultar</Button></form>
      <div className="space-y-1"><Label htmlFor={`${id}-seller`}>Vendedor</Label><select id={`${id}-seller`} value={seller} disabled={loading} onChange={event => setSeller(event.target.value)} className="block h-9 max-w-full rounded-md border bg-white px-3 text-sm"><option value="todos">Todos los vendedores</option>{report?.vendedores.map(item => <option key={item.id_personal} value={item.id_personal}>{item.vendedor}</option>)}</select></div>
    </div>
    <div className="flex flex-wrap gap-4 text-sm"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-green-700"/>Efectivo</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-blue-600"/>Crédito</span></div>
    {loading && <p role="status">Cargando ventas mensuales…</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
    {!loading && !error && sellers.length === 0 && <p>No hay vendedores ni ventas para este año.</p>}
    {sellers.map(item => <SellerChart key={`${year}-${item.id_personal}`} seller={item} year={year} maximum={maximum} rows={report?.meses.filter(row => row.id_personal === item.id_personal) ?? []}/>)}
  </CardContent></Card>
}
