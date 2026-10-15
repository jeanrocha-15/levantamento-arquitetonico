import type { PlanRoom } from './floorPlan'
import { worldPoint } from './floorPlan'
import type { RoomPlacement } from './models'
import type { Point } from './geometry'
import { openingSymbol } from './openingSymbols'
import { openingFrame } from './openingFrame'
import { pointsBox } from './architecturalDimensions'
import type { DimensionRequest, DimensionBox } from './architecturalDimensions'
export function surveyDimensions(shown:{shape:PlanRoom;placement?:RoomPlacement}[],font:number,format:(value:number|null|undefined)=>string,options:{all?:boolean;selectedKey?:string}={}){
 const requests:DimensionRequest[]=[],obstacles:DimensionBox[]=[]
 for(const {shape,placement} of shown){const at=(p:Point)=>placement?worldPoint(p,placement):p,room=shape.room
  for(const s of shape.survey.perimeter.segments){requests.push({key:`${room.id}|wall:${s.wall.id}`,a:at(s.start),b:at(s.end),text:`${s.wall.label} · ${format(s.wall.lengthM)}`,thickness:s.wall.thickness??0,side:(placement?room.planLabelOffsets:room.labelOffsets)?.[`wall:${s.wall.id}`]?.side})}
  for(const p of shape.survey.internalWalls.placements)requests.push({key:`${room.id}|internal:${p.internalWall.id}`,a:at(p.start),b:at(p.end),text:`${p.internalWall.label} · ${format(p.internalWall.lengthM)}`,thickness:p.internalWall.thicknessM??0,side:(placement?room.planLabelOffsets:room.labelOffsets)?.[`internal:${p.internalWall.id}`]?.side})
  for(const faces of [...shape.faces.values(),...shape.internalFaces.values()])for(const f of faces)obstacles.push(pointsBox([at(f.start),at(f.end)],font*.15))
  for(const o of shape.survey.openings.placements){for(const part of openingSymbol(o.opening,o.start,o.end,openingFrame(shape.survey.perimeter,o,room.wallMeasurementFace)))obstacles.push(pointsBox([part.a,part.b,...part.kind==='curve'?[part.c1,part.c2]:[]].map(at),font*.15));const a=at(o.start),b=at(o.end),length=Math.hypot(b.x-a.x,b.y-a.y)||1,p={x:(a.x+b.x)/2-(b.y-a.y)/length*font*2,y:(a.y+b.y)/2+(b.x-a.x)/length*font*2};obstacles.push({x:p.x-font*6,y:p.y-font,width:font*12,height:font*5})}
  shape.objects.forEach(o=>obstacles.push(pointsBox(o.bounds.map(at),font)))
  const bounds=pointsBox(shape.polygon.map(at)),text=`${room.displayId??''} ${room.name}`;obstacles.push({x:bounds.x+bounds.width/2-text.length*font*.3,y:bounds.y+bounds.height/2-font,width:text.length*font*.6,height:font*3})
  shape.survey.perimeter.corners.forEach(c=>{const p=at(c.position);obstacles.push({x:p.x-font*2,y:p.y-font*2,width:font*4,height:font*4})})
 }
 if(options.all)return {requests,obstacles}
 const kept:DimensionRequest[]=[]
 for(const r of requests){
  const length=Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y),ux=(r.b.x-r.a.x)/length,uy=(r.b.y-r.a.y)/length
  if(r.key===options.selectedKey){kept.push(r);continue}
  // Small returns remain selectable in the editor, but do not crowd the overview.
  if(length<font*3)continue
  const previousInRoom=requests.slice(0,requests.indexOf(r)).filter(p=>p.key.split('|')[0]===r.key.split('|')[0])
  const duplicate=[...kept,...previousInRoom].some(p=>{
   const plen=Math.hypot(p.b.x-p.a.x,p.b.y-p.a.y)
   if(Math.abs(plen-length)>1e-6||Math.abs((p.b.x-p.a.x)*uy-(p.b.y-p.a.y)*ux)>1e-6)return false
   const sameRoom=p.key.split('|')[0]===r.key.split('|')[0],shape=shown.find(s=>s.shape.room.id===r.key.split('|')[0])?.shape
   if(sameRoom&&shape?.survey.perimeter.segments.length===4&&shape.survey.perimeter.corners.every(c=>Math.abs(c.visualAngle-90)<.001))return true
   const along=Math.abs(((p.a.x+p.b.x-r.a.x-r.b.x)*ux+(p.a.y+p.b.y-r.a.y-r.b.y)*uy)/2)
   const across=Math.abs((p.a.x-r.a.x)*uy-(p.a.y-r.a.y)*ux)
   return !sameRoom&&along<1e-6&&across<=Math.max(r.thickness??0,p.thickness??0)+.001
  })
  if(!duplicate)kept.push(r)
 }
 return {requests:kept,obstacles}
}
