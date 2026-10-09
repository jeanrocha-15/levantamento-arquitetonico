import { cornerAnchor, cornerSnap, cornerWallRelationships } from './cornerConnections'
import {wallConflicts} from './wallConflicts'
import { availableCounterpart } from './spatialConnections'
import type { Project,Room,RoomRelationship,RoomPlacement } from './models'
import type { Point } from './geometry'
import { alignRoomAnchors,buildPlanRoom,floorRooms,floorPlacements,worldPoint,rotatePoint,normalOf,midpoint,pointDistance,normalizeRotation,planTolerance,planBounds,polygonDistance,polygonsOverlap,pointInPolygon } from './floorPlan'
import type { PlanRoom } from './floorPlan'
export interface PlanFeature { start:Point;end:Point;length:number;thickness:number }
export interface SnapChoice { id:string;relationship:RoomRelationship;placement:RoomPlacement;label:string;differenceM:number }
export function planRelationships(project:Project,floorId:string) {
 const rooms=floorRooms(project,floorId),ids=new Set(rooms.map(r=>r.id)),list=[...project.relationships,...cornerWallRelationships(project,floorId)]
 rooms.forEach(room=>{room.walls.forEach(w=>{if(w.sharedWallReference)list.push({id:`wall:${w.id}`,type:'shared_wall',sourceRoomId:room.id,sourceElementId:w.id,targetRoomId:w.sharedWallReference.roomId,targetElementId:w.sharedWallReference.wallId})});room.openings.forEach(o=>{if(o.connectedRoomId)list.push({id:`opening:${o.id}`,type:'opening_connection',sourceRoomId:room.id,sourceElementId:o.id,targetRoomId:o.connectedRoomId,targetElementId:o.connectedOpeningId})})})
 const seen=new Set<string>();return list.filter(r=>{if(r.secondary)return false;if(project.spatialConnections?.some(c=>c.assemblyDetached&&(c.id===r.spatialConnectionId||c.id===r.derivedFromCornerId||([c.a,c.b].some(s=>s.roomId===r.sourceRoomId&&s.elementId===r.sourceElementId)&&[c.a,c.b].some(s=>s.roomId===r.targetRoomId&&s.elementId===r.targetElementId)))))return false;if(r.type==='manual_reference'||!ids.has(r.sourceRoomId)||!ids.has(r.targetRoomId)||r.sourceRoomId===r.targetRoomId)return false;const key=[`${r.sourceRoomId}:${r.sourceElementId??''}`,`${r.targetRoomId}:${r.targetElementId??''}`].sort().join('|')+r.type;if(seen.has(key))return false;seen.add(key);return true})
}
export function planFeature(shape:PlanRoom,type:RoomRelationship['type'],id?:string):PlanFeature|undefined {
 const segment=shape.survey.perimeter.segments.find(s=>s.wall.id===id)
 const opening=shape.survey.openings.placements.find(o=>o.opening.id===id)
 const wall=type==='opening_connection'?shape.room.walls.find(w=>w.id===opening?.wall.id):segment?.wall
 const internal=shape.room.internalWalls.find(w=>w.id===opening?.wall.id)
 const source=type==='opening_connection'?opening:segment
 if(!source || (type==='shared_wall' && (!segment?.measured || !(wall?.lengthM && wall.lengthM>0))))return undefined
 const storedThickness=wall?.thickness??internal?.thicknessM??0,thickness=Number.isFinite(storedThickness)?Math.max(0,storedThickness):0,n=normalOf(source.start,source.end),offset=(shape.room.wallMeasurementFace==='external'?1:-1)*thickness/2
 const shift=(p:Point)=>({x:p.x+n.x*offset,y:p.y+n.y*offset})

 return {start:shift(source.start),end:shift(source.end),length:pointDistance(source.start,source.end),thickness}
}
const transformed=(f:PlanFeature,p:RoomPlacement)=>({...f,start:worldPoint(f.start,p),end:worldPoint(f.end,p)})
const angle=(f:PlanFeature)=>Math.atan2(f.end.y-f.start.y,f.end.x-f.start.x)*180/Math.PI
export function featureAlignment(a:PlanFeature,b:PlanFeature) {
 return {distanceM:pointDistance(midpoint(a.start,a.end),midpoint(b.start,b.end)),angleDegrees:Math.abs(180-Math.abs(((angle(a)-angle(b)+540)%360)-180)),differenceM:Math.abs(a.length-b.length),thicknessM:Math.abs(a.thickness-b.thickness)}
}
export function sameSideForRelationship(project:Project,r:RoomRelationship) {
 const assembly=project.spatialConnections?.find(c=>c.assembly&&c.id===r.spatialConnectionId);if(assembly)return !!assembly.flipped
 if(r.derivedFromCornerId)return r.placementMode==='inside'
 const rooms=project.floors.flatMap(f=>floorRooms(project,f.id)),a=rooms.find(x=>x.id===r.sourceRoomId),b=rooms.find(x=>x.id===r.targetRoomId)
 const aid=r.type==='opening_connection'?a?.openings.find(o=>o.id===r.sourceElementId)?.wallId:r.sourceElementId,bid=r.type==='opening_connection'?b?.openings.find(o=>o.id===r.targetElementId)?.wallId:r.targetElementId
 const cornerPair=cornerWallRelationships(project,a?.floorId??'').find(c=>(c.sourceRoomId===a?.id&&c.sourceElementId===aid&&c.targetRoomId===b?.id&&c.targetElementId===bid)||(c.sourceRoomId===b?.id&&c.sourceElementId===bid&&c.targetRoomId===a?.id&&c.targetElementId===aid))
 if(cornerPair)return cornerPair.placementMode==='inside'
 return !!(a?.walls.find(w=>w.id===aid && w.sharedWallReference?.roomId===b?.id && w.sharedWallReference?.wallId===bid)?.sharedWallReference?.placementSide==='same' || b?.walls.find(w=>w.id===bid && w.sharedWallReference?.roomId===a?.id && w.sharedWallReference?.wallId===aid)?.sharedWallReference?.placementSide==='same')
}
export function sharedWallAlignment(a:PlanFeature,b:PlanFeature,sameSide=false) {
 const d={x:(a.end.x-a.start.x)/(a.length||1),y:(a.end.y-a.start.y)/(a.length||1)},project=(p:Point)=>(p.x-a.start.x)*d.x+(p.y-a.start.y)*d.y
 const bs=project(b.start),be=project(b.end),overlapM=Math.max(0,Math.min(a.length,Math.max(bs,be))-Math.max(0,Math.min(bs,be)))
 const uncoveredM=Math.max(0,Math.min(a.length,b.length)-overlapM),base=featureAlignment(a,b)
 const distanceM=Math.max(...[b.start,b.end].map(p=>Math.abs((p.x-a.start.x)*d.y-(p.y-a.start.y)*d.x)))
 return {...base,distanceM,angleDegrees:sameSide?180-base.angleDegrees:base.angleDegrees,differenceM:uncoveredM,overlapM}
}
function intentionalContainment(project:Project,a:Room,b:Room,pa:Point[],pb:Point[]) {
 const related=planRelationships(project,a.floorId).some(r=>r.type==='shared_wall' && [r.sourceRoomId,r.targetRoomId].includes(a.id) && [r.sourceRoomId,r.targetRoomId].includes(b.id) && sameSideForRelationship(project,r))
 return related && (pa.every(p=>pointInPolygon(p,pb,false)) || pb.every(p=>pointInPolygon(p,pa,false)))
}
export function relationshipState(project:Project,r:RoomRelationship,placements=floorPlacements(project,project.floors.find(f=>floorRooms(project,f.id).some(room=>room.id===r.sourceRoomId))?.id??'')) {
 const source=placements.find(p=>p.roomId===r.sourceRoomId),target=placements.find(p=>p.roomId===r.targetRoomId),rooms=project.floors.flatMap(f=>floorRooms(project,f.id)),a=rooms.find(x=>x.id===r.sourceRoomId),b=rooms.find(x=>x.id===r.targetRoomId)
 if(!a||!b||!source||!target)return {completed:false,message:'Relação não compatibilizada: posicione os dois ambientes.'}
 const sa=buildPlanRoom(a),sb=buildPlanRoom(b)
 if(r.type==='adjacency'){const pa=sa.interiorPolygon.map(p=>worldPoint(p,source)),pb=sb.interiorPolygon.map(p=>worldPoint(p,target));const completed=!polygonsOverlap(pa,pb)&&polygonDistance(pa,pb)<=planTolerance.adjacencyM;return {completed,message:completed?'Adjacência compatibilizada.':'Adjacência ainda não compatibilizada.'}}
 if(r.type==='corner'&&project.spatialConnections?.find(c=>c.id===r.spatialConnectionId)?.assembly){const c=project.spatialConnections.find(c=>c.id===r.spatialConnectionId)!,expected=cornerSnap(c,a,b,source);const completed=!!expected&&pointDistance(expected,target)<=planTolerance.alignmentM&&Math.abs(normalizeRotation(target.rotation-expected.rotation+180)-180)<=planTolerance.angleDegrees;return {completed,message:completed?'Conexão por canto compatibilizada.':'Cantos ou paredes incidentes desalinhados.'}}
 if(r.type==='corner'){const ca=cornerAnchor(a,{roomId:a.id,elementId:r.sourceElementId,face:r.sourceFace},r.placementMode),cb=cornerAnchor(b,{roomId:b.id,elementId:r.targetElementId,face:r.targetFace},r.placementMode);if(!ca||!cb)return {completed:false,message:'Canto correspondente sem geometria suficiente.'};const distanceM=pointDistance(worldPoint(ca.position,source),worldPoint(cb.position,target)),expected=cornerSnap({id:r.id,type:'corner',a:{roomId:a.id,elementId:r.sourceElementId,face:r.sourceFace},b:{roomId:b.id,elementId:r.targetElementId,face:r.targetFace},orientation:r.orientation,placementMode:r.placementMode,sharedWallId:r.sharedWallId},a,b,source)!.rotation,angleDegrees=Math.abs(normalizeRotation(target.rotation-expected+180)-180),completed=distanceM<=planTolerance.alignmentM && angleDegrees<=planTolerance.angleDegrees;return {completed,message:completed?'Conexão por canto compatibilizada.':'Cantos desalinhados ou orientação divergente.'}}
 const fa=planFeature(sa,r.type,r.sourceElementId),fb=planFeature(sb,r.type,r.targetElementId)
 if(!fa||!fb)return {completed:false,message:'Relação sem elemento correspondente definido ou sem geometria suficiente.'}
 const same=sameSideForRelationship(project,r),alignment=r.type==='shared_wall'?sharedWallAlignment(transformed(fa,source),transformed(fb,target),same):featureAlignment(transformed(fa,source),transformed(fb,target));if(r.type==='opening_connection'&&same)alignment.angleDegrees=180-alignment.angleDegrees
 const completed=alignment.distanceM<=planTolerance.alignmentM&&alignment.angleDegrees<=planTolerance.angleDegrees&&alignment.differenceM<=planTolerance.lengthM&&alignment.thicknessM<=planTolerance.lengthM
 return {completed,alignment,message:completed?'Relação compatibilizada.':r.type==='opening_connection'?'Abertura desalinhada ou divergente.':'Parede compartilhada não compatibilizada.'}
}
export function snapChoices(project:Project,floorId:string,roomId:string,placements=floorPlacements(project,floorId)):SnapChoice[] {
 const rooms=floorRooms(project,floorId),room=rooms.find(r=>r.id===roomId);if(!room)return []
 const shape=buildPlanRoom(room),current=placements.find(p=>p.roomId===roomId),choices:SnapChoice[]=[]
 for(const relation of planRelationships(project,floorId)) {
  if(relation.derivedFromCornerId)continue
  if(relation.sourceRoomId!==roomId&&relation.targetRoomId!==roomId)continue
  const reversed=relation.sourceRoomId===roomId,r=reversed?{...relation,sourceRoomId:relation.targetRoomId,sourceElementId:relation.targetElementId,targetRoomId:roomId,targetElementId:relation.sourceElementId,sourceFace:relation.targetFace,targetFace:relation.sourceFace}:relation
  const anchor=placements.find(p=>p.roomId===r.sourceRoomId),other=rooms.find(x=>x.id===r.sourceRoomId);if(!anchor||!other)continue
  const sourceShape=buildPlanRoom(other),prefix=`${other.displayId??''} ${other.name}`
  if(r.type==='adjacency') {const bounds=planBounds(sourceShape.points.map(p=>worldPoint(p,anchor))),rotation=current?.rotation??0,local=planBounds(shape.points.map(p=>rotatePoint(p,rotation)));const variants=[['à direita',bounds.maxX+.15-local.minX,bounds.minY-local.minY],['à esquerda',bounds.minX-.15-local.maxX,bounds.minY-local.minY],['abaixo',bounds.minX-local.minX,bounds.maxY+.15-local.minY],['acima',bounds.minX-local.minX,bounds.minY-.15-local.maxY]] as const;variants.forEach(([label,x,y],i)=>choices.push({id:`${relation.id}:${i}`,relationship:relation,placement:{roomId,floorId,x,y,rotation},label:`${prefix}: ${label} (escolha o lado)`,differenceM:0}));continue}
  if(r.type==='corner'){const originalConnection=project.spatialConnections?.find(c=>c.id===r.spatialConnectionId||c.id===r.id);const placement=cornerSnap(originalConnection??{id:r.id,type:'corner',a:{roomId:other.id,elementId:r.sourceElementId,face:r.sourceFace},b:{roomId:room.id,elementId:r.targetElementId,face:r.targetFace},orientation:r.orientation,placementMode:r.placementMode,sharedWallId:r.sharedWallId},other,room,anchor);if(placement)choices.push({id:relation.id,relationship:relation,placement,label:`${prefix} · canto ↔ canto · ${r.orientation==='inverted'?'invertida':'normal'}`,differenceM:0});continue}
  const sourceIds=r.sourceElementId?[r.sourceElementId]:r.type==='opening_connection'?other.openings.filter(o=>o.type!=='window').map(o=>o.id):[]
  const targetIds=r.targetElementId?[r.targetElementId]:r.type==='opening_connection'?room.openings.filter(o=>{const source=other.openings.find(x=>x.id===r.sourceElementId);return source?availableCounterpart(source,other.id,o):o.type!=='window' && !o.connectedOpeningId}).map(o=>o.id):[]
  for(const sourceId of sourceIds)for(const targetId of targetIds){const original=planFeature(sourceShape,r.type,sourceId),target=planFeature(shape,r.type,targetId);if(!original||!target)continue;const source=transformed(original,anchor),differenceM=Math.abs(source.length-target.length)
   const same=sameSideForRelationship(project,r)
   const anchors=differenceM>planTolerance.lengthM?['início','centro','final'] as const:['centro'] as const
   anchors.forEach((alignment)=>{const tp=alignment==='início'?(same?target.start:target.end):alignment==='final'?(same?target.end:target.start):midpoint(target.start,target.end),placement=alignRoomAnchors(room,anchor,{position:alignment==='início'?original.start:alignment==='final'?original.end:midpoint(original.start,original.end),angle:angle(original)},{position:tp,angle:angle(target)},!same);choices.push({id:`${relation.id}:${sourceId}:${targetId}:${alignment}`,relationship:relation,placement,label:`${prefix} · ${r.type==='shared_wall'?'parede':'abertura'} ${sourceShape.room.walls.find(w=>w.id===sourceId)?.label??other.openings.find(o=>o.id===sourceId)?.label??''} ↔ ${room.walls.find(w=>w.id===targetId)?.label??room.openings.find(o=>o.id===targetId)?.label??''} · ${alignment}${r.type==='shared_wall'&&differenceM>planTolerance.lengthM?' · trecho parcial':''}`,differenceM:r.type==='shared_wall'?0:differenceM})})
  }
 }
 return choices
}
export function planCompatibility(project:Project,floorId:string,placements=floorPlacements(project,floorId)) {
 const rooms=floorRooms(project,floorId),relations=planRelationships(project,floorId),alerts:{roomId:string;message:string;otherRoomId?:string}[]=[],placed=new Set(placements.map(p=>p.roomId));let completed=placed.size
 rooms.filter(r=>!placed.has(r.id)).forEach(r=>alerts.push({roomId:r.id,message:'Ambiente não posicionado.'}))
 relations.forEach(r=>{const state=relationshipState(project,r,placements);if(state.completed)completed++;else alerts.push({roomId:r.targetRoomId,otherRoomId:r.sourceRoomId,message:state.message});if(state.alignment&&state.alignment.differenceM>planTolerance.lengthM)alerts.push({roomId:r.targetRoomId,otherRoomId:r.sourceRoomId,message:`Divergência: ${(state.alignment.differenceM*100).toLocaleString('pt-BR',{maximumFractionDigits:2})} cm.`});if(state.alignment&&state.alignment.thicknessM>planTolerance.lengthM)alerts.push({roomId:r.targetRoomId,message:`Espessuras divergentes: ${(state.alignment.thicknessM*100).toLocaleString('pt-BR',{maximumFractionDigits:2})} cm.`})})
 const shapes=rooms.filter(r=>placed.has(r.id)).map(buildPlanRoom)
 for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){const a=shapes[i],b=shapes[j];if(!a.survey.perimeter.closed||!b.survey.perimeter.closed)continue;const pa=a.interiorPolygon.map(p=>worldPoint(p,placements.find(x=>x.roomId===a.room.id)!)),pb=b.interiorPolygon.map(p=>worldPoint(p,placements.find(x=>x.roomId===b.room.id)!));if(polygonsOverlap(pa,pb)&&!intentionalContainment(project,a.room,b.room,pa,pb))alerts.push({roomId:a.room.id,otherRoomId:b.room.id,message:'Sobreposição inesperada entre ambientes.'})}
 alerts.push(...wallConflicts(project,floorId,placements))
 const total=rooms.length+relations.length,overlaps=alerts.filter(a=>a.message.startsWith('Sobreposição')||a.message.startsWith('Conflito de paredes')).length
 return {alerts,total,completed,percentage:total?Math.round(100*Math.max(0,completed-Math.min(overlaps,completed))/total):0}
}
export function assistPlacements(project:Project,floorId:string) {
 let placements=[...floorPlacements(project,floorId)],changed=true;const added:RoomPlacement[]=[],ambiguous:string[]=[]
 while(changed){changed=false;for(const room of floorRooms(project,floorId)){if(placements.some(p=>p.roomId===room.id))continue;const candidates=snapChoices(project,floorId,room.id,placements),unique=candidates.filter((c,i)=>candidates.findIndex(x=>pointDistance(x.placement,c.placement)<1e-6&&Math.abs(x.placement.rotation-c.placement.rotation)<1e-6)===i)
  if(unique.length!==1||unique[0].differenceM>planTolerance.lengthM)continue
  const candidate=unique[0],trial=[...placements,candidate.placement],relations=planRelationships(project,floorId).filter(r=>(r.sourceRoomId===room.id||r.targetRoomId===room.id)&&trial.some(p=>p.roomId===(r.sourceRoomId===room.id?r.targetRoomId:r.sourceRoomId)))
  if(relations.some(r=>!relationshipState(project,r,trial).completed)||planCompatibility(project,floorId,trial).alerts.some(a=>a.message.startsWith('Sobreposição')&&(a.roomId===room.id||a.otherRoomId===room.id)))continue
  placements=trial;added.push(candidate.placement);changed=true
 }}
 floorRooms(project,floorId).filter(r=>!placements.some(p=>p.roomId===r.id)&&snapChoices(project,floorId,r.id,placements).length).forEach(r=>ambiguous.push(r.id))
 return {added,ambiguous}
}
