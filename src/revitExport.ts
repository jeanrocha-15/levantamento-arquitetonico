import {wallConflicts} from './wallConflicts'
import {roomWallHeight} from './ceilingHeight'
import type { Project } from './models'
import { floorRooms, buildPlanRoom, worldPoint } from './floorPlan'
import { buildWallFaces } from './wallFaces'

// Versioned exchange contract; source measurements remain untouched.
export function createRevitExchange(project:Project, floorId:string, elevationM:number) {
 if(!Number.isFinite(elevationM)) throw new Error('Informe uma elevação válida.')
 const floor=project.floors.find(f=>f.id===floorId)
 if(!floor) throw new Error('Selecione um pavimento.')
 const conflicts=wallConflicts(project,floorId,project.roomPlacements??[])
 if(conflicts.length)throw new Error(conflicts.map(c=>c.message).join(' '))
 const warnings:string[]=[]
 const openings:{id:string;label:string;type:string;hostWallId:string;roomId:string;physicalKey:string;sourceRefs:{roomId:string;id:string}[];start:number[];end:number[]}[]=[]
 const walls: {id:string;roomId:string;label:string;start:number[];end:number[];heightM:number;thicknessM:number;typeName:string;measuredLengthM:number|null}[]=[]
 for(const room of floorRooms(project,floorId)) {
  const placement=project.roomPlacements?.find(p=>p.roomId===room.id&&p.floorId===floorId)
  if(!placement) {warnings.push(`${room.name}: não posicionado na Planta Geral.`);continue}
  const shape=buildPlanRoom(room)
  const segments=[...shape.survey.perimeter.segments.map(s=>({id:s.wall.id,label:s.wall.label,start:s.start,end:s.end,thickness:s.wall.thickness,typeName:s.wall.customWallType||({masonry:'Alvenaria',drywall:'Drywall',concrete:'Concreto',glass:'Vidro',wood:'Madeira',partition:'Divisória',other:'Outro'}[s.wall.wallType??'other']),height:roomWallHeight(room).wallHeightM,length:s.wall.lengthM})),...shape.survey.internalWalls.placements.map(s=>({id:s.internalWall.id,label:s.internalWall.label,start:s.start,end:s.end,thickness:s.internalWall.thicknessM,typeName:'Parede interna',height:s.internalWall.heightM??roomWallHeight(room).wallHeightM,length:s.internalWall.lengthM}))]
  for(const s of segments) {
   if(!s.height||!Number.isFinite(s.height)||s.height<=0||!s.thickness||!Number.isFinite(s.thickness)||s.thickness<=0) {warnings.push(`${room.name}/${s.label}: informe pé-direito e espessura válidos.`);continue}
   // Midpoint of two joined faces gives the physical wall axis.
   const faces=buildWallFaces(segments.map(v=>({...v,referenceFace:room.wallMeasurementFace??'internal'}))) .get(s.id)??[]
   if(faces.length<2) continue
   const mid=(a:{x:number;y:number},b:{x:number;y:number})=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2})
   const start=worldPoint(mid(faces[0].start,faces[1].start),placement),end=worldPoint(mid(faces[0].end,faces[1].end),placement)
   // SVG y-down -> Revit y-up. No scaling per room.
   walls.push({id:s.id,roomId:room.id,label:s.label,start:[start.x,-start.y,elevationM],end:[end.x,-end.y,elevationM],heightM:s.height,thicknessM:s.thickness,typeName:s.typeName,measuredLengthM:s.length})
  }
  for(const layout of shape.survey.openings.wallLayouts) for(const item of layout.placements) {
   const o=item.opening,host=walls.find(w=>w.id===o.wallId&&w.roomId===room.id)
   if(!host||!o.heightM||o.heightM<=0||o.type==='window'&&(o.sillHeightM==null||o.sillHeightM<0)) {warnings.push(`${room.name}/${o.label}: abertura incompleta.`);continue}
   const a=worldPoint(item.start,placement),b=worldPoint(item.end,placement)
   const projectToWall=(p:{x:number;y:number})=>{const dx=host.end[0]-host.start[0],dy=host.end[1]-host.start[1],t=((p.x-host.start[0])*dx+(-p.y-host.start[1])*dy)/(dx*dx+dy*dy);return [host.start[0]+t*dx,host.start[1]+t*dy]}
   const start=projectToWall(a),end=projectToWall(b),sill=o.type==='window'?o.sillHeightM!:0
   const refs=[{roomId:room.id,id:o.id}]
   if(o.connectedRoomId&&o.connectedOpeningId)refs.push({roomId:o.connectedRoomId,id:o.connectedOpeningId})
   const connection=project.spatialConnections?.find(c=>c.type==='opening'&&[c.a,c.b].some(side=>side.roomId===room.id&&side.elementId===o.id))
   if(connection)for(const side of [connection.a,connection.b])if(side.elementId&&!refs.some(r=>r.roomId===side.roomId&&r.id===side.elementId))refs.push({roomId:side.roomId,id:side.elementId})
   const physicalKey=refs.map(r=>r.roomId+':'+r.id).sort().join('|')
   openings.push({physicalKey,sourceRefs:refs,id:o.id,label:o.label,type:o.type,hostWallId:host.id,roomId:room.id,start:[...start,elevationM+sill],end:[...end,elevationM+sill+o.heightM]})
  }
 }
 if(warnings.length) throw new Error(`Exportação incompleta. Corrija antes de exportar: ${warnings.join(' ')}`)
 // Consolidate collinear, overlapping physical wall axes. Source survey remains unchanged.
 const merged=walls.map(w=>({...w,sourceIds:[w.id]}))
 for(let i=0;i<merged.length;i++) for(let j=i+1;j<merged.length;j++) {
  const a=merged[i],b=merged[j],dx=a.end[0]-a.start[0],dy=a.end[1]-a.start[1],len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len
  const t=(p:number[])=>((p[0]-a.start[0])*ux+(p[1]-a.start[1])*uy)
  const off=(p:number[])=>Math.abs((p[0]-a.start[0])*uy-(p[1]-a.start[1])*ux)
  const lo=Math.min(t(b.start),t(b.end)),hi=Math.max(t(b.start),t(b.end))
  if(off(b.start)>1e-6||off(b.end)>1e-6||lo>len+1e-6||hi< -1e-6||Math.abs(a.thicknessM-b.thicknessM)>1e-6) continue
  if(Math.abs(a.heightM-b.heightM)>1e-6) {
   if(Math.min(len,hi)-Math.max(0,lo)<=1e-6)continue
   // Higher wall owns overlap; retain the lower wall only outside that interval.
   if(a.heightM>b.heightM) { const temp=merged[i];merged[i]=merged[j];merged[j]=temp;i--;break }
   const from=Math.max(0,lo),to=Math.min(len,hi),origin=[...a.start]
   const at=(v:number)=>[origin[0]+v*ux,origin[1]+v*uy,origin[2]]
   for(const o of openings)if(o.hostWallId===a.id){const center=(t(o.start)+t(o.end))/2;if(center>=from&&center<=to)o.hostWallId=b.id;else if(center>to)o.hostWallId=a.id+':tail'}
   if(to<len-1e-6)merged.push({...a,id:a.id+':tail',start:at(to),end:at(len)})
   if(from>1e-6)a.end=at(from);else {merged.splice(i,1);i--}
   break
  }
  const origin=[...a.start],first=Math.min(0,lo),last=Math.max(len,hi)
  a.start=[origin[0]+first*ux,origin[1]+first*uy,origin[2]];a.end=[origin[0]+last*ux,origin[1]+last*uy,origin[2]]
  a.sourceIds.push(...b.sourceIds);for(const o of openings)if(b.sourceIds.includes(o.hostWallId))o.hostWallId=a.id
  merged.splice(j,1);j--
 }
 const xyDistance=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1])
 const equivalent=(a:typeof openings[number],b:typeof openings[number])=>a.hostWallId===b.hostWallId&&a.type===b.type&&Math.abs(a.start[2]-b.start[2])<1e-6&&Math.abs(a.end[2]-b.end[2])<1e-6&&((xyDistance(a.start,b.start)<1e-6&&xyDistance(a.end,b.end)<1e-6)||(xyDistance(a.start,b.end)<1e-6&&xyDistance(a.end,b.start)<1e-6))
 const uniqueOpenings:typeof openings=[]
 for(const o of [...openings].sort((a,b)=>(a.roomId+':'+a.id).localeCompare(b.roomId+':'+b.id))) {
  const prior=uniqueOpenings.find(p=>p.physicalKey===o.physicalKey||p.sourceRefs.some(r=>o.sourceRefs.some(s=>r.roomId===s.roomId&&r.id===s.id))||equivalent(p,o))
  if(prior){
   if(!equivalent(prior,o))throw new Error(`Abertura vinculada ${o.label}: as duas pontas estão desalinhadas ou com dimensões diferentes. Confira o encaixe antes de exportar.`)
   for(const ref of o.sourceRefs)if(!prior.sourceRefs.some(r=>r.roomId===ref.roomId&&r.id===ref.id))prior.sourceRefs.push(ref)
  }else uniqueOpenings.push(o)
 }

 if(!walls.length) throw new Error('Nenhuma parede válida e posicionada para exportar.')
 return {format:'lac-revit',schemaVersion:1,units:'m',project:{id:project.id,name:project.name},floor:{id:floor.id,name:floor.name,elevationM},walls:merged,openings:uniqueOpenings,heightAssumptions:floorRooms(project,floorId).map(r=>({roomId:r.id,...roomWallHeight(r)})),warnings,sourceRooms:floorRooms(project,floorId),roomPlacements:project.roomPlacements?.filter(p=>p.floorId===floorId)??[],limitations:['Aberturas são recortes retangulares, sem folhas ou caixilhos.','Paredes compartilhadas permanecem independentes; confira duplicações no Revit.']}
}
