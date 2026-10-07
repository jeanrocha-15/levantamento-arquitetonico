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
    const {controller,event}=setup(false), original={...state.value}
    controller.handlers.onPointerDownCapture(event(100,100) as never)
    controller.handlers.onPointerMoveCapture(event(140,120) as never)
    expect(state.value).toEqual(original)
  })
})


describe('Roda do mouse isolada no croqui', () => {
  beforeEach(() => { state.value = { ...FULL_VIEW } })
  const svg = () => Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 440, height: 340 }),
  })
  const wheel = () => Object.assign(new Event('wheel', { cancelable: true, bubbles: true }), {
    deltaY: -100, clientX: 110, clientY: 85,
  })
  it('cancela a rolagem nativa e a propagação, mantendo o ponto sob o cursor', () => {
    const node = svg(), reference = { current: null }
    const controller = useSketchZoom(reference as never, { panEnabled: true })
    const attach = vi.spyOn(node, 'addEventListener')
    const cleanup = controller.bindSvg(node as never)
    const event = wheel(), propagation = vi.spyOn(event, 'stopPropagation')
    node.dispatchEvent(event)
    expect(attach).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false, capture: true })
    expect(event.defaultPrevented).toBe(true)
    expect(propagation).toHaveBeenCalledOnce()
    expect(state.value.w).toBeLessThan(FULL_VIEW.w)
    expect(state.value.x + state.value.w * .25).toBeCloseTo(110)
    expect(state.value.y + state.value.h * .25).toBeCloseTo(85)
    cleanup?.()
    const after = { ...state.value }, detached = wheel()
    node.dispatchEvent(detached)
    expect(state.value).toEqual(after)
    expect(detached.defaultPrevented).toBe(false)
  })
  it('reinstala o controle quando o SVG muda após carregar outro projeto', () => {
    const controller = useSketchZoom({ current: null } as never, { panEnabled: true })
    const first = svg(), second = svg()
    const cleanup = controller.bindSvg(first as never)
    cleanup?.()
    const cleanupSecond = controller.bindSvg(second as never)
    first.dispatchEvent(wheel())
    expect(state.value).toEqual(FULL_VIEW)
    const event = wheel()
    second.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(state.value.w).toBeLessThan(FULL_VIEW.w)
    cleanupSecond?.()
  })
  it('não intercepta a roda na visualização de relatório', () => {
    const node = svg(), controller = useSketchZoom({ current: null } as never, { panEnabled: false, enabled: false })
    controller.bindSvg(node as never)
    const event = wheel()
    node.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(state.value).toEqual(FULL_VIEW)
  })
})
