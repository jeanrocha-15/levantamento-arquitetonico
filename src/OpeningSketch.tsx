import { openingSymbol } from './openingSymbols'
import OpeningSymbolSketch from './OpeningSymbolSketch'
import { openingFrame } from './openingFrame'
import { lineRotation } from './labelRotation'
import { useMeasurements } from './Measurement'
import type { buildPerimeter } from './geometry'
import { useMemo } from 'react'
import { doorDescription, openingNames, placeOpeningLabels } from './openings'
import { Movable, useOffsetLookup } from './sketchDrag'
import { dimensionLine, insideNormal } from './dimensions'
import type { buildOpeningLayout, LabelBox } from './openings'

export default function OpeningSketch({ layout, geometry, extraReservations = [], onSelect, showDimensions = true, mode='architectural', referenceFace='internal' }: { layout: ReturnType<typeof buildOpeningLayout>; geometry: ReturnType<typeof buildPerimeter>; extraReservations?: LabelBox[]; onSelect?: (openingId: string) => void; showDimensions?: boolean;mode?:'simplified'|'architectural';referenceFace?:'internal'|'external' }) {
  const { unit, format } = useMeasurements()
  const labels = useMemo(() => placeOpeningLabels(layout.placements, geometry.project, extraReservations, unit), [layout, geometry, extraReservations, unit])
  const offsetOf = useOffsetLookup()
  const center = useMemo(() => { const points = geometry.segments.map(segment => geometry.project(segment.start)); return points.length ? { x: points.reduce((t, p) => t + p.x, 0) / points.length, y: points.reduce((t, p) => t + p.y, 0) / points.length } : { x: 220, y: 170 } }, [geometry])
  return <g className="svg-openings" pointerEvents="none">{labels.map(({ placement, x, y, anchor, box }) => {
    const offset = offsetOf(`opening:${placement.opening.id}`)
    const { opening, reference } = placement
    const start = geometry.project(placement.start), end = geometry.project(placement.end)
    const dimensions = `${format(opening.widthM, false)} × ${format(opening.heightM)}`
    const referenceText = `${format(opening.offsetM)} de ${reference.label}`

    const operation = doorDescription(opening)
    return <g key={opening.id} className={`svg-opening opening-${opening.type}`} role="img" aria-label={`${openingNames[opening.type]} ${opening.label}, parede ${placement.wall.label}, ${dimensions}${opening.type === 'window' ? `, peitoril ${format(opening.sillHeightM)}` : ''}, ${referenceText} até a borda mais próxima${operation ? `. ${operation}` : ''}`}>
      <title>{`${opening.label} · Parede ${placement.wall.label} · ${referenceText} até a borda mais próxima${operation ? ` · ${operation}` : ''}`}</title>
      <OpeningSymbolSketch parts={openingSymbol(opening,placement.start,placement.end,openingFrame(geometry,placement,referenceFace),mode)} project={geometry.project}/>
      {onSelect && <line className="opening-hit" pointerEvents="stroke" x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="24" role="button" tabIndex={0} aria-label={`Editar ${opening.label}`} onClick={event => { event.stopPropagation(); onSelect(opening.id) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(opening.id) } }}/>}
      {showDimensions && (opening.offsetM ?? 0) > 0 && (() => {
        // Cota da distância do canto de referência até a borda mais próxima, pelo lado de fora da parede.
        const from = geometry.project(placement.referencePoint), to = geometry.project(placement.nearPoint)
        const inside = insideNormal(start, end, center)
        const line = dimensionLine(from, to, { x: -inside.x, y: -inside.y }, 9)
        if (!line) return null
        return <g className="svg-dimension"><line x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}/>{line.ticks.map(([a, b], index) => <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>)}<text x={line.text.x} y={line.text.y} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${line.angle} ${line.text.x} ${line.text.y})`}>{format(opening.offsetM)}</text></g>
      })()}

      <line className="opening-leader" x1={anchor.x} y1={anchor.y} x2={x + offset.dx} y2={y + 4 + offset.dy}/>
      <circle className="opening-anchor" cx={anchor.x} cy={anchor.y} r="2"/>
      <Movable id={`opening:${opening.id}`} angle={lineRotation(start,end)} box={box} title={opening.label}><text x={x} y={y} textAnchor="middle" className="opening-label"><tspan x={x} className="opening-code">{opening.label}</tspan><tspan x={x} dy="12">{dimensions}</tspan>{opening.type === 'window' && <tspan x={x} dy="12">P={format(opening.sillHeightM)}</tspan>}<tspan x={x} dy="12" className="opening-reference">{referenceText}</tspan></text></Movable>
    </g>
  })}</g>
}
