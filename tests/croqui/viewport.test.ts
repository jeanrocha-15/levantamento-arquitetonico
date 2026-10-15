import {describe,it,expect} from 'vitest'
import {FULL_VIEW,viewportView,zoomAt,panBy} from '../../src/sketchZoom'

describe('Responsive sketch viewport',()=>{
 it.each([2.5,.5,1,440/340])('fills aspect %s with uniform scale and the same center',aspect=>{
  const original=zoomAt(panBy(FULL_VIEW,35,-70),1.5),before={...original},visible=viewportView(original,aspect)
  expect(visible.w/visible.h).toBeCloseTo(aspect)
  expect(visible.w).toBeGreaterThanOrEqual(original.w-1e-9)
  expect(visible.h).toBeGreaterThanOrEqual(original.h-1e-9)
  expect(visible.x+visible.w/2).toBeCloseTo(original.x+original.w/2)
  expect(visible.y+visible.h/2).toBeCloseTo(original.y+original.h/2)
  expect(original).toEqual(before)
 })
 it('keeps the wheel anchor fixed in the extra visible area',()=>{
  const aspect=3,visible=viewportView(FULL_VIEW,aspect),x=visible.x+visible.w*.1,y=visible.y+visible.h*.8
  const next=zoomAt(FULL_VIEW,1.1,(x-FULL_VIEW.x)/FULL_VIEW.w,(y-FULL_VIEW.y)/FULL_VIEW.h),after=viewportView(next,aspect)
  expect(after.x+after.w*.1).toBeCloseTo(x)
  expect(after.y+after.h*.8).toBeCloseTo(y)
 })
})
