import type { Project,RoomPlacement } from './models'
import { floorRooms } from './floorPlan'
// Counterparts remain survey entities. Only the origin supplies the plan symbol.
export function duplicatePlanOpenings(project:Project,floorId:string,placements:RoomPlacement[]) {
 const suppressed=new Set<string>(),rooms=floorRooms(project,floorId),placed=new Set(placements.map(p=>p.roomId)),entries=rooms.flatMap(room=>room.openings.map(opening=>({roomId:room.id,opening})))
 for(const a of entries){if(!placed.has(a.roomId))continue
  const connection=project.spatialConnections?.find(c=>c.type==='opening'&&!c.assemblyDetached&&[c.a,c.b].some(s=>s.roomId===a.roomId&&s.elementId===a.opening.id)),other=connection?(connection.a.roomId===a.roomId?connection.b:connection.a):undefined
  const b=entries.find(b=>b.roomId===(other?.roomId??a.opening.connectedRoomId)&&b.opening.id===(other?.elementId??a.opening.connectedOpeningId));if(!b||!placed.has(b.roomId))continue
  const origin=a.opening.originOpeningId??b.opening.originOpeningId??connection?.a.elementId??a.opening.id
  if(origin!==a.opening.id)suppressed.add(`${a.roomId}:${a.opening.id}`)
 }
 return suppressed
}
