import type { Project } from './models'
import { floorRooms, buildPlanRoom, worldPoint } from './floorPlan'
import { buildWallFaces } from './wallFaces'

// Versioned exchange contract; source measurements remain untouched.
export function createRevitExchange(project:Project, floorId:string, elevationM:number) {
 if(!Number.isFinite(elevationM)) throw new Error('Informe uma elevação válida.')
 const floor=project.floors.find(f=>f.id===floorId)
 if(!floor) throw new Error('Selecione um pavimento.')
 const warnings:string[]=[]
 const walls: {id:string;roomId:string;label:string;start:number[];end:number[];heightM:number;thicknessM:number;measuredLengthM:number|null}[]=[]
 for(const room of floorRooms(project,floorId)) {
  const placement=project.roomPlacements?.find(p=>p.roomId===room.id&&p.floorId===floorId)
  if(!placement) {warnings.push(`${room.name}: não posicionado na Planta Geral.`);continue}
  const shape=buildPlanRoom(room)
  const segments=[...shape.survey.perimeter.segments.map(s=>({id:s.wall.id,label:s.wall.label,start:s.start,end:s.end,thickness:s.wall.thickness,height:room.ceilingHeightM,length:s.wall.lengthM})),...shape.survey.internalWalls.placements.map(s=>({id:s.internalWall.id,label:s.internalWall.label,start:s.start,end:s.end,thickness:s.internalWall.thicknessM,height:s.internalWall.heightM??room.ceilingHeightM,length:s.internalWall.lengthM}))]
  for(const s of segments) {
   if(!s.height||!Number.isFinite(s.height)||s.height<=0||!s.thickness||!Number.isFinite(s.thickness)||s.thickness<=0) {warnings.push(`${room.name}/${s.label}: informe pé-direito e espessura válidos.`);continue}
   // Midpoint of two joined faces gives the physical wall axis.
   const faces=buildWallFaces(segments.map(v=>({...v,referenceFace:room.wallMeasurementFace??'internal'}))) .get(s.id)??[]
   if(faces.length<2) continue
   const mid=(a:{x:number;y:number},b:{x:number;y:number})=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2})
   const start=worldPoint(mid(faces[0].start,faces[1].start),placement),end=worldPoint(mid(faces[0].end,faces[1].end),placement)
   // SVG y-down -> Revit y-up. No scaling per room.
   walls.push({id:s.id,roomId:room.id,label:s.label,start:[start.x,-start.y,elevationM],end:[end.x,-end.y,elevationM],heightM:s.height,thicknessM:s.thickness,measuredLengthM:s.length})
  }
 }
 if(!walls.length) throw new Error('Nenhuma parede válida e posicionada para exportar.')
 return {format:'lac-revit',schemaVersion:1,units:'m',project:{id:project.id,name:project.name},floor:{id:floor.id,name:floor.name,elevationM},walls,warnings,sourceRooms:floorRooms(project,floorId),roomPlacements:project.roomPlacements?.filter(p=>p.floorId===floorId)??[],limitations:['Importação inicial de paredes; aberturas e famílias não são criadas.','Paredes compartilhadas permanecem independentes; confira duplicações no Revit.']}
}
