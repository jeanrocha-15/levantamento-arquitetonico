import type { Project,RoomPlacement } from './models'
import { buildPlanRoom,floorRooms,worldPoint,pointDistance } from './floorPlan'
// Only one graphical symbol for an explicitly paired and actually aligned physical opening.
// Misaligned counterparts stay visible so that survey divergences are not hidden.
export function duplicatePlanOpenings(project:Project,floorId:string,placements:RoomPlacement[]) {
 const suppressed=new Set<string>(),rooms=floorRooms(project,floorId),entries=rooms.flatMap(room=>{const placement=placements.find(p=>p.roomId===room.id);return placement?buildPlanRoom(room).survey.openings.placements.map(o=>({roomId:room.id,opening:o.opening,start:worldPoint(o.start,placement),end:worldPoint(o.end,placement)})):[]})
 for(const a of entries){const connection=project.spatialConnections?.find(c=>c.type==='opening'&&!c.assemblyDetached&&[c.a,c.b].some(s=>s.roomId===a.roomId&&s.elementId===a.opening.id)),other=connection?(connection.a.roomId===a.roomId?connection.b:connection.a):undefined
 const b=entries.find(b=>b.roomId===(other?.roomId??a.opening.connectedRoomId)&&b.opening.id===(other?.elementId??a.opening.connectedOpeningId));if(!b||b.opening.type!==a.opening.type)continue
 const aligned=Math.min(Math.max(pointDistance(a.start,b.start),pointDistance(a.end,b.end)),Math.max(pointDistance(a.start,b.end),pointDistance(a.end,b.start)))<=.02
 if(aligned)suppressed.add([`${a.roomId}:${a.opening.id}`,`${b.roomId}:${b.opening.id}`].sort()[1])
 }
 return suppressed
}
