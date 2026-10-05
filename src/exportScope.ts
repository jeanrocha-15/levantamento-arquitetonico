import { updateRoom } from './domain'
import type { Project, Room } from './models'
import { reconcileRelationships, projectRooms } from './relationships'

export type ExportScope='room'|'floor'|'plan'|'project'
export const exportScopeNames:Record<ExportScope,string>={room:'Ambiente atual',floor:'Pavimento atual',plan:'Planta Geral',project:'Projeto completo'}
// Export a copy; never reconcile, assemble or move the original plan.
export function scopedProject(project:Project,scope:ExportScope,floorId?:string,roomId?:string):Project {
  if(scope==='project')return {...project,exportSelection:undefined}
  const rooms=projectRooms(project),selected=scope==='room'?rooms.filter(r=>r.id===roomId):rooms.filter(r=>r.floorId===floorId)
  if(!selected.length && scope==='room')throw new Error('Selecione um ambiente para exportar.')
  const ids=new Set(selected.map(r=>r.id))
  const copy=(r:Room,parentRoomId?:string):Room=>({...r,parentRoomId,subrooms:r.subrooms.filter(c=>ids.has(c.id)).map(c=>copy(c,r.id)),openings:r.openings.map(o=>!o.connectedRoomId||ids.has(o.connectedRoomId)?o:{...o,connectedRoomId:undefined,connectedOpeningId:undefined}),walls:r.walls.map(w=>!w.sharedWallReference||ids.has(w.sharedWallReference.roomId)?w:{...w,sharedWallReference:undefined})})
  const relationships=project.relationships.filter(r=>ids.has(r.sourceRoomId)&&ids.has(r.targetRoomId)),validRelations=new Set(relationships.map(r=>r.id))
  const result:Project={...project,exportSelection:{scope,floorId,roomId},floors:project.floors.filter(f=>scope==='room'?selected.some(r=>r.floorId===f.id):f.id===floorId).map(f=>({...f,rooms:selected.filter(r=>r.floorId===f.id && (!r.parentRoomId||!ids.has(r.parentRoomId))).map(r=>copy(r))})),relationships,spatialConnections:project.spatialConnections?.filter(c=>ids.has(c.a.roomId)&&ids.has(c.b.roomId)),roomPlacements:project.roomPlacements?.filter(p=>ids.has(p.roomId)),planPreferences:Object.fromEntries(Object.entries(project.planPreferences??{}).filter(([id])=>selected.some(r=>r.floorId===id)).map(([id,p])=>[id,{...p,baseRoomId:p.baseRoomId&&ids.has(p.baseRoomId)?p.baseRoomId:undefined}])),wallCompatibilities:project.wallCompatibilities?.filter(c=>ids.has(c.a.roomId)&&ids.has(c.b.roomId)),roofs:scope==='room'||scope==='plan'?[]:project.roofs?.filter(r=>r.floorId===floorId),detachedRoofPhotos:[]}
  const clean=(r:Room):Room=>({...r,internalWalls:r.internalWalls.map(w=>({...w,formalDivisionRelationshipId:w.formalDivisionRelationshipId&&validRelations.has(w.formalDivisionRelationshipId)?w.formalDivisionRelationshipId:undefined})),subrooms:r.subrooms.map(clean)})
  return {...result,floors:result.floors.map(f=>({...f,rooms:f.rooms.map(clean)}))}
}

// A scoped restore replaces only its selection, never the rest of the project.
export function mergeScopedProject(current:Project,incoming:Project):Project {
  const scope=incoming.exportSelection?.scope
  if(!scope)return incoming
  const ids=new Set(projectRooms(incoming).map(r=>r.id)),oldRooms=new Map(projectRooms(current).map(r=>[r.id,r]))
  const restore=(room:Room):Room=>{
    const old=oldRooms.get(room.id)
    return {...room,parentRoomId:scope==='room'?old?.parentRoomId:room.parentRoomId,subrooms:scope==='room'?old?.subrooms??[]:room.subrooms.map(restore),openings:room.openings.map(o=>{
      const previous=old?.openings.find(x=>x.id===o.id)
      return previous?.connectedRoomId && !ids.has(previous.connectedRoomId) && !o.connectedRoomId?{...o,connectedRoomId:previous.connectedRoomId,connectedOpeningId:previous.connectedOpeningId}:o
    }),walls:room.walls.map(w=>{const reference=old?.walls.find(x=>x.id===w.id)?.sharedWallReference;return reference && !ids.has(reference.roomId) && !w.sharedWallReference?{...w,sharedWallReference:reference}:w})}
  }
  let floors=current.floors.map(f=>{
    const selected=incoming.floors.find(x=>x.id===f.id)
    if(!selected)return f
    if(scope!=='room')return {...selected,rooms:selected.rooms.map(restore)}
    let rooms=f.rooms
    for(const room of selected.rooms){if(oldRooms.has(room.id))rooms=updateRoom(rooms,room.id,()=>restore(room));else rooms=[...rooms,restore(room)]}
    return {...f,rooms}
  })
  floors=[...floors,...incoming.floors.filter(f=>!floors.some(x=>x.id===f.id))]
  const remainingIds=new Set(projectRooms({...current,floors}).map(r=>r.id))
  const retained=(a:string,b:string)=>!ids.has(a)||!ids.has(b)
  return reconcileRelationships({...current,floors,exportSelection:undefined,relationships:[...current.relationships.filter(r=>retained(r.sourceRoomId,r.targetRoomId)),...incoming.relationships],spatialConnections:[...current.spatialConnections??[]].filter(c=>retained(c.a.roomId,c.b.roomId)).concat(incoming.spatialConnections??[]),roomPlacements:[...current.roomPlacements??[]].filter(p=>!ids.has(p.roomId)).concat(incoming.roomPlacements??[]).filter(p=>remainingIds.has(p.roomId)),planPreferences:{...current.planPreferences,...incoming.planPreferences},wallCompatibilities:[...current.wallCompatibilities??[]].filter(c=>retained(c.a.roomId,c.b.roomId)).concat(incoming.wallCompatibilities??[]),roofs:scope==='floor'?[...current.roofs??[]].filter(r=>r.floorId!==incoming.exportSelection?.floorId).concat(incoming.roofs??[]):current.roofs},current)
}
