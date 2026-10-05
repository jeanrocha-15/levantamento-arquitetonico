import type { Room, RoomPlacement, SpatialConnection, SpatialSide } from './models'
import { buildPlanRoom, normalizeRotation, rotatePoint, worldPoint } from './floorPlan'
import { buildWallFaces } from './wallFaces'

export function cornerAnchor(room:Room,side:SpatialSide) {
  const shape=buildPlanRoom(room),corner=shape.survey.perimeter.corners.find(c=>c.id===side.elementId)
  if(!corner)return undefined
  const segment=shape.survey.perimeter.segments.find(s=>s.wall.id===corner.wallIds[0])
  if(!segment?.measured)return undefined
  const faces=buildWallFaces(shape.survey.perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace:room.wallMeasurementFace??'internal'})))
  const ranges=faces.get(segment.wall.id)??[],position=side.face==='external'?(ranges[1]?.end??corner.position):(ranges[0]?.end??corner.position)
  return {position,angle:Math.atan2(segment.direction.y,segment.direction.x)*180/Math.PI}
}
export function cornerSnap(connection:SpatialConnection,source:Room,target:Room,anchor:RoomPlacement):RoomPlacement|undefined {
  const a=cornerAnchor(source,connection.a),b=cornerAnchor(target,connection.b)
  if(!a||!b)return undefined
  const rotation=normalizeRotation(anchor.rotation+a.angle-b.angle+(connection.orientation==='inverted'?0:180)),sp=worldPoint(a.position,anchor),tp=rotatePoint(b.position,rotation)
  return {roomId:target.id,floorId:target.floorId,x:sp.x-tp.x,y:sp.y-tp.y,rotation}
}
