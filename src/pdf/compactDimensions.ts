import type { DimensionRequest } from '../architecturalDimensions'

// Presentation only: retain one existing dimension for coincident wall spans.
// Do not add lengths, change endpoints, or merge merely adjacent segments.
export function compactPdfDimensions(requests:DimensionRequest[],protectedKeys:Set<string>=new Set()) {
 const length=(r:DimensionRequest)=>Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y)
 const kept:DimensionRequest[]=[]
 for(const r of [...requests].sort((a,b)=>length(b)-length(a))){
  if(protectedKeys.has(r.key)||!r.key.includes('|wall:')){kept.push(r);continue}
  const duplicate=kept.some(p=>{
   if(!p.key.includes('|wall:')||p.key.split('|')[0]===r.key.split('|')[0])return false
   const size=length(p);if(size<1e-9||length(r)<1e-9)return false
   const u={x:(p.b.x-p.a.x)/size,y:(p.b.y-p.a.y)/size}
   const cross=(q:{x:number;y:number})=>(q.x-p.a.x)*u.y-(q.y-p.a.y)*u.x
   // Angular tolerance is deliberately tight: irregular corners remain distinct.
   if(Math.abs(cross(r.b)-cross(r.a))/length(r)>.001)return false
   const tolerance=Math.max(p.thickness??0,r.thickness??0)+.001
   if(Math.max(Math.abs(cross(r.a)),Math.abs(cross(r.b)))>tolerance)return false
   const a=(r.a.x-p.a.x)*u.x+(r.a.y-p.a.y)*u.y,b=(r.b.x-p.a.x)*u.x+(r.b.y-p.a.y)*u.y
   return Math.min(a,b)>=-.001&&Math.max(a,b)<=size+.001
  })
  if(!duplicate)kept.push(r)
 }
 const keys=new Set(kept.map(r=>r.key))
 return requests.filter(r=>keys.has(r.key))
}
