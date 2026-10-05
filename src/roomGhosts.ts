import type { Project,Room } from './models'
import { projectRooms } from './relationships'
import { buildPlanRoom,inverseWorldPoint,worldPoint } from './floorPlan'
import { snapChoices } from './floorPlanConnections'

// Tree membership never supplies geometric coordinates. Use saved placement or an
// unambiguous structural connection; omit unknown positions instead of guessing.
export function roomGhosts(project:Project,room:Room) {
  const rooms=projectRooms(project),related=new Set<string>(room.subrooms.map(r=>r.id))
  if(room.parentRoomId)related.add(room.parentRoomId)
  project.spatialConnections?.forEach(c=>{if(c.a.roomId===room.id)related.add(c.b.roomId);if(c.b.roomId===room.id)related.add(c.a.roomId)})
  project.relationships.forEach(c=>{if(c.sourceRoomId===room.id)related.add(c.targetRoomId);if(c.targetRoomId===room.id)related.add(c.sourceRoomId)})
  const own=project.roomPlacements?.find(p=>p.roomId===room.id)
  return rooms.filter(r=>related.has(r.id)&&r.floorId===room.floorId).flatMap(target=>{
    const saved=project.roomPlacements?.find(p=>p.roomId===target.id),shape=buildPlanRoom(target)
    if(own&&saved)return [{room:target,segments:shape.survey.perimeter.segments.map(s=>({start:inverseWorldPoint(worldPoint(s.start,saved),own),end:inverseWorldPoint(worldPoint(s.end,saved),own)}))}]
    const anchor={roomId:room.id,floorId:room.floorId,x:0,y:0,rotation:0},choices=snapChoices(project,room.floorId,target.id,[anchor])
    if(choices.length!==1)return []
    return [{room:target,segments:shape.survey.perimeter.segments.map(s=>({start:worldPoint(s.start,choices[0].placement),end:worldPoint(s.end,choices[0].placement)}))}]
  })
}
