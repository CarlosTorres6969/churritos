export class DomainError extends Error {
  constructor(message: string, public status = 400, public code = "VALIDATION") { super(message) }
}

export const TIME_ZONE = "America/Tegucigalpa"
export type PriceType = "completo" | "medio" | "mayorista" | "mayorista2"
export const SPECIAL_PRODUCTS = ["G", "C", "MEGA", "CCP", "CHF", "CF"]

export function today(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now)
}
export function formatBusinessDate(value: string | Date): string {
  return new Date(dateOnly(value) + "T12:00:00Z").toLocaleDateString("es-HN", { timeZone: TIME_ZONE })
}

export function validDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DomainError("Fecha inválida")
  const date = new Date(value + "T12:00:00Z")
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new DomainError("Fecha inválida")
  return value
}

export function addDays(date: string, days: number): string {
  const value = new Date(validDate(date) + "T12:00:00Z")
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function dayOfWeek(date = today()): number { return new Date(validDate(date) + "T12:00:00Z").getUTCDay() || 7 }
export function dateOnly(value: string | Date): string { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10) }
export function positiveId(value: unknown, name = "ID"): number {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0 || number > 2147483647) throw new DomainError(`${name} inválido`)
  return number
}
export function cents(value: unknown, allowZero = false): number {
  if (typeof value !== "number" && typeof value !== "string") throw new DomainError("Monto inválido")
  if (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value)) throw new DomainError("Monto inválido")
  const number = Number(value)
  const amount = Math.round(number * 100)
  if (!Number.isSafeInteger(amount) || amount > 9999999999 || amount < (allowZero ? 0 : 1) || Math.abs(number * 100 - amount) > 0.00001) throw new DomainError("Monto inválido; use como máximo dos decimales")
  return amount
}
export function text(value: unknown, name: string, max: number, required = true): string {
  if (value == null && !required) return ""
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new DomainError(`${name} inválido`)
  return value.trim()
}
export function passwordValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128) throw new DomainError("Contraseña inválida")
  return value
}
export function pagination(params: URLSearchParams) {
  const page = positiveId(params.get("page") || "1", "Página")
  const pageSize = positiveId(params.get("pageSize") || params.get("limit") || "10", "Tamaño de página")
  if (pageSize > 100) throw new DomainError("El máximo es 100 registros por página")
  const offset = (page - 1) * pageSize
  if (offset > 2147483647) throw new DomainError("Página fuera de rango")
  return { page, pageSize, offset }
}
export function productCode(description?: string | null): string {
  const tokens: string[] = (description || "").toUpperCase().match(/[A-Z0-9]+/g) || []
  return ["MINIORI", "CHF", "CCP", "MEGA", "L4", "L3", "CF", "ORI", "G", "C"].find(code => tokens.includes(code)) || ""
}
export function availablePrices(customerType: string, description?: string | null): PriceType[] {
  if (customerType?.trim().toLowerCase().includes("mayorista")) return ["mayorista", "mayorista2"]
  return SPECIAL_PRODUCTS.includes(productCode(description)) ? ["completo"] : ["completo", "medio"]
}
export function stockUnits(quantity: number, price: PriceType): number { return quantity * (price === "medio" ? 0.5 : 1) }
export function paymentBalances(balance: number, overdue: number, payment: number) {
  const current = cents(balance, true), late = cents(overdue, true), amount = cents(payment)
  if (late > current || amount > current) throw new DomainError("El pago excede la deuda pendiente")
  return { saldo_actual: (current - amount) / 100, saldo_vencido: Math.max(0, late - amount) / 100 }
}
export function commission(description: string, priceType: PriceType, quantity: number, fullPrice: number, wholesalePrice: number) {
  const code = productCode(description), wholesale = priceType.startsWith("mayorista")
  let units = stockUnits(quantity, priceType), seller = 0, company = 0
  if (code === "L4" || code === "L3") {
    if (wholesale) {
      units = quantity
      seller = code === "L4" ? 4 : 3
      company = code === "L4" ? (wholesalePrice === 154 ? 17.648 : 13.648) : (wholesalePrice === 113 ? 10.736 : 7.736)
    } else { seller = code === "L4" ? 6 : 5; company = code === "L4" ? 21.648 : 15.736 }
  } else if (code === "G" || code === "C") {
    units = wholesale ? quantity * (wholesalePrice === 38.5 ? 2 : 1) : quantity * (fullPrice === 20 ? 0.5 : 1)
    seller = wholesale && code === "G" && wholesalePrice === 18.8 ? 1 : 2
    company = wholesale ? (wholesalePrice === 38.5 ? 3.412 : 1.46) : 4.9
  } else {
    const rates: Record<string, [number, number]> = { CHF: [1.49, 3], CF: [1.2, 3], ORI: [1, 1.4], MINIORI: [1, 1.4], MEGA: [2, 3.184], CCP: [1, 1.4] }
    ;[seller, company] = rates[code] || [0, 0]
  }
  return { units, seller: Number((units * seller).toFixed(4)), company: Number((units * company).toFixed(4)) }
}
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
}
export function csvCell(value: unknown): string {
  let text = String(value ?? "")
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}
