import { lineRotation } from './labelRotation'
import type { FaceRange } from './wallFaces'
import { buildWallFaces } from './wallFaces'
import { useMeasurements } from './Measurement'
import type { buildPerimeter } from './geometry'
import type { placeInternalWallLabels } from './internalWalls'
import { Movable, useOffsetLookup } from './sketchDrag'


export default function InternalWallSketch({ labels, geometry, onSelect, ranges, referenceFace='internal' }: { labels: ReturnType<typeof placeInternalWallLabels>; geometry: ReturnType<typeof buildPerimeter>; onSelect?: (id:string)=>void; ranges?:Map<string,FaceRange[]>;referenceFace?:'internal'|'external' }) {
  const { format } = useMeasurements()
  const offsetOf = useOffsetLookup()
  const faces=buildWallFaces(labels.map(({placement:p})=>({id:p.internalWall.id,start:p.start,end:p.end,thickness:p.internalWall.thicknessM,referenceFace})),ranges)
  return <g className="svg-internal-walls" >{labels.map(({ placement, x, y, middle, box }) => {
    const offset = offsetOf(`internal:${placement.internalWall.id}`)
    const start = geometry.project(placement.start), end = geometry.project(placement.end)
    const wall = placement.internalWall
    return <g key={wall.id} className={`svg-internal-wall ${wall.thicknessM && wall.thicknessM>0?'has-thickness':''}`} data-element-id={wall.id} role={onSelect?"button":"img"} tabIndex={onSelect?0:undefined} onClick={()=>onSelect?.(wall.id)} onKeyDown={event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();onSelect?.(wall.id)}}} aria-label={`Parede interna ${wall.label}, ${format(wall.lengthM!)}, origem na parede ${placement.wall.label}, ${format(wall.origin.type === 'perimeter_wall' ? wall.origin.distanceM! : 0)} do canto ${placement.reference.label}, orientação ${wall.orientationDegrees} graus`}>
      <title>{`${wall.label} · Origem: Parede ${placement.wall.label} · Canto ${placement.reference.label} · ${wall.orientationDegrees}°${wall.note ? ` · ${wall.note}` : ''}`}</title>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="18"/>{(faces.get(wall.id) ?? []).map((face,index)=>{const a=geometry.project(face.start),b=geometry.project(face.end);return <line key={index} className="internal-wall-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth="2"/>})}
      <circle className="internal-wall-origin" cx={start.x} cy={start.y} r="3"/>
      <line className="internal-wall-leader" x1={middle.x} y1={middle.y} x2={x + offset.dx} y2={y + 4 + offset.dy}/>
      <Movable id={`internal:${wall.id}`} angle={lineRotation(start,end)} box={box} title={wall.label}><text className="internal-wall-label" x={x} y={y} textAnchor="middle"><tspan x={x}>{wall.label}</tspan><tspan x={x} dy="14" className="internal-wall-length">{format(wall.lengthM!)}</tspan></text></Movable>
    </g>
  })}</g>
}
