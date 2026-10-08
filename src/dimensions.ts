// Cotas (linhas de dimensão) do croqui: só desenho, calculadas a partir da geometria de visualização.
export interface P { x: number; y: number }
export interface DimensionLine { from: P; to: P; text: P; angle: number; ticks: [P, P][] }
// Linha paralela ao trecho a–b, deslocada `offset` unidades para o lado `side` (vetor unitário), com traços a 45°.
export function dimensionLine(a: P, b: P, side: P, offset = 11, tick = 3.5, textGap = 5): DimensionLine | null {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (!(length > 1e-9)) return null
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const from = { x: a.x + side.x * offset, y: a.y + side.y * offset }, to = { x: b.x + side.x * offset, y: b.y + side.y * offset }
  const diagonal = { x: (u.x + side.x) * tick / Math.SQRT2, y: (u.y + side.y) * tick / Math.SQRT2 }
  const tickAt = (p: P): [P, P] => [{ x: p.x - diagonal.x, y: p.y - diagonal.y }, { x: p.x + diagonal.x, y: p.y + diagonal.y }]
  let angle = Math.atan2(u.y, u.x) * 180 / Math.PI
  if (angle > 90) angle -= 180; else if (angle < -90) angle += 180
  return { from, to, ticks: [tickAt(from), tickAt(to)], angle, text: { x: (from.x + to.x) / 2 + side.x * textGap, y: (from.y + to.y) / 2 + side.y * textGap } }
}
// Lado interno do ambiente em relação a um trecho de parede: aponta para o centro dos vértices.
export function insideNormal(a: P, b: P, center: P): P {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return normal.x * (center.x - middle.x) + normal.y * (center.y - middle.y) >= 0 ? normal : { x: -normal.x, y: -normal.y }
}
