import type { Room, RoomPlacement, SpatialConnection, SpatialSide } from './models'
import { buildPlanRoom, alignRoomAnchors, putRoomPlacement, rotatePoint, normalizeRotation, midpoint } from './floorPlan'
import type { Project } from './models'
import { buildWallFaces } from './wallFaces'

export function cornerAnchor(room:Room,side:SpatialSide,placementMode?:SpatialConnection['placementMode']) {
  const shape=buildPlanRoom(room),corner=shape.survey.perimeter.corners.find(c=>c.id===side.elementId)
  if(!corner)return undefined
  const segment=shape.survey.perimeter.segments.find(s=>s.wall.id===corner.wallIds[0])
  if(!segment?.measured)return undefined
  const faces=buildWallFaces(shape.survey.perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace:room.wallMeasurementFace??'internal'})))
  const ranges=faces.get(segment.wall.id)??[],position=placementMode==='outside'&&ranges.length===2?midpoint(ranges[0].end,ranges[1].end):side.face==='external'?(ranges[1]?.end??corner.position):(ranges[0]?.end??corner.position)
  // The interior bisector follows the clockwise perimeter beginning at entry wall A.
  // Both incident walls and the actual corner angle participate, including reflex corners.
  const sign=side.face==='external'?-1:1
  const direction={x:corner.labelDirection.x*sign,y:corner.labelDirection.y*sign}
  return {position,corner,shape,angle:Math.atan2(direction.y,direction.x)*180/Math.PI}
}
export function cornerSnap(connection:SpatialConnection,source:Room,target:Room,anchor:RoomPlacement):RoomPlacement|undefined {
  if(connection.a.roomId!==source.id && connection.b.roomId===source.id) {
   const relative=cornerSnap(connection,target,source,{roomId:target.id,floorId:target.floorId,x:0,y:0,rotation:0})
   if(!relative)return undefined
   const rotation=normalizeRotation(anchor.rotation-relative.rotation),offset=rotatePoint(relative,rotation)
   return {roomId:target.id,floorId:target.floorId,x:anchor.x-offset.x,y:anchor.y-offset.y,rotation}
  }
  const a=cornerAnchor(source,connection.a,connection.placementMode),b=cornerAnchor(target,connection.b,connection.placementMode)
  if(!a||!b)return undefined
  if(connection.placementMode==='inside') {
   const interiorA=cornerAnchor(source,{...connection.a,face:'internal'})!,interiorB=cornerAnchor(target,{...connection.b,face:'internal'})!
   return alignRoomAnchors(target,anchor,{position:a.position,angle:interiorA.angle},{position:b.position,angle:interiorB.angle},false)
  }
  if(connection.placementMode==='outside') {
   const index=connection.sharedWallId===a.corner.wallIds[0]?0:1,targetIndex=index===0?1:0
   const sa=a.shape.survey.perimeter.segments.find(s=>s.wall.id===a.corner.wallIds[index]),sb=b.shape.survey.perimeter.segments.find(s=>s.wall.id===b.corner.wallIds[targetIndex])
   if(!sa||!sb)return undefined
   return alignRoomAnchors(target,anchor,{position:a.position,angle:Math.atan2(sa.direction.y,sa.direction.x)*180/Math.PI},{position:b.position,angle:Math.atan2(sb.direction.y,sb.direction.x)*180/Math.PI},true)
  }
  return alignRoomAnchors(target,anchor,a,b,connection.orientation!=='inverted')
}
export function confirmCornerConnection(project:Project,connection:SpatialConnection,anchor:RoomPlacement,preview:RoomPlacement):Project {
 const positioned=putRoomPlacement(putRoomPlacement(project,anchor),preview)
 return {...positioned,spatialConnections:[...(project.spatialConnections??[]).filter(c=>c.id!==connection.id),connection]}
}

// Incident wall pairs are derived from the corner link; no duplicate wall records are created.
export function cornerWallRelationships(project:Project,floorId:string) {
 const rooms=project.floors.find(f=>f.id===floorId)?.rooms??[],flatten=(list:Room[]):Room[]=>list.flatMap(r=>[r,...flatten(r.subrooms)])
 const byId=new Map(flatten(rooms).map(r=>[r.id,r])),result:import('./models').RoomRelationship[]=[]
 for(const connection of project.spatialConnections??[]) {
  if(connection.type!=='corner'||!connection.placementMode)continue
  const a=byId.get(connection.a.roomId),b=byId.get(connection.b.roomId);if(!a||!b)continue
  const ca=cornerAnchor(a,connection.a),cb=cornerAnchor(b,connection.b);if(!ca||!cb)continue
  const indices=connection.placementMode==='inside'?[0,1]:[connection.sharedWallId===ca.corner.wallIds[0]?0:1]
  for(const index of indices){const other=connection.placementMode==='inside'?index:1-index;result.push({id:`${connection.id}:wall:${index}`,type:'shared_wall',sourceRoomId:a.id,sourceElementId:ca.corner.wallIds[index],targetRoomId:b.id,targetElementId:cb.corner.wallIds[other],derivedFromCornerId:connection.id,placementMode:connection.placementMode})}
 }
 return result
}
