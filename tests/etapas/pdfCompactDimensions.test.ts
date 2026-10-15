import {describe,it,expect} from 'vitest'
import {compactPdfDimensions} from '../../src/pdf/compactDimensions'
import {layoutDimensions} from '../../src/architecturalDimensions'
import type {DimensionRequest} from '../../src/architecturalDimensions'
import {PdfPage} from '../../src/pdf/pdfWriter'
import {repairSheetDimensions} from '../../src/pdf/dimensionRepair'

const wall=(room:string,start:number,end:number,y=0):DimensionRequest=>({key:`${room}|wall:A`,a:{x:start,y},b:{x:end,y},thickness:.15,text:`A · ${end-start} m`})
describe('PDF wall dimension grouping',()=>{
 it('keeps one original dimension for three superimposed spans, without changing measurements',()=>{
  const requests=[wall('sala',0,10),wall('a',0,5,.15),wall('b',5,10,.15)],original=JSON.stringify(requests)
  expect(compactPdfDimensions(requests)).toEqual([requests[0]])
  expect(JSON.stringify(requests)).toBe(original)
 })
 it('does not merge adjacent walls, separate hosts, or partially overlapping spans',()=>{
  const requests=[wall('a',0,5),wall('b',5,10),wall('c',0,5,1),wall('d',4,8)]
  expect(compactPdfDimensions(requests)).toHaveLength(4)
 })
 it('works after a rigid rotation and preserves explicit label adjustments',()=>{
  const requests=[wall('a',0,5),wall('b',5,0,.1)].map(r=>({...r,a:{x:r.a.x*.6-r.a.y*.8,y:r.a.x*.8+r.a.y*.6},b:{x:r.b.x*.6-r.b.y*.8,y:r.b.x*.8+r.b.y*.6}}))
  expect(compactPdfDimensions(requests)).toHaveLength(1)
  expect(compactPdfDimensions(requests,new Set([requests[1].key]))).toHaveLength(2)
 })
 it('bounds the distance from a host even when all nearby positions conflict',()=>{
  const r=wall('a',0,5),font=.1
  const d=layoutDimensions([r],[{x:-100,y:-100,width:200,height:200}],font,{bands:2}).get(r.key)!
  expect(Math.abs(d.line.from.y)).toBeLessThanOrEqual(.15+font*3.5)
  expect(d.conflict).toBe(true)
 })
 it('does not send dimension lines far from the host during final sheet repair',()=>{
  const page=new PdfPage(210,297);page.section='drawing'
  page.rect(0,0,200,40,{width:.2})
  page.group='wall';page.line({x:10,y:20},{x:10,y:25},{width:.1,dimensionAnchor:true})
  page.line({x:10,y:25},{x:60,y:25},{width:.1})
  page.text({x:35,y:25},'5,00 m',2.5,{align:'center'})
  const repaired=repairSheetDimensions(page.scene,{x:0,y:0,width:210,height:297})
  const anchor=repaired.scene.find(i=>i.kind==='line'&&i.style.dimensionAnchor)!
  if(anchor.kind!=='line')throw new Error('Missing anchor')
  expect(anchor.a).toEqual({x:10,y:20})
  expect(Math.abs(anchor.b.y-anchor.a.y)).toBeLessThanOrEqual(7.5)
 })
})
