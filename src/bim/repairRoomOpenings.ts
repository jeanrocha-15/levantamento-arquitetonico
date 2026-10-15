import type {Project,Room} from '../models'
import {buildRoomGeometry} from '../roomGeometry'
import {getWallReferences} from '../openings'

// One-time repair of old imports: restore missing survey references, never move
// the physical openings or overwrite a measurement already entered in a room.
export function repairRoomOpenings(project:Project):Project {
 if(!project.bim)return project
 const next=structuredClone(project),rooms:Room[]=[]
 const visit=(items:Room[])=>items.forEach(r=>{rooms.push(r);visit(r.subrooms)})
 next.floors.forEach(f=>visit(f.rooms))
 for(const physical of next.bim!.openings){
  const existing=rooms.flatMap(r=>r.openings).find(o=>o.physicalOpeningId===physical.lacId)
  let label=existing?.label
  if(!label){const prefix={door:'P',window:'J',gap:'V'}[physical.type],used=new Set(rooms.flatMap(r=>r.openings.map(o=>o.label)));let n=1;while(used.has(prefix+String(n).padStart(2,'0')))n++;label=prefix+String(n).padStart(2,'0')}
  for(const room of rooms){
   if(room.openings.some(o=>o.physicalOpeningId===physical.lacId))continue
   const placement=next.roomPlacements?.find(p=>p.roomId===room.id);if(!placement)continue
   const angle=placement.rotation*Math.PI/180,dx=physical.position[0]-placement.x,dy=-physical.position[1]-placement.y
   const local={x:dx*Math.cos(angle)+dy*Math.sin(angle),y:-dx*Math.sin(angle)+dy*Math.cos(angle)}
   const candidates=buildRoomGeometry(room).perimeter.segments.filter(s=>s.wall.physicalWallId===physical.hostWallId).map(s=>{
    const along=(local.x-s.start.x)*s.direction.x+(local.y-s.start.y)*s.direction.y,offset=along-(physical.width??0)/2
    return {s,offset,overlap:Math.min(s.wall.lengthM??0,offset+(physical.width??0))-Math.max(0,offset)}
   }).filter(c=>c.overlap>1e-6).sort((a,b)=>b.overlap-a.overlap)
   const candidate=candidates[0];if(!candidate)continue
   const reference=getWallReferences(room.walls,room.corners,candidate.s.wall.id)[0];if(!reference)continue
   const id=`${physical.lacId}:room:${room.id}`
   room.openings.push({id,lacId:id,revitUniqueId:physical.revitUniqueId,physicalOpeningId:physical.lacId,note:physical.note,label,type:physical.type,wallId:candidate.s.wall.id,referenceCornerId:reference.id,offsetM:candidate.offset,widthM:physical.width,heightM:physical.height,sillHeightM:physical.sill})
   if(!physical.roomRefs.some(ref=>ref.roomId===room.id))physical.roomRefs.push({roomId:room.id,openingId:id})
  }
  const sides=rooms.flatMap(room=>room.openings.filter(o=>o.physicalOpeningId===physical.lacId).map(opening=>({room,opening})))
  if(sides.length===2){const [a,b]=sides
   if((!a.opening.connectedOpeningId||a.opening.connectedOpeningId===b.opening.id)&&(!b.opening.connectedOpeningId||b.opening.connectedOpeningId===a.opening.id)){
    a.opening.connectedRoomId=b.room.id;a.opening.connectedOpeningId=b.opening.id
    b.opening.connectedRoomId=a.room.id;b.opening.connectedOpeningId=a.opening.id
    next.spatialConnections??=[]
    if(!next.spatialConnections.some(c=>c.type==='opening'&&(c.a.elementId===a.opening.id||c.b.elementId===a.opening.id)))next.spatialConnections.push({id:physical.lacId+':connection',type:'opening',a:{roomId:a.room.id,elementId:a.opening.id},b:{roomId:b.room.id,elementId:b.opening.id}})
   }
  }
 }
 return next
}
