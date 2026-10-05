import type { Room, RoomPlacement, SpatialConnection, SpatialSide } from './models'
import { buildPlanRoom, alignRoomAnchors, putRoomPlacement, rotatePoint, normalizeRotation, midpoint, worldPoint, pointDistance } from './floorPlan'
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
  if(connection.assembly && connection.a.wallId && connection.b.wallId) {
   const sa=buildPlanRoom(source),sb=buildPlanRoom(target),ca=sa.survey.perimeter.corners.find(c=>c.id===connection.a.elementId&&c.wallIds.includes(connection.a.wallId!)),cb=sb.survey.perimeter.corners.find(c=>c.id===connection.b.elementId&&c.wallIds.includes(connection.b.wallId!)),wa=sa.survey.perimeter.segments.find(s=>s.wall.id===connection.a.wallId),wb=sb.survey.perimeter.segments.find(s=>s.wall.id===connection.b.wallId)
   if(!ca||!cb||!wa||!wb)return undefined
   return alignRoomAnchors(target,anchor,{position:ca.position,angle:Math.atan2(wa.direction.y,wa.direction.x)*180/Math.PI},{position:cb.position,angle:Math.atan2(wb.direction.y,wb.direction.x)*180/Math.PI},!connection.flipped)
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
  if(connection.type!=='corner'||connection.assemblyDetached)continue
  if(connection.assembly && connection.a.wallId && connection.b.wallId) {
   const a=byId.get(connection.a.roomId),b=byId.get(connection.b.roomId);if(!a||!b)continue
   const sa=buildPlanRoom(a),sb=buildPlanRoom(b),ca=sa.survey.perimeter.corners.find(c=>c.id===connection.a.elementId),cb=sb.survey.perimeter.corners.find(c=>c.id===connection.b.elementId),pa={roomId:a.id,floorId,x:0,y:0,rotation:0},pb=cornerSnap(connection,a,b,pa);if(!ca||!cb||!pb)continue
   for(const aid of ca.wallIds)for(const bid of cb.wallIds){const wa=sa.survey.perimeter.segments.find(s=>s.wall.id===aid),wb=sb.survey.perimeter.segments.find(s=>s.wall.id===bid);if(!wa||!wb)continue;const bs=worldPoint(wb.start,pb),be=worldPoint(wb.end,pb),length=pointDistance(wa.start,wa.end);if(!length)continue;const d={x:(wa.end.x-wa.start.x)/length,y:(wa.end.y-wa.start.y)/length},dot=(p:{x:number;y:number})=>(p.x-wa.start.x)*d.x+(p.y-wa.start.y)*d.y,off=(p:{x:number;y:number})=>Math.abs((p.x-wa.start.x)*d.y-(p.y-wa.start.y)*d.x),overlap=Math.min(length,Math.max(dot(bs),dot(be)))-Math.max(0,Math.min(dot(bs),dot(be)));if(off(bs)>1e-6||off(be)>1e-6||overlap<=1e-6)continue;const same=(be.x-bs.x)*d.x+(be.y-bs.y)*d.y>0;result.push({id:`${connection.id}:wall:${aid}:${bid}`,type:'shared_wall',sourceRoomId:a.id,sourceElementId:aid,targetRoomId:b.id,targetElementId:bid,derivedFromCornerId:connection.id,placementMode:same?'inside':'outside'})}
   continue
  }
  if(!connection.placementMode)continue
  const a=byId.get(connection.a.roomId),b=byId.get(connection.b.roomId);if(!a||!b)continue
  const ca=cornerAnchor(a,connection.a),cb=cornerAnchor(b,connection.b);if(!ca||!cb)continue
  const indices=connection.placementMode==='inside'?[0,1]:[connection.sharedWallId===ca.corner.wallIds[0]?0:1]
  for(const index of indices){const other=connection.placementMode==='inside'?index:1-index;result.push({id:`${connection.id}:wall:${index}`,type:'shared_wall',sourceRoomId:a.id,sourceElementId:ca.corner.wallIds[index],targetRoomId:b.id,targetElementId:cb.corner.wallIds[other],derivedFromCornerId:connection.id,placementMode:connection.placementMode})}
 }
 return result
}
