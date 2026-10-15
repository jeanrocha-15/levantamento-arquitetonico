import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {importRevitInventory} from '../../src/bim/importRevit'
import {createLacExchange,recordsOf,projectFromExchange,preserveFieldData} from '../../src/bim/exchange'
import {compareSync,mergeExchange} from '../../src/bim/sync'
import {buildRoomGeometry} from '../../src/roomGeometry'
import {createSnapshot,decodeSnapshot,encodeSnapshot} from '../../src/storage'
const point=(x:number,y:number)=>[x,y,0]
function fixture(){const polygon=[point(0,0),point(4,0),point(4,3),point(0,3)];return {format:'revit-lac-exchange',schemaVersion:1,units:'m',source:{documentId:'doc',title:'Casa'},levels:[{uniqueId:'level',name:'Térreo',elevationM:0}],elements:[...polygon.map((start,i)=>({kind:'wall',uniqueId:'wall'+i,level:{uniqueId:'level'},thicknessM:.15,unconnectedHeightM:3,axis:{isStraight:true,hostStart:start,hostEnd:polygon[(i+1)%4]}})),{kind:'room',uniqueId:'room',name:'Sala',level:{uniqueId:'level'},areaM2:12,boundaryLoops:[polygon.map((start,i)=>({element:{uniqueId:'wall'+i},curve:{isStraight:true,hostStart:start,hostEnd:polygon[(i+1)%4]}}))]}]}}
describe('LAC Exchange',()=>{
 it('keeps a rolling family as an editable provisional gap with its source note',()=>{
  const base=fixture(),data={...base,elements:[...base.elements,{kind:'special_opening',uniqueId:'roller',familyName:'Porta de rolar',host:{uniqueId:'wall0'},level:{uniqueId:'level'},hostPosition:point(2,0),dimensions:{widthM:1.2,heightM:2.5}}]}
  const p=importRevitInventory(data),o=p.floors[0].rooms[0].openings[0]
  expect(o.type).toBe('gap');expect(o.widthM).toBe(1.2);expect(o.note).toContain('Porta de rolar')
  expect(buildRoomGeometry(p.floors[0].rooms[0]).openings.placements).toHaveLength(1)
 })
 it('keeps an unmeasured special opening located without inventing its width',()=>{
  const base=fixture(),data={...base,elements:[...base.elements,{kind:'special_opening',uniqueId:'roller',familyName:'Janela de rolar',host:{uniqueId:'wall0'},level:{uniqueId:'level'},hostPosition:point(2,0)}]}
  const p=importRevitInventory(data),o=p.floors[0].rooms[0].openings[0]
  expect(o.widthM).toBeNull();expect(o.offsetM).toBe(2)
  expect(createLacExchange(p).openings).toHaveLength(1)
 })
 it('keeps field records and presentation settings when BIM collections are updated',()=>{
  const original=importRevitInventory(fixture()),next=projectFromExchange(createLacExchange(original))
  original.measurementUnit='cm';original.generalChecks={client:{status:'ok',value:'Cliente'}};original.sheetLayouts={}
  original.floors[0].rooms[0].photos=[{id:'photo',originalFileName:'local.jpg',createdAt:'2026-01-01',roomId:original.floors[0].rooms[0].id,linkedEntityType:'wall',linkedEntityId:'deleted-wall',tags:[],fileId:'blob',mimeType:'image/jpeg',size:42}]
  const result=preserveFieldData(original,next)
  expect(result.measurementUnit).toBe('cm');expect(result.generalChecks).toEqual(original.generalChecks)
  expect(result.floors[0].rooms[0].photos?.[0].fileId).toBe('blob')
  expect(result.floors[0].rooms[0].photos?.[0].linkedEntityId).toBeUndefined()
 })
 it('converts real rooms into editable geometry, preserving scale and identity across imports',()=>{const a=importRevitInventory(fixture()),b=importRevitInventory(fixture()),r=a.floors[0].rooms[0];expect(r.id).toBe(b.floors[0].rooms[0].id);expect(buildRoomGeometry(r).perimeter.closureM).toBeLessThan(1e-8);expect(r.walls.map(w=>w.lengthM).sort()).toEqual([3,3,4,4]);expect(a.bim!.physicalWalls).toHaveLength(4);const exchange=createLacExchange(a),back=projectFromExchange(exchange);expect(back.floors[0].rooms[0].walls).toHaveLength(4);expect(back.roomPlacements).toEqual(a.roomPlacements)})
 it('preserves BIM identities through local storage',()=>{const p=projectFromExchange(createLacExchange(importRevitInventory(fixture()))),data={projects:[p],projectId:p.id,floorId:p.floors[0].id,roomId:p.floors[0].rooms[0].id};const loaded=decodeSnapshot(encodeSnapshot(createSnapshot(data))).data.projects[0];expect(loaded.bim).toEqual(p.bim);expect(loaded.floors[0].revitUniqueId).toBe('level')})
 it('detects both-side modifications and deletion conflicts',()=>{expect(compareSync({w:4},{w:3.98},{w:4.1})[0].status).toBe('conflict');expect(compareSync({w:4},{},{w:4.1})[0].status).toBe('conflict');expect(compareSync({w:4},{w:4},{},false)[0].status).toBe('same')})
 it('requires explicit conflict choices and keeps original snapshot',()=>{const a=createLacExchange(importRevitInventory(fixture()));a.syncMetadata.baseline=recordsOf(a);const b=structuredClone(a);a.rooms[0].name='LAC';b.rooms[0].name='Revit';expect(()=>mergeExchange(a,b,{})).toThrow();expect(mergeExchange(a,b,{['rooms:'+a.rooms[0].lacId]:'local'}).rooms[0].name).toBe('LAC')})
 it.runIf(!!process.env.LAC_REVIT_FIXTURE)('validates the actual Revit export without including private model data in repository',()=>{const data=JSON.parse(readFileSync(process.env.LAC_REVIT_FIXTURE!,'utf8')),p=importRevitInventory(data),e=createLacExchange(p);expect(e.rooms.length).toBeGreaterThan(0);expect(e.physicalWalls.length).toBeGreaterThan(0);expect(e.openings.length).toBe(data.elements.filter((x:{kind:string})=>x.kind==='door'||x.kind==='window').length);for(const r of p.floors.flatMap(f=>f.rooms)){expect(buildRoomGeometry(r).perimeter.closureM,r.name).toBeLessThan(1e-6)}const next=projectFromExchange(e);expect(next.roomPlacements).toHaveLength(e.rooms.length);for(const room of p.floors.flatMap(f=>f.rooms))expect(buildRoomGeometry(room).openings.placements.length).toBe(room.openings.length);console.log('Madeireira import:',JSON.stringify({rooms:e.rooms.length,walls:e.physicalWalls.length,openings:e.openings.length,elements:e.elements.length,attachedOpenings:e.openings.filter(o=>o.roomRefs.length).length}))})
})
