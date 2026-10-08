import type { PlanRoom } from './floorPlan'
import { planBounds } from './floorPlan'
// Canonical drawing units: the camera must scale annotations and rooms together.
export function planAnnotationSize(shapes:PlanRoom[]):number {
 const sizes=shapes.map(s=>{const b=planBounds(s.polygon);return Math.min(b.width,b.height)}).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b)
 if(!sizes.length)return .1
 return Math.max(.02,Math.min(.5,sizes[Math.floor(sizes.length/2)]/30))
}
