"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Movement { id_auditoria: number; fecha: string; responsable: string | null; anterior: number; cantidad: number; operacion: string | null }
export function InventoryHistory({ id, name }: { id: number; name: string }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [pages, setPages] = useState(1)
  const [items, setItems] = useState<Movement[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("")
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true); setError(""); setItems([])
    void (async () => {
      try {
        const response = await fetch(`/API/inventario-ruta/historial?id_inventario_ruta=${id}&page=${page}&pageSize=10`, { signal: controller.signal, cache: "no-store" })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "No se pudo cargar el historial")
        if (!controller.signal.aborted) { setItems(result.data); setPages(result.pagination.totalPages || 1) }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Error de conexión") }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [open, id, page])
  return <>
    <Button variant="outline" size="sm" onClick={() => { setPage(1); setOpen(true) }}>Ver historial</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Historial de inventario · {name}</DialogTitle><DialogDescription>Reposiciones y ajustes registrados, con las existencias antes y después de cada actualización.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading ? <p>Cargando historial…</p> : <div className="space-y-3">
        {items.length === 0 && !error && <p>No hay reposiciones ni ajustes registrados.</p>}
        {items.map(item => <article key={item.id_auditoria} className="rounded-lg border p-3 text-sm space-y-2">
          <div className="flex flex-wrap justify-between gap-2"><strong>{item.operacion === "agregar" ? "Reposición" : "Ajuste / registro"}</strong><time>{new Date(item.fecha).toLocaleString("es-HN", { timeZone: "America/Tegucigalpa" })}</time></div>
          <dl className="grid grid-cols-3 gap-2"><div><dt>Anterior</dt><dd className="font-semibold">{item.anterior}</dd></div><div><dt>Movimiento</dt><dd className="font-semibold">{item.cantidad - item.anterior > 0 ? "+" : ""}{item.cantidad - item.anterior}</dd></div><div><dt>Resultado</dt><dd className="font-semibold">{item.cantidad}</dd></div></dl>
          <p className="text-gray-600">Registrado por: {item.responsable || "Usuario no disponible"}</p>
        </article>)}
      </div>}
      <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><span className="text-sm">Página {page} de {pages}</span><Button variant="outline" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>Siguiente</Button></div>
    </DialogContent></Dialog>
  </>
}
