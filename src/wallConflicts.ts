import type {Project,RoomPlacement} from './models'
import {buildPlanRoom,floorRooms,worldPoint} from './floorPlan'
import {buildWallFaces} from './wallFaces'
export function wallConflicts(project:Project,floorId:string,placements:RoomPlacement[]) {
 const walls=floorRooms(project,floorId).flatMap(room=>{
  const p=placements.find(p=>p.roomId===room.id&&p.floorId===floorId);if(!p)return []
  const segments=buildPlanRoom(room).survey.perimeter.segments
  const faces=buildWallFaces(segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace:room.wallMeasurementFace??'internal'})))
  return segments.flatMap(s=>{const f=faces.get(s.wall.id);if(!f?.length)return [];const midpoint=(a:{x:number;y:number},b:{x:number;y:number})=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});return [{room,wall:s.wall,start:worldPoint(f.length>1?midpoint(f[0].start,f[1].start):s.start,p),end:worldPoint(f.length>1?midpoint(f[0].end,f[1].end):s.end,p)}]})
 })
 const alerts:{roomId:string;otherRoomId:string;message:string}[]=[]
 for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++){
  const a=walls[i],b=walls[j];if(a.room.id===b.room.id)continue
  const same=(ra:string,wa:string,rb:string,wb:string)=>ra===a.room.id&&wa===a.wall.id&&rb===b.room.id&&wb===b.wall.id||ra===b.room.id&&wa===b.wall.id&&rb===a.room.id&&wb===a.wall.id
  if(project.spatialConnections?.some(c=>c.type==='shared_wall'&&same(c.a.roomId,c.a.wallId??c.a.elementId??'',c.b.roomId,c.b.wallId??c.b.elementId??''))||project.relationships.some(r=>r.type==='shared_wall'&&same(r.sourceRoomId,r.sourceElementId??'',r.targetRoomId,r.targetElementId??''))||[a,b].some((w,k)=>w.wall.sharedWallReference?.roomId===[b,a][k].room.id&&w.wall.sharedWallReference?.wallId===[b,a][k].wall.id))continue
  const dx=a.end.x-a.start.x,dy=a.end.y-a.start.y,len=Math.hypot(dx,dy),bdx=b.end.x-b.start.x,bdy=b.end.y-b.start.y,blen=Math.hypot(bdx,bdy);if(len<1e-6||blen<1e-6||Math.abs(dx*bdy-dy*bdx)/(len*blen)>.001)continue
  const along=(p:{x:number;y:number})=>((p.x-a.start.x)*dx+(p.y-a.start.y)*dy)/len
  const offset=Math.abs((b.start.x-a.start.x)*dy-(b.start.y-a.start.y)*dx)/len
  const overlap=Math.min(len,Math.max(along(b.start),along(b.end)))-Math.max(0,Math.min(along(b.start),along(b.end)))
  const thickness=((a.wall.thickness??0)+(b.wall.thickness??0))/2
  if(overlap>.01&&offset<Math.max(1e-6,thickness-1e-6))alerts.push({roomId:a.room.id,otherRoomId:b.room.id,message:`Conflito de paredes: ${a.room.name} / ${a.wall.label} e ${b.room.name} / ${b.wall.label} sobrepostas, sem vínculo de parede compartilhada. Confira medidas internas e espessura da parede entre ambientes.`})
 }
 return alerts
}
