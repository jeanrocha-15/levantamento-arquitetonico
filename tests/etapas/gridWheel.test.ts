import {it,expect,vi} from 'vitest'
import {bindGridWheel} from '../../src/gridWheel'
it('consome o scroll dentro do grid e preserva a rolagem após desmontagem',()=>{
 const grid=new EventTarget(),zoom=vi.fn(),release=bindGridWheel(grid,zoom),inside=new Event('wheel',{cancelable:true,bubbles:true})
 expect(grid.dispatchEvent(inside)).toBe(false);expect(inside.defaultPrevented).toBe(true);expect(zoom).toHaveBeenCalledTimes(1)
 release();const after=new Event('wheel',{cancelable:true,bubbles:true});expect(grid.dispatchEvent(after)).toBe(true);expect(after.defaultPrevented).toBe(false);expect(zoom).toHaveBeenCalledTimes(1)
})
it('não bloqueia scroll fora do grid nem duplica o zoom após nova montagem',()=>{
 const page=new EventTarget(),grid=new EventTarget(),zoom=vi.fn(),release=bindGridWheel(grid,zoom),outside=new Event('wheel',{cancelable:true})
 page.dispatchEvent(outside);expect(outside.defaultPrevented).toBe(false);expect(zoom).not.toHaveBeenCalled()
 release();const cleanup=bindGridWheel(grid,zoom);grid.dispatchEvent(new Event('wheel',{cancelable:true}));expect(zoom).toHaveBeenCalledTimes(1);cleanup()
})
