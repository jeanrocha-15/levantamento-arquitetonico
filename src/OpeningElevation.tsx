import { useMeasurements } from './Measurement'
import type { Opening, Room } from './models'
import { getWallReferences } from './openings'
import { dimensionLine } from './dimensions'

const ok = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
// Vista da parede de dentro do ambiente, só para conferência: cota do peitoril, da altura,
// da largura e da distância ao canto. Usa as medidas originais; nada é gravado.
export default function OpeningElevation({ room, opening }: { room: Room; opening: Opening }) {
  const { format } = useMeasurements()
  const wall = [...room.walls,...room.internalWalls].find(item => item.id === opening.wallId)
  const reference = getWallReferences(room.walls, room.corners, opening.wallId,room.internalWalls).find(item => item.id === opening.referenceCornerId)
  const sill = opening.type === 'window' ? opening.sillHeightM : 0
  if (!wall || !reference || !ok(wall.lengthM) || !(wall.lengthM > 0) || !ok(opening.widthM) || !ok(opening.heightM) || !ok(opening.offsetM) || !ok(sill)) return null
  const length = wall.lengthM, top = sill + opening.heightM
  const height = ok(room.ceilingHeightM) && room.ceilingHeightM > 0 ? Math.max(room.ceilingHeightM, top) : Math.max(2.6, top + .3)
  const fromM = reference.endpoint === 'start' ? opening.offsetM : length - opening.offsetM - opening.widthM
  const W = 300, H = 150, pad = 30, scale = Math.min((W - 2 * pad) / length, (H - 2 * pad + 10) / height)
  const x = (m: number) => pad + m * scale, y = (m: number) => H - pad + 6 - m * scale
  const vertical = (from: number, to: number, at: number, side: number, text: string, key: string) => { const line = dimensionLine({ x: at, y: y(from) }, { x: at, y: y(to) }, { x: side, y: 0 }, 8, 3); return line && <g key={key} className="svg-dimension"><line x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}/>{line.ticks.map(([a, b], i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>)}<text x={line.text.x + side * 4} y={line.text.y} textAnchor={side > 0 ? 'start' : 'end'} dominantBaseline="middle">{text}</text></g> }
  const horizontal = (from: number, to: number, text: string, key: string) => { const line = dimensionLine({ x: x(from), y: y(0) }, { x: x(to), y: y(0) }, { x: 0, y: 1 }, 10, 3); return line && <g key={key} className="svg-dimension"><line x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}/>{line.ticks.map(([a, b], i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>)}<text x={line.text.x} y={line.text.y + 4} textAnchor="middle" dominantBaseline="middle">{text}</text></g> }
  const nearM = reference.endpoint === 'start' ? 0 : length, edgeM = reference.endpoint === 'start' ? fromM : fromM + opening.widthM
  return <figure className="opening-elevation" aria-label={`Vista da parede ${wall.label} de dentro do ambiente com as cotas de ${opening.label}`}>
    <svg viewBox={`0 0 ${W} ${H + 8}`} role="img">
      <rect className="elev-wall" x={x(0)} y={y(height)} width={length * scale} height={height * scale}/>
      <rect className={`elev-opening opening-${opening.type}`} x={x(fromM)} y={y(top)} width={opening.widthM * scale} height={opening.heightM * scale}/>
      <text className="elev-caption" x={x(0)} y={y(height) - 6}>Parede {wall.label} · vista de dentro</text>
      {opening.type === 'window' && vertical(0, sill, x(fromM + opening.widthM), 1, `peitoril ${format(sill)}`, 'sill')}
      {vertical(sill, top, x(fromM), -1, `alt. ${format(opening.heightM)}`, 'height')}
      {opening.offsetM > 0 && horizontal(Math.min(nearM, edgeM), Math.max(nearM, edgeM), `${format(opening.offsetM)} de ${reference.label}`, 'offset')}
      <text className="elev-width" x={x(fromM + opening.widthM / 2)} y={y(top) - 4} textAnchor="middle">{format(opening.widthM)}</text>
    </svg>
  </figure>
}
