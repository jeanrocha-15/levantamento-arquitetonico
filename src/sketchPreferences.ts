export const LABEL_SIZES = [0.5, 0.75, 1, 1.25, 1.5] as const
export function sketchLabelScale(value?: number): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 1.5 ? value : 1 }
