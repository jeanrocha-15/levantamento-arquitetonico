import type { Project,RoomPlacement } from './models'
import type { FaceRange } from './wallFaces'
import { buildPlanRoom,floorRooms,worldPoint,normalOf,pointDistance,planTolerance } from './floorPlan'
import { planRelationships,planFeature,sharedWallAlignment,sameSideForRelationship } from './floorPlanConnections'
export function sharedPlanFaces(project:Project,floorId:string,placements:RoomPlacement[]) {
 const suppressed=new Set<string>(),faces:{roomId:string;otherRoomId:string;ranges:FaceRange[]}[]=[],rooms=floorRooms(project,floorId)
 const groups=new Map<string,{roomId:string;otherRoomId:string;ranges:FaceRange[]}>()
 const relations=planRelationships(project,floorId).filter(r=>r.type==='shared_wall')
 for(const r of planRelationships(project,floorId).filter(r=>r.type==='opening_connection')){
  const a=rooms.find(x=>x.id===r.sourceRoomId)?.openings.find(o=>o.id===r.sourceElementId),b=rooms.find(x=>x.id===r.targetRoomId)?.openings.find(o=>o.id===r.targetElementId)
  if(a&&b&&!relations.some(w=>w.sourceRoomId===r.sourceRoomId&&w.sourceElementId===a.wallId&&w.targetRoomId===r.targetRoomId&&w.targetElementId===b.wallId))relations.push({...r,type:'shared_wall',sourceElementId:a.wallId,targetElementId:b.wallId})
 }
 for(const r of relations){
  const a=rooms.find(x=>x.id===r.sourceRoomId),b=rooms.find(x=>x.id===r.targetRoomId),pa=placements.find(x=>x.roomId===r.sourceRoomId),pb=placements.find(x=>x.roomId===r.targetRoomId),ka=`${r.sourceRoomId}:${r.sourceElementId}`,kb=`${r.targetRoomId}:${r.targetElementId}`
  if(!a||!b||!pa||!pb)continue
  const sa=buildPlanRoom(a),sb=buildPlanRoom(b),fa=planFeature(sa,'shared_wall',r.sourceElementId),fb=planFeature(sb,'shared_wall',r.targetElementId);if(!fa||!fb||!fa.thickness||!fb.thickness)continue
  const wa={...fa,start:worldPoint(fa.start,pa),end:worldPoint(fa.end,pa)},wb={...fb,start:worldPoint(fb.start,pb),end:worldPoint(fb.end,pb)},alignment=sharedWallAlignment(wa,wb,sameSideForRelationship(project,r))
  if(alignment.distanceM>planTolerance.alignmentM||alignment.angleDegrees>planTolerance.angleDegrees)continue
  const origin=wa.start,length=pointDistance(wa.start,wa.end),d={x:(wa.end.x-origin.x)/length,y:(wa.end.y-origin.y)/length},n=normalOf(wa.start,wa.end),dot=(p:{x:number;y:number})=>(p.x-origin.x)*d.x+(p.y-origin.y)*d.y
  const low=Math.max(0,Math.min(dot(wb.start),dot(wb.end))),high=Math.min(length,Math.max(dot(wb.start),dot(wb.end)));if(high-low<1e-8)continue
  const groupA=groups.get(ka),groupB=groups.get(kb);if(groupA&&groupA===groupB)continue
  const rawA=groupA?.ranges??(sa.faces.get(r.sourceElementId!)??[]).map(f=>({start:worldPoint(f.start,pa),end:worldPoint(f.end,pa)})),rawB=groupB?.ranges??(sb.faces.get(r.targetElementId!)??[]).map(f=>({start:worldPoint(f.start,pb),end:worldPoint(f.end,pb)})),ranges:FaceRange[]=[]
  // Retain the exclusive pieces, with their actual thickness and corner offsets.
  for(const f of [...rawA,...rawB]){const x=dot(f.start),y=dot(f.end),delta=y-x
   if(Math.abs(delta)<1e-9){if(x<low-1e-8||x>high+1e-8)ranges.push(f);continue}
   const cut=(lo:number,hi:number)=>{const t0=Math.max(0,Math.min((lo-x)/delta,(hi-x)/delta)),t1=Math.min(1,Math.max((lo-x)/delta,(hi-x)/delta));if(t1-t0>1e-9){const at=(t:number)=>({x:f.start.x+(f.end.x-f.start.x)*t,y:f.start.y+(f.end.y-f.start.y)*t});ranges.push({start:at(t0),end:at(t1)})}}
   cut(-1e12,low);cut(high,1e12)
  }
  // The source supplies the physical wall band in the common interval.
  const offsets=rawA.flatMap(f=>[f.start,f.end]).map(p=>(p.x-origin.x)*n.x+(p.y-origin.y)*n.y);if(!offsets.length)continue
  const sides=[Math.min(...offsets),Math.max(...offsets)],at=(t:number,offset:number)=>({x:origin.x+d.x*t+n.x*offset,y:origin.y+d.y*t+n.y*offset})
  const inheritedHoles=rooms.flatMap(room=>{const placement=placements.find(p=>p.roomId===room.id);if(!placement)return [];return buildPlanRoom(room).survey.openings.placements.filter(o=>{const group=groups.get(`${room.id}:${o.wall.id}`);return !!group&&(group===groupA||group===groupB)}).map(o=>[dot(worldPoint(o.start,placement)),dot(worldPoint(o.end,placement))])})
  const holes=[...inheritedHoles,...sa.survey.openings.placements.filter(o=>o.wall.id===r.sourceElementId).map(o=>[dot(worldPoint(o.start,pa)),dot(worldPoint(o.end,pa))]),...sb.survey.openings.placements.filter(o=>o.wall.id===r.targetElementId).map(o=>[dot(worldPoint(o.start,pb)),dot(worldPoint(o.end,pb))])].map(([a,b])=>[Math.max(low,Math.min(a,b)),Math.min(high,Math.max(a,b))]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]),merged:number[][]=[]
  holes.forEach(h=>{const last=merged.at(-1);if(last&&h[0]<=last[1])last[1]=Math.max(last[1],h[1]);else merged.push([...h])})
  for(const side of sides){let cursor=low;for(const [start,end] of merged){if(start>cursor)ranges.push({start:at(cursor,side),end:at(start,side)});cursor=Math.max(cursor,end)}if(cursor<high)ranges.push({start:at(cursor,side),end:at(high,side)})}
  for(const hole of merged)for(const t of hole)ranges.push({start:at(t,sides[0]),end:at(t,sides[1])})
  // Keep an existing free end cap, once, when it borders the overlap.
  for(const f of rawA){const x=dot(f.start),y=dot(f.end);if(Math.abs(x-y)<1e-8&&(Math.abs(x-low)<1e-8||Math.abs(x-high)<1e-8)&&!merged.some(([lo,hi])=>x>=lo-1e-8&&x<=hi+1e-8))ranges.push(f)}
  suppressed.add(ka);suppressed.add(kb);const group={roomId:a.id,otherRoomId:b.id,ranges:mergeFaceRanges(ranges)};for(const [key,value] of groups)if(value===groupA||value===groupB)groups.set(key,group);groups.set(ka,group);groups.set(kb,group)
 }
 faces.push(...new Set(groups.values()));return {suppressed,faces}
}

function mergeFaceRanges(input:FaceRange[]):FaceRange[]{
 const ranges:FaceRange[]=[]
 for(const initial of input){let face=initial,changed=true
  while(changed){changed=false;for(let i=0;i<ranges.length;i++){const other=ranges[i],length=pointDistance(face.start,face.end);if(length<1e-10)break;const d={x:(face.end.x-face.start.x)/length,y:(face.end.y-face.start.y)/length},dot=(p:FaceRange['start'])=>(p.x-face.start.x)*d.x+(p.y-face.start.y)*d.y,cross=(p:FaceRange['start'])=>Math.abs((p.x-face.start.x)*d.y-(p.y-face.start.y)*d.x),lo=Math.min(dot(other.start),dot(other.end)),hi=Math.max(dot(other.start),dot(other.end));if(cross(other.start)<1e-8&&cross(other.end)<1e-8&&lo<=length+1e-8&&hi>=-1e-8){const at=(t:number)=>({x:face.start.x+d.x*t,y:face.start.y+d.y*t});face={start:at(Math.min(0,lo)),end:at(Math.max(length,hi))};ranges.splice(i,1);changed=true;break}}}
  if(pointDistance(face.start,face.end)>1e-10)ranges.push(face)
 }
 return ranges
}
