import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {roomFrom,project,opening} from '../etapa11/helpers'
import {putRoomPlacement} from '../../src/floorPlan'
import {snapChoices,relationshipState,planCompatibility,sharedWallAlignment} from '../../src/floorPlanConnections'
import {sharedPlanFaces} from '../../src/floorPlanFaces'
import {reconcileRelationships} from '../../src/relationships'
import {createSnapshot,encodeSnapshot,decodeSnapshot} from '../../src/storage'
import PlanSnapControls from '../../src/PlanSnapControls'
import {SharedWalls} from '../../src/RoomConnections'

function pair(same=false) {
 const a=roomFrom('Sala',[4,4,4,4]),b=roomFrom('Banheiro',[2,2,2,2]);[a,b].forEach(r=>r.walls.forEach(w=>w.thickness=.15))
 b.walls[3].sharedWallReference={roomId:a.id,wallId:a.walls[1].id,placementSide:same?'same':'opposite'}
 let p=reconcileRelationships(project([a,b]));p=putRoomPlacement(p,{roomId:a.id,floorId:a.floorId,x:0,y:0,rotation:0})
 return {a,b,p}
}
describe('Paredes compartilhadas por trecho e encaixe único',()=>{
 it('2 m podem compartilhar um trecho de 4 m sem divergência',()=>{
  const {a,b,p}=pair(),before=JSON.stringify(p.floors),choices=snapChoices(p,a.floorId,b.id)
  expect(choices).toHaveLength(3);expect(choices.every(c=>c.differenceM===0)).toBe(true)
  for(const choice of choices){const next=putRoomPlacement(p,choice.placement);expect(relationshipState(next,p.relationships[0]).completed).toBe(true);expect(planCompatibility(next,a.floorId).alerts).toEqual([]);const faces=sharedPlanFaces(next,a.floorId,next.roomPlacements!);expect(faces.suppressed.size).toBe(2);expect(faces.faces).toHaveLength(1)}
  expect(JSON.stringify(p.floors)).toBe(before)
 })
 it('distingue trecho válido de parede deslocada, afastada ou angulada',()=>{
  const feature=(x:number,y:number,length:number)=>({start:{x,y},end:{x:x+length,y},length,thickness:.15})
  expect(sharedWallAlignment(feature(0,0,4),feature(1,0,2),true).differenceM).toBe(0)
  expect(sharedWallAlignment(feature(0,0,4),feature(3,0,2),true).differenceM).toBe(1)
  expect(sharedWallAlignment(feature(0,0,4),feature(1,.3,2),true).distanceM).toBeCloseTo(.3)
 })
 it('aceita banheiro contido quando mesmo lado foi informado explicitamente',()=>{
  const {a,b,p}=pair(true),choice=snapChoices(p,a.floorId,b.id).find(c=>c.label.includes('centro'))!,next=putRoomPlacement(p,choice.placement)
  expect(choice.placement.rotation).toBe(180)
  expect(relationshipState(next,p.relationships[0]).completed).toBe(true)
  expect(planCompatibility(next,a.floorId).alerts).toEqual([])
  expect(sharedPlanFaces(next,a.floorId,next.roomPlacements!).suppressed.size).toBe(2)
  const unrelated={...next,relationships:[],floors:next.floors.map(f=>({...f,rooms:f.rooms.map(r=>({...r,walls:r.walls.map(w=>({...w,sharedWallReference:undefined}))}))}))}
  expect(planCompatibility(unrelated,a.floorId).alerts.some(x=>x.message.startsWith('Sobreposição'))).toBe(true)
 })
 it('a organização em subambiente sozinha não altera o posicionamento',()=>{
  const {a,b,p}=pair();b.parentRoomId=a.id
  expect(snapChoices(p,a.floorId,b.id)[0].placement.rotation).toBe(0)
 })
 it('uma abertura associada à parede interna usa o mesmo lado explicitado',()=>{
  const {a,b,p}=pair(true),oa=opening(a,{label:'V01',type:'gap',offsetM:1.5},1),ob=opening(b,{label:'V01',type:'gap',offsetM:.5},3)
  oa.connectedRoomId=b.id;oa.connectedOpeningId=ob.id;ob.connectedRoomId=a.id;ob.connectedOpeningId=oa.id
  const next=reconcileRelationships({...p,floors:project([a,b]).floors}),choice=snapChoices(next,a.floorId,b.id).find(c=>c.relationship.type==='opening_connection')!
  expect(choice.placement.rotation).toBe(180)
  expect(relationshipState(putRoomPlacement(next,choice.placement),choice.relationship).completed).toBe(true)
 })
 it('exibe um único botão, com alternativas num seletor',()=>{
  const {a,b,p}=pair(),choices=snapChoices(p,a.floorId,b.id),html=renderToStaticMarkup(<PlanSnapControls choices={choices} onApply={()=>{}}/>)
  expect(html.match(/Aplicar encaixe/g)).toHaveLength(1);expect(html).toContain('Referência para o encaixe');expect(html).not.toContain('Divergência:')
  expect(html.match(/<option/g)).toHaveLength(4)
 })
 it('persiste o mesmo lado e mostra essa configuração no editor',()=>{
  const {a,b,p}=pair(true),data={projects:[p],projectId:p.id,floorId:a.floorId,roomId:b.id},loaded=decodeSnapshot(encodeSnapshot(createSnapshot(data)))
  expect(loaded.data.projects[0].floors[0].rooms[1].walls[3].sharedWallReference?.placementSide).toBe('same')
  expect(renderToStaticMarkup(<SharedWalls room={b} rooms={[{room:a,path:'Sala'}]} onChange={()=>{}}/>)).toContain('Mesmo lado — ambiente dentro do outro')
 })
})
