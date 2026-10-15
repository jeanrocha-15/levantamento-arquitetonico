import {createRoom,wallLabel} from '../domain'
import type {Project,Room,RoomPlacement} from '../models'
import {ensureProjectMetadata} from '../projectMetadata'
import type {BimState,XYZ,PhysicalElement} from './types'
type Ref={uniqueId?:string;elementId?:string}
type Curve={isStraight?:boolean;hostStart?:XYZ;hostEnd?:XYZ;hostSamples?:XYZ[];start?:XYZ;end?:XYZ}
type Boundary={element?:Ref;curve:Curve}
interface SourceElement extends Ref {lacSurvey?:Room;lacId?:string;name?:string;kind:string;level?:Ref;host?:Ref;room?:Ref;hostPosition?:XYZ;position?:XYZ;axis?:Curve;boundaryLoops?:Boundary[][];areaM2?:number;unboundedHeightM?:number;thicknessM?:number;unconnectedHeightM?:number;rotationDegrees?:number;widthM?:number;heightM?:number;sillHeightM?:number;category?:{name?:string};familyName?:string;boundingBox?:{hostCorners?:XYZ[]};dimensions?:{widthM?:number;depthM?:number;heightM?:number};phase?:Ref;type?:Ref;parameters?:{name:string;value?:number;unit?:string}[]}
export interface RevitInventory {format:'revit-lac-exchange';schemaVersion:1;units:'m';source:{documentId:string;title:string;lacProjectId?:string;linkInstance?:Ref};levels:(Ref&{lacId?:string;name:string;elevationM:number;hostOrigin?:XYZ})[];elements:SourceElement[];types?:(Ref&{parameters?:{name:string;value?:number;unit?:string}[]})[];unplacedRooms?:unknown[];scope?:{allLevels?:boolean};warnings?:string[]}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)
const validPoint=(x:unknown):x is XYZ=>Array.isArray(x)&&x.length===3&&x.every(finite)
export const signedArea=(points:XYZ[])=>points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+p[0]*q[1]-q[0]*p[1]},0)/2
export function inside(point:XYZ,polygon:XYZ[]) {let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes}
export function importRevitInventory(raw:unknown):Project {
  const d=raw as RevitInventory
  if(d?.format!=='revit-lac-exchange'||d.schemaVersion!==1||d.units!=='m'||!d.source?.documentId||!Array.isArray(d.levels)||!Array.isArray(d.elements))throw new Error('Arquivo Revit inválido ou versão não suportada.')
  const scope=d.source.documentId+(d.source.linkInstance?.uniqueId?':link:'+d.source.linkInstance.uniqueId:'')
  const uid=(ref:Ref|undefined)=>ref?.uniqueId
  const key=(ref:Ref&{lacId?:string})=>ref.lacId??(uid(ref)?`revit:${scope}:${uid(ref)}`:undefined)
  const bim:BimState={sourceDocumentId:scope,physicalWalls:[],openings:[],elements:[],revitMappings:[],warnings:[...(d.warnings??[])]}
  const project:Project={id:d.source.lacProjectId??`revit-project:${scope}`,name:d.source.title,floors:[],relationships:[],spatialConnections:[],roomPlacements:[],bim,measurementUnit:'m'}
  const byUid=new Map(d.elements.filter(e=>uid(e)).map(e=>[uid(e)!,e]))
  for(const level of d.levels){const id=key(level);if(!id||!finite(level.elevationM))throw new Error('Pavimento sem identidade ou elevação válida.');project.floors.push({id,lacId:id,revitUniqueId:level.uniqueId,name:level.name,elevation:level.hostOrigin?.[2]??level.elevationM,rooms:[]})}
  const floorOf=(e:SourceElement)=>project.floors.find(f=>f.revitUniqueId===uid(e.level))
  for(const e of d.elements.filter(e=>e.kind==='wall')){
    const id=key(e),start=e.axis?.hostStart??e.axis?.start,end=e.axis?.hostEnd??e.axis?.end,floor=floorOf(e)
    if(!id||!validPoint(start)||!validPoint(end)||!floor){bim.warnings.push(`${e.name??e.elementId}: parede sem eixo/nível válido; preservada como elemento externo.`);continue}
    bim.physicalWalls.push({lacId:id,revitUniqueId:e.uniqueId,start,end,curve:e.axis?.isStraight===false?e.axis:undefined,thickness:e.thicknessM??null,baseLevelId:floor.id,height:e.unconnectedHeightM??null,roomIds:[],surveyRefs:[]})
  }
  const roomGlobal=new Map<string,XYZ[]>(),roomEdges=new Map<string,{start:XYZ;end:XYZ;host?:string}[]>(),placements=new Map<string,RoomPlacement>()
  for(const e of d.elements.filter(e=>e.kind==='room')){
    const floor=floorOf(e),rid=key(e)
    if(!rid||!floor||(e.areaM2??0)<=0||!e.boundaryLoops?.length){bim.warnings.push(`${e.name??e.elementId}: ambiente sem área/contorno/nível; não convertido em levantamento.`);continue}
    const loops=e.boundaryLoops.map(loop=>loop.map(b=>({start:b.curve.hostStart??b.curve.start,end:b.curve.hostEnd??b.curve.end,host:uid(b.element),straight:b.curve.isStraight!==false})))
    if(loops.some(loop=>loop.some(s=>!validPoint(s.start)||!validPoint(s.end)||!s.straight))){bim.warnings.push(`${e.name}: contorno curvo ou inválido preservado como externo.`);continue}
    let edges=loops.sort((a,b)=>Math.abs(signedArea(b.map(s=>s.start!)))-Math.abs(signedArea(a.map(s=>s.start!))))[0].map(s=>({start:s.start!,end:s.end!,host:s.host}))
    if(edges.some((s,i)=>Math.hypot(s.end[0]-edges[(i+1)%edges.length].start[0],s.end[1]-edges[(i+1)%edges.length].start[1])>1e-5)){bim.warnings.push(`${e.name}: limites desconectados; revisar no Revit.`);continue}
    // SVG has Y down. A clockwise SVG perimeter is counterclockwise in Revit.
    if(signedArea(edges.map(s=>s.start))>0)edges=edges.reverse().map(s=>({...s,start:s.end,end:s.start}))
    for(let i=0;i<edges.length-1;i++){const a=edges[i],b=edges[i+1],dx=a.end[0]-a.start[0],dy=a.end[1]-a.start[1],ex=b.end[0]-b.start[0],ey=b.end[1]-b.start[1];if(a.host===b.host&&Math.abs(dx*ey-dy*ex)<1e-9&&dx*ex+dy*ey>0){a.end=b.end;edges.splice(i+1,1);i--}}
    const first=e.lacSurvey?.walls[0]?.physicalWallId,firstIndex=first?edges.findIndex(s=>bim.physicalWalls.find(w=>w.revitUniqueId===s.host)?.lacId===first):-1
    if(firstIndex>0)edges=[...edges.slice(firstIndex),...edges.slice(0,firstIndex)]
    const origin=edges[0].start,heading=Math.atan2(-(edges[0].end[1]-origin[1]),edges[0].end[0]-origin[0])*180/Math.PI
    const room:Room={...createRoom(e.name??'Ambiente Revit',floor.id),...e.lacSurvey,subrooms:[],name:e.name??'Ambiente Revit',floorId:floor.id,id:rid,lacId:rid,revitUniqueId:e.uniqueId,perimeterClosed:true,ceilingHeightM:e.lacSurvey?.ceilingHeightM??(finite(e.unboundedHeightM)&&e.unboundedHeightM>0?e.unboundedHeightM:null),ceilingType:e.lacSurvey?.ceilingType??'slab',notes:e.lacSurvey?.notes??'Importado do Revit. Confirme a entrada principal/Parede A e o pé-direito em campo.'}
    const reused=new Set<string>()
    room.walls=edges.map((s,i)=>{const physical=bim.physicalWalls.find(w=>w.revitUniqueId===s.host),length=Math.hypot(s.end[0]-s.start[0],s.end[1]-s.start[1]),old=e.lacSurvey?.walls.find(w=>w.physicalWallId===physical?.lacId&&!reused.has(w.id)),wid=old?.id??`${rid}:survey:${s.host??'boundary'}:${i}`;reused.add(wid);if(physical){physical.roomIds.push(rid);physical.surveyRefs.push({roomId:rid,wallId:wid})}return {id:wid,lacId:wid,label:old?.label??wallLabel(i),lengthM:length,originalMeasuredLengthM:old?.originalMeasuredLengthM??length,physicalWallId:physical?.lacId,thickness:physical?.thickness??null}})
    room.corners=edges.map((s,i)=>{const n=edges[(i+1)%edges.length],a=Math.atan2(-(s.end[1]-s.start[1]),s.end[0]-s.start[0]),b=Math.atan2(-(n.end[1]-n.start[1]),n.end[0]-n.start[0]),turn=Math.atan2(Math.sin(b-a),Math.cos(b-a))*180/Math.PI;return {id:`${rid}:corner:${i}`,wallIds:[room.walls[i].id,room.walls[(i+1)%edges.length].id],angleDegrees:180-turn,angleSource:'informed'}})
    room.openings=[];room.objects=[]
    if(loops.length>1){room.pendingItems.push({id:rid+':holes',description:'Ambiente com ilhas/recortes internos do Revit. Consulte os elementos externos preservados.',resolved:false,kind:'technical'});bim.warnings.push(`${e.name}: ${loops.length-1} contorno(s) interno(s) preservados como referência.`)}
    const placement={roomId:rid,floorId:floor.id,x:origin[0],y:-origin[1],rotation:heading,locked:true}
    floor.rooms.push(room);project.roomPlacements!.push(placement);placements.set(rid,placement);roomGlobal.set(rid,edges.map(s=>s.start));roomEdges.set(rid,edges)
  }
  const rooms=project.floors.flatMap(f=>f.rooms)
  let door=0,window=0
  for(const e of d.elements.filter(e=>e.kind==='door'||e.kind==='window')){
    const oid=key(e),host=bim.physicalWalls.find(w=>w.revitUniqueId===uid(e.host)),pos=e.hostPosition??e.position
    if(!oid||!host||!validPoint(pos)){bim.warnings.push(`${e.name}: abertura sem parede hospedeira/posição; preservada como externa.`);continue}
    const type=e.kind as 'door'|'window',physical={lacId:oid,revitUniqueId:e.uniqueId,hostWallId:host.lacId,levelId:floorOf(e)?.id??host.baseLevelId,type,position:pos,width:e.widthM??null,height:e.heightM??null,sill:e.sillHeightM??(type==='door'?0:null),roomRefs:[] as {roomId:string;openingId:string}[]}
    const label=(type==='door'?'P':'J')+String(type==='door'?++door:++window).padStart(2,'0')
    for(const room of rooms){const edges=roomEdges.get(room.id)!;for(let i=0;i<edges.length;i++){const s=edges[i];if(s.host!==uid(e.host))continue;const length=room.walls[i].lengthM!,along=((pos[0]-s.start[0])*(s.end[0]-s.start[0])+(pos[1]-s.start[1])*(s.end[1]-s.start[1]))/length,offset=along-(e.widthM??0)/2;if(offset<-.001||along+(e.widthM??0)/2>length+.001)continue;const id=`${oid}:room:${room.id}`;room.openings.push({id,lacId:id,revitUniqueId:e.uniqueId,physicalOpeningId:oid,label,wallId:room.walls[i].id,type,referenceCornerId:room.corners[(i+edges.length-1)%edges.length].id,offsetM:Math.max(0,offset),widthM:e.widthM??null,heightM:e.heightM??null,sillHeightM:physical.sill});physical.roomRefs.push({roomId:room.id,openingId:id});break}}
    if(physical.roomRefs.length===2){const [a,b]=physical.roomRefs;for(const [from,to] of [[a,b],[b,a]]){const o=rooms.find(r=>r.id===from.roomId)!.openings.find(o=>o.id===from.openingId)!;o.connectedRoomId=to.roomId;o.connectedOpeningId=to.openingId}project.spatialConnections!.push({id:oid+':connection',type:'opening',a:{roomId:a.roomId,elementId:a.openingId},b:{roomId:b.roomId,elementId:b.openingId}})}
    bim.openings.push(physical)
  }
  const converted=new Set([...rooms.map(r=>r.revitUniqueId),...bim.physicalWalls.map(w=>w.revitUniqueId),...bim.openings.map(o=>o.revitUniqueId)])
  const aux=new Set(['Autodesk.Revit.DB.ModelLine','Autodesk.Revit.DB.Material','Autodesk.Revit.DB.AppearanceAssetElement'])
  for(const e of d.elements){
    const eid=key(e);if(!eid)throw new Error('Elemento sem UniqueId estável.')
    if(converted.has(e.uniqueId)&&!(e.kind==='room'&&(e.boundaryLoops?.length??0)>1))continue
    const source=e as SourceElement&{class?:string}
    if(aux.has(source.class??'')||['Componentes de legenda','Câmeras','Layout do eixo do sistema cortina'].includes(e.category?.name??'')){bim.warnings.push(`${e.name??eid}: registro auxiliar não físico, mantido no arquivo original.`);continue}
    if(e.kind==='room'&&(e.areaM2??0)<=0)continue
    const box=e.boundingBox?.hostCorners?.filter(validPoint)??[],pos=e.hostPosition??e.position??box[0]
    const level=floorOf(e),category=({'furniture':'Furniture',equipment:'Equipment',structural_column:'Column',structural_framing:'Beam',plumbing_fixture:'Equipment',door:'Door',window:'Window'} as Record<string,string>)[e.kind]??'GenericModel'
    const representation=e.axis?.hostSamples??(e.axis?.hostStart&&e.axis?.hostEnd?[e.axis.hostStart,e.axis.hostEnd]:box)
    const record:PhysicalElement={lacId:e.kind==='room'?eid+':boundary-reference':eid,revitUniqueId:e.uniqueId,category,type:e.familyName??e.name??e.kind,levelId:level?.id??'',position:validPoint(pos)?pos:[0,0,0],rotation:e.rotationDegrees??0,hostId:uid(e.host)?key(byUid.get(uid(e.host)!)??e.host!):undefined,editable:false,representation,source:e,issue:'Representação simplificada do Revit; edição limitada.'}
    if(!validPoint(pos)){record.issue='Sem posição disponível; consulte os Dados Revit.';bim.warnings.push(`${record.type}: sem posição disponível.`)}
    const candidates=rooms.filter(r=>(!level||r.floorId===level.id)&&inside(record.position,roomGlobal.get(r.id)!))
    const room=candidates.length===1?candidates[0]:undefined
    const parameters=[...(e.parameters??[]),...(d.types?.find(t=>t.uniqueId===e.type?.uniqueId)?.parameters??[])]
    const dim=(names:string[])=>parameters.find(p=>names.includes(p.name)&&p.unit==='m'&&finite(p.value)&&p.value!>0)?.value
    const dimensions=e.dimensions??{widthM:dim(['Width','Largura','b']),depthM:dim(['Depth','Profundidade','h']),heightM:dim(['Height','Altura'])}
    if(finite(dimensions.widthM)&&finite(dimensions.depthM)){record.width=dimensions.widthM;record.depth=dimensions.depthM;record.height=dimensions.heightM;record.editable='limited';record.issue='Dimensões simplificadas de parâmetros Revit.'}
    // Exact family dimensions must come from the exporter. A world-axis bounding box is not a rotated object's size.
    if(room&&finite(dimensions.widthM)&&finite(dimensions.depthM)){
      const p=placements.get(room.id)!,a=p.rotation*Math.PI/180,dx=record.position[0]-p.x,dy=-record.position[1]-p.y
      const structural=category==='Column'||category==='Beam'
      room.objects!.push({id:eid,lacId:eid,revitUniqueId:e.uniqueId,displayId:`${structural?(category==='Column'?'PIL':'VIG'):'OBJ'}-${String(bim.elements.length+1).padStart(3,'0')}`,roomId:room.id,name:record.type,category:structural?'structural':category==='Furniture'?'furniture':'equipment',shape:'rectangle',dimensions:{...dimensions},position:{xM:dx*Math.cos(a)+dy*Math.sin(a),yM:-dx*Math.sin(a)+dy*Math.cos(a)},rotationDegrees:-record.rotation-p.rotation,structuralKind:structural?(category==='Column'?'column':'beam'):undefined})
      record.roomId=room.id;record.objectId=eid;record.editable='limited'
    }
    if(!record.levelId&&room)record.levelId=room.floorId
    if(!record.levelId){const unknown=scope+':unassigned';if(!project.floors.some(f=>f.id===unknown))project.floors.push({id:unknown,lacId:unknown,name:'Sem nível — revisar',elevation:0,rooms:[]});record.levelId=unknown;record.issue='Nível ausente no Revit. Associar antes de sincronizar.'}
    bim.elements.push(record)
  }
  bim.physicalWalls.forEach(w=>w.roomIds=[...new Set(w.roomIds)])
  bim.warnings.unshift(`${rooms.length} ambientes convertidos; ${d.unplacedRooms?.length??0} não posicionados preservados no arquivo original.`)
  return ensureProjectMetadata(project)
}
