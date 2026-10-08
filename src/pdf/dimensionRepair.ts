import { overlaps,pointsBox } from '../architecturalDimensions'
import type { DimensionBox } from '../architecturalDimensions'
import type { PdfSceneItem,Pt } from './pdfWriter'
import {textWidthMm} from './pdfWriter'
const translated=(p:Pt,x:number,y:number)=>({x:p.x+x,y:p.y+y})
function boxOf(item:PdfSceneItem):DimensionBox|undefined{
 if(item.kind==='line')return pointsBox([item.a,item.b],item.style.width/2+.12)
 if(item.kind==='text'){const width=textWidthMm(item.text,item.sizeMm,item.options.font),shift=item.options.align==='center'?width/2:item.options.align==='right'?width:0,r=(item.options.rotate??0)*Math.PI/180,polygon=[[-shift,-item.sizeMm],[width-shift,-item.sizeMm],[width-shift,item.sizeMm*.25],[-shift,item.sizeMm*.25]].map(([x,y])=>({x:item.at.x+x*Math.cos(r)-y*Math.sin(r),y:item.at.y+x*Math.sin(r)+y*Math.cos(r)}));return {...pointsBox(polygon,.2),polygon}}
 if(item.kind==='rect')return{x:item.x,y:item.y,width:item.w,height:item.h}
 if(item.kind==='polyline')return pointsBox(item.points,.2)
 if(item.kind==='curve')return pointsBox([item.a,item.c1,item.c2,item.b],.2)
 if(item.kind==='circle')return{x:item.center.x-item.r,y:item.center.y-item.r,width:2*item.r,height:2*item.r}
}
const inside=(b:DimensionBox,area:DimensionBox)=>b.x>=area.x&&b.y>=area.y&&b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height
// Repairs only presentation. Anchor starts remain on their original wall faces.
export function repairSheetDimensions(scene:PdfSceneItem[],area:DimensionBox){
 let result=[...scene],unresolved=0,repositioned=0
 const groups=[...new Set(scene.filter(i=>i.section==='drawing'&&i.group).map(i=>i.group!))]
 for(const group of groups){const items=result.filter(i=>i.group===group),text=items.find((i):i is Extract<PdfSceneItem,{kind:'text'}>=>i.kind==='text');if(!text)continue
  const r=(text.options.rotate??0)*Math.PI/180,u={x:Math.cos(r),y:Math.sin(r)},n={x:-u.y,y:u.x},size=text.sizeMm,other=result.filter(i=>i.section==='drawing'&&i.group!==group&&!(i.kind==='line'&&i.style.dimensionAnchor)).flatMap(i=>{const b=boxOf(i);return b?[b]:[]})
  const candidate=(parallel:number,perpendicular:number)=>items.map(i=>{
   if(i.kind==='text')return {...i,at:translated(i.at,u.x*parallel+n.x*perpendicular,u.y*parallel+n.y*perpendicular)}
   if(i.kind==='line')return {...i,a:i.style.dimensionAnchor?i.a:translated(i.a,n.x*perpendicular,n.y*perpendicular),b:translated(i.b,n.x*perpendicular,n.y*perpendicular)}
   return i
  })
  const score=(items:PdfSceneItem[])=>items.filter(i=>i.kind==='text'||i.kind==='line'&&!i.style.dimensionAnchor).reduce((sum,item)=>{const b=boxOf(item)!;return sum+(inside(b,area)?0:10000)+other.filter(a=>overlaps(a,b)).length},0)
  let best=items,bestScore=score(items);if(!bestScore)continue
  const anchor=items.find((i):i is Extract<PdfSceneItem,{kind:'line'}>=>i.kind==='line'&&!!i.style.dimensionAnchor),distance=anchor?(anchor.b.x-anchor.a.x)*n.x+(anchor.b.y-anchor.a.y)*n.y:0,sign=distance<0?-1:1
  const bands=[0,...[2,4,8,12,18].map(v=>v*size*sign),-2*distance,...[2,4,8,12].map(v=>-2*distance-v*size*sign)]
  search:for(const band of bands)for(const parallel of [0,2,-2,4,-4,8,-8,12,-12].map(v=>v*size)){const next=candidate(parallel,band),value=score(next);if(value<bestScore){best=next;bestScore=value}if(!value)break search}
  if(best!==items){let index=0;result=result.map(item=>item.group===group?best[index++]:item);repositioned++}
  if(bestScore)unresolved++
 }
 return {scene:result,unresolved,repositioned}
}
