import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {roomFrom} from '../etapa11/helpers'
import {buildPlanRoom} from '../../src/floorPlan'
import {planAnnotationSize} from '../../src/planAnnotationScale'
import PlanLabel from '../../src/PlanLabel'
describe('Cotas acompanham o zoom global',()=>{
 it('texto e parede diminuem na mesma proporção ao afastar a câmera',()=>{
  const room=roomFrom('Sala',[4,3,4,3]),before=structuredClone(room),size=planAnnotationSize([buildPlanRoom(room)]),screen=(world:number,cameraWidth:number)=>world/cameraWidth*800
  for(const width of [6,12,48,192])expect(screen(size,width)/screen(4,width)).toBeCloseTo(size/4)
  expect(screen(size,48)).toBeCloseTo(screen(size,12)/4);expect(room).toEqual(before)
 })
 it('a fonte explícita prevalece sobre o CSS das cotas',()=>{
  const html=renderToStaticMarkup(<svg><g className="svg-dimension"><PlanLabel id="wall:a" x={0} y={0} size={.1} dimension>A · 4 m</PlanLabel></g></svg>)
  expect(html).toContain('font-size="0.1"');expect(html).toContain('font-size:0.1px')
 })
 it('mantém tamanho consistente por conjunto e fallback finito',()=>{
  const shapes=[buildPlanRoom(roomFrom('Sala',[4,3,4,3])),buildPlanRoom(roomFrom('Banheiro',[2,2,2,2]))]
  expect(planAnnotationSize(shapes)).toBe(planAnnotationSize([...shapes].reverse()));expect(planAnnotationSize([])).toBe(.1)
 })
})
