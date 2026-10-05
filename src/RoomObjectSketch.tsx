import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { useSketchLabelScale } from './sketchDrag'
import { useMeasurements } from './Measurement'
import type { buildPerimeter } from './geometry'
import type { ObjectPlacement } from './roomObjects'
import { objectDimensionsLabel, objectCategoryNames } from './roomObjects'

export default function RoomObjectSketch({ placements, geometry, selectedId, onSelect, onMove }: { placements: ObjectPlacement[]; geometry: ReturnType<typeof buildPerimeter>; selectedId?: string; onSelect?: (id: string) => void; onMove?: (id: string, position: { xM: number; yM: number }) => void }) {
  const { unit, format } = useMeasurements()
  const labelScale = useSketchLabelScale()
  // Arrastar no croqui: com o mouse, qualquer objeto; no toque, só o objeto já selecionado (para não atrapalhar a rolagem).
  // O deslocamento em pixels do desenho é convertido em metros pela escala atual; grava ao soltar, arredondado ao milímetro.
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number; ratio: number; start: { xM: number; yM: number }; moved: boolean }>(undefined)
  const [live, setLive] = useState<{ id: string; xM: number; yM: number }>()
  const suppress = useRef(false)
  const begin = (event: PointerEvent<SVGGElement>, object: ObjectPlacement['object']) => {
    if (!onMove || object.position.xM == null || object.position.yM == null) return
    if (event.pointerType === 'mouse' ? event.button !== 0 : selectedId !== object.id) return
    const ctm = event.currentTarget.ownerSVGElement?.getScreenCTM()
    event.stopPropagation()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* indisponível */ }
    drag.current = { id: object.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, ratio: ctm?.a ? 1 / ctm.a : 1, start: { xM: object.position.xM, yM: object.position.yM }, moved: false }
  }
  const move = (event: PointerEvent<SVGGElement>) => {
    const d = drag.current; if (!d || d.pointerId !== event.pointerId) return
    const dx = event.clientX - d.x, dy = event.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true; event.preventDefault()
    const round = (value: number) => Math.round(value * 1000) / 1000
    setLive({ id: d.id, xM: round(d.start.xM + dx * d.ratio / geometry.scale), yM: round(d.start.yM + dy * d.ratio / geometry.scale) })
  }
  const end = (event: PointerEvent<SVGGElement>) => {
    const d = drag.current; if (!d || d.pointerId !== event.pointerId) return
    drag.current = undefined
    if (d.moved && live?.id === d.id) { suppress.current = true; onMove?.(d.id, { xM: live.xM, yM: live.yM }); setTimeout(() => { suppress.current = false }, 0) }
    setLive(undefined)
  }
  return <g className="svg-room-objects">{placements.map(({ object, center, widthM, heightM }) => {
    const moving = live?.id === object.id
    const point = geometry.project(moving ? { x: center.x + live.xM - object.position.xM!, y: center.y + live.yM - object.position.yM! } : center), width = widthM * geometry.scale, height = heightM * geometry.scale
    if (![point.x, point.y, width, height].every(Number.isFinite)) return null
    const label = objectDimensionsLabel(object, unit)
    const codeFits = width >= (object.displayId.length * 6 + 6) * labelScale && (object.shape === 'line' || height >= 16 * labelScale)
    const dimensionsFit = codeFits && width >= (label.length * 5 + 8) * labelScale && height >= 36 * labelScale
    const select = () => { if (!suppress.current) onSelect?.(object.id) }
    return <g key={object.id} data-object-id={object.id} className={`svg-room-object ${selectedId === object.id ? 'is-selected' : ''} ${moving ? 'is-moving' : ''} ${onMove ? 'is-movable' : ''}`} onPointerDown={event => begin(event, object)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} role="button" tabIndex={0} aria-pressed={selectedId === object.id} aria-label={`${object.displayId} ${object.name}, ${objectCategoryNames[object.category]}, ${label}, rotação ${object.rotationDegrees}°`} onClick={select} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() } }}>
      <title>{`${object.displayId} — ${object.name} · ${label} · ${object.rotationDegrees}°${object.note ? ` · ${object.note}` : ''}`}</title>
      <g transform={`translate(${point.x} ${point.y}) rotate(${object.rotationDegrees ?? 0})`}>
        {object.shape !== 'line' && <rect x={-Math.max(width, 16) / 2} y={-Math.max(height, 16) / 2} width={Math.max(width, 16)} height={Math.max(height, 16)} fill="transparent"/>}
        {object.shape === 'rectangle' && <rect className="object-shape" x={-width / 2} y={-height / 2} width={width} height={height} rx="2"/>}
        {object.shape === 'circle' && <circle className="object-shape" r={width / 2}/>}
        {object.shape === 'line' && <><line className="object-hit" x1={-width / 2} x2={width / 2} y1="0" y2="0"/><line className="object-shape" x1={-width / 2} x2={width / 2} y1="0" y2="0"/></>}
      </g>
      {(codeFits || selectedId === object.id) && <text transform={labelScale === 1 ? undefined : `translate(${point.x} ${point.y}) scale(${labelScale}) translate(${-point.x} ${-point.y})`} className="object-label" x={point.x} y={point.y + (object.shape === 'line' ? -8 : dimensionsFit ? -3 : 3)} textAnchor="middle" pointerEvents="none">{object.displayId}{dimensionsFit && <tspan x={point.x} dy="13">{label}</tspan>}</text>}
      {moving && <text className="object-move-readout" x={point.x} y={point.y - Math.max(height, 16) / 2 - 6} textAnchor="middle" pointerEvents="none">X {format(live.xM)} · Y {format(live.yM)}</text>}
    </g>
  })}</g>
}
