import type { Project,Room } from './models'
import { projectRooms } from './relationships'
import { assemblyPlacement } from './planAssembly'
import { putRoomPlacement,pointDistance,normalizeRotation } from './floorPlan'
import { mapProjectRooms } from './spatialConnections'
const signature=(room:Room)=>JSON.stringify([room.walls.map(w=>[w.id,w.lengthM,w.thickness,w.surveyPlacement]),room.corners,room.diagonals.filter(d=>!d.checkOnly),room.geometryAdjustment,room.perimeterClosed,room.wallMeasurementFace,room.openings.map(o=>[o.id,o.wallId,o.referenceCornerId,o.offsetM,o.widthM])])
export function markAssemblyChanges(next:Project,previous:Project):Project {
 const before=new Map(projectRooms(previous).map(r=>[r.id,r])),current=projectRooms(next),pending=new Set(next.geometryChangedRoomIds??[])
 for(const room of current){const old=before.get(room.id);if(old&&signature(old)!==signature(room)&&next.roomPlacements?.some(p=>p.roomId===room.id)&&next.spatialConnections?.some(c=>!c.assemblyDetached&&c.a.elementId&&c.b.elementId&&[c.a.roomId,c.b.roomId].includes(room.id)))pending.add(room.id)}
 return {...next,geometryChangedRoomIds:[...pending].filter(id=>current.some(r=>r.id===id))}
}
export function keepAssemblyPosition(project:Project,roomId:string):Project{return {...project,geometryChangedRoomIds:project.geometryChangedRoomIds?.filter(id=>id!==roomId)}}
export function recalculateAssembly(project:Project,roomId:string):{project:Project;error?:string} {
 const candidates=(project.spatialConnections??[]).filter(c=>!c.assemblyDetached&&[c.a.roomId,c.b.roomId].includes(roomId)).flatMap(c=>{const fixed=project.roomPlacements?.find(p=>p.roomId===(c.a.roomId===roomId?c.b.roomId:c.a.roomId));const placement=fixed&&assemblyPlacement(project,c,fixed);return placement?[placement]:[]})
 if(!candidates.length)return {project,error:'Não há referências suficientes para recalcular este encaixe.'}
 const candidate=candidates[0]
 if(candidates.some(p=>pointDistance(p,candidate)>.001||Math.abs(normalizeRotation(p.rotation-candidate.rotation+180)-180)>.01))return {project,error:'As conexões indicam posições diferentes. Escolha visualmente o encaixe na Planta Geral.'}
 return {project:keepAssemblyPosition(putRoomPlacement(project,candidate),roomId)}
}
export function promoteDeletedOrigins(next:Project,previous:Project,confirm:(message:string)=>boolean):Project {
 const remaining=new Set(projectRooms(next).flatMap(r=>r.openings.map(o=>o.id))),deleted=projectRooms(previous).flatMap(r=>r.openings).filter(o=>!remaining.has(o.id)&&o.originOpeningId===o.id&&o.connectedOpeningId&&remaining.has(o.connectedOpeningId))
 let result=next
 for(const source of deleted){const promote=confirm(`A origem ${source.label} foi excluída. Transformar a contraparte na nova origem?`);result=mapProjectRooms(result,r=>({...r,openings:r.openings.map(o=>o.id===source.connectedOpeningId?{...o,originOpeningId:promote?o.id:undefined}:o)}))}
 return result
}
