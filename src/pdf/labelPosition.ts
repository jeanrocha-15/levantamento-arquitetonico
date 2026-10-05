import type { Pt } from './pdfWriter'
import { textWidthMm } from './pdfWriter'
import { planBounds,pointInPolygon } from '../floorPlan'
// Paper-space label placement only; survey and placement coordinates are immutable.
export function roomLabelPosition(polygon:Pt[],obstacles:Pt[][],text:string,size=3) {
 const b=planBounds(polygon),center={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2},width=textWidthMm(text,size),boxes=obstacles.map(planBounds),candidates=[center,...[-18,18,-30,30].map(d=>({x:center.x,y:center.y+d})),...[.25,.5,.75].flatMap(y=>[.25,.5,.75].map(x=>({x:b.minX+b.width*x,y:b.minY+b.height*y})))]
 return candidates.find(p=>{const corners=[{x:p.x-width/2,y:p.y-size},{x:p.x+width/2,y:p.y-size},{x:p.x-width/2,y:p.y+1},{x:p.x+width/2,y:p.y+1}];return corners.every(c=>pointInPolygon(c,polygon,false))&&!boxes.some(o=>p.x+width/2>o.minX-1&&p.x-width/2<o.maxX+1&&p.y+1>o.minY-1&&p.y-size<o.maxY+1)})??center
}
