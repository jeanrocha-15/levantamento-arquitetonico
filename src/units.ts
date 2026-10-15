export type MeasurementUnit = 'mm' | 'cm' | 'm'
// Canonical lengths remain in meters to preserve the existing geometry and data.
const factors: Record<MeasurementUnit, number> = { mm: 1000, cm: 100, m: 1 }
export const unitNames: Record<MeasurementUnit, string> = { mm: 'Milímetros', cm: 'Centímetros', m: 'Metros' }
export const isMeasurementUnit = (value: unknown): value is MeasurementUnit => value === 'mm' || value === 'cm' || value === 'm'
export function toDisplay(valueM: number, unit: MeasurementUnit): number { return valueM * factors[unit] }
export function toCanonical(value: number, unit: MeasurementUnit): number { return value / factors[unit] }
// Conversão entre unidades (mm ↔ cm ↔ m). 15 algarismos significativos removem o ruído binário
// (1,23 m → 1230 mm, e não 1230,0000000000002) sem alterar nenhuma medida real.
export function convertMeasurement(value: number, from: MeasurementUnit, to: MeasurementUnit): number {
  if (from === to || !Number.isFinite(value)) return value
  return Number((value * factors[to] / factors[from]).toPrecision(15))
}
export function parseMeasurement(text: string, unit: MeasurementUnit): number | null {
  const value = text.trim().replace(',', '.')
  if (!value) return null
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return NaN
  return toCanonical(Number(value), unit)
}
export function inputMeasurement(value: number | null | undefined, unit: MeasurementUnit): string {
  return value == null || !Number.isFinite(value) ? '' : String(toDisplay(value, unit))
}
// Em metros, rótulos seguem o padrão técnico com duas casas ("4,20 m");
// A precisão visual não altera o valor armazenado ou o texto de edição.
export function formatMeasurement(value: number | null | undefined, unit: MeasurementUnit, suffix = true): string {
  if (value == null || !Number.isFinite(value)) return '?'
  const text = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: unit === 'm' ? 2 : 0, maximumFractionDigits: unit === 'm' ? 2 : unit === 'cm' ? 1 : 0 }).format(toDisplay(value, unit))
  return suffix ? `${text} ${unit}` : text
}
// Texto exibido no campo fora de edição: vírgula decimal e, em metros, duas casas ("2,80").
// Sem separador de milhar (para "2800" mm continuar legível pelo parser). Nunca altera o valor salvo:
// O número completo aparece somente durante a edição.
export function displayMeasurementInput(value: number | null | undefined, unit: MeasurementUnit): string {
  if (value == null || !Number.isFinite(value)) return ''
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: unit === 'm' ? 2 : 0, maximumFractionDigits: unit === 'm' ? 2 : unit === 'cm' ? 1 : 0, useGrouping: false }).format(toDisplay(value, unit))
}
