import { lineRotation } from './labelRotation'
import { useMeasurements } from './Measurement'
import type { buildPerimeter } from './geometry'
import { useMemo } from 'react'
import { doorDescription, doorDrawing, openingNames, placeOpeningLabels } from './openings'
import { Movable, useOffsetLookup } from './sketchDrag'
import { dimensionLine, insideNormal } from './dimensions'
import type { buildOpeningLayout, LabelBox } from './openings'

export default function OpeningSketch({ layout, geometry, extraReservations = [], onSelect, showDimensions = true }: { layout: ReturnType<typeof buildOpeningLayout>; geometry: ReturnType<typeof buildPerimeter>; extraReservations?: LabelBox[]; onSelect?: (openingId: string) => void; showDimensions?: boolean }) {
  const { unit, format } = useMeasurements()
  const labels = useMemo(() => placeOpeningLabels(layout.placements, geometry.project, extraReservations, unit), [layout, geometry, extraReservations, unit])
  const offsetOf = useOffsetLookup()
  const center = useMemo(() => { const points = geometry.segments.map(segment => geometry.project(segment.start)); return points.length ? { x: points.reduce((t, p) => t + p.x, 0) / points.length, y: points.reduce((t, p) => t + p.y, 0) / points.length } : { x: 220, y: 170 } }, [geometry])
  return <g className="svg-openings" pointerEvents="none">{labels.map(({ placement, x, y, anchor, box }) => {
    const offset = offsetOf(`opening:${placement.opening.id}`)
    const { opening, direction, reference } = placement
    const start = geometry.project(placement.start), end = geometry.project(placement.end)
    const normal = { x: -direction.y, y: direction.x }
    const dimensions = `${format(opening.widthM, false)} × ${format(opening.heightM)}`
    const referenceText = `${format(opening.offsetM)} de ${reference.label}`
    const jamb = (point: { x: number; y: number }) => <line x1={point.x - normal.x * 5} y1={point.y - normal.y * 5} x2={point.x + normal.x * 5} y2={point.y + normal.y * 5}/>
    const door = doorDrawing(opening, start, end, direction)
    const operation = doorDescription(opening)
    return <g key={opening.id} className={`svg-opening opening-${opening.type}`} role="img" aria-label={`${openingNames[opening.type]} ${opening.label}, parede ${placement.wall.label}, ${dimensions}${opening.type === 'window' ? `, peitoril ${format(opening.sillHeightM)}` : ''}, ${referenceText} até a borda mais próxima${operation ? `. ${operation}` : ''}`}>
      <title>{`${opening.label} · Parede ${placement.wall.label} · ${referenceText} até a borda mais próxima${operation ? ` · ${operation}` : ''}`}</title>
      {door?.kind === 'hinged' && <g className={`door-swing ${door.specified ? '' : 'is-unspecified'}`}><path className="door-arc" d={door.arc}/><line className="door-leaf" x1={door.leaf[0].x} y1={door.leaf[0].y} x2={door.leaf[1].x} y2={door.leaf[1].y}/></g>}
      {door?.kind === 'sliding' && <g className={`door-sliding ${door.specified ? '' : 'is-unspecified'}`}><line className="door-track" x1={door.track![0].x} y1={door.track![0].y} x2={door.track![1].x} y2={door.track![1].y}/><line className="door-leaf" x1={door.leaf[0].x} y1={door.leaf[0].y} x2={door.leaf[1].x} y2={door.leaf[1].y}/><path className="door-arrow" d={door.arrow}/></g>}
      {onSelect && <line className="opening-hit" pointerEvents="stroke" x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="24" role="button" tabIndex={0} aria-label={`Editar ${opening.label}`} onClick={event => { event.stopPropagation(); onSelect(opening.id) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(opening.id) } }}/>}
      {showDimensions && (opening.offsetM ?? 0) > 0 && (() => {
        // Cota da distância do canto de referência até a borda mais próxima, pelo lado de fora da parede.
        const from = geometry.project(placement.referencePoint), to = geometry.project(placement.nearPoint)
        const inside = insideNormal(start, end, center)
        const line = dimensionLine(from, to, { x: -inside.x, y: -inside.y }, 9)
        if (!line) return null
        return <g className="svg-dimension"><line x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}/>{line.ticks.map(([a, b], index) => <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>)}<text x={line.text.x} y={line.text.y} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${line.angle} ${line.text.x} ${line.text.y})`}>{format(opening.offsetM)}</text></g>
      })()}
      <g className="opening-jambs">{jamb(start)}{jamb(end)}</g>
      {opening.type === 'window' && <g className="window-pane">{[-2, 2].map(offset => <line key={offset} x1={start.x + normal.x * offset} y1={start.y + normal.y * offset} x2={end.x + normal.x * offset} y2={end.y + normal.y * offset}/>)}</g>}
      <line className="opening-leader" x1={anchor.x} y1={anchor.y} x2={x + offset.dx} y2={y + 4 + offset.dy}/>
      <circle className="opening-anchor" cx={anchor.x} cy={anchor.y} r="2"/>
      <Movable id={`opening:${opening.id}`} angle={lineRotation(start,end)} box={box} title={opening.label}><text x={x} y={y} textAnchor="middle" className="opening-label"><tspan x={x} className="opening-code">{opening.label}</tspan><tspan x={x} dy="12">{dimensions}</tspan>{opening.type === 'window' && <tspan x={x} dy="12">P={format(opening.sillHeightM)}</tspan>}<tspan x={x} dy="12" className="opening-reference">{referenceText}</tspan></text></Movable>
    </g>
  })}</g>
}
