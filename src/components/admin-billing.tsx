"use client"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { invoicePrintHtml, type PrintableInvoice } from "@/lib/invoice-print"

interface CAI { id_cai: number; codigo_cai: string; fecha_inicio: string; fecha_fin: string; rango_inicial: number; rango_final: number; siguiente_numero: number; activo: boolean; facturas_emitidas: number }
interface Invoice extends PrintableInvoice { id_factura: number }
const empty = { codigo_cai: "", fecha_inicio: "", fecha_fin: "", rango_inicial: 1, rango_final: 1000, activo: false }
const money = (value: number) => new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" }).format(value)
const date = (value: string) => new Date(value.slice(0, 10) + "T12:00:00Z").toLocaleDateString("es-HN", { timeZone: "America/Tegucigalpa" })
export default function AdminBilling() {
  const router = useRouter(), [invoices, setInvoices] = useState<Invoice[]>([]), [cais, setCais] = useState<CAI[]>([])
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [caiPage, setCaiPage] = useState(1), [caiPages, setCaiPages] = useState(1)
  const [totals, setTotals] = useState({ total_facturas: 0, total_facturado: 0, facturas_anuladas: 0 })
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const [editing, setEditing] = useState<CAI | null>(null), [open, setOpen] = useState(false), [form, setForm] = useState(empty), [selected, setSelected] = useState<Invoice | null>(null)
  const load = useCallback(async () => {
    try {
      const responses = await Promise.all([fetch(`/API/Factura?page=${page}&pageSize=10`), fetch(`/API/CAI?page=${caiPage}&limit=10`), fetch("/API/resumen")])
      const [facturas, autorizaciones, summary] = await Promise.all(responses.map(response => response.json()))
      if (responses.some(response => !response.ok)) throw new Error(facturas.error || autorizaciones.error || summary.error || "No se pudieron cargar los datos")
      setInvoices(facturas.data.facturas); setPages(facturas.data.pagination.totalPages || 1)
      setCais(autorizaciones.data.items); setCaiPages(autorizaciones.data.totalPages || 1); setTotals(summary.data)
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Error de conexión") }
    finally { setLoading(false) }
  }, [page, caiPage])
  useEffect(() => { void load() }, [load])
  const save = async () => {
    setBusy(true); setError("")
    try {
      const response = await fetch(editing ? `/API/CAI?id_cai=${editing.id_cai}` : "/API/CAI", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setOpen(false); await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo guardar") }
    finally { setBusy(false) }
  }
  const activate = async (cai: CAI) => {
    setBusy(true); setError("")
    try { const response = await fetch(`/API/CAI?id_cai=${cai.id_cai}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo: !cai.activo }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await load() }
    catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo actualizar") }
    finally { setBusy(false) }
  }
  const annul = async (item: Invoice) => {
    const reason = window.prompt("Anular repone los productos en la ruta original y revierte la venta y su deuda de crédito. Solo se permite con la jornada abierta y sin pagos aplicados. Se conserva la factura anulada. Escriba el motivo (mínimo 10 caracteres):")
    if (!reason) return
    setBusy(true); setError("")
    try { const response = await fetch("/API/Factura", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_factura: item.id_factura, motivo: reason }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setSelected(null); await load() }
    catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo anular") }
    finally { setBusy(false) }
  }
  const printInvoice = (item: Invoice) => {
    const preview = window.open("", "_blank", "width=420,height=700")
    if (!preview) { setError("Permita las ventanas emergentes para imprimir la factura"); return }
    preview.opener = null
    preview.document.write(invoicePrintHtml(item)); preview.document.close(); preview.focus(); preview.print()
  }
  const immutable = Boolean(editing?.facturas_emitidas)
  if (loading) return <main className="min-h-screen grid place-items-center">Cargando facturación…</main>
  return <main className="min-h-screen bg-gray-50 p-4 md:p-8"><div className="max-w-6xl mx-auto space-y-6">
    <div className="flex items-center gap-4"><Button variant="outline" onClick={() => router.push("/admin")}>Volver</Button><h1 className="text-2xl font-bold">Facturas y CAI</h1></div>
    {error && <p role="alert" className="rounded-md bg-red-50 border border-red-200 p-3 text-red-800">{error}</p>}
    <div className="grid sm:grid-cols-3 gap-4">{[["Total facturas", totals.total_facturas], ["Facturación vigente", money(totals.total_facturado)], ["Anuladas", totals.facturas_anuladas]].map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{value}</CardContent></Card>)}</div>
    <Tabs defaultValue="facturas"><TabsList><TabsTrigger value="facturas">Facturas</TabsTrigger><TabsTrigger value="cai">CAI</TabsTrigger></TabsList>
      <TabsContent value="facturas"><Card><CardHeader><CardTitle>Facturas emitidas</CardTitle></CardHeader><CardContent className="space-y-4">
        {invoices.length === 0 && <p>No hay facturas registradas.</p>}
        {invoices.map(item => <article key={item.id_factura} className="border rounded-lg p-4 flex flex-wrap justify-between gap-4">
          <div><h2 className="font-semibold">{item.numero_factura}</h2><p>{item.nombre_cliente}</p><p className="text-sm text-gray-600">Vendedor: {item.nombre_vendedor || "No registrado"}</p><p className="text-sm text-gray-600">{date(item.fecha_emision)} · {money(item.monto_total)}</p><Badge variant={item.anulada ? "destructive" : "default"}>{item.anulada ? "Anulada" : "Vigente"}</Badge></div>
          <div className="flex flex-wrap gap-2 items-center"><Button variant="outline" onClick={() => setSelected(item)}>Ver</Button><Button variant="outline" onClick={() => printInvoice(item)}>Imprimir</Button><Button variant="destructive" disabled={busy || item.anulada} onClick={() => annul(item)}>Anular</Button></div>
        </article>)}
        <div className="flex justify-between items-center"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><span>Página {page} de {pages}</span><Button variant="outline" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Siguiente</Button></div>
      </CardContent></Card></TabsContent>
      <TabsContent value="cai"><Card><CardHeader className="flex flex-row justify-between items-center"><CardTitle>Autorizaciones CAI</CardTitle><Button onClick={() => { setEditing(null); setForm(empty); setError(""); setOpen(true) }}>Nuevo CAI</Button></CardHeader><CardContent className="space-y-4">{cais.length === 0 && <p>No hay CAI configurados.</p>}{cais.map(cai => <article key={cai.id_cai} className="border rounded-lg p-4 space-y-2"><div className="flex justify-between gap-3"><h2 className="font-semibold break-all">{cai.codigo_cai}</h2><Badge variant={cai.activo ? "default" : "secondary"}>{cai.activo ? "Activo" : "Inactivo"}</Badge></div><p>Vigencia: {date(cai.fecha_inicio)} — {date(cai.fecha_fin)}</p><p>Rango: {cai.rango_inicial} — {cai.rango_final} · Siguiente: {cai.siguiente_numero}</p><p>Facturas emitidas: {cai.facturas_emitidas}</p><div className="flex gap-2"><Button variant="outline" onClick={() => { setEditing(cai); setForm({ codigo_cai: cai.codigo_cai, fecha_inicio: cai.fecha_inicio.slice(0, 10), fecha_fin: cai.fecha_fin.slice(0, 10), rango_inicial: cai.rango_inicial, rango_final: cai.rango_final, activo: cai.activo }); setError(""); setOpen(true) }}>Editar</Button><Button disabled={busy} onClick={() => activate(cai)}>{cai.activo ? "Desactivar" : "Activar"}</Button></div></article>)}<div className="flex justify-between items-center"><Button variant="outline" disabled={caiPage <= 1} onClick={() => setCaiPage(value => value - 1)}>Anterior</Button><span>Página {caiPage} de {caiPages}</span><Button variant="outline" disabled={caiPage >= caiPages} onClick={() => setCaiPage(value => value + 1)}>Siguiente</Button></div></CardContent></Card></TabsContent>
    </Tabs>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "Editar CAI" : "Nuevo CAI"}</DialogTitle><DialogDescription>{immutable ? "La autorización emitida se conserva; puede cambiar su estado." : "Configura la vigencia y el rango autorizado."}</DialogDescription></DialogHeader><form className="grid gap-3" onSubmit={event => { event.preventDefault(); void save() }}><Label htmlFor="cai-code">Código CAI</Label><Input id="cai-code" value={form.codigo_cai} disabled={immutable} required maxLength={50} onChange={event => setForm({ ...form, codigo_cai: event.target.value })}/><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="cai-start">Fecha inicio</Label><Input id="cai-start" type="date" value={form.fecha_inicio} disabled={immutable} required onChange={event => setForm({ ...form, fecha_inicio: event.target.value })}/></div><div><Label htmlFor="cai-end">Fecha fin</Label><Input id="cai-end" type="date" value={form.fecha_fin} disabled={immutable} required onChange={event => setForm({ ...form, fecha_fin: event.target.value })}/></div><div><Label htmlFor="cai-first">Rango inicial</Label><Input id="cai-first" type="number" min={1} value={form.rango_inicial} disabled={immutable} required onChange={event => setForm({ ...form, rango_inicial: Number(event.target.value) })}/></div><div><Label htmlFor="cai-last">Rango final</Label><Input id="cai-last" type="number" min={1} value={form.rango_final} disabled={immutable} required onChange={event => setForm({ ...form, rango_final: Number(event.target.value) })}/></div></div><Label className="flex gap-2"><input type="checkbox" checked={form.activo} onChange={event => setForm({ ...form, activo: event.target.checked })}/>CAI activo</Label>{error && <p role="alert" className="text-red-700">{error}</p>}<Button disabled={busy}>Guardar</Button></form></DialogContent></Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={value => { if (!value) setSelected(null) }}><DialogContent><DialogHeader><DialogTitle>Detalle de factura</DialogTitle><DialogDescription>{selected?.numero_factura}</DialogDescription></DialogHeader>{selected && <div className="space-y-3"><p>{selected.nombre_cliente}</p><p>Vendedor: {selected.nombre_vendedor || "No registrado"}</p><p>{date(selected.fecha_emision)} · {selected.codigo_cai}</p>{selected.productos.map((item, index) => <div key={index} className="flex justify-between gap-3 border-b py-2"><span>{item.nombre} × {item.cantidad}<br/><small>{money(item.precio_unitario)} c/u</small></span><strong>{money(item.total)}</strong></div>)}<p className="text-xl font-bold text-right">Total: {money(selected.monto_total)}</p><Button onClick={() => printInvoice(selected)}>Imprimir factura</Button></div>}</DialogContent></Dialog>
  </div></main>
}
