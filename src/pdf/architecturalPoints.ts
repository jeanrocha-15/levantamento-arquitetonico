import { objectLayerVisible } from './sheetDecorations'
import type { PlanRoom } from '../floorPlan'
import type { PdfLayers } from './sheetDecorations'
export function architecturalPoints(shape:PlanRoom,layers:PdfLayers) {
 const points=shape.survey.perimeter.segments.flatMap(s=>[s.start,s.end])
 if(layers.walls)points.push(...[...shape.faces.values(),...shape.internalFaces.values()].flat().flatMap(f=>[f.start,f.end]))
 if(layers.openings)shape.survey.openings.placements.forEach(o=>{points.push(o.start,o.end);if(o.opening.type==='door'&&o.opening.doorKind!=='sliding'){const hinge=o.opening.hinge==='right'?o.end:o.start,width=Math.hypot(o.end.x-o.start.x,o.end.y-o.start.y),sign=o.opening.swing==='outward'?-1:1;points.push({x:hinge.x-o.direction.y*width*sign,y:hinge.y+o.direction.x*width*sign})}})
 points.push(...shape.objects.filter(o=>objectLayerVisible(o.object,layers)).flatMap(o=>o.bounds))
 return points
}
