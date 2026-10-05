import { roomGhosts } from './roomGhosts'
import { buildWallFaces } from './wallFaces'
import RoomObjectSketch from './RoomObjectSketch'
import { buildObjectPlacements, fitObjectsSketch } from './roomObjects'
import { useMeasurements } from './Measurement'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { LABEL_SIZES, sketchLabelScale } from './sketchPreferences'
import type { LabelOffsets, Project, Room } from './models'
import { DragProvider, Movable, useLabelDrag } from './sketchDrag'
import { useSketchZoom } from './sketchZoom'
import { buildPerimeter } from './geometry'
import { validAngle } from './corners'
import GeometryStatus from './GeometryStatus'
import { buildOpeningLayout } from './openings'
import OpeningSketch from './OpeningSketch'
import { buildInternalWallLayout, fitInternalWallsSketch, placeInternalWallLabels } from './internalWalls'
import InternalWallSketch from './InternalWallSketch'
import { getSketchLabelLayout } from './sketchLabels'
import type { RoomGeometry } from './roomGeometry'

const degrees = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
// No celular, o croqui recolhido é uma miniatura fixa: zoom só com o croqui expandido.
const compactLayout = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 800px)').matches
export default function Sketch({ project, room, survey, focusElementId, selectedObjectId, onSelectObject, variant = 'panel', onLabelOffsetsChange, onFocusField, onObjectsChange, onLabelScaleChange }: { project?:Project; room?: Room; survey?: RoomGeometry; focusElementId?: string; selectedObjectId?: string; onSelectObject?: (id: string) => void; variant?: 'panel' | 'report'; onLabelOffsetsChange?: (offsets: LabelOffsets) => void; onFocusField?: (elementId: string, field: string) => void; onObjectsChange?: (objects: NonNullable<Room['objects']>) => void; onLabelScaleChange?: (scale: number) => void }) {
  const { unit, format } = useMeasurements()
  const [expanded, setExpanded] = useState(false)
  const [arrange, setArrange] = useState(false)
  const [moveMode, setMoveMode] = useState(false)
  const labelScale = sketchLabelScale(room?.sketchLabelScale)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useLabelDrag({ offsets: room?.labelOffsets, onChange: onLabelOffsetsChange, enabled: variant !== 'report' && !moveMode && !!room && !!onLabelOffsetsChange, arrange, svgRef })
  const zoom = useSketchZoom(svgRef, { panEnabled: !arrange, moveMode })
  useEffect(() => { if (!zoom.zoomed) setMoveMode(false) }, [zoom.zoomed])
  const [selection, setSelection] = useState<{ roomId: string; wallId: string }>()
  useEffect(() => {
    if (room && focusElementId && room.walls.some(wall => wall.id === focusElementId)) setSelection({ roomId: room.id, wallId: focusElementId })
  }, [room?.id, focusElementId])
  const svgId = useId().replace(/:/g, '')
  const perimeter = useMemo(() => survey?.perimeter ?? buildPerimeter(room?.walls ?? [], room?.corners ?? [], room?.diagonals ?? []), [survey, room?.walls, room?.corners, room?.diagonals])
  const internalWallLayout = useMemo(() => survey?.internalWalls ?? buildInternalWallLayout(perimeter, room?.walls ?? [], room?.corners ?? [], room?.internalWalls ?? []), [survey, perimeter, room?.walls, room?.corners, room?.internalWalls])
  const internalGeometry = useMemo(() => fitInternalWallsSketch(perimeter, internalWallLayout.placements), [perimeter, internalWallLayout])
  const objectPlacements = useMemo(() => buildObjectPlacements(room?.objects ?? [], [...perimeter.segments,...internalWallLayout.placements.map(p=>({wall:{id:p.internalWall.id},start:p.start,end:p.end}))]), [room?.objects, perimeter, internalWallLayout])
  const envelope=useMemo(()=>{const openings=survey?.openings ?? buildOpeningLayout(perimeter,room?.walls ?? [],room?.corners ?? [],room?.openings ?? [],internalWallLayout.placements);return [...buildWallFaces(perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace:room?.wallMeasurementFace ?? 'internal'})),new Map(openings.wallLayouts.map(w=>[w.wallId,w.solidRanges]))).values(),...buildWallFaces(internalWallLayout.placements.map(p=>({id:p.internalWall.id,start:p.start,end:p.end,thickness:p.internalWall.thicknessM,referenceFace:room?.wallMeasurementFace ?? 'internal'}))).values()].flat().flatMap(f=>[f.start,f.end])},[perimeter,survey,room?.walls,room?.corners,room?.openings,room?.wallMeasurementFace,internalWallLayout])
  const ghosts=useMemo(()=>project&&room?roomGhosts(project,room):[],[project,room])
  const geometry = useMemo(() => fitObjectsSketch(internalGeometry, objectPlacements, [...internalWallLayout.placements.flatMap(placement => [placement.start, placement.end]),...envelope,...ghosts.flatMap(g=>g.segments.flatMap(s=>[s.start,s.end]))]), [internalGeometry, objectPlacements, internalWallLayout,envelope,ghosts])
  const labelLayout = useMemo(() => getSketchLabelLayout(geometry, unit), [geometry, unit])
  const internalWallLabels = useMemo(() => placeInternalWallLabels(internalWallLayout.placements, geometry.project, labelLayout.boxes, unit), [internalWallLayout, geometry, labelLayout, unit])
  const openingLayout = useMemo(() => survey?.openings ?? buildOpeningLayout(geometry, room?.walls ?? [], room?.corners ?? [], room?.openings ?? [],internalWallLayout.placements), [survey, geometry, room?.walls, room?.corners, room?.openings,internalWallLayout])
  const openingReservations = useMemo(() => [...labelLayout.boxes, ...internalWallLabels.map(label => label.box)], [labelLayout, internalWallLabels])
  const wallFaces = useMemo(() => buildWallFaces(geometry.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace:room?.wallMeasurementFace ?? 'internal'})), new Map(openingLayout.wallLayouts.map(w=>[w.wallId,w.solidRanges]))), [geometry,openingLayout,room?.wallMeasurementFace])
  const selected = selection?.roomId === room?.id ? selection?.wallId : undefined
  const selectedObject = room?.objects?.find(object => object.id === selectedObjectId)
  const selectedWall = room?.walls.find(wall => wall.id === selected)
  return <aside className={variant === 'report' ? 'sketch-panel sketch-report' : `sketch-panel ${expanded ? 'expanded' : ''}`} aria-label="Croqui do ambiente">
    <div className="sketch-heading"><div><span className="eyebrow">VISUALIZAÇÃO</span><h2>Croqui do ambiente</h2></div><button className="expand" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'Recolher' : 'Expandir'}</button></div>
    <div className={`sketch-paper ${arrange ? 'is-arranging' : ''} ${zoom.zoomed ? 'is-zoomed' : ''} ${moveMode ? 'is-panning' : ''} ${selectedObject && onObjectsChange ? 'object-selected' : ''}`} {...(variant === 'report' || (!expanded && compactLayout()) ? {} : zoom.handlers)}>{variant !== 'report' && <div className="zoom-tools" role="group" aria-label="Zoom do croqui"><button onClick={zoom.zoomIn} aria-label="Aproximar">＋</button><button aria-label="Mover croqui" aria-pressed={moveMode} disabled={!zoom.zoomed} onClick={() => { setMoveMode(value => !value); setArrange(false) }}>✥ Mover</button><button onClick={zoom.zoomOut} disabled={!zoom.zoomed} aria-label="Afastar">－</button>{zoom.zoomed && <button onClick={zoom.reset} aria-label="Ver croqui inteiro">⤢ {Math.round(zoom.zoom * 100)}%</button>}</div>}<DragProvider api={drag.api} labelScale={labelScale}><svg ref={svgRef} style={{ '--sketch-label-scale': labelScale } as CSSProperties} viewBox={variant === 'report' ? '0 0 440 340' : zoom.viewBox} role="group" aria-label={`Croqui de ${room?.name || 'ambiente'}, com ângulos entre paredes`} {...drag.svgHandlers}>
      <defs><pattern id={`${svgId}-grid`} width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" style={{ fill: 'var(--c-d7ddd4)' }}/></pattern><marker id={`${svgId}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" style={{ fill: 'var(--c-947239)' }}/></marker></defs>
      <rect width="440" height="340" fill={`url(#${svgId}-grid)`}/>
      <text x="20" y="24" className="svg-caption">↻ Perímetro horário · face {room?.wallMeasurementFace==='external'?'externa':'interna'} · ângulos internos</text>
      {room && (geometry.segments.length > 0 || room.ceilingHeightM !== null) && (() => {
        const text = `Pé-direito ${room.ceilingHeightM === null ? 'não informado' : Number.isFinite(room.ceilingHeightM) ? format(room.ceilingHeightM) : 'inválido'}`
        const width = text.length * 6.2 + 6
        return <g className="svg-ceiling" pointerEvents="none"><Movable id="ceiling" box={{ x: 424 - width, y: 12, width, height: 16 }} title="pé-direito"><text x={421} y={24} textAnchor="end">{text}</text></Movable></g>
      })()}
      {!geometry.segments.length && !objectPlacements.length && <text x="220" y="175" textAnchor="middle" className="svg-empty">{room ? 'Adicione a parede A para começar' : 'Selecione um ambiente'}</text>}
      {objectPlacements.length > 0 && (() => { const origin = geometry.project({ x: 0, y: 0 }); return <g className="object-coordinate-origin" pointerEvents="none"><title>Origem das posições dos objetos: X=0, Y=0, início da primeira parede</title><path d={`M${origin.x-5} ${origin.y}h10M${origin.x} ${origin.y-5}v10`}/></g> })()}
      {geometry.diagonalSegments.map(segment => {
        const start = geometry.project(segment.start), end = geometry.project(segment.end)
        const { x, y, box } = labelLayout.positions.get(`diagonal:${segment.diagonal.id}`)!
        return <g key={segment.diagonal.id} className="svg-diagonal" pointerEvents="none"><title>{`Diagonal medida ${segment.label}: ${format(segment.diagonal.lengthM!)}`}</title><line x1={start.x} y1={start.y} x2={end.x} y2={end.y}/><Movable id={`diagonal:${segment.diagonal.id}`} box={box} title={`diagonal ${segment.label}`}><text x={x} y={y - 6} textAnchor="middle">{segment.label}<tspan x={x} dy="13">{format(segment.diagonal.lengthM!)}</tspan></text></Movable></g>
      })}
      {geometry.allMeasured && !geometry.endpointsMeet && geometry.segments.length >= 3 && (() => {
        const start = geometry.project(geometry.segments[0].start), end = geometry.project(geometry.segments.at(-1)!.end)
        return <g className="closure-gap" pointerEvents="none"><title>Diferença de fechamento; trecho ilustrativo, sem parede adicionada</title><line x1={start.x} y1={start.y} x2={end.x} y2={end.y}/><circle cx={end.x} cy={end.y} r="3"/></g>
      })()}
      {ghosts.map(ghost=><g key={ghost.room.id} className="room-ghost" opacity=".3" pointerEvents="none"><title>{`${ghost.room.displayId} — ${ghost.room.name}: ambiente anexo, croqui independente`}</title>{ghost.segments.map((segment,index)=>{const a=geometry.project(segment.start),b=geometry.project(segment.end);return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeDasharray="5 4"/>})}{ghost.segments[0]&&<text x={geometry.project(ghost.segments[0].start).x} y={geometry.project(ghost.segments[0].start).y-8} fontSize="10">{ghost.room.displayId} {ghost.room.name}</text>}</g>)}
      {geometry.segments.map((segment, index) => {
        const start = geometry.project(segment.start), end = geometry.project(segment.end)
        const { x: dx, y: dy } = segment.direction
        const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
        const label = labelLayout.positions.get(`wall:${segment.wall.id}`)!
        const entry = labelLayout.positions.get('entry')!
        const active = selected === segment.wall.id
        const select = () => { if (room) { setSelection({ roomId: room.id, wallId: segment.wall.id }); onSelectObject?.(''); if (onFocusField) { setExpanded(false); onFocusField(segment.wall.id, 'lengthM') } } }
        return <g key={segment.wall.id} className={`svg-wall ${segment.wall.thickness && segment.wall.thickness>0?'has-thickness':''} ${active ? 'is-selected' : ''}`} role="button" tabIndex={0} aria-pressed={active} aria-label={`Parede ${segment.wall.label}, ${segment.measured ? `${format(segment.wall.lengthM!)}` : 'sem medida válida'}`} onClick={select} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() } }}>
          <title>{`Parede ${segment.wall.label}${segment.wall.thickness != null ? ` · Espessura: ${format(segment.wall.thickness)}` : ''}`}</title><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="22"/>
          {(wallFaces.get(segment.wall.id) ?? []).map((range, rangeIndex) => {
            const from = geometry.project(range.start), to = geometry.project(range.end)
            return <line key={rangeIndex} className="wall-stroke" x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeDasharray={segment.measured ? undefined : '6 5'}/>
          })}
          <Movable id={`wall:${segment.wall.id}`} box={label.box} title={`medida da parede ${segment.wall.label}`}><text className="wall-label" x={label.x} y={label.y - 6} textAnchor="middle"><tspan x={label.x}>{segment.wall.label}</tspan><tspan x={label.x} dy="16" className="wall-length">{segment.wall.lengthM === null ? 'Sem medida' : Number.isFinite(segment.wall.lengthM) ? `${format(segment.wall.lengthM)}` : 'Medida inválida'}</tspan></text></Movable>
          {index === 0 && <g className="entry-indicator"><line x1={middle.x - dy * 48} y1={middle.y + dx * 48} x2={middle.x - dy * 9} y2={middle.y + dx * 9} style={{ stroke: 'var(--c-947239)' }} strokeWidth="2" markerEnd={`url(#${svgId}-arrow)`}/><Movable id="entry" box={entry.box} title="entrada principal"><text x={entry.x} y={entry.y} textAnchor="middle">Entrada principal · {segment.wall.label}</text></Movable></g>}
        </g>
      })}
      <InternalWallSketch labels={internalWallLabels} geometry={geometry} referenceFace={room?.wallMeasurementFace ?? 'internal'} ranges={new Map(openingLayout.wallLayouts.map(w=>[w.wallId,w.solidRanges]))} onSelect={variant!=='report' && onFocusField ? id=>onFocusField(id,'lengthM') : undefined}/>
      <OpeningSketch layout={openingLayout} geometry={geometry} extraReservations={openingReservations} onSelect={onFocusField && variant !== 'report' ? openingId => { setSelection(undefined); setExpanded(false); onFocusField(openingId, 'widthM') } : undefined}/>
      {geometry.corners.map(corner => {
        const position = geometry.project(corner.position)
        const label = labelLayout.positions.get(`angle:${corner.id}`)!; const cornerLabel = labelLayout.positions.get(`corner:${corner.id}`)!
        const startHeading = Math.atan2(corner.incoming.y, corner.incoming.x) + Math.PI
        const endHeading = startHeading - corner.visualAngle * Math.PI / 180
        const arcStart = { x: position.x + Math.cos(startHeading) * 13, y: position.y + Math.sin(startHeading) * 13 }
        const arcEnd = { x: position.x + Math.cos(endHeading) * 13, y: position.y + Math.sin(endHeading) * 13 }
        const defined = validAngle(corner.angleDegrees)
        const source = !defined ? (room?.corners.find(item => item.id === corner.id)?.angleSource === 'calculated' ? 'auto · faltam dados' : 'não definido') : corner.angleSource === 'assumed' ? 'presumido' : corner.angleSource === 'calculated' ? 'auto' : 'manual'
        return <g key={corner.id} className="svg-corner" pointerEvents="none">
          <title>{`Canto ${corner.label}: ${defined ? `${corner.angleDegrees}°` : 'ainda não definido'} — ${source}${corner.closing && !geometry.endpointsMeet ? ', encontro final ainda separado do início' : ''}`}</title>
          <circle cx={position.x} cy={position.y} r="4"/>
          <path className="angle-arc" d={`M${arcStart.x} ${arcStart.y} A13 13 0 ${corner.visualAngle > 180 ? 1 : 0} 0 ${arcEnd.x} ${arcEnd.y}`} strokeDasharray={!defined || (corner.closing && !geometry.endpointsMeet) ? '3 3' : undefined}/>
          <Movable id={`corner:${corner.id}`} box={cornerLabel.box} title={`canto ${corner.label}`}><text x={cornerLabel.x} y={cornerLabel.y} textAnchor="middle">{corner.label}</text></Movable>
          <Movable id={`angle:${corner.id}`} box={label.box} title={`ângulo ${corner.label}`}><text x={label.x} y={label.y} textAnchor="middle" className="corner-angle"><tspan x={label.x}>{defined ? `${corner.angleSource === 'calculated' ? '≈ ' : ''}${degrees.format(corner.angleDegrees!)}°` : '?'}</tspan><tspan x={label.x} dy="12" className="angle-source">{source}</tspan></text></Movable>
        </g>
      })}
      {/* Objetos por cima dos rótulos, para poderem ser selecionados e arrastados mesmo sob um rótulo. */}
      <RoomObjectSketch onMove={!moveMode && room && onObjectsChange && variant !== 'report' ? (objectId, position) => onObjectsChange((room.objects ?? []).map(item => item.id === objectId ? { ...item, position, attachedWallId: undefined, followWallAngle: false } : item)) : undefined} placements={objectPlacements} geometry={geometry} selectedId={selectedObjectId} onSelect={objectId => { setSelection(undefined); setExpanded(false); onSelectObject?.(objectId) }}/>
    </svg></DragProvider></div>
    {variant !== 'report' && room && <div className="label-tools">
      <button className={`label-arrange ${arrange ? 'is-on' : ''}`} aria-pressed={arrange} onClick={() => { setArrange(value => !value); setMoveMode(false); drag.setActive(undefined) }}>✥ {arrange ? 'Concluir ajuste' : 'Ajustar rótulos'}</button>
      {drag.active && drag.offsets[drag.active] && <button onClick={() => { drag.reset(drag.active); drag.setActive(undefined) }}>↺ Restaurar {labelName(drag.active, room!, geometry)}</button>}
      {Object.keys(drag.offsets).length > 0 && <button onClick={() => { if (window.confirm('Voltar todos os rótulos deste croqui para a posição automática?')) { drag.reset(); drag.setActive(undefined) } }}>↺ Restaurar todos ({Object.keys(drag.offsets).length})</button>}
      {onLabelScaleChange && <label className="label-size-control">Tamanho dos rótulos<select value={labelScale} onChange={event => onLabelScaleChange(Number(event.target.value))}>{LABEL_SIZES.map(size => <option key={size} value={size}>{size * 100}%{size === 1 ? ' — padrão' : ''}</option>)}</select></label>}
      <span className="label-hint">{moveMode ? 'Arraste com o mouse ou com um dedo para mover somente a visualização. Desative Mover para selecionar elementos.' : arrange ? 'Arraste os rótulos com o dedo ou o mouse. Setas do teclado também movem; Delete restaura.' : 'Com o mouse, arraste qualquer rótulo. No celular, toque em “Ajustar rótulos”. Pinça com dois dedos aproxima; com zoom, arraste o fundo ou ative Mover para navegar.'}</span>
    </div>}
    <div className="sketch-note" role="status"><span className="status-dot"/>{selectedObject ? `${selectedObject.displayId} — ${selectedObject.name} selecionado` : selectedWall ? `Parede ${selectedWall.label} selecionada` : onFocusField ? 'Toque em uma parede ou abertura para ir ao campo dela' : 'Clique em uma parede ou objeto para selecionar'}</div>
    <div className="geometry-notes">
      <p>Entrada principal indicada na primeira parede{room?.walls[0] ? ` (${room.walls[0].label})` : ''}. Aberturas: largura × altura e peitoril em {unit}. A distância parte do canto identificado até a borda mais próxima.</p>
      {geometry.segments.length > 0 && !geometry.allMeasured && <p>Trechos sem comprimento positivo usam referência visual tracejada de {format(1)}. Informe as medidas para definir o perímetro.</p>}
      {geometry.corners.length > 0 && !geometry.allAnglesDefined && <p>Ângulos não definidos usam 90° apenas no desenho provisório. O valor original permanece sem definição.</p>}
      <GeometryStatus geometry={geometry}/>
    </div>
  </aside>
}

function labelName(key: string, room: Room, geometry: ReturnType<typeof buildPerimeter>) {
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
  if (key === 'ceiling') return 'pé-direito'
  if (key === 'entry') return 'entrada principal'
  if (kind === 'wall') return `medida ${room.walls.find(wall => wall.id === id)?.label ?? ''}`.trim()
  if (kind === 'opening') return room.openings.find(item => item.id === id)?.label ?? 'abertura'
  if (kind === 'internal') return room.internalWalls.find(item => item.id === id)?.label ?? 'parede interna'
  if (kind === 'angle' || kind === 'corner') return `${kind === 'angle' ? 'ângulo' : 'canto'} ${geometry.corners.find(corner => corner.id === id)?.label ?? ''}`.trim()
  if (kind === 'diagonal') return 'diagonal'
  return 'rótulo'
}
