import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { roomChecklist, projectChecklistSummary } from '../../src/checklist'
import { COMPLETION_ITEMS, TECHNICAL_ITEMS, technicalItemId } from '../../src/technicalChecklist'
import { createRoomObject } from '../../src/roomObjects'
import { createSnapshot, readSnapshot, encodeSnapshot, decodeSnapshot, SCHEMA_VERSION, saveWorkspace } from '../../src/storage'
import * as photoStorage from '../../src/photoStorage'
import { importSurveyPhoto } from '../../src/photoImport'
import { cloneWithNewIds } from '../../src/projectClone'
import { photoTarget, searchPhotos, cleanProjectPhotoLinks } from '../../src/photos'
import TechnicalChecklistPanel, { CompletionStats } from '../../src/TechnicalChecklistPanel'
import PhotoOffer from '../../src/PhotoOffer'
import { sectionForIssue } from '../../src/environmentNavigation'
import { roomFrom, project } from '../etapa11/helpers'
import type { Photo } from '../../src/models'

function fixture() {
  const room=roomFrom('Sala',[4,3,4,3]), p=project([room]);
  room.technicalChecks=Object.fromEntries(TECHNICAL_ITEMS.filter(item=>!item.general).map(item=>[item.key,{status:'na' as const}]));
  p.generalChecks=Object.fromEntries(TECHNICAL_ITEMS.filter(item=>item.general).map(item=>[item.key,{status:'na' as const}]));
  return {room,p}
}
describe('Etapa 20 — conclusão, checklist e fotos independentes',()=>{
  it('OK e N/A concluem, Pendente reduz, e OK exige dados gerais preenchidos',()=>{
    const {room,p}=fixture();expect(roomChecklist(room,p).completeness).toBe(100);
    room.technicalChecks!.generator={status:'pending'};
    const pending=roomChecklist(room,p);expect(pending.completeness).toBeLessThan(100);expect(pending.checksCompleted).toBe(pending.checksTotal-1);
    room.technicalChecks!.generator={status:'ok'};expect(roomChecklist(room,p).completeness).toBe(100);
    p.generalChecks!.client={status:'ok',value:''};expect(roomChecklist(room,p).completeness).toBeLessThan(100);
    p.generalChecks!.client.value='Cliente X';expect(roomChecklist(room,p).completeness).toBe(100);
    room.ceilingHeightM=null;expect(roomChecklist(room,p).issues.some(issue=>issue.field==='ceilingHeightM')).toBe(false);
    room.technicalChecks!.ceiling={status:'ok'};expect(roomChecklist(room,p).issues.some(issue=>issue.field==='ceilingHeightM')).toBe(true);
  });
  it('medidas incompletas invalidam OK, sem contar a parede novamente no checklist',()=>{
    const {room,p}=fixture();room.technicalChecks!.walls={status:'ok'};room.technicalChecks!.geometry={status:'ok'};
    const full=roomChecklist(room,p);room.walls[0].lengthM=null;
    const incomplete=roomChecklist(room,p);
    expect(incomplete.checksTotal).toBe(COMPLETION_ITEMS.length);expect(incomplete.obligations.length).toBe(full.obligations.length);
    expect(incomplete.checks.find(item=>item.key==='walls')?.completed).toBe(false);
    expect(incomplete.checks.find(item=>item.key==='geometry')?.completed).toBe(true);
    expect(incomplete.issues.some(item=>item.elementId===room.walls[0].id)).toBe(true);
  });
  it('classifica vigas/pilares/equipamentos sem duplicar como objetos genéricos',()=>{
    const {room,p}=fixture();const beam={...createRoomObject(room),technicalItemKey:'beams'};room.objects=[beam];
    room.technicalChecks!.beams={status:'ok'};room.technicalChecks!.objects={status:'ok'};
    const result=roomChecklist(room,p);expect(result.checks.find(item=>item.key==='beams')?.completed).toBe(false);
    expect(result.checks.find(item=>item.key==='objects')?.completed).toBe(true);
    expect(sectionForIssue(room,result.issues.find(item=>item.elementId===beam.id)!)).toBe('objects');
    beam.dimensions={widthM:.2,depthM:3};expect(roomChecklist(room,p).checks.find(item=>item.key==='beams')?.completed).toBe(true);
  });
  it('fotos e a recusa não entram no denominador e os vínculos técnicos são pesquisáveis',()=>{
    const {room,p}=fixture(), before=roomChecklist(room,p);
    const photo:Photo={id:'photo',fileId:'blob',originalFileName:'registro.jpg',createdAt:'2026-10-05',roomId:room.id,linkedEntityType:'technical_item',linkedEntityId:technicalItemId(room,'generator'),tags:[],mimeType:'image/jpeg',size:5};room.photos=[photo];
    const after=roomChecklist(room,p);expect(after.completeness).toBe(before.completeness);expect(after.checksTotal).toBe(before.checksTotal);expect(after.photosCount).toBe(1);
    room.technicalChecks!.facade={status:'pending',note:'Fachada lateral'};expect(roomChecklist(room,p).completeness).toBe(before.completeness);expect(roomChecklist(room,p).issues.some(item=>item.field==='check:facade')).toBe(false);
    expect(photoTarget(room,photo)?.label).toBe('Gerador');expect(searchPhotos(p,{query:'gerador',roomId:'',type:'',link:'all'})).toHaveLength(1);
    const original=structuredClone(room);let closed=false;
    const html=renderToStaticMarkup(<PhotoOffer request={{roomId:room.id,type:'room',entityId:room.id,label:room.name}} onAdd={()=>{}} onClose={()=>{closed=true}}/>);
    expect(html).toContain('Agora não');expect(html).toContain('capture="environment"');expect(room).toEqual(original);expect(closed).toBe(false);
  });
  it('dados gerais contam uma vez no projeto e são compartilhados entre ambientes',()=>{
    const {room,p}=fixture();const other=roomFrom('Cozinha',[4,3,4,3]);other.technicalChecks=structuredClone(room.technicalChecks);p.floors[0].rooms.push(other);
    const summary=projectChecklistSummary(p), general=TECHNICAL_ITEMS.filter(item=>item.general).length;
    expect(summary.checksTotal).toBe(COMPLETION_ITEMS.length*2-general);
    p.generalChecks!.client={status:'pending'};
    expect(projectChecklistSummary(p).issues.filter(item=>item.field==='check:client')).toHaveLength(1);
    expect(roomChecklist(other,p).checks.find(item=>item.key==='client')?.completed).toBe(false);
  });
  it('pendências técnicas abrem o grupo do checklist e os quatro indicadores são separados',()=>{
    const {room,p}=fixture();room.technicalChecks!.fuelGas={status:'pending'};
    const result=roomChecklist(room,p), issue=result.issues.find(item=>item.field==='check:fuelGas')!;
    expect(issue.elementId).toBe(technicalItemId(room,'fuelGas'));expect(sectionForIssue(room,issue)).toBe('checklist');
    const html=renderToStaticMarkup(<TechnicalChecklistPanel room={room} project={p} onChange={()=>{}} onProjectChange={()=>{}} onNavigate={()=>{}}/>);
    for(const label of ['DADOS GERAIS','MEDIÇÕES','ELÉTRICA/GÁS','PRODUTOS PERIGOSOS']) expect(html).toContain(label);
    const stats=renderToStaticMarkup(<CompletionStats result={result}/>);for(const label of ['Levantamento:','Verificações:','Pendências:','Fotos:']) expect(stats).toContain(label);
  });
  it('preserva status, dados gerais, medidas e fotos nas migrações e cópias do projeto',()=>{
    const {room,p}=fixture();room.technicalChecks!.tanks={status:'ok',note:'Tanque externo'};p.generalChecks!.client={status:'ok',value:'Cliente X'};
    room.photos=[{id:'photo',fileId:'blob',originalFileName:'tanque.jpg',createdAt:'2026-10-05',roomId:room.id,linkedEntityType:'technical_item',linkedEntityId:technicalItemId(room,'tanks'),tags:[],mimeType:'image/jpeg',size:5}];
    const data={projects:[p],projectId:p.id,floorId:p.floors[0].id,roomId:room.id}, snapshot=createSnapshot(data);
    expect(snapshot.schemaVersion).toBe(5);expect(decodeSnapshot(encodeSnapshot(snapshot)).data).toEqual(data);
    expect(readSnapshot({...snapshot,schemaVersion:4}).schemaVersion).toBe(SCHEMA_VERSION);
    expect(()=>readSnapshot({...snapshot,data:{...data,projects:[{...p,generalChecks:{client:{status:'invalid'}}} as never]}})).toThrow();
    const cloned=cloneWithNewIds(p).project;const copied=cloned.floors[0].rooms[0];expect(copied.walls.map(w=>w.lengthM)).toEqual(room.walls.map(w=>w.lengthM));expect(copied.technicalChecks).toEqual(room.technicalChecks);
    expect(photoTarget(copied,copied.photos![0])?.label).toBe('Tanques');expect(cleanProjectPhotoLinks(cloned).floors[0].rooms[0].photos![0].linkedEntityId).toBe(technicalItemId(copied,'tanks'));
  });
  it('importa com vínculo automático e reabre status, metadados e Blobs no IndexedDB',async()=>{
    const {room,p}=fixture();room.technicalChecks!.panels={status:'ok',note:'Quadro de distribuição'};
    const thumbnail=new Blob(['miniatura'],{type:'image/jpeg'}), original=new File(['imagem original'],'quadro.jpg',{type:'image/jpeg'});
    const preview=vi.spyOn(photoStorage,'createThumbnail').mockResolvedValue(thumbnail);
    try {
      const photo=await importSurveyPhoto(original,room.id,{type:'technical_item',id:technicalItemId(room,'panels')},photo=>{room.photos=[photo]});
      expect(photo.linkedEntityId).toBe(technicalItemId(room,'panels'));
      await saveWorkspace(createSnapshot({projects:[p],projectId:p.id,floorId:p.floors[0].id,roomId:room.id}));
      vi.resetModules();const reopened=await import('../../src/storage'), loaded=await reopened.loadWorkspace();
      const restored=loaded!.data.projects[0].floors[0].rooms[0];expect(restored.technicalChecks).toEqual(room.technicalChecks);
      expect(restored.photos![0].linkedEntityId).toBe(technicalItemId(restored,'panels'));
      expect(await (await photoStorage.readPhotoFile(photo.fileId)).text()).toBe('imagem original');
      expect(await (await photoStorage.readPhotoFile(photo.fileId,true)).text()).toBe('miniatura');
    } finally {preview.mockRestore()}
  });
});
