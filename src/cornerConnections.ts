import type { Room, RoomPlacement, SpatialConnection, SpatialSide } from './models'
import { buildPlanRoom, alignRoomAnchors, putRoomPlacement } from './floorPlan'
import type { Project } from './models'
import { buildWallFaces } from './wallFaces'

export function cornerAnchor(room:Room,side:SpatialSide) {
  const shape=buildPlanRoom(room),corner=shape.survey.perimeter.corners.find(c=>c.id===side.elementId)
  if(!corner)return undefined
  const segment=shape.survey.perimeter.segments.find(s=>s.wall.id===corner.wallIds[0])
  if(!segment?.measured)return undefined
  const faces=buildWallFaces(shape.survey.perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace:room.wallMeasurementFace??'internal'})))
  const ranges=faces.get(segment.wall.id)??[],position=side.face==='external'?(ranges[1]?.end??corner.position):(ranges[0]?.end??corner.position)
  // The interior bisector follows the clockwise perimeter beginning at entry wall A.
  // Both incident walls and the actual corner angle participate, including reflex corners.
  const sign=side.face==='external'?-1:1
  const direction={x:corner.labelDirection.x*sign,y:corner.labelDirection.y*sign}
  return {position,angle:Math.atan2(direction.y,direction.x)*180/Math.PI}
}
export function cornerSnap(connection:SpatialConnection,source:Room,target:Room,anchor:RoomPlacement):RoomPlacement|undefined {
  const a=cornerAnchor(source,connection.a),b=cornerAnchor(target,connection.b)
  if(!a||!b)return undefined
  return alignRoomAnchors(target,anchor,a,b,connection.orientation!=='inverted')
}
export function confirmCornerConnection(project:Project,connection:SpatialConnection,anchor:RoomPlacement,preview:RoomPlacement):Project {
 const positioned=putRoomPlacement(putRoomPlacement(project,anchor),preview)
 return {...positioned,spatialConnections:[...project.spatialConnections??[],connection]}
}
