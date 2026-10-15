import type {Project,Room} from '../models'
import {buildPlanRoom,worldPoint} from '../floorPlan'
import {roomWallHeight} from '../ceilingHeight'
import {cornerWallRelationships} from '../cornerConnections'
import type {LacExchange,PhysicalWall,PhysicalOpening,XYZ} from './types'
export const allRooms=(p:Project):Room[]=>{const walk=(rs:Room[]):Room[]=>rs.flatMap(r=>[r,...walk(r.subrooms)]);return p.floors.flatMap(f=>walk(f.rooms))}
export function createLacExchange(p:Project):LacExchange {
  const warnings:string[]=[],walls=new Map<string,PhysicalWall>(),openings=new Map<string,PhysicalOpening>()
  const rooms=allRooms(p),parent=new Map<string,string>()
  const root=(id:string):string=>parent.has(id)?root(parent.get(id)!):id
  const union=(a:string,b:string)=>{a=root(a);b=root(b);if(a!==b)parent.set(a>b?a:b,a>b?b:a)}
  const relationships=[...p.relationships,...p.floors.flatMap(f=>cornerWallRelationships(p,f.id))]
  relationships.filter(r=>r.type==='shared_wall'&&r.sourceElementId&&r.targetElementId).forEach(r=>union(r.sourceElementId!,r.targetElementId!))
  p.spatialConnections?.filter(c=>c.type==='shared_wall').forEach(c=>{const a=c.a.wallId??c.a.elementId,b=c.b.wallId??c.b.elementId;if(a&&b)union(a,b)})
  rooms.forEach(r=>r.walls.forEach(w=>{if(w.sharedWallReference)union(w.id,w.sharedWallReference.wallId)}))
  const exchangeRooms:LacExchange['rooms']=[]
  const physicalId=(wid:string)=>{const ids=rooms.flatMap(r=>r.walls).filter(w=>root(w.id)===root(wid));return ids.find(w=>w.physicalWallId)?.physicalWallId??p.bim?.physicalWalls.find(w=>w.surveyRefs.some(s=>ids.some(i=>i.id===s.wallId)))?.lacId??`physical:${root(wid)}`}
  for(const r of rooms){const placement=p.roomPlacements?.find(x=>x.roomId===r.id),floor=p.floors.find(f=>f.id===r.floorId);if(!placement||!floor){warnings.push(`${r.name}: não posicionado; não enviado ao BIM.`);continue}
    const shape=buildPlanRoom(r),z=floor.elevation??0,toWorld=(v:{x:number;y:number}):XYZ=>{const q=worldPoint(v,placement);return [q.x,-q.y,z]}
    const survey=structuredClone(r);survey.subrooms=[];survey.lacId=r.lacId??r.id
    exchangeRooms.push({lacId:r.lacId??r.id,revitUniqueId:r.revitUniqueId,levelId:floor.id,name:r.name,boundary:shape.polygon.map(toWorld),survey,placement:{...placement}})
    for(const segment of shape.survey.perimeter.segments){if(r.revitUniqueId&&!segment.wall.physicalWallId){warnings.push(`${r.name}/${segment.wall.label}: limite sem parede física, preservado no ambiente.`);continue}const wall=segment.wall,id=wall.physicalWallId??physicalId(wall.id),faces=shape.faces.get(wall.id),original=p.bim?.physicalWalls.find(w=>w.lacId===id)
      const mid=(at:'start'|'end')=>faces&&faces.length>=2?{x:(faces[0][at].x+faces[1][at].x)/2,y:(faces[0][at].y+faces[1][at].y)/2}:segment[at]
      const proposed:PhysicalWall={lacId:id,revitUniqueId:original?.revitUniqueId,start:toWorld(mid('start')),end:toWorld(mid('end')),thickness:wall.thickness??null,baseLevelId:floor.id,height:roomWallHeight(r).wallHeightM,material:wall.customWallType??wall.wallType,roomIds:[r.id],surveyRefs:[{roomId:r.id,wallId:wall.id}]}
      // Preserve imported physical axis until survey geometry changes, including partial room boundaries.
      const baseline=p.bim?.baseline?.[`rooms:${r.id}`] as LacExchange['rooms'][number]|undefined
      const unchanged=baseline&&JSON.stringify(baseline.survey.walls)===JSON.stringify(r.walls)&&JSON.stringify(baseline.survey.corners)===JSON.stringify(r.corners)&&JSON.stringify(baseline.placement)===JSON.stringify(placement)
      const candidate=original&&(unchanged||!baseline&&!!r.revitUniqueId)?{...original,roomIds:[r.id],surveyRefs:proposed.surveyRefs}:proposed
      if(baseline&&(baseline.survey.ceilingHeightM!==r.ceilingHeightM||baseline.survey.ceilingType!==r.ceilingType))candidate.height=proposed.height
      const existing=walls.get(id)
      if(!existing)walls.set(id,candidate)
      else {existing.roomIds=[...new Set([...existing.roomIds,r.id])];existing.surveyRefs.push(...proposed.surveyRefs)
        const dx=existing.end[0]-existing.start[0],dy=existing.end[1]-existing.start[1],len=Math.hypot(dx,dy),t=(v:XYZ)=>((v[0]-existing.start[0])*dx+(v[1]-existing.start[1])*dy)/(len||1),off=(v:XYZ)=>Math.abs((v[0]-existing.start[0])*dy-(v[1]-existing.start[1])*dx)/(len||1)
        if(off(candidate.start)>0.002||off(candidate.end)>0.002||Math.abs((existing.thickness??0)-(candidate.thickness??0))>.002)warnings.push(`Parede física ${id}: medições de ambientes incompatíveis; revisar antes de sincronizar.`)
        else {const lo=Math.min(0,t(candidate.start),t(candidate.end)),hi=Math.max(len,t(candidate.start),t(candidate.end)),start=existing.start;existing.start=[start[0]+lo*dx/len,start[1]+lo*dy/len,start[2]];existing.end=[start[0]+hi*dx/len,start[1]+hi*dy/len,start[2]]}
      }
      const sw=survey.walls.find(w=>w.id===wall.id)!;sw.lacId=sw.lacId??sw.id;sw.physicalWallId=id;sw.originalMeasuredLengthM??=sw.lengthM
    }
    for(const pi of shape.survey.internalWalls.placements){const w=pi.internalWall,id=w.lacId??w.id,old=p.bim?.physicalWalls.find(w=>w.lacId===id);walls.set(id,{lacId:id,revitUniqueId:w.revitUniqueId??old?.revitUniqueId,start:toWorld(pi.start),end:toWorld(pi.end),thickness:w.thicknessM??null,height:w.heightM??roomWallHeight(r).wallHeightM,baseLevelId:floor.id,roomIds:[r.id],surveyRefs:[{roomId:r.id,wallId:w.id}]})}
    for(const layout of shape.survey.openings.placements){const o=layout.opening,id=o.physicalOpeningId??(o.connectedOpeningId?`opening:${[o.id,o.connectedOpeningId].sort()[0]}`:o.lacId??o.id),host=r.walls.find(w=>w.id===o.wallId)??r.internalWalls.find(w=>w.id===o.wallId);if(!host)continue
      const prev=p.bim?.openings.find(x=>x.lacId===id),position=toWorld({x:(layout.start.x+layout.end.x)/2,y:(layout.start.y+layout.end.y)/2});position[2]+=o.sillHeightM??0
      const hostId=r.internalWalls.some(w=>w.id===host.id)?host.lacId??host.id:('physicalWallId' in host?host.physicalWallId:undefined)??physicalId(host.id)
      const item:PhysicalOpening={note:o.note,lacId:id,revitUniqueId:prev?.revitUniqueId??o.revitUniqueId,hostWallId:hostId,levelId:floor.id,type:o.type,position,width:o.widthM,height:o.heightM,sill:o.sillHeightM,roomRefs:[{roomId:r.id,openingId:o.id}]}
      const baseRoom=p.bim?.baseline?.[`rooms:${r.id}`] as LacExchange['rooms'][number]|undefined
      const baseOpening=baseRoom?.survey.openings.find(x=>x.id===o.id)
      if(prev&&(!baseRoom&&r.revitUniqueId||baseOpening&&JSON.stringify(baseOpening)===JSON.stringify(o)&&JSON.stringify(baseRoom?.placement)===JSON.stringify(placement))){item.position=[...prev.position];item.levelId=prev.levelId}
      else {const physical=walls.get(hostId);if(physical){const dx=physical.end[0]-physical.start[0],dy=physical.end[1]-physical.start[1],length2=dx*dx+dy*dy;if(length2){const t=((position[0]-physical.start[0])*dx+(position[1]-physical.start[1])*dy)/length2;item.position=[physical.start[0]+dx*t,physical.start[1]+dy*t,position[2]]}}}
      if(openings.has(id)){const previous=openings.get(id)!;previous.roomRefs.push(...item.roomRefs);if(previous.width!==item.width||previous.height!==item.height)warnings.push(`${o.label}: dimensões divergentes entre as duas faces.`)}else openings.set(id,item)
    }
  }
  for(const w of p.bim?.physicalWalls??[])if(!walls.has(w.lacId)&&!w.surveyRefs.length)walls.set(w.lacId,w)
  for(const o of p.bim?.openings??[])if(!openings.has(o.lacId)&&(!o.roomRefs.length||o.roomRefs.some(ref=>rooms.some(r=>r.id===ref.roomId&&r.openings.some(x=>x.id===ref.openingId)))))openings.set(o.lacId,o)
  const elements=structuredClone((p.bim?.elements??[]).filter(e=>!e.objectId||rooms.some(r=>r.objects?.some(o=>o.id===e.objectId))))
  for(const r of rooms){const place=p.roomPlacements?.find(x=>x.roomId===r.id);if(!place)continue;for(const o of r.objects??[]){const pos=worldPoint({x:o.position.xM??0,y:o.position.yM??0},place),id=o.lacId??o.id,index=elements.findIndex(e=>e.lacId===id),item={lacId:id,revitUniqueId:o.revitUniqueId,category:o.structuralKind==='column'?'Column':o.structuralKind==='beam'?'Beam':o.category==='furniture'?'Furniture':'Equipment',type:o.name,levelId:r.floorId,position:[pos.x,-pos.y,p.floors.find(f=>f.id===r.floorId)?.elevation??0] as XYZ,rotation:-(place.rotation+(o.rotationDegrees??0)),width:o.dimensions.widthM??o.dimensions.diameterM??undefined,depth:o.dimensions.depthM??o.dimensions.diameterM??undefined,height:o.dimensions.heightM??undefined,roomId:r.id,objectId:o.id,editable:'limited' as const,representation:[]};if(index>=0)elements[index]={...elements[index],...item};else elements.push(item)}}
  return {format:'lac-exchange',schemaVersion:1,units:'m',project:{lacId:p.id,name:p.name,sourceDocumentId:p.bim?.sourceDocumentId},levels:p.floors.map(f=>({lacId:f.lacId??f.id,name:f.name,elevation:f.elevation??0,revitUniqueId:f.revitUniqueId})),rooms:exchangeRooms,physicalWalls:[...walls.values()],openings:[...openings.values()],elements,connections:p.spatialConnections??[],revitMappings:p.bim?.revitMappings??[],syncMetadata:{exportedAt:new Date().toISOString(),baseline:p.bim?.baseline??p.bim?.pendingBaseline,complete:exchangeRooms.length===rooms.length,warnings:[...new Set([...(p.bim?.warnings??[]),...warnings])]}}
}
export function recordsOf(e:LacExchange):Record<string,unknown>{return structuredClone(Object.fromEntries([...( ['levels','rooms','physicalWalls','openings','elements'] as const).flatMap(key=>e[key].map(item=>[`${key}:${item.lacId}`,item])),...e.connections.map(item=>[`connections:${item.id}`,item])]))}

// Field records and presentation settings are not owned by a BIM update.
export function preserveFieldData(existing:Project,next:Project):Project {
 const oldRooms=new Map(allRooms(existing).map(r=>[r.id,r]))
 for(const room of allRooms(next)){
  const old=oldRooms.get(room.id);if(!old)continue
  room.photos=structuredClone(old.photos??[])
  const ids=new Set([room.id,...room.walls.map(w=>w.id),...room.openings.map(o=>o.id),...room.internalWalls.map(w=>w.id),...(room.objects??[]).map(o=>o.id)])
  room.photos.forEach(photo=>{if(photo.linkedEntityId&&!ids.has(photo.linkedEntityId)&&photo.linkedEntityType!=='technical_item'){delete photo.linkedEntityId;delete photo.linkedEntityType}})
 }
 const roomIds=new Set(allRooms(next).map(r=>r.id))
 return {...existing,...next,measurementUnit:existing.measurementUnit,relationships:existing.relationships.filter(r=>roomIds.has(r.sourceRoomId)&&roomIds.has(r.targetRoomId))}
}
export function saveExchangeIdentity(project:Project,e:LacExchange):Project {
 const walk=(rooms:Room[]):Room[]=>rooms.map(r=>({...r,lacId:r.lacId??r.id,walls:r.walls.map(w=>({...w,lacId:w.lacId??w.id,physicalWallId:e.physicalWalls.find(p=>p.surveyRefs.some(ref=>ref.roomId===r.id&&ref.wallId===w.id))?.lacId??w.physicalWallId,originalMeasuredLengthM:w.originalMeasuredLengthM??w.lengthM})),openings:r.openings.map(o=>({...o,lacId:o.lacId??o.id,physicalOpeningId:e.openings.find(p=>p.roomRefs.some(ref=>ref.roomId===r.id&&ref.openingId===o.id))?.lacId??o.physicalOpeningId})),internalWalls:r.internalWalls.map(w=>({...w,lacId:w.lacId??w.id})),objects:r.objects?.map(o=>({...o,lacId:o.lacId??o.id})),subrooms:walk(r.subrooms)}))
 return {...project,floors:project.floors.map(f=>({...f,lacId:f.lacId??f.id,elevation:f.elevation??0,rooms:walk(f.rooms)})),bim:{...project.bim,physicalWalls:e.physicalWalls,openings:e.openings,elements:e.elements,revitMappings:e.revitMappings,warnings:e.syncMetadata.warnings,pendingBaseline:recordsOf(e)}}
}
export function projectFromExchange(e:LacExchange):Project {
  if(e.format!=='lac-exchange'||e.schemaVersion!==1||e.units!=='m'||!e.project?.lacId)throw new Error('LAC Exchange inválido.')
  for(const k of ['levels','rooms','physicalWalls','openings','elements','connections','revitMappings'] as const)if(!Array.isArray(e[k]))throw new Error(`Coleção ausente: ${k}`)
  const ids=new Set<string>();for(const item of [...e.levels,...e.rooms,...e.physicalWalls,...e.openings,...e.elements]){if(!item.lacId||ids.has(item.lacId))throw new Error('IDs ausentes ou duplicados no intercâmbio.');ids.add(item.lacId)}
  const floors=e.levels.map(l=>({id:l.lacId,lacId:l.lacId,revitUniqueId:l.revitUniqueId,name:l.name,elevation:l.elevation,rooms:e.rooms.filter(r=>r.levelId===l.lacId).map(r=>({...r.survey,id:r.lacId,lacId:r.lacId,revitUniqueId:r.revitUniqueId,floorId:l.lacId}))}))
  if(floors.flatMap(f=>f.rooms).length!==e.rooms.length||e.rooms.some(r=>!r.survey?.walls||!r.placement))throw new Error('Ambiente sem pavimento, levantamento ou posição.')
  for(const floor of floors){const list=floor.rooms;for(const room of list){room.subrooms=[]}for(const room of list){if(room.parentRoomId){const parent=list.find(r=>r.id===room.parentRoomId);if(!parent||parent===room)throw new Error('Hierarquia de ambientes inválida.');let ancestor=parent;const seen=new Set([room.id]);while(ancestor){if(seen.has(ancestor.id))throw new Error('Ciclo na hierarquia.');seen.add(ancestor.id);if(!ancestor.parentRoomId)break;ancestor=list.find(r=>r.id===ancestor.parentRoomId)!}parent.subrooms.push(room)}}floor.rooms=list.filter(r=>!r.parentRoomId)}
  return {id:e.project.lacId,name:e.project.name,measurementUnit:'m',floors,relationships:[],spatialConnections:e.connections,roomPlacements:e.rooms.map(r=>r.placement),bim:{sourceDocumentId:e.project.sourceDocumentId,physicalWalls:e.physicalWalls,openings:e.openings,elements:e.elements,revitMappings:e.revitMappings,warnings:e.syncMetadata.warnings,lastSync:e.syncMetadata.exportedAt,baseline:recordsOf(e)}}
}
