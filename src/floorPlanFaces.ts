import type { Project,RoomPlacement } from './models'
import type { FaceRange } from './wallFaces'
import { buildPlanRoom,floorRooms,worldPoint,normalOf,pointDistance,planTolerance } from './floorPlan'
import { planRelationships,planFeature,sharedWallAlignment,sameSideForRelationship } from './floorPlanConnections'
// Only explicitly related, aligned walls are fused in this rendering projection.
// The two independent walls, their measurements and their openings remain intact.
export function sharedPlanFaces(project:Project,floorId:string,placements:RoomPlacement[]) {
 const suppressed=new Set<string>(),faces:{roomId:string;otherRoomId:string;ranges:FaceRange[]}[]=[],rooms=floorRooms(project,floorId)
 const relations=planRelationships(project,floorId).filter(r=>r.type==='shared_wall'),counts=new Map<string,number>()
 relations.forEach(r=>[`${r.sourceRoomId}:${r.sourceElementId}`,`${r.targetRoomId}:${r.targetElementId}`].forEach(key=>counts.set(key,(counts.get(key)??0)+1)))
 for(const r of relations){const a=rooms.find(x=>x.id===r.sourceRoomId),b=rooms.find(x=>x.id===r.targetRoomId),pa=placements.find(x=>x.roomId===r.sourceRoomId),pb=placements.find(x=>x.roomId===r.targetRoomId),ka=`${r.sourceRoomId}:${r.sourceElementId}`,kb=`${r.targetRoomId}:${r.targetElementId}`;if(!a||!b||!pa||!pb||counts.get(ka)!==1||counts.get(kb)!==1)continue
 const sa=buildPlanRoom(a),sb=buildPlanRoom(b),fa=planFeature(sa,'shared_wall',r.sourceElementId),fb=planFeature(sb,'shared_wall',r.targetElementId);if(!fa||!fb||!fa.thickness||!fb.thickness)continue
 const wa={...fa,start:worldPoint(fa.start,pa),end:worldPoint(fa.end,pa)},wb={...fb,start:worldPoint(fb.start,pb),end:worldPoint(fb.end,pb)},alignment=sharedWallAlignment(wa,wb,sameSideForRelationship(project,r))
 if(alignment.distanceM>planTolerance.alignmentM||alignment.angleDegrees>planTolerance.angleDegrees||alignment.differenceM>planTolerance.lengthM)continue
 const origin=wa.start,length=pointDistance(wa.start,wa.end),d={x:(wa.end.x-origin.x)/length,y:(wa.end.y-origin.y)/length},n=normalOf(wa.start,wa.end),dot=(p:{x:number;y:number})=>(p.x-origin.x)*d.x+(p.y-origin.y)*d.y
 const raw=[...(sa.faces.get(r.sourceElementId!)??[]).map(f=>({start:worldPoint(f.start,pa),end:worldPoint(f.end,pa)})),...(sb.faces.get(r.targetElementId!)??[]).map(f=>({start:worldPoint(f.start,pb),end:worldPoint(f.end,pb)}))],points=raw.flatMap(f=>[f.start,f.end]);if(!points.length)continue
 const offsets=points.map(p=>(p.x-origin.x)*n.x+(p.y-origin.y)*n.y),sides=[Math.min(...offsets),Math.max(...offsets)],holes=[...sa.survey.openings.placements.filter(o=>o.wall.id===r.sourceElementId).map(o=>[dot(worldPoint(o.start,pa)),dot(worldPoint(o.end,pa))]),...sb.survey.openings.placements.filter(o=>o.wall.id===r.targetElementId).map(o=>[dot(worldPoint(o.start,pb)),dot(worldPoint(o.end,pb))])].map(([a,b])=>[Math.max(0,Math.min(a,b)),Math.min(length,Math.max(a,b))]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]),merged:number[][]=[]
 holes.forEach(h=>{const last=merged.at(-1);if(last&&h[0]<=last[1])last[1]=Math.max(last[1],h[1]);else merged.push([...h])})
 const ranges:FaceRange[]=[];for(const side of sides){const same=points.filter(p=>Math.abs((p.x-origin.x)*n.x+(p.y-origin.y)*n.y-side)<1e-6),min=Math.min(0,...same.map(dot)),max=Math.max(length,...same.map(dot)),point=(t:number)=>({x:origin.x+d.x*t+n.x*side,y:origin.y+d.y*t+n.y*side});let cursor=min;for(const [start,end] of merged){if(start>cursor)ranges.push({start:point(cursor),end:point(start)});cursor=Math.max(cursor,end)}if(cursor<max)ranges.push({start:point(cursor),end:point(max)})}
 suppressed.add(ka);suppressed.add(kb);faces.push({roomId:a.id,otherRoomId:b.id,ranges})
 }
 return {suppressed,faces}
}
