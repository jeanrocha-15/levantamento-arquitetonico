import 'fake-indexeddb/auto'
import { describe,expect,it,vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { roomFrom,project,opening } from '../etapa11/helpers'
import { buildWallFaces } from '../../src/wallFaces'
import { buildRoomGeometry } from '../../src/roomGeometry'
import { createStructuralObject,nextStructuralSequence,structuralVerification } from '../../src/structural'
import { createRoomObject,resolveObjectAttachment,buildObjectPlacements,attachmentSegments } from '../../src/roomObjects'
import { roomChecklist,projectChecklistSummary } from '../../src/checklist'
import { TECHNICAL_ITEMS } from '../../src/technicalChecklist'
import { createRoof,changeWaterCount,roofChecklist,roofSlope,nextRoofSequence } from '../../src/roofs'
import { createSnapshot,encodeSnapshot,decodeSnapshot,readSnapshot,SCHEMA_VERSION,saveWorkspace } from '../../src/storage'
import { cloneWithNewIds } from '../../src/projectClone'
import { allProjectPhotos,photoFileIds,searchRoofPhotos } from '../../src/photos'
import { drawRoomSheet } from '../../src/pdf/roomSheet'
import { referencedPhotos } from '../../src/photoSync'
import { createProjectArchive,readProjectArchive } from '../../src/projectArchive'
import RoofSketch from '../../src/RoofSketch'
import RoomObjectEditor from '../../src/RoomObjectEditor'
import RoofsPanel from '../../src/RoofsPanel'
import { UnitContext } from '../../src/Measurement'
import type { Photo,Roof,RoomObject } from '../../src/models'

function fixture() {
  const room=roomFrom('Sala',[4,3,4,3]),p=project([room]);room.technicalChecks=Object.fromEntries(TECHNICAL_ITEMS.filter(i=>!i.general).map(i=>[i.key,{status:'na' as const}]));p.generalChecks=Object.fromEntries(TECHNICAL_ITEMS.filter(i=>i.general).map(i=>[i.key,{status:'na' as const}]));return {room,p}
}
function completeRoof(roof:Roof):Roof {return {...roof,lengthM:6,widthM:4,waters:roof.waters.map((w,i)=>({...w,direction:(i===0?'north':'south') as 'north'|'south',highSide:'Cumeeira',lowSide:`Beiral ${i+1}`,highHeightM:4,lowHeightM:3,projectionM:2}))}}
function completeColumn(object:RoomObject):RoomObject {return {...object,profile:'square',material:'cast_concrete',dimensions:{widthM:.2}}}
describe('Etapa 21 — faces físicas, estruturas e telhados',()=>{
  it.each([90,45,82,270])('une offsets no canto de %s graus sem alterar as medidas',angle=>{
    const room=roomFrom('Teste',[4,3,2],[angle,90,90]);room.walls.forEach(w=>w.thickness=.2);const before=structuredClone(room);const geometry=buildRoomGeometry(room);
    const faces=buildWallFaces(geometry.perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace:'internal'})));
    const a=faces.get(room.walls[0].id)!,b=faces.get(room.walls[1].id)!;expect(a).toHaveLength(2);expect(a[0].end.x).toBeCloseTo(b[0].start.x);expect(a[1].end.x).toBeCloseTo(b[1].start.x);expect(a[1].end.y).toBeCloseTo(b[1].start.y);expect(a[0].start.y).toBeCloseTo(0);expect(a[1].start.y).toBeCloseTo(-.2);expect(room).toEqual(before);
  })
  it('muda somente o lado da espessura ao escolher face externa',()=>{
    const segment={id:'A',start:{x:0,y:0},end:{x:4,y:0},thickness:.15};const internal=buildWallFaces([{...segment,referenceFace:'internal'}]).get('A')!,external=buildWallFaces([{...segment,referenceFace:'external'}]).get('A')!;
    expect(internal.map(f=>f.start.y)).toEqual([0,-.15]);expect(external.map(f=>f.start.y)).toEqual([.15,0]);expect(segment.end.x).toBe(4);
    expect(buildWallFaces([{...segment,thickness:undefined}]).get('A')).toEqual([{start:segment.start,end:segment.end}]);
  })
  it('preserva a referência de paredes simples e une espessuras diferentes em trechos colineares',()=>{
    const {room}=fixture();room.walls[0].thickness=.15;const g=buildRoomGeometry(room);const faces=buildWallFaces(g.perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace:'internal'})));
    expect(faces.get(room.walls[1].id)![0].start).toEqual(g.perimeter.segments[1].start);
    const steps=buildWallFaces([{id:'A',start:{x:0,y:0},end:{x:2,y:0},thickness:.15,referenceFace:'internal'},{id:'B',start:{x:2,y:0},end:{x:4,y:0},thickness:.2,referenceFace:'internal'}]);
    expect(steps.get('A')!.some(face=>Math.abs(face.start.x-2)<1e-9 && Math.abs(face.end.x-2)<1e-9 && Math.abs(face.start.y-face.end.y)>.01)).toBe(true);
  })
  it('interrompe as duas faces para portas, janelas e vãos',()=>{
    const {room}=fixture();room.walls[0].thickness=.2;opening(room,{label:'P01',type:'door',offsetM:.2,widthM:.5});opening(room,{label:'J01',type:'window',offsetM:1.2,widthM:.5,sillHeightM:1});opening(room,{label:'V01',type:'gap',offsetM:2.2,widthM:.5});const g=buildRoomGeometry(room);
    const faces=buildWallFaces(g.perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness})),new Map(g.openings.wallLayouts.map(w=>[w.wallId,w.solidRanges]))).get(room.walls[0].id)!;
    expect(faces).toHaveLength(8);expect(faces.every(f=>!(f.start.x<1.4&&f.end.x>1.4))).toBe(true);
  })
  it('representa abertura em PI e corta suas duas faces',()=>{
    const {room}=fixture();room.internalWalls=[{id:'pi',label:'PI01',origin:{type:'perimeter_wall',wallId:room.walls[0].id,referenceCornerId:room.corners[3].id,distanceM:1},lengthM:2,orientationDegrees:45,thicknessM:.1}];const item=opening(room,{label:'P01',type:'door',wallId:'pi',referenceCornerId:'pi:start',offsetM:.4,widthM:.8});const g=buildRoomGeometry(room);expect(g.openings.checks.find(c=>c.id===item.id)?.drawable).toBe(true);
    const placement=g.internalWalls.placements[0];const faces=buildWallFaces([{id:'pi',start:placement.start,end:placement.end,thickness:.1}],new Map(g.openings.wallLayouts.map(w=>[w.wallId,w.solidRanges])));expect(faces.get('pi')).toHaveLength(4);
  })
  it('gera PIL/VIG estáveis e não reutiliza números excluídos',()=>{
    const {room}=fixture();const column=createStructuralObject(room,'column'),beam=createStructuralObject(room,'beam');expect(column.displayId).toBe('PIL-001');expect(beam.displayId).toBe('VIG-001');room.structuralCounters={column:1,beam:1};room.objects=[];expect(nextStructuralSequence(room,'column')).toBe(2);expect(createStructuralObject(room,'beam').displayId).toBe('VIG-002');
  })
  it('forma, seção e material são independentes, e dimensão de viga não exige profundidade duplicada',()=>{
    const {room}=fixture();const beam={...createStructuralObject(room,'beam'),profile:'I' as const,material:'steel' as const,dimensions:{lengthM:3,widthM:.2,heightM:.3,webM:.01,flangeM:.02}};expect(structuralVerification(beam).every(c=>c.completed)).toBe(true);const placements=buildObjectPlacements([beam]);expect(placements[0].widthM).toBe(3);expect(placements[0].heightM).toBe(.2);expect(beam.dimensions.widthM).toBe(.2);
    expect(structuralVerification({...beam,material:undefined}).find(c=>c.key==='material')?.completed).toBe(false);expect(structuralVerification({...beam,profile:'custom',customProfile:''}).find(c=>c.key==='shape')?.completed).toBe(false);
    expect(buildObjectPlacements([completeColumn(createStructuralObject(room,'column'))])[0].heightM).toBe(.2);
  })
  it('anexos seguem posição e ângulo sem alterar dimensões, inclusive em PI',()=>{
    const {room}=fixture();const object={...createRoomObject(room),dimensions:{widthM:1.2,depthM:.7},attachedWallId:room.walls[1].id,followWallAngle:true,alongWallM:1,offset:.2};const before=structuredClone(object);
    const resolved=resolveObjectAttachment(object,attachmentSegments(room));expect(resolved.rotationDegrees).toBeCloseTo(90);expect(resolved.position.xM).toBeCloseTo(3.8);expect(resolved.position.yM).toBeCloseTo(1);
    room.corners[0].angleDegrees=45;expect(resolveObjectAttachment(object,attachmentSegments(room)).rotationDegrees).toBeCloseTo(135);expect(object).toEqual(before);
    object.followWallAngle=false;object.rotationDegrees=12;expect(resolveObjectAttachment(object,attachmentSegments(room)).rotationDegrees).toBe(12);
    room.internalWalls=[{id:'pi',label:'PI01',origin:{type:'perimeter_wall',wallId:room.walls[0].id,referenceCornerId:room.corners[3].id,distanceM:1},lengthM:2,orientationDegrees:45}];object.attachedWallId='pi';object.followWallAngle=true;expect(resolveObjectAttachment(object,attachmentSegments(room)).rotationDegrees).toBeCloseTo(45);
  })
  it('conta três verificações por estrutura sem duplicar a obrigação geral',()=>{
    const {room,p}=fixture();const before=roomChecklist(room,p);room.objects=[createStructuralObject(room,'column')];const incomplete=roomChecklist(room,p);expect(incomplete.checksTotal).toBe(before.checksTotal+2);expect(incomplete.issues.filter(i=>i.elementId===room.objects![0].id)).toHaveLength(3);expect(incomplete.issues.some(i=>i.field==='check:columns')).toBe(false);
    room.objects=[completeColumn(room.objects[0])];expect(roomChecklist(room,p).completeness).toBe(100);
  })
  it.each([1,2,3,4] as const)('estrutura %s águas independentes e preserva IDs ao aumentar',count=>{
    const {p}=fixture();const roof=changeWaterCount(createRoof(p),count);expect(roof.waters).toHaveLength(count);const old=structuredClone(roof);const increased=changeWaterCount(roof,4);expect(increased.waters[0]).toEqual(roof.waters[0]);expect(roof).toEqual(old);expect(new Set(increased.waters.map(w=>w.id)).size).toBe(4);
  })
  it('calcula desnível, porcentagem e ângulo por água sem substituir alturas',()=>{
    const {p}=fixture();const roof=completeRoof(createRoof(p)),before=structuredClone(roof);const slope=roofSlope(roof.waters[0])!;expect(slope.riseM).toBe(1);expect(slope.percent).toBe(50);expect(slope.degrees).toBeCloseTo(26.565);roof.waters[1].projectionM=4;expect(roofSlope(roof.waters[1])?.percent).toBe(25);expect(roof.waters[0]).toEqual(before.waters[0]);expect(roofSlope({...roof.waters[0],projectionM:0})).toBeUndefined();expect(roofSlope({...roof.waters[0],lowHeightM:5})).toBeUndefined();
  })
  it('inclui checklist de telhado na % do projeto, exclui fotos e respeita N/A',()=>{
    const {p}=fixture();const before=projectChecklistSummary(p);const roof=createRoof(p);p.roofs=[roof];expect(projectChecklistSummary(p).completeness).toBeLessThan(before.completeness);expect(projectChecklistSummary(p).checksTotal).toBe(before.checksTotal+5);p.roofs=[completeRoof(roof)];expect(projectChecklistSummary(p).completeness).toBe(100);expect(roofChecklist(p.roofs[0]).completeness).toBe(100);
    const photo:Photo={id:'photo',fileId:'file',roomId:'',roofId:roof.id,linkedEntityType:'roof',linkedEntityId:roof.id,originalFileName:'cobertura.jpg',createdAt:'2026-10-05',mimeType:'image/jpeg',size:1,tags:['telhado']};p.roofs[0].photos=[photo];expect(projectChecklistSummary(p).completeness).toBe(100);expect(photoFileIds([p]).has('file')).toBe(true);expect(referencedPhotos([p]).has('file')).toBe(true);expect(searchRoofPhotos(p,{query:'TEL-001',roomId:'',type:'roof',link:'linked'})).toHaveLength(1);
    roof.checks={heights:{status:'na'},slope:{status:'na'}};expect(roofChecklist(roof).checks.find(c=>c.key==='slope')?.completed).toBe(true);
  })
  it('salva schema 6, lê schema 5 e copia vínculos de estruturas/telhados sem alterar medidas',async()=>{
    const {room,p}=fixture();room.wallMeasurementFace='external';room.objects=[{...completeColumn(createStructuralObject(room,'column')),attachedWallId:room.walls[0].id,followWallAngle:true,alongWallM:1,offset:.2}];p.roofs=[completeRoof(createRoof(p))];p.roofCounter=1;const roof=p.roofs[0];roof.photos=[{id:'photo',fileId:'file',roomId:'',roofId:roof.id,linkedEntityType:'roof',linkedEntityId:roof.id,originalFileName:'roof.jpg',createdAt:'2026-10-05',mimeType:'image/jpeg',size:1,tags:[]}];const data={projects:[p],projectId:p.id,floorId:'F1',roomId:room.id};const snap=createSnapshot(data);
    expect(SCHEMA_VERSION).toBe(6);expect(decodeSnapshot(encodeSnapshot(snap))).toEqual(snap);expect(readSnapshot({...snap,schemaVersion:5}).schemaVersion).toBe(6);const copied=cloneWithNewIds(p).project;expect(copied.roofs![0].projectId).toBe(copied.id);expect(copied.roofs![0].photos![0].roofId).toBe(copied.roofs![0].id);expect(copied.floors[0].rooms[0].objects![0].attachedWallId).toBe(copied.floors[0].rooms[0].walls[0].id);
    await saveWorkspace(snap);vi.resetModules();const storage=await import('../../src/storage');expect((await storage.loadWorkspace())?.data.projects[0].roofs).toEqual(p.roofs);p.roofs=[];p.detachedRoofPhotos=roof.photos.map(photo=>({...photo,roofId:undefined,linkedEntityType:undefined,linkedEntityId:undefined}));expect(allProjectPhotos(p)).toHaveLength(1);expect(nextRoofSequence(p)).toBe(2);expect(readSnapshot(createSnapshot(data))).toBeTruthy();
  })
  it('mantém fotos de telhado nos arquivos de projeto existentes',async()=>{
    const {room,p}=fixture(),roof=createRoof(p);p.roofs=[roof];roof.photos=[{id:'photo',fileId:'file',roomId:'',roofId:roof.id,linkedEntityType:'roof',linkedEntityId:roof.id,originalFileName:'roof.jpg',createdAt:'2026-10-05',mimeType:'image/jpeg',size:3,tags:[]}];const original=new Blob(['abc'],{type:'image/jpeg'});const archive=await createProjectArchive({projects:[p],projectId:p.id,floorId:'F1',roomId:room.id},p.id,async()=>({original,thumbnail:original}));expect(archive).toBeTruthy();
    // The existing archive reader also validates all new metadata through schema 6.
    const contents=await readProjectArchive(archive.bytes);expect(contents.project.roofs![0].photos![0].fileId).toBe('file');expect(contents.files.has('file')).toBe(true);
  })
  it('reutiliza faces no PDF e mantém proporção física das medidas',()=>{
    const {room,p}=fixture();room.walls.forEach(w=>w.thickness=.15);const before=structuredClone(room);const pdf=drawRoomSheet({room,project:p,option:{sheet:'A3',orientation:'landscape',scale:50}});expect(pdf.toPaper({x:4,y:0}).x-pdf.toPaper({x:0,y:0}).x).toBeCloseTo(80);expect(room).toEqual(before);expect(pdf.page.ops.join(' ')).not.toContain('NaN');
  })
  it('mostra formas condicionais, IDs estruturais e vistas de telhado separadas por unidade',()=>{
    const {room,p}=fixture();room.objects=[{...createStructuralObject(room,'beam'),attachedWallId:room.walls[0].id,alongWallM:0,offset:0}];const roof=completeRoof(createRoof(p));p.roofs=[roof];const original=structuredClone(p);const objectHtml=renderToStaticMarkup(<RoomObjectEditor room={room} onChange={()=>{}}/>);expect(objectHtml).toContain('VIG-001');expect(objectHtml).toContain('Seguir ângulo da parede');expect(objectHtml).toContain('Material');
    const metres=renderToStaticMarkup(<UnitContext value="m"><RoofSketch roof={roof}/></UnitContext>),centimetres=renderToStaticMarkup(<UnitContext value="cm"><RoofSketch roof={roof}/></UnitContext>);expect(metres).toContain('6,00 m');expect(centimetres).toContain('600 cm');expect(metres).toContain('Cumeeira');expect(metres).toContain('≈ 50%');expect(renderToStaticMarkup(<RoofsPanel project={p} onChange={()=>{}}/>)).toContain('Checklist do telhado');expect(p).toEqual(original);
  })
})
