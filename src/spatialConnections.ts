import { nextVisualSequence } from './visualIds'
import { getCorners } from './corners'
import type { Opening, Project, Room, SpatialConnection } from './models'
import { generateId } from './domain'

const allRooms=(project:Project):Room[]=>{const visit=(rooms:Room[]):Room[]=>rooms.flatMap(r=>[r,...visit(r.subrooms)]);return project.floors.flatMap(f=>visit(f.rooms))}
export function mapProjectRooms(project:Project,change:(room:Room)=>Room):Project {
  const visit=(rooms:Room[]):Room[]=>rooms.map(room=>({...change(room),subrooms:visit(room.subrooms)}))
  return {...project,floors:project.floors.map(f=>({...f,rooms:visit(f.rooms)}))}
}
export function availableCounterpart(opening:Opening,sourceRoomId:string,candidate:Opening) {
  return candidate.id!==opening.id && candidate.type===opening.type && (!candidate.connectedRoomId || candidate.connectedRoomId===sourceRoomId) && (!candidate.connectedOpeningId || candidate.connectedOpeningId===opening.id)
}
export function nextProjectOpeningSequence(project:Project,type:Opening['type']) {
  return nextVisualSequence(allRooms(project).flatMap(r=>r.openings.filter(o=>o.type===type).map(o=>o.label)),{door:'P',window:'J',gap:'V'}[type])
}
// Visual IDs identify physical openings project-wide; UUIDs remain structural IDs.
export function ensureUniqueOpeningLabels(project:Project):Project {
  const rooms=allRooms(project),openings=new Map(rooms.flatMap(r=>r.openings.map(o=>[o.id,o] as const))),labels=new Map<string,string>(),used=new Set<string>()
  const counters={door:0,window:0,gap:0}
  const reserved=new Set([...openings.values()].map(o=>o.label))
  const prefixes={door:'P',window:'J',gap:'V'}
  for(const opening of openings.values()) {
    if(labels.has(opening.id))continue
    let label=opening.label
    if(!new RegExp(`^${prefixes[opening.type]}\\d+$`).test(label)||used.has(label)){const sequence=nextVisualSequence(reserved,prefixes[opening.type]);label=`${prefixes[opening.type]}${String(sequence).padStart(2,'0')}`;reserved.add(label)}
    used.add(label);labels.set(opening.id,label);counters[opening.type]=Math.max(counters[opening.type],Number(/(\d+)$/.exec(label)?.[1]??0))
    const peer=opening.connectedOpeningId?openings.get(opening.connectedOpeningId):undefined
    if(peer?.connectedOpeningId===opening.id && peer.type===opening.type)labels.set(peer.id,label)
  }
  return {...mapProjectRooms(project,r=>({...r,openings:r.openings.map(o=>({...o,label:labels.get(o.id)!}))})),openingCounters:counters}
}
export function openingConnectionStatus(opening:Opening,rooms:Room[]) {
  if(!opening.connectedRoomId)return 'Não vinculada'
  if(!opening.connectedOpeningId)return 'Aguardando contraparte'
  const other=rooms.find(r=>r.id===opening.connectedRoomId)?.openings.find(o=>o.id===opening.connectedOpeningId)
  return other && other.type===opening.type && Object.is(other.widthM,opening.widthM) && Object.is(other.heightM,opening.heightM)?'Vinculada':'Divergente'
}
// Apply changes to the two ends atomically. Import/migration never changes measurements.
export function prepareOpeningConnections(project:Project,previous?:Project):Project {
  const rooms=allRooms(project),oldRooms=previous?allRooms(previous):[],old=new Map(oldRooms.flatMap(r=>r.openings.map(o=>[o.id,o] as const)))
  const openings=new Map(rooms.flatMap(r=>r.openings.map(o=>[o.id,{...o}] as const))),owners=new Map(rooms.flatMap(r=>r.openings.map(o=>[o.id,r.id] as const)))
  const changed=(o:Opening)=>{const p=old.get(o.id);return !!p && (p.connectedRoomId!==o.connectedRoomId || p.connectedOpeningId!==o.connectedOpeningId)}
  for(const [key,p] of old) {
    const next=openings.get(key)
    if(p.connectedOpeningId && (!next || changed(next))) {
      const peer=openings.get(p.connectedOpeningId)
      if(peer?.connectedOpeningId===key && !changed(peer)) openings.set(peer.id,{...peer,connectedOpeningId:undefined,connectedRoomId:undefined})
    }
  }
  const consumed=new Set<string>(),paired=new Set<string>()
  // Existing physical pairs have priority over a proposed third end.
  const candidates=[...openings.values()].sort((a,b)=>Number(changed(a))-Number(changed(b)))
  for(const initial of candidates) {
    const o=openings.get(initial.id)!,target=o.connectedRoomId && rooms.find(r=>r.id===o.connectedRoomId),peer=o.connectedOpeningId && openings.get(o.connectedOpeningId)
    if(!o.connectedOpeningId){if(o.connectedRoomId)openings.set(o.id,{...o,originOpeningId:o.originOpeningId??o.id});continue}
    if(paired.has(o.id))continue
    if(!target || target.id===owners.get(o.id) || !peer || owners.get(peer.id)!==target.id || !availableCounterpart(o,owners.get(o.id)!,peer) || consumed.has(peer.id) || consumed.has(o.id)) {
      openings.set(o.id,{...o,connectedOpeningId:undefined});continue
    }
    let a=o,b={...peer,connectedRoomId:owners.get(o.id),connectedOpeningId:o.id}
    const beforeA=old.get(a.id),beforeB=old.get(b.id)
    const aEdited=!!beforeA && (!Object.is(a.widthM,beforeA.widthM)||!Object.is(a.heightM,beforeA.heightM))
    const bEdited=!!beforeB && (!Object.is(b.widthM,beforeB.widthM)||!Object.is(b.heightM,beforeB.heightM))
    const newlyLinked=!!previous && (beforeA?.connectedOpeningId!==b.id || beforeB?.connectedOpeningId!==a.id)
    const preserveOriginal=project.spatialConnections?.some(c=>c.assembly&&c.type==='opening'&&[c.a.elementId,c.b.elementId].includes(a.id)&&[c.a.elementId,c.b.elementId].includes(b.id))
    if(newlyLinked && !preserveOriginal) {const reference=changed(a)?b:a;a={...a,widthM:reference.widthM,heightM:reference.heightM};b={...b,widthM:reference.widthM,heightM:reference.heightM}}
    else if(aEdited&&!bEdited)b={...b,widthM:a.widthM,heightM:a.heightM}
    else if(bEdited&&!aEdited)a={...a,widthM:b.widthM,heightM:b.heightM}
    const origin=a.originOpeningId===a.id||a.originOpeningId===b.id?a.originOpeningId:b.originOpeningId===a.id||b.originOpeningId===b.id?b.originOpeningId:beforeA?.originOpeningId??beforeB?.originOpeningId??project.spatialConnections?.find(c=>c.type==='opening'&&[c.a.elementId,c.b.elementId].includes(a.id)&&[c.a.elementId,c.b.elementId].includes(b.id))?.a.elementId??(newlyLinked&&changed(a)?b.id:a.id)
    a={...a,originOpeningId:origin};b={...b,originOpeningId:origin}
    openings.set(a.id,a);openings.set(b.id,b);consumed.add(a.id);consumed.add(b.id);paired.add(a.id);paired.add(b.id)
  }
  return mapProjectRooms(project,r=>({...r,openings:r.openings.map(o=>openings.get(o.id)!)}))
}
const pairKey=(a:{roomId:string;elementId?:string},b:{roomId:string;elementId?:string})=>[`${a.roomId}:${a.elementId??''}`,`${b.roomId}:${b.elementId??''}`].sort().join('|')
export function reconcileSpatialConnections(project:Project):Project {
  const rooms=allRooms(project),byId=new Map(rooms.map(r=>[r.id,r])),connections:SpatialConnection[]=[],seen=new Set<string>()
  const add=(type:SpatialConnection['type'],a:SpatialConnection['a'],b:SpatialConnection['b'],old?:SpatialConnection)=>{
    const key=type+pairKey(a,b);if(seen.has(key))return;seen.add(key)
    const saved=old ?? project.spatialConnections?.find(c=>c.type===type && (pairKey(c.a,c.b)===pairKey(a,b) || type==='opening' && [c.a.elementId,c.b.elementId].some(elementId=>!!elementId && [a.elementId,b.elementId].includes(elementId))))
    connections.push({...saved,id:saved?.id ?? generateId(),type,a:{...saved?.a,...a,wallId:saved?.a.roomId===a.roomId?saved.a.wallId:saved?.b.wallId},b:{...saved?.b,...b,wallId:saved?.b.roomId===b.roomId?saved.b.wallId:saved?.a.wallId}})
  }
  for(const room of rooms){
    for(const opening of room.openings)if(opening.connectedRoomId && byId.has(opening.connectedRoomId))add('opening',{roomId:room.id,elementId:opening.id},{roomId:opening.connectedRoomId,elementId:opening.connectedOpeningId})
    for(const wall of room.walls)if(wall.sharedWallReference)add('shared_wall',{roomId:room.id,elementId:wall.id},{roomId:wall.sharedWallReference.roomId,elementId:wall.sharedWallReference.wallId})
  }
  for(const c of project.spatialConnections ?? []) {
    if((c.type==='opening'||c.type==='shared_wall')&&!c.assembly)continue
    const a=byId.get(c.a.roomId),b=byId.get(c.b.roomId)
    if(!a||!b||a.id===b.id)continue
    const owns=(r:Room,elementId?:string)=>!elementId || [...r.corners,...r.walls,...r.internalWalls,...r.openings,...r.objects??[]].some(e=>e.id===elementId)
    if(c.type==='opening'&&connections.some(x=>x.type==='opening'&&x.id!==c.id&&[x.a.elementId,x.b.elementId].some(id=>!!id&&[c.a.elementId,c.b.elementId].includes(id))))continue
    const cornerValid=(r:Room,side:SpatialConnection['a'])=>getCorners(r.walls,r.corners).some(x=>x.id===side.elementId&&(!c.assembly||!!side.wallId&&x.wallIds.includes(side.wallId)))
    const typeValid=c.type==='corner'?cornerValid(a,c.a)&&cornerValid(b,c.b):c.type==='shared_wall'?a.walls.some(w=>w.id===c.a.elementId)&&b.walls.some(w=>w.id===c.b.elementId):c.type==='opening'?a.openings.some(o=>o.id===c.a.elementId)&&b.openings.some(o=>o.id===c.b.elementId):owns(a,c.a.elementId)&&owns(b,c.b.elementId)
    if(typeValid)add(c.type,c.a,c.b,c)
  }
  for(const r of project.relationships)if(r.type==='adjacency'||r.type==='manual_reference')add('manual',{roomId:r.sourceRoomId,elementId:r.sourceElementId},{roomId:r.targetRoomId,elementId:r.targetElementId},project.spatialConnections?.find(c=>c.id===r.spatialConnectionId))
  const relationships=project.relationships.filter(r=>r.type!=='corner').map(r=>({...r,spatialConnectionId:connections.find(c=>pairKey(c.a,c.b)===pairKey({roomId:r.sourceRoomId,elementId:r.sourceElementId},{roomId:r.targetRoomId,elementId:r.targetElementId}))?.id}))
  connections.filter(c=>c.assembly && c.type!=='corner').forEach(c=>{if(!relationships.some(r=>r.spatialConnectionId===c.id))relationships.push({id:c.id,type:c.type==='opening'?'opening_connection':'shared_wall',sourceRoomId:c.a.roomId,sourceElementId:c.a.elementId,targetRoomId:c.b.roomId,targetElementId:c.b.elementId,spatialConnectionId:c.id})})
  connections.filter(c=>c.type==='corner').forEach(c=>relationships.push({id:c.id,type:'corner',sourceRoomId:c.a.roomId,sourceElementId:c.a.elementId,targetRoomId:c.b.roomId,targetElementId:c.b.elementId,spatialConnectionId:c.id,sourceFace:c.a.face,targetFace:c.b.face,orientation:c.orientation,placementMode:c.placementMode,sharedWallId:c.sharedWallId}))
  return {...project,spatialConnections:connections,relationships}
}
