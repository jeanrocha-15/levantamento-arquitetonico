import {describe,it,expect} from 'vitest'
import {roomFrom,project} from '../etapa11/helpers'
import type {SpatialConnection} from '../../src/models'
import {cornerSnap,cornerAnchor,cornerWallRelationships,confirmCornerConnection} from '../../src/cornerConnections'
import {worldPoint,pointDistance,putRoomPlacement,buildPlanRoom} from '../../src/floorPlan'
import {snapChoices,planCompatibility,planFeature,sharedWallAlignment} from '../../src/floorPlanConnections'
import {reconcileRelationships} from '../../src/relationships'
import {sharedPlanFaces} from '../../src/floorPlanFaces'
import {createSnapshot,encodeSnapshot,decodeSnapshot} from '../../src/storage'
function setup(mode:'inside'|'outside',shared=3,thickness=0) {
 const a=roomFrom('Sala',[4,4,4,4]),b=roomFrom('Banheiro',[2,2,2,2]);[a,b].forEach(r=>r.walls.forEach(w=>w.thickness=thickness))
 const connection:SpatialConnection={id:'CD-CD',type:'corner',a:{roomId:a.id,elementId:a.corners[2].id,face:mode==='outside'?'external':'internal'},b:{roomId:b.id,elementId:b.corners[2].id,face:'internal'},placementMode:mode,sharedWallId:a.walls[shared].id}
 const anchor={roomId:a.id,floorId:a.floorId,x:0,y:0,rotation:0},placement=cornerSnap(connection,a,b,anchor)!,p=reconcileRelationships(confirmCornerConnection(project([a,b]),connection,anchor,placement))
 return {a,b,connection,anchor,placement,p}
}
describe('Canto como referência de ambiente interno ou anexo',()=>{
 it('CD ↔ CD interno usa partes de C e D, sem outros vínculos manuais',()=>{
  const {a,b,p,placement}=setup('inside');expect(placement).toMatchObject({x:0,y:2,rotation:0});expect(cornerWallRelationships(p,a.floorId).map(r=>[r.sourceElementId,r.targetElementId])).toEqual([[a.walls[2].id,b.walls[2].id],[a.walls[3].id,b.walls[3].id]])
  expect(planCompatibility(p,a.floorId).alerts).toEqual([]);expect(planCompatibility(p,a.floorId).percentage).toBe(100);expect(snapChoices(p,a.floorId,b.id)).toHaveLength(1)
 })
 it.each([2,3])('anexo externo compartilha o trecho da parede %s e continua a outra',shared=>{
  const {a,b,p,placement,connection,anchor}=setup('outside',shared)
  expect(placement.rotation).toBe(shared===2?90:270)
  expect(pointDistance(worldPoint(cornerAnchor(a,connection.a,connection.placementMode)!.position,anchor),worldPoint(cornerAnchor(b,connection.b,connection.placementMode)!.position,placement))).toBeLessThan(1e-10)
  expect(planCompatibility(p,a.floorId).alerts).toEqual([])
  expect(cornerWallRelationships(p,a.floorId)).toHaveLength(1)
  expect(b.walls.map(w=>w.label)).toEqual(['A','B','C','D'])
 })
 it.each(['inside','outside'] as const)('respeita a espessura e as faces no modo %s',mode=>{
  const {a,b,p,placement}=setup(mode,3,.15);if(mode==='outside'){const sa=planFeature(buildPlanRoom(a),'shared_wall',a.walls[2].id)!,sb=planFeature(buildPlanRoom(b),'shared_wall',b.walls[3].id)!;const continuation=sharedWallAlignment(sa,{...sb,start:worldPoint(sb.start,placement),end:worldPoint(sb.end,placement)},true);expect(continuation.distanceM).toBeLessThan(1e-10);expect(continuation.angleDegrees).toBeLessThan(1e-10)}expect(planCompatibility(p,a.floorId).alerts).toEqual([]);expect(sharedPlanFaces(p,a.floorId,p.roomPlacements!).faces.length).toBe(mode==='inside'?2:1)
 })
 it('a mesma transformação pode ser invertida ao mover a Sala relativa ao Banheiro',()=>{
  const {a,b,p,anchor,placement}=setup('outside');const reverse=snapChoices(p,a.floorId,a.id)[0].placement
  expect(reverse.rotation).toBeCloseTo(anchor.rotation);expect(reverse.x).toBeCloseTo(anchor.x);expect(reverse.y).toBeCloseTo(anchor.y)
  expect(snapChoices(p,a.floorId,b.id)[0].placement).toEqual(placement)
 })
 it('persiste o vínculo por canto sem criar referências de parede redundantes',()=>{
  const {a,b,p}=setup('inside'),data={projects:[p],projectId:p.id,floorId:a.floorId,roomId:b.id},loaded=decodeSnapshot(encodeSnapshot(createSnapshot(data))).data.projects[0]
  expect(loaded.spatialConnections?.[0].placementMode).toBe('inside');expect(loaded.roomPlacements).toEqual(p.roomPlacements)
  expect(loaded.floors[0].rooms.flatMap(r=>r.walls).every(w=>!w.sharedWallReference)).toBe(true)
  expect(planCompatibility(loaded,a.floorId).alerts).toEqual([])
  const connection=loaded.spatialConnections![0],anchor=loaded.roomPlacements!.find(x=>x.roomId===a.id)!,updated=confirmCornerConnection(loaded,connection,anchor,loaded.roomPlacements!.find(x=>x.roomId===b.id)!)
  expect(updated.spatialConnections).toHaveLength(1);expect(updated.spatialConnections![0].id).toBe(connection.id)
 })
})
