import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {roomFrom,opening,project} from '../etapa11/helpers'
import {openingSymbol,doorVisualNames,windowVisualNames} from '../../src/openingSymbols'
import {openingFrame} from '../../src/openingFrame'
import {buildRoomGeometry} from '../../src/roomGeometry'
import {buildPlanRoom} from '../../src/floorPlan'
import {layoutDimensions,overlaps,parallelOffset,pointsBox} from '../../src/architecturalDimensions'
import {surveyDimensions} from '../../src/surveyDimensions'
import OpeningElevation,{wallElevationData} from '../../src/OpeningElevation'
import {drawRoomSheet} from '../../src/pdf/roomSheet'
import {drawPlanSheet} from '../../src/pdf/planSheet'
import {composeSheet} from '../../src/pdf/sheetComposer'
import {defaultSheetLayout} from '../../src/pdf/sheetSettings'
import {createSnapshot,decodeSnapshot,encodeSnapshot} from '../../src/storage'
import {doorOperationKnown} from '../../src/checklist'
const option={sheet:'A3',orientation:'landscape',scale:50} as const

describe('Representação arquitetônica preserva os dados de campo',()=>{
 it.each(Object.keys(doorVisualNames) as (keyof typeof doorVisualNames)[])('porta %s mantém largura e posição, com símbolo canônico',type=>{
  const r=roomFrom('Sala',[6,4,6,4]);r.walls.forEach(w=>w.thickness=.15);const o=opening(r,{type:'door',label:'P01',doorVisualType:type,widthM:1,heightM:2.1,offsetM:.5,swing:'inward',hinge:'left',slideDirection:'right'});r.openings=[o]
  const original=structuredClone(r),survey=buildRoomGeometry(r),placement=survey.openings.placements[0],frame=openingFrame(survey.perimeter,placement),symbol=openingSymbol(o,placement.start,placement.end,frame)
  expect(symbol.every(p=>[p.a,p.b,...p.kind==='curve'?[p.c1,p.c2]:[]].every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)))).toBe(true)
  if(type==='gap')expect(symbol).toEqual([])
  if(type==='single'||type==='double')expect(symbol.filter(p=>p.kind==='curve')).toHaveLength(type==='double'?2:1)
  if(type.startsWith('slide'))expect(symbol.every(p=>p.kind==='line')).toBe(true)
  const draw=drawRoomSheet({project:project([r]),room:r,option});expect(Math.hypot(draw.toPaper({x:1,y:0}).x-draw.toPaper({x:0,y:0}).x,draw.toPaper({x:1,y:0}).y-draw.toPaper({x:0,y:0}).y)).toBeCloseTo(20)
  expect(r).toEqual(original)
 })
 it.each(Object.keys(windowVisualNames) as (keyof typeof windowVisualNames)[])('janela %s atravessa as duas faces',type=>{
  const r=roomFrom('Sala',[6,4,6,4]);r.walls[0].thickness=.15;const o=opening(r,{type:'window',label:'J01',windowVisualType:type,widthM:1.2,heightM:1,sillHeightM:1.1,offsetM:1});r.openings=[o];const survey=buildRoomGeometry(r),p=survey.openings.placements[0],symbol=openingSymbol(o,p.start,p.end,openingFrame(survey.perimeter,p))
  expect(symbol.flatMap(p=>[p.a.y,p.b.y])).toContain(-.15)
  expect(symbol.flatMap(p=>[p.a.y,p.b.y])).toContain(0)
 })
 it('um único recorte inclui todas as aberturas e as cotas encadeadas fecham',()=>{
  const r=roomFrom('Sala',[6,4,6,4]);r.ceilingHeightM=2.6
  const refs=buildRoomGeometry(r).perimeter.corners
  r.openings=[opening(r,{type:'door',label:'P01',offsetM:.5,widthM:.8,heightM:2.1}),opening(r,{type:'window',label:'J01',offsetM:2,widthM:1,heightM:1,sillHeightM:1}),opening(r,{type:'window',label:'J02',offsetM:.5,widthM:1.2,heightM:1,sillHeightM:1,referenceCornerId:refs[0].id})]
  const before=structuredClone(r),data=wallElevationData(r,r.walls[0].id)!,html=renderToStaticMarkup(<OpeningElevation room={r}/>)
  expect(data.openings).toHaveLength(3);expect(data.chain.reduce((s,c)=>s+c.value,0)).toBeCloseTo(6);expect(data.difference).toBeCloseTo(0)
  expect((html.match(/<figure/g)||[])).toHaveLength(1);for(const name of ['P01','J01','J02','Total'])expect(html).toContain(name)
  expect(r).toEqual(before)
  r.openings[1].offsetM=.6;expect(wallElevationData(r,r.walls[0].id)!.warnings.length).toBeGreaterThan(0);expect(wallElevationData(r,r.walls[0].id)!.difference).toBeGreaterThan(0)
 })
 it('cotas de ambientes coincidentes procuram faixas distintas sem sobreposição de texto',()=>{
  const a=roomFrom('Sala',[4,3,4,3]),b=roomFrom('Cozinha',[4,3,4,3]),source=surveyDimensions([{shape:buildPlanRoom(a),placement:{roomId:a.id,floorId:a.floorId,x:0,y:0,rotation:45}},{shape:buildPlanRoom(b),placement:{roomId:b.id,floorId:b.floorId,x:0,y:0,rotation:45}}],.1,n=>`${n} m`),dims=[...layoutDimensions(source.requests,source.obstacles,.1).values()]
  expect(dims).toHaveLength(8);expect(dims.every(d=>!d.conflict)).toBe(true)
  for(let i=0;i<dims.length;i++)for(let j=i+1;j<dims.length;j++)expect(overlaps(dims[i].box,dims[j].box)).toBe(false)
 })
 it('arrasto paralelo conserva orientação em 0°, 45°, 82° e 180°',()=>{
  for(const angle of [0,45,82,180]){const result=parallelOffset({dx:12,dy:6},angle),rad=angle*Math.PI/180;expect(result.dx*-Math.sin(rad)+result.dy*Math.cos(rad)).toBeCloseTo(0,10)}
  expect(overlaps(pointsBox([{x:0,y:0},{x:4,y:4}],.01),pointsBox([{x:0,y:2},{x:1,y:3}],.01))).toBe(false)
 })
 it('modo visual, materiais e lado da cota persistem sem alterar vínculos/placements',()=>{
  const r=roomFrom('Sala',[4,3,4,3]),o=opening(r,{type:'door',label:'P01',doorVisualType:'double',material:'wood',swing:'inward'});r.openings=[o];r.labelOffsets={[`wall:${r.walls[0].id}`]:{dx:20,dy:0,side:-1}}
  const p={...project([r]),representationMode:'simplified' as const,roomPlacements:[{roomId:r.id,floorId:r.floorId,x:7,y:-2,rotation:82,locked:true}]},decoded=decodeSnapshot(encodeSnapshot(createSnapshot({projects:[p],projectId:p.id,floorId:r.floorId,roomId:r.id}))).data.projects[0]
  expect(decoded.representationMode).toBe('simplified');expect(decoded.roomPlacements).toEqual(p.roomPlacements);expect(decoded.floors[0].rooms[0].openings[0].material).toBe('wood');expect(decoded.floors[0].rooms[0].labelOffsets).toEqual(r.labelOffsets)
  expect(doorOperationKnown(o)).toBe(true);expect(doorOperationKnown({...o,doorVisualType:'gap',swing:undefined})).toBe(true)
 })
 it('prancha mantém cotas paralelas e ajustes separados do croqui',()=>{
  const r=roomFrom('Sala',[4,3,4,3]),p=project([r]),layout=defaultSheetLayout(option),key=`${r.id}|wall:${r.walls[0].id}`,source={kind:'room' as const,room:r},base=composeSheet(p,source,layout),before=structuredClone(p),moved=composeSheet(p,source,{...layout,labelOverrides:{[key]:{dx:0,dy:15,rotation:82}}})
  const label=(page:typeof base.page)=>page.scene.find(i=>i.kind==='text'&&i.options.key===key)
  expect(label(moved.page)).toEqual(label(base.page));expect(p).toEqual(before)
  p.roomPlacements=[{roomId:r.id,floorId:r.floorId,x:8,y:-5,rotation:82}];const draw=drawPlanSheet({project:p,floor:p.floors[0],option});expect([...draw.extent.dimensions.values()].every(d=>Math.abs(d.line.angle)<=90)).toBe(true)
  expect(draw.page.scene.some(i=>i.kind==='line')).toBe(true)
 })
})
