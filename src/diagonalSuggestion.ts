import type { Room,Diagonal } from './models'
import { buildRoomGeometry } from './roomGeometry'
import { getCorners } from './corners'
export function diagonalSuggestion(room:Room,diagonal:Diagonal):number|null {
 const geometry=buildRoomGeometry({...room,diagonals:room.diagonals.filter(d=>d.id!==diagonal.id)}).perimeter,corners=getCorners(room.walls,room.corners)
 const index=(id:string)=>diagonal.vertexIds?id==='origin'?0:room.walls.findIndex(w=>w.id===id)+1:((corners.findIndex(c=>c.id===id)+1)%room.walls.length)
 const ids=diagonal.vertexIds??diagonal.cornerIds
 if(!diagonal.vertexIds&&ids.some(id=>!corners.some(c=>c.id===id))||diagonal.vertexIds&&ids.some(id=>id!=='origin'&&!room.walls.some(w=>w.id===id)))return null
 const points=[{x:0,y:0},...geometry.segments.map(s=>s.end)],a=points[index(ids[0])],b=points[index(ids[1])]
 return a&&b?Math.hypot(a.x-b.x,a.y-b.y):null
}
