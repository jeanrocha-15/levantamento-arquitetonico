import type { Project, Room } from './models'
import { projectRooms } from './relationships'

export type ExportScope='room'|'floor'|'plan'|'project'
export const exportScopeNames:Record<ExportScope,string>={room:'Ambiente atual',floor:'Pavimento atual',plan:'Planta Geral',project:'Projeto completo'}
// Export a copy; never reconcile, assemble or move the original plan.
export function scopedProject(project:Project,scope:ExportScope,floorId?:string,roomId?:string):Project {
  if(scope==='project')return project
  const rooms=projectRooms(project),selected=scope==='room'?rooms.filter(r=>r.id===roomId):rooms.filter(r=>r.floorId===floorId)
  if(!selected.length && scope==='room')throw new Error('Selecione um ambiente para exportar.')
  const ids=new Set(selected.map(r=>r.id))
  const copy=(r:Room,parentRoomId?:string):Room=>({...r,parentRoomId,subrooms:r.subrooms.filter(c=>ids.has(c.id)).map(c=>copy(c,r.id)),openings:r.openings.map(o=>!o.connectedRoomId||ids.has(o.connectedRoomId)?o:{...o,connectedRoomId:undefined,connectedOpeningId:undefined}),walls:r.walls.map(w=>!w.sharedWallReference||ids.has(w.sharedWallReference.roomId)?w:{...w,sharedWallReference:undefined})})
  const relationships=project.relationships.filter(r=>ids.has(r.sourceRoomId)&&ids.has(r.targetRoomId)),validRelations=new Set(relationships.map(r=>r.id))
  const result:Project={...project,floors:project.floors.filter(f=>scope==='room'?selected.some(r=>r.floorId===f.id):f.id===floorId).map(f=>({...f,rooms:selected.filter(r=>r.floorId===f.id && (!r.parentRoomId||!ids.has(r.parentRoomId))).map(r=>copy(r))})),relationships,spatialConnections:project.spatialConnections?.filter(c=>ids.has(c.a.roomId)&&ids.has(c.b.roomId)),roomPlacements:project.roomPlacements?.filter(p=>ids.has(p.roomId)),roofs:scope==='room'||scope==='plan'?[]:project.roofs?.filter(r=>r.floorId===floorId),detachedRoofPhotos:[]}
  const clean=(r:Room):Room=>({...r,internalWalls:r.internalWalls.map(w=>({...w,formalDivisionRelationshipId:w.formalDivisionRelationshipId&&validRelations.has(w.formalDivisionRelationshipId)?w.formalDivisionRelationshipId:undefined})),subrooms:r.subrooms.map(clean)})
  return {...result,floors:result.floors.map(f=>({...f,rooms:f.rooms.map(clean)}))}
}
