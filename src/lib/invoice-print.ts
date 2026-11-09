import { escapeHtml } from "./business"

export interface PrintableInvoice {
  numero_factura: string
  fecha_emision: string
  nombre_cliente: string
  nombre_vendedor: string | null
  codigo_cai: string
  monto_total: number
  anulada: boolean
  productos: { nombre: string; cantidad: number; precio_unitario: number; total: number }[]
}

export function invoicePrintHtml(invoice: PrintableInvoice): string {
  const money = (value: number) => `L. ${value.toFixed(2)}`
  const date = new Date(invoice.fecha_emision.slice(0, 10) + "T12:00:00Z").toLocaleDateString("es-HN", { timeZone: "America/Tegucigalpa" })
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${escapeHtml(invoice.numero_factura)}</title><style>
    @page{size:80mm auto;margin:4mm}body{font:12px monospace;color:#000;max-width:72mm;margin:0 auto;overflow-wrap:anywhere}h1{text-align:center;font-size:16px}table{width:100%;border-collapse:collapse}th,td{text-align:right;padding:5px 0;border-bottom:1px dashed #555}th:first-child,td:first-child{text-align:left}.total{text-align:right;font-size:16px;font-weight:bold}
    </style></head><body><h1>INVERSIONES MEJIA</h1><h1>FACTURA${invoice.anulada ? " ANULADA" : ""}</h1>
    <p>No: ${escapeHtml(invoice.numero_factura)}<br>Fecha: ${escapeHtml(date)}</p>
    <p>Cliente: ${escapeHtml(invoice.nombre_cliente)}<br>Vendedor: ${escapeHtml(invoice.nombre_vendedor || "No registrado")}</p>
    <table><thead><tr><th>Producto / precio</th><th>Cant.</th><th>Total</th></tr></thead><tbody>${invoice.productos.map(item => `<tr><td>${escapeHtml(item.nombre)}<br>${money(item.precio_unitario)} c/u</td><td>${item.cantidad}</td><td>${money(item.total)}</td></tr>`).join("")}</tbody></table>
    <p class="total">TOTAL: ${money(invoice.monto_total)}</p><p>CAI: ${escapeHtml(invoice.codigo_cai)}</p><p>Gracias por su compra</p></body></html>`
}
