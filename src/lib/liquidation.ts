export interface LiquidationDetail {
  tipo: "DETALLE"
  id_personal: number
  nombre_vendedor: string
  id_producto: number
  descripcion: string | null
  category: string | null
  precio_unitario: number | null
  cantidad_vendida: number
  total_unidades: number | null
  liquidacion_vendedor: number | null
  liquidacion_empresa: number | null
  requiere_revision: number | boolean
  recalculado?: number | boolean
}

export interface LiquidationTotal {
  tipo: "TOTAL_VENDEDOR" | "TOTAL_GENERAL"
  id_personal: number | null
  nombre_vendedor: string
  cantidad_vendida: number
  total_unidades_vendedor: number | null
  total_liquidacion_vendedor: number | null
  total_liquidacion_empresa: number | null
  requiere_revision: boolean
  recalculado?: boolean
}

export type Liquidation = LiquidationDetail | LiquidationTotal

function sumKnown(values: (number | null | undefined)[]): number | null {
  if (values.some(value => value == null)) return null
  return Number(values.reduce<number>((sum, value) => sum + Number(value), 0).toFixed(4))
}

export function mergeLiquidationDetails(rows: LiquidationDetail[]): LiquidationDetail[] {
  const groups = new Map<string, LiquidationDetail[]>()
  for (const row of rows) {
    const key = JSON.stringify([
      row.id_personal,
      row.descripcion?.trim().toLocaleLowerCase() ?? null,
      row.category?.trim().toLocaleLowerCase() ?? null,
      row.precio_unitario,
    ])
    const group = groups.get(key) || []
    group.push(row); groups.set(key, group)
  }
  return [...groups.values()].map(group => ({
    ...group[0],
    cantidad_vendida: group.reduce((sum, row) => sum + Number(row.cantidad_vendida), 0),
    total_unidades: sumKnown(group.map(row => row.total_unidades)),
    liquidacion_vendedor: sumKnown(group.map(row => row.liquidacion_vendedor)),
    liquidacion_empresa: sumKnown(group.map(row => row.liquidacion_empresa)),
    requiere_revision: group.some(row => Boolean(row.requiere_revision)),
    recalculado: group.some(row => Boolean(row.recalculado)),
  }))
}

export function summarizeLiquidation(details: LiquidationDetail[]): Liquidation[] {
  const totals: LiquidationTotal[] = [...new Set(details.map(row => row.id_personal))].map(id => {
    const rows = details.filter(row => row.id_personal === id)
    return {
      tipo: "TOTAL_VENDEDOR", id_personal: id, nombre_vendedor: rows[0].nombre_vendedor,
      cantidad_vendida: rows.reduce((sum, row) => sum + Number(row.cantidad_vendida), 0),
      total_unidades_vendedor: sumKnown(rows.map(row => row.total_unidades)),
      total_liquidacion_vendedor: sumKnown(rows.map(row => row.liquidacion_vendedor)),
      total_liquidacion_empresa: sumKnown(rows.map(row => row.liquidacion_empresa)),
      requiere_revision: rows.some(row => Boolean(row.requiere_revision) || row.total_unidades == null || row.liquidacion_vendedor == null || row.liquidacion_empresa == null),
      recalculado: rows.some(row => Boolean(row.recalculado)),
    }
  })
  const general: LiquidationTotal = {
    tipo: "TOTAL_GENERAL", id_personal: null, nombre_vendedor: "",
    cantidad_vendida: totals.reduce((sum, row) => sum + row.cantidad_vendida, 0),
    total_unidades_vendedor: sumKnown(totals.map(row => row.total_unidades_vendedor)),
    total_liquidacion_vendedor: sumKnown(totals.map(row => row.total_liquidacion_vendedor)),
    total_liquidacion_empresa: sumKnown(totals.map(row => row.total_liquidacion_empresa)),
    requiere_revision: totals.some(row => row.requiere_revision),
    recalculado: totals.some(row => row.recalculado),
  }
  return [...details, ...totals, general]
}

export function liquidationForVendor(rows: Liquidation[], vendor: number): Liquidation[] {
  const selected = rows.filter(row => row.id_personal === vendor)
  const total = selected.find((row): row is LiquidationTotal => row.tipo === "TOTAL_VENDEDOR")
  return total ? [...selected, { ...total, tipo: "TOTAL_GENERAL", id_personal: null, nombre_vendedor: "" }] : selected
}
