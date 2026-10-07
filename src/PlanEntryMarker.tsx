import type { RoomPlacement } from './models'
import type { PlanRoom } from './floorPlan'
import { midpoint, normalOf, rotatePoint, worldPoint } from './floorPlan'

export default function PlanEntryMarker({shape,placement,size}:{shape:PlanRoom;placement:RoomPlacement;size:number}) {
 const wall=shape.survey.perimeter.segments.find(s=>s.wall.label==='A')??shape.survey.perimeter.segments[0]
 if(!wall)return null
 const opening=shape.survey.openings.placements.find(o=>o.wall.id===wall.wall.id && o.opening.type!=='window')
 const center=worldPoint(opening?midpoint(opening.start,opening.end):midpoint(wall.start,wall.end),placement)
 const inward=rotatePoint(normalOf(wall.start,wall.end),placement.rotation),across={x:-inward.y,y:inward.x}
 const tip={x:center.x+inward.x*size*.5,y:center.y+inward.y*size*.5},tail={x:center.x-inward.x*size*2,y:center.y-inward.y*size*2}
 return <g className="plan-entry" aria-label={`Entrada · ${wall.wall.label} — Entrada principal`} fill="none" stroke="var(--plan-text, currentColor)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"><path d={`M ${tail.x} ${tail.y} L ${tip.x} ${tip.y} M ${tip.x-inward.x*size+across.x*size*.5} ${tip.y-inward.y*size+across.y*size*.5} L ${tip.x} ${tip.y} L ${tip.x-inward.x*size-across.x*size*.5} ${tip.y-inward.y*size-across.y*size*.5}`} vectorEffect="non-scaling-stroke"/><title>{`Entrada principal · Parede ${wall.wall.label}`}</title></g>
}
