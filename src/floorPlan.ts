import type { Project,Room,RoomPlacement } from './models'
import type { Point } from './geometry'
import { buildRoomGeometry } from './roomGeometry'
import { buildWallFaces } from './wallFaces'
import { buildObjectPlacements } from './roomObjects'
import { projectRooms,flattenRooms } from './relationships'
export const planTolerance={alignmentM:.02,lengthM:.01,angleDegrees:1,snapM:.35,adjacencyM:.3,numericalM:1e-7}
export const pointDistance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
export function rotatePoint(p:Point,rotation:number):Point {const angle=(rotation%360)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return {x:p.x*c-p.y*s,y:p.x*s+p.y*c}}
export function worldPoint(p:Point,placement:RoomPlacement):Point {const r=rotatePoint(p,placement.rotation);return {x:r.x+placement.x,y:r.y+placement.y}}
export function inverseWorldPoint(p:Point,placement:RoomPlacement):Point {return rotatePoint({x:p.x-placement.x,y:p.y-placement.y},-placement.rotation)}
export const normalOf=(a:Point,b:Point)=>{const length=pointDistance(a,b)||1;return {x:-(b.y-a.y)/length,y:(b.x-a.x)/length}}
export const midpoint=(a:Point,b:Point)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2})
export const normalizeRotation=(angle:number)=>((angle%360)+360)%360
// One rigid transform for previews, snaps and saved placements. Angles are local.
export function alignRoomAnchors(room:Room,anchor:RoomPlacement,source:{position:Point;angle:number},target:{position:Point;angle:number},opposite=true):RoomPlacement {
 const rotation=normalizeRotation(anchor.rotation+source.angle-target.angle+(opposite?180:0))
 const world=worldPoint(source.position,anchor),rotated=rotatePoint(target.position,rotation)
 return {roomId:room.id,floorId:room.floorId,x:world.x-rotated.x,y:world.y-rotated.y,rotation}
}
export function floorRooms(project:Project,floorId:string) {return flattenRooms(project.floors.find(f=>f.id===floorId)?.rooms ?? [])}
export function floorPlacements(project:Project,floorId:string) {const ids=new Set(floorRooms(project,floorId).map(r=>r.id));return (project.roomPlacements ?? []).filter(p=>p.floorId===floorId && ids.has(p.roomId))}
export function cleanRoomPlacements(project:Project):Project {if(!project.roomPlacements)return project;const rooms=new Map(projectRooms(project).map(r=>[r.id,r]));return {...project,roomPlacements:project.roomPlacements.filter(p=>rooms.get(p.roomId)?.floorId===p.floorId)}}
export function putRoomPlacement(project:Project,placement:RoomPlacement):Project {return {...project,roomPlacements:[...(project.roomPlacements ?? []).filter(p=>p.roomId!==placement.roomId),{...placement}]}}
export function buildPlanRoom(room:Room) {
  const survey=buildRoomGeometry(room),referenceFace=room.wallMeasurementFace ?? 'internal'
  const ranges=new Map(survey.openings.wallLayouts.map(w=>[w.wallId,w.solidRanges]))
  const faces=buildWallFaces(survey.perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace})),ranges)
  const internalFaces=buildWallFaces(survey.internalWalls.placements.map(p=>({id:p.internalWall.id,start:p.start,end:p.end,thickness:p.internalWall.thicknessM,referenceFace})),ranges)
  const objects=buildObjectPlacements(room.objects ?? [],[...survey.perimeter.segments,...survey.internalWalls.placements.map(p=>({wall:{id:p.internalWall.id},start:p.start,end:p.end}))])
  const polygon=survey.perimeter.segments.map(s=>s.start)
  const uncut=buildWallFaces(survey.perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace})))
  const interiorPolygon=survey.perimeter.segments.map(s=>uncut.get(s.wall.id)?.[0]?.start ?? s.start)
  const points=[{x:0,y:0},...survey.perimeter.segments.flatMap(s=>[s.start,s.end]),...[...faces.values(),...internalFaces.values()].flat().flatMap(f=>[f.start,f.end]),...objects.flatMap(o=>o.bounds)]
  return {room,survey,faces,uncutFaces:uncut,internalFaces,objects,polygon,interiorPolygon,points}
}
export type PlanRoom=ReturnType<typeof buildPlanRoom>
export function planBounds(points:Point[]) {const p=points.length?points:[{x:0,y:0}];const minX=Math.min(...p.map(p=>p.x)),maxX=Math.max(...p.map(p=>p.x)),minY=Math.min(...p.map(p=>p.y)),maxY=Math.max(...p.map(p=>p.y));return {minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY}}
export function insertRoomPlacement(room:PlanRoom,placed:{shape:PlanRoom;placement:RoomPlacement}[]):RoomPlacement {
  const bounds=planBounds(placed.flatMap(({shape,placement})=>shape.points.map(p=>worldPoint(p,placement)))),local=planBounds(room.points)
  return {roomId:room.room.id,floorId:room.room.floorId,x:placed.length?bounds.maxX+1-local.minX:-local.minX,y:-local.minY,rotation:0}
}
export function pointInPolygon(point:Point,polygon:Point[],strict=true):boolean {
  let inside=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[j],b=polygon[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)
    if(length && Math.abs((point.x-a.x)*dy-(point.y-a.y)*dx)/length<planTolerance.numericalM && (point.x-a.x)*(point.x-b.x)+(point.y-a.y)*(point.y-b.y)<=planTolerance.numericalM) return !strict
    if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside
  }
  return inside
}
export function polygonsOverlap(a:Point[],b:Point[]):boolean {
  if(a.length<3 || b.length<3)return false
  const ba=planBounds(a),bb=planBounds(b),eps=planTolerance.numericalM
  if(ba.maxX<=bb.minX+eps || bb.maxX<=ba.minX+eps || ba.maxY<=bb.minY+eps || bb.maxY<=ba.minY+eps)return false
  const cross=(a:Point,b:Point,p:Point)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const x=a[i],y=a[(i+1)%a.length],p=b[j],q=b[(j+1)%b.length];if(cross(x,y,p)*cross(x,y,q)<-eps*eps && cross(p,q,x)*cross(p,q,y)<-eps*eps)return true}
  // Interior samples also detect identical/collinear polygons without flagging a shared boundary.
  const samples=(polygon:Point[])=>polygon.flatMap((p,i)=>{const q=polygon[(i+1)%polygon.length],m=midpoint(p,q),n=normalOf(p,q);return [p,m,{x:m.x+n.x*eps*10,y:m.y+n.y*eps*10},{x:m.x-n.x*eps*10,y:m.y-n.y*eps*10}]})
  return [...samples(a),...samples(b)].some(p=>pointInPolygon(p,a)&&pointInPolygon(p,b))
}
export function polygonDistance(a:Point[],b:Point[]):number {
  if(polygonsOverlap(a,b))return 0
  const distanceTo=(p:Point,x:Point,y:Point)=>{const dx=y.x-x.x,dy=y.y-x.y,t=Math.max(0,Math.min(1,((p.x-x.x)*dx+(p.y-x.y)*dy)/(dx*dx+dy*dy||1)));return pointDistance(p,{x:x.x+t*dx,y:x.y+t*dy})}
  if(!a.length || !b.length)return Infinity
  return Math.min(...a.flatMap(p=>b.map((x,i)=>distanceTo(p,x,b[(i+1)%b.length]))),...b.flatMap(p=>a.map((x,i)=>distanceTo(p,x,a[(i+1)%a.length]))))
}
