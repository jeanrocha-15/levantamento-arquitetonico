import {it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {roomFrom,project} from '../etapa11/helpers'
import Sketch from '../../src/Sketch'
import {buildPlanRoom} from '../../src/floorPlan'
import {getSketchLabelLayout} from '../../src/sketchLabels'
it('fantasma grande não afasta cotas nem reduz o ambiente ativo',()=>{
 const room=roomFrom('Banheiro',[2,2,2,2]),parent=roomFrom('Sala',[40,30,40,30]);room.parentRoomId=parent.id;const p=project([room,parent]);p.roomPlacements=[{roomId:room.id,floorId:room.floorId,x:0,y:0,rotation:0},{roomId:parent.id,floorId:parent.floorId,x:0,y:0,rotation:0}]
 const before=structuredClone(p),baseline=(html:string)=>html.match(/class="architectural-dimension svg-dimension"[^>]*><line[^>]*>/g)
 const alone=renderToStaticMarkup(<Sketch room={room}/>),ghost=renderToStaticMarkup(<Sketch room={room} project={p}/>)
 expect(ghost).toContain('room-ghost');expect(baseline(ghost)).toHaveLength(4);expect(baseline(ghost)).toEqual(baseline(alone));expect(p).toEqual(before)
})
it('não reserva espaço para textos de paredes substituídos pelas cotas',()=>{
 const room=roomFrom('Sala',[4,3,4,3]),geometry=buildPlanRoom(room).survey.perimeter,layout=getSketchLabelLayout(geometry,'m',false)
 expect([...layout.positions.keys()].some(k=>k.startsWith('wall:'))).toBe(false);expect(layout.positions.has('entry')).toBe(true)
})
