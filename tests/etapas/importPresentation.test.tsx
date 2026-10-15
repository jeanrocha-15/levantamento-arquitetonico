import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {roomFrom,project,opening} from '../etapa11/helpers'
import {formatMeasurement,displayMeasurementInput,inputMeasurement,parseMeasurement} from '../../src/units'
import {buildPlanRoom} from '../../src/floorPlan'
import {surveyDimensions} from '../../src/surveyDimensions'
import {buildRoomGeometry} from '../../src/roomGeometry'
import {repairRoomOpenings} from '../../src/bim/repairRoomOpenings'
import {importRevitInventory} from '../../src/bim/importRevit'
import {composeSheet} from '../../src/pdf/sheetComposer'
import {defaultSheetLayout} from '../../src/pdf/sheetSettings'
import {buildPdf} from '../../src/pdf/pdfWriter'
import Sketch from '../../src/Sketch'

describe('Imported model presentation',()=>{
 it('rounds presentation without changing editable measurements',()=>{
  const value=1.19750
  expect(formatMeasurement(value,'m')).toBe('1,20 m')
  expect(displayMeasurementInput(value,'m')).toBe('1,20')
  expect(parseMeasurement(inputMeasurement(value,'m'),'m')).toBe(value)
  expect(formatMeasurement(5.259999999999991,'m')).toBe('5,26 m')
 })
 it('removes redundant rectangular dimensions while keeping a complete option',()=>{
  const room=roomFrom('Sala',[4,3,4,3]),shape=buildPlanRoom(room),original=JSON.stringify(room)
  expect(surveyDimensions([{shape}],.1,String).requests).toHaveLength(2)
  expect(surveyDimensions([{shape}],.1,String,{all:true}).requests).toHaveLength(4)
  expect(JSON.stringify(room)).toBe(original)
 })
 it('restores a missing individual opening without changing the physical opening',()=>{
  const room=roomFrom('Sala',[4,3,4,3]);room.walls[0].physicalWallId='physical'
  const p=project([room]);p.roomPlacements=[{roomId:room.id,floorId:room.floorId,x:10,y:20,rotation:90}]
  const physical={lacId:'door',hostWallId:'physical',levelId:room.floorId,type:'door' as const,position:[10,-22,0] as [number,number,number],width:.8,height:2.1,sill:0,roomRefs:[]}
  p.bim={physicalWalls:[],openings:[physical],elements:[],revitMappings:[],warnings:[]}
  const fixed=repairRoomOpenings(p),r=fixed.floors[0].rooms[0]
  expect(r.openings).toHaveLength(1);expect(r.openings[0].offsetM).toBeCloseTo(1.6)
  expect(buildRoomGeometry(r).openings.placements).toHaveLength(1)
  expect(fixed.bim!.openings[0].position).toEqual(physical.position)
  expect(repairRoomOpenings(fixed)).toEqual(fixed);expect(room.openings).toHaveLength(0)
 })
 it('keeps imported opening dimensions when a wall junction trims its graphic',()=>{
  const r=roomFrom('Sala',[4,3,4,3]),o=opening(r,{type:'door',label:'P01',offsetM:-.02,widthM:.9,physicalOpeningId:'door'})
  const before=JSON.stringify(o),g=buildRoomGeometry(r)
  expect(g.openings.placements).toHaveLength(1);expect(g.openings.placements[0].start.x).toBe(0)
  expect(JSON.stringify(o)).toBe(before)
 })
 it('starts imported sketches clean while retaining opening symbols and selection',()=>{
  const r=roomFrom('Sala',[4,3,4,3]);r.revitUniqueId='revit';opening(r,{type:'door',label:'P01'})
  const markup=renderToStaticMarkup(<Sketch room={r} onFocusField={()=>{}}/>)
  expect(markup).toContain('Editar P01');expect(markup).not.toContain('class="angle-arc"')
  expect(markup).toContain('mostrar detalhes')
 })
 it.runIf(!!process.env.LAC_REVIT_FIXTURE)('renders the user model with rounded compact PDF annotations',()=>{
  const p=importRevitInventory(JSON.parse(readFileSync(process.env.LAC_REVIT_FIXTURE!,'utf8'))),floor=[...p.floors].sort((a,b)=>b.rooms.length-a.rooms.length)[0]
  const {page}=composeSheet(p,{kind:'plan',floor},defaultSheetLayout({sheet:'A1',orientation:'landscape',scale:100}))
  const bytes=buildPdf(page,'Verificação de apresentação'),text=new TextDecoder('latin1').decode(bytes)
  expect(text).not.toMatch(/\d,\d{5,} m/)
  mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/deposito-after.pdf',bytes)
 })
})
