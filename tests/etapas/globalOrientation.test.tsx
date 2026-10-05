import FloorPlanCanvas from '../../src/FloorPlanCanvas'
import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {roomFrom,project,opening} from '../etapa11/helpers'
import type {SpatialConnection} from '../../src/models'
import {cornerAnchor,cornerSnap,confirmCornerConnection} from '../../src/cornerConnections'
import {buildPlanRoom,worldPoint,rotatePoint,pointDistance} from '../../src/floorPlan'
import {snapChoices,relationshipState,planFeature} from '../../src/floorPlanConnections'
import {reconcileRelationships} from '../../src/relationships'
import {createRoomObject} from '../../src/roomObjects'
import PlanEntryMarker from '../../src/PlanEntryMarker'

function setup(rotation=0) {
 const a=roomFrom('Sala',[4,3,4,3]),b=roomFrom('Cozinha',[4,3,4,3])
 const connection:SpatialConnection={id:'corner-global',type:'corner',a:{roomId:a.id,elementId:a.corners[0].id,face:'internal'},b:{roomId:b.id,elementId:b.corners[0].id,face:'internal'},orientation:'normal'}
 const anchor={roomId:a.id,floorId:a.floorId,x:7.1,y:-2.3,rotation}
 return {a,b,connection,anchor,p:{...project([a,b]),roomPlacements:[anchor]}}
}
describe('Orientação global preserva o levantamento local',()=>{
 it.each([0,90,180,270,82])('rotaciona todo o ambiente com referência global %s°',rotation=>{
  const {a,b,connection,anchor}=setup(rotation),original=structuredClone(b),placement=cornerSnap(connection,a,b,anchor)!
  expect(placement.rotation).toBeCloseTo((rotation+180)%360)
  const ca=cornerAnchor(a,connection.a)!,cb=cornerAnchor(b,connection.b)!
  expect(pointDistance(worldPoint(ca.position,anchor),worldPoint(cb.position,placement))).toBeLessThan(1e-10)
  const shape=buildPlanRoom(b),first=shape.survey.perimeter.segments[0]
  expect(pointDistance(worldPoint(first.start,placement),worldPoint(first.end,placement))).toBeCloseTo(4)
  expect(b).toEqual(original);expect(b.walls.map(w=>w.label)).toEqual(['A','B','C','D'])
 })
 it.each(['normal','inverted'] as const)('respeita faces e orientação %s em cantos irregulares',orientation=>{
  const {a,b,connection,anchor}=setup(37);b.corners[0].angleDegrees=82;connection.orientation=orientation
  for(const face of ['internal','external'] as const){connection.b.face=face;const placement=cornerSnap(connection,a,b,anchor)!,ca=cornerAnchor(a,connection.a)!,cb=cornerAnchor(b,connection.b)!
   const da=rotatePoint({x:Math.cos(ca.angle*Math.PI/180),y:Math.sin(ca.angle*Math.PI/180)},anchor.rotation),db=rotatePoint({x:Math.cos(cb.angle*Math.PI/180),y:Math.sin(cb.angle*Math.PI/180)},placement.rotation)
   expect(da.x*db.x+da.y*db.y).toBeCloseTo(orientation==='normal'?-1:1)
   expect(pointDistance(worldPoint(ca.position,anchor),worldPoint(cb.position,placement))).toBeLessThan(1e-10)
  }
 })
 it('confirma exatamente a prévia global e reutiliza a mesma transformação no snap',()=>{
  const {a,b,connection,anchor,p}=setup(90),preview=cornerSnap(connection,a,b,anchor)!
  const saved=reconcileRelationships(confirmCornerConnection(p,connection,anchor,preview)),snap=snapChoices(saved,a.floorId,b.id)[0]
  expect(saved.roomPlacements?.find(x=>x.roomId===b.id)).toEqual(preview)
  expect(snap.placement).toEqual(preview)
  expect(relationshipState(saved,saved.relationships.find(r=>r.type==='corner')!).completed).toBe(true)
  const reverse=snapChoices(saved,a.floorId,a.id)[0].placement
  expect(reverse.rotation).toBeCloseTo(anchor.rotation);expect(reverse.x).toBeCloseTo(anchor.x);expect(reverse.y).toBeCloseTo(anchor.y)
 })
 it('encaixa entradas na Parede A com os ambientes em lados opostos',()=>{
  const {a,b,p,anchor}=setup(45),oa=opening(a,{label:'P01',type:'door'}),ob=opening(b,{label:'P01',type:'door'})
  p.relationships=[{id:'entry',type:'opening_connection',sourceRoomId:a.id,sourceElementId:oa.id,targetRoomId:b.id,targetElementId:ob.id}]
  const snap=snapChoices(p,a.floorId,b.id)[0].placement,fa=planFeature(buildPlanRoom(a),'opening_connection',oa.id)!,fb=planFeature(buildPlanRoom(b),'opening_connection',ob.id)!
  expect(snap.rotation).toBeCloseTo(225)
  expect(pointDistance(worldPoint(fa.start,anchor),worldPoint(fb.end,snap))).toBeLessThan(1e-10)
  expect(pointDistance(worldPoint(fa.end,anchor),worldPoint(fb.start,snap))).toBeLessThan(1e-10)
 })
 it('transforma objetos, aberturas e PI sem escala nem alteração dos dados locais',()=>{
  const {a,b,connection,anchor}=setup(90);opening(b,{label:'J01',type:'window',sillHeightM:1})
  b.objects=[{...createRoomObject(b),dimensions:{widthM:1,depthM:.6},position:{xM:2,yM:1.5},rotationDegrees:45}]
  b.internalWalls=[{id:'PI1',label:'PI-001',lengthM:1,orientationDegrees:45,origin:{type:'free',position:{xM:1,yM:1}},thicknessM:.15}]
  const original=structuredClone(b),placement=cornerSnap(connection,a,b,anchor)!,shape=buildPlanRoom(b)
  for(const segment of [...shape.survey.perimeter.segments,...shape.survey.internalWalls.placements,...shape.survey.openings.placements])expect(pointDistance(worldPoint(segment.start,placement),worldPoint(segment.end,placement))).toBeCloseTo(pointDistance(segment.start,segment.end))
  expect(pointDistance(worldPoint(shape.objects[0].bounds[0],placement),worldPoint(shape.objects[0].bounds[1],placement))).toBeCloseTo(1)
  expect(b).toEqual(original)
  const canvas=renderToStaticMarkup(<FloorPlanCanvas project={project([b])} floorId={b.floorId} placements={[placement]} selected={b.id} onSelect={()=>{}} onMove={()=>{}} visibility={{names:true,ids:true,measurements:true,openings:true,objects:true,equipment:true,structural:true}} focusToken={0} fitToken={0}/>)
  expect(canvas).toMatch(/<rect[^>]*vector-effect="non-scaling-stroke"[^>]*width="1"[^>]*height="0.6"/)
  const marker=renderToStaticMarkup(<PlanEntryMarker shape={shape} placement={placement} size={.1}/>)
  expect(marker).toContain('Entrada principal · Parede A');expect(marker).toContain('Entrada · A')
 })
})
