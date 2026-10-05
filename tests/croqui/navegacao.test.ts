import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ value: {x:0,y:0,w:440,h:340} }))
vi.mock('react', async importOriginal => ({...await importOriginal<typeof import('react')>(), useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({current:value}), useState: () => [state.value, (update: typeof state.value | ((value: typeof state.value) => typeof state.value)) => {state.value = typeof update === 'function' ? update(state.value) : update}]}))
import { FULL_VIEW, useSketchZoom, zoomAt } from '../../src/sketchZoom'
describe('Movimentação da visualização do croqui', () => {
  beforeEach(() => {state.value = zoomAt(FULL_VIEW,2)})
  const setup = (moveMode = true, panEnabled = true) => {
    const svg = {contains:()=>true,getScreenCTM:()=>({a:2}),getBoundingClientRect:()=>({width:440,height:340,left:0,top:0})}
    const controller = useSketchZoom({current:svg} as never,{panEnabled,moveMode})
    const event = (x:number,y:number,interactive=false) => ({pointerType:'mouse',button:0,pointerId:1,clientX:x,clientY:y,target:{closest:()=>interactive?{}:null},currentTarget:{setPointerCapture:vi.fn(),hasPointerCapture:()=>true,releasePointerCapture:vi.fn()},preventDefault:vi.fn(),stopPropagation:vi.fn()})
    return {controller,event}
  }
  it('arrasta em ambos os eixos usando a escala real do SVG, inclusive sobre elementos no modo Mover', () => {
    const {controller,event}=setup(), start={...state.value}
    controller.handlers.onPointerDownCapture(event(100,100,true) as never)
    controller.handlers.onPointerMoveCapture(event(140,120,true) as never)
    expect(state.value).toEqual({...start,x:start.x-20,y:start.y-10})
    controller.handlers.onPointerUpCapture(event(140,120) as never)
    controller.handlers.onPointerMoveCapture(event(200,200) as never)
    expect(state.value.x).toBe(start.x-20)
  })
  it('mantém arraste de objetos/rótulos no modo de edição e respeita Ajustar rótulos', () => {
    for(const [moveMode,panEnabled] of [[false,true],[true,false]]){
      const {controller,event}=setup(moveMode,panEnabled), original={...state.value}
      controller.handlers.onPointerDownCapture(event(100,100,true) as never)
      controller.handlers.onPointerMoveCapture(event(140,120) as never)
      expect(state.value).toEqual(original)
    }
  })
  it('não trata toque como mouse nem inicia arraste sem zoom', () => {
    state.value={...FULL_VIEW}
    const {controller,event}=setup(), original={...state.value}
    controller.handlers.onPointerDownCapture(event(100,100) as never)
    controller.handlers.onPointerMoveCapture(event(140,120) as never)
    expect(state.value).toEqual(original)
  })
})
