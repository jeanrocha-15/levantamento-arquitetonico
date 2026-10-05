import type { Project,Room,RoomPlacement,SpatialConnection,SpatialSide } from './models'
import { alignRoomAnchors,buildPlanRoom,floorRooms,floorPlacements,midpoint,normalizeRotation,pointDistance,rotatePoint,worldPoint } from './floorPlan'
import { planFeature,snapChoices } from './floorPlanConnections'
export type FitType='opening'|'shared_wall'|'corner'
export interface AssemblyPick extends SpatialSide { elementId:string }
export function assemblyAnchor(room:Room,type:FitType,side:SpatialSide,shape=buildPlanRoom(room)) {
 if(type==='corner') {const corner=shape.survey.perimeter.corners.find(c=>c.id===side.elementId);if(!corner||!side.wallId||!corner.wallIds.includes(side.wallId))return undefined;const wall=shape.survey.perimeter.segments.find(s=>s.wall.id===side.wallId);if(!wall?.measured)return undefined;return {position:corner.position,angle:Math.atan2(wall.direction.y,wall.direction.x)*180/Math.PI}}
 const f=planFeature(shape,type==='opening'?'opening_connection':'shared_wall',side.elementId);if(!f)return undefined
 return {position:midpoint(f.start,f.end),angle:Math.atan2(f.end.y-f.start.y,f.end.x-f.start.x)*180/Math.PI}
}
// The saved temporary placement is the preview. No local geometry or scale changes.
export function assemblyPlacement(project:Project,connection:SpatialConnection,anchor:RoomPlacement):RoomPlacement|undefined {
 const rooms=floorRooms(project,anchor.floorId),forward=anchor.roomId===connection.a.roomId,a=forward?connection.a:connection.b,b=forward?connection.b:connection.a,source=rooms.find(r=>r.id===a.roomId),target=rooms.find(r=>r.id===b.roomId)
 if(!source||!target||connection.type==='manual')return undefined
 const sa=assemblyAnchor(source,connection.type,a),sb=assemblyAnchor(target,connection.type,b);if(!sa||!sb)return undefined
 return {...alignRoomAnchors(target,anchor,sa,sb,!connection.flipped),locked:floorPlacements(project,anchor.floorId).find(p=>p.roomId===target.id)?.locked??false}
}
export function connectedAssembly(project:Project,roomId:string,excludeRoomId?:string) {
 const owners=new Map(project.floors.flatMap(f=>floorRooms(project,f.id).map(r=>[r.id,f.id] as const))),floorId=owners.get(roomId),ids=new Set([roomId]);let changed=true
 while(changed){changed=false;for(const c of project.spatialConnections??[]){if(owners.get(c.a.roomId)!==floorId||owners.get(c.b.roomId)!==floorId||c.a.roomId===excludeRoomId||c.b.roomId===excludeRoomId||c.assemblyDetached||c.assemblyLocked===false||!c.a.elementId||!c.b.elementId)continue;if(ids.has(c.a.roomId)!==ids.has(c.b.roomId)){ids.add(c.a.roomId);ids.add(c.b.roomId);changed=true}}}
 return ids
}
export function transformAssembly(placements:RoomPlacement[],from:RoomPlacement,to:RoomPlacement,ids:Set<string>) {
 const angle=to.rotation-from.rotation
 return placements.map(p=>{if(!ids.has(p.roomId))return p;const delta=rotatePoint({x:p.x-from.x,y:p.y-from.y},angle);return {...p,x:to.x+delta.x,y:to.y+delta.y,rotation:normalizeRotation(p.rotation+angle)}})
}
export function openingAvailable(project:Project,roomId:string,id:string,otherRoomId:string,otherId?:string) {
 const room=project.floors.flatMap(f=>floorRooms(project,f.id)).find(r=>r.id===roomId),opening=room?.openings.find(o=>o.id===id)
 if(!opening)return false
 if(opening.connectedOpeningId && opening.connectedOpeningId!==otherId)return false
 if(opening.connectedRoomId && opening.connectedRoomId!==otherRoomId)return false
 return !(project.spatialConnections??[]).some(c=>c.type==='opening'&&c.a.elementId&&c.b.elementId&&[c.a,c.b].some(s=>s.roomId===roomId&&s.elementId===id)&&![c.a,c.b].some(s=>s.roomId===otherRoomId&&s.elementId===otherId))
}
export function snapPlacement(project:Project,desired:RoomPlacement,gridStep=.1,excluded=new Set([desired.roomId])) {
 const rooms=floorRooms(project,desired.floorId),room=rooms.find(r=>r.id===desired.roomId);if(!room)return desired
 const threshold=.18,angular=(a:number,b:number)=>Math.abs(normalizeRotation(a-b+180)-180)
 const candidates:RoomPlacement[]=[]
 for(const c of project.spatialConnections??[]){if(!c.assembly||c.assemblyDetached||![c.a.roomId,c.b.roomId].includes(room.id))continue;const fixed=floorPlacements(project,desired.floorId).find(p=>p.roomId===(c.a.roomId===room.id?c.b.roomId:c.a.roomId));if(fixed&&!excluded.has(fixed.roomId)){const p=assemblyPlacement(project,c,fixed);if(p)candidates.push(p)}}
 candidates.push(...snapChoices(project,desired.floorId,room.id).filter(c=>!excluded.has(c.relationship.sourceRoomId===room.id?c.relationship.targetRoomId:c.relationship.sourceRoomId)).map(c=>c.placement))
 const nearest=(list:RoomPlacement[])=>list.filter(p=>pointDistance(p,desired)<threshold&&angular(p.rotation,desired.rotation)<12).sort((a,b)=>pointDistance(a,desired)-pointDistance(b,desired))[0]
 const linked=nearest(candidates);if(linked)return {...desired,x:linked.x,y:linked.y,rotation:linked.rotation}
 const shape=buildPlanRoom(room),nearby:RoomPlacement[]=[]
 for(const fixed of floorPlacements(project,desired.floorId)){if(excluded.has(fixed.roomId))continue;const other=rooms.find(r=>r.id===fixed.roomId);if(!other)continue;const otherShape=buildPlanRoom(other)
  for(const type of ['opening','corner','shared_wall'] as const){
   const picks=(r:Room,s:ReturnType<typeof buildPlanRoom>):AssemblyPick[]=>type==='opening'?r.openings.map(o=>({roomId:r.id,elementId:o.id})):type==='shared_wall'?r.walls.map(w=>({roomId:r.id,elementId:w.id})):s.survey.perimeter.corners.flatMap(c=>c.wallIds.map(wallId=>({roomId:r.id,elementId:c.id,wallId})))
   const fixedAnchors=picks(other,otherShape).map(a=>({a,anchor:assemblyAnchor(other,type,a,otherShape)})),mobileAnchors=picks(room,shape).map(b=>({b,anchor:assemblyAnchor(room,type,b,shape)}))
   for(const {a,anchor:aa} of fixedAnchors)for(const {b,anchor:bb} of mobileAnchors){if(!aa||!bb||pointDistance(worldPoint(aa.position,fixed),worldPoint(bb.position,desired))>threshold)continue;if(type==='opening'&&(!openingAvailable(project,a.roomId,a.elementId,b.roomId,b.elementId)||!openingAvailable(project,b.roomId,b.elementId,a.roomId,a.elementId)))continue;for(const flipped of type==='opening'?[false]:[false,true])nearby.push(alignRoomAnchors(room,fixed,aa,bb,!flipped))}
  }
 }
 const close=nearest(nearby);if(close)return {...desired,x:close.x,y:close.y,rotation:close.rotation}
 return {...desired,x:Math.round(desired.x/gridStep)*gridStep,y:Math.round(desired.y/gridStep)*gridStep}
}
export function wallPlanningValue(project:Project,roomId:string,wallId:string) {return project.wallCompatibilities?.find(c=>c.strategy!=='original'&&((c.a.roomId===roomId&&c.a.wallId===wallId)||(c.b.roomId===roomId&&c.b.wallId===wallId)))?.valueM}
