import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {CadViewTabs} from '../../src/CadWorkspace'
import RoomEditor from '../../src/RoomEditor'
import {roomFrom,project,opening} from '../etapa11/helpers'
import {buildRoomGeometry} from '../../src/roomGeometry'

describe('CAD editor presentation',()=>{
 it('shows only the selected wall while preserving the room and existing commands',()=>{
  const room=roomFrom('Sala',[4,3,4,3]),p=project([room]),before=JSON.stringify(p)
  const html=renderToStaticMarkup(<RoomEditor contextual room={room} project={p} survey={buildRoomGeometry(room)} section="perimeter" onChange={()=>{throw Error('Presentation must not edit data')}} relatedRooms={[]} onNavigate={()=>{}} focusIssue={{id:'selection',roomId:room.id,elementId:room.walls[1].id,field:'lengthM',description:'',kind:'automatic'}}/>)
  expect(html.match(/class="wall-row"/g)).toHaveLength(1)
  expect(html).toContain(`id="${room.walls[1].id}"`)
  expect(html).toContain('Próxima parede')
  expect(html).toContain('Todas as paredes')
  expect(JSON.stringify(p)).toBe(before)
 })
 it('keeps one opening in properties without losing other openings or linking controls',()=>{
  const room=roomFrom('Sala',[4,3,4,3]);opening(room,{type:'door',label:'P01'});const window=opening(room,{type:'window',label:'J01'},1)
  const p=project([room]),before=JSON.stringify(p)
  const html=renderToStaticMarkup(<RoomEditor contextual room={room} project={p} survey={buildRoomGeometry(room)} section="openings" onChange={()=>{}} relatedRooms={[]} onNavigate={()=>{}} focusIssue={{id:'selection',roomId:room.id,elementId:window.id,field:'widthM',description:'',kind:'automatic'}}/>)
  expect(html.match(/class="opening-card"/g)).toHaveLength(1)
  expect(html).toContain('Todas as aberturas');expect(html).toContain('Aparência e material')
  expect(JSON.stringify(p)).toBe(before)
 })
 it('represents views by identity, without a second room model',()=>{
  const view={key:'room:abc',kind:'room' as const,roomId:'abc',floorId:'F1',name:'Sala'}
  const html=renderToStaticMarkup(<CadViewTabs projectId="p" current={view} isValid={()=>true} onOpen={()=>{}}/>)
  expect(html).toContain('aria-selected="true"');expect(html).toContain('Visualizações abertas');expect(html).toContain('Sala')
 })
})
