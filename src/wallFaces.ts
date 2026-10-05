import type { Point } from './geometry'

export interface FaceSegment { id: string; start: Point; end: Point; thickness?: number | null; referenceFace?: 'internal' | 'external' | 'center' }
export interface FaceRange { start: Point; end: Point }
const distance = (a: Point,b: Point) => Math.hypot(a.x-b.x,a.y-b.y)
const direction = (s: FaceSegment) => { const length=distance(s.start,s.end); return {x:(s.end.x-s.start.x)/length,y:(s.end.y-s.start.y)/length} }
const shift = (p:Point,d:Point,offset:number) => ({x:p.x-d.y*offset,y:p.y+d.x*offset})
const half = (s:FaceSegment) => s.thickness && Number.isFinite(s.thickness) && s.thickness>0 ? s.thickness/2 : 0
const faceOffset = (s:FaceSegment,side:number) => side===0?0:half(s)*(side+(s.referenceFace==='internal'?-1:s.referenceFace==='external'?1:0))
function intersection(a:Point,da:Point,b:Point,db:Point):Point | undefined {
  const cross=da.x*db.y-da.y*db.x
  if(Math.abs(cross)<1e-10) return undefined
  const t=((b.x-a.x)*db.y-(b.y-a.y)*db.x)/cross
  const result={x:a.x+t*da.x,y:a.y+t*da.y}
  return Number.isFinite(result.x)&&Number.isFinite(result.y)?result:undefined
}
// Physical coordinates only. The centerline and all measurements remain untouched.
// Adjacent offset lines share their intersection, including concave corners and unequal thicknesses.
// An open perimeter is never joined across its measured closing gap.
export function buildWallFaces(segments:FaceSegment[],ranges?:Map<string,FaceRange[]>):Map<string,FaceRange[]> {
  const result=new Map<string,FaceRange[]>()
  segments.forEach((segment,index)=>{
    if(distance(segment.start,segment.end)<1e-10) {result.set(segment.id,[]);return}
    const d=direction(segment), h=half(segment), solids=ranges?.get(segment.id) ?? [{start:segment.start,end:segment.end}]
    const faces:FaceRange[]=[]
    for(const side of h?[1,-1]:[0]) {
      const joined=(end:'start'|'end')=>{
        const point=segment[end],neighbor=segments[(index+(end==='start'?-1:1)+segments.length)%segments.length]
        const neighborPoint=neighbor?.[end==='start'?'end':'start']
        const own=shift(point,d,faceOffset(segment,side))
        if(!neighbor || neighbor===segment || !neighborPoint || distance(point,neighborPoint)>1e-7 || distance(neighbor.start,neighbor.end)<1e-10) return own
        const nd=direction(neighbor)
        return intersection(own,d,shift(neighborPoint,nd,faceOffset(neighbor,side)),nd) ?? own
      }
      for(const range of solids) faces.push({start:distance(range.start,segment.start)<1e-8?joined('start'):shift(range.start,d,faceOffset(segment,side)),end:distance(range.end,segment.end)<1e-8?joined('end'):shift(range.end,d,faceOffset(segment,side))})
      // Parallel segments with different thicknesses meet through a short step.
      if(h) for(const end of ['start','end'] as const) {
        const neighbor=segments[(index+(end==='start'?-1:1)+segments.length)%segments.length]
        if(!neighbor || neighbor===segment || distance(neighbor.start,neighbor.end)<1e-10 || end==='start' && half(neighbor)>0) continue
        const point=segment[end],other=neighbor[end==='start'?'end':'start'],nd=direction(neighbor)
        if(distance(point,other)>1e-7 || Math.abs(d.x*nd.y-d.y*nd.x)>1e-10 || !solids.some(r=>distance(r[end],point)<1e-8) || !(ranges?.get(neighbor.id) ?? [{start:neighbor.start,end:neighbor.end}]).some(r=>distance(r[end==='start'?'end':'start'],other)<1e-8)) continue
        const from=shift(point,d,faceOffset(segment,side)),to=shift(other,nd,faceOffset(neighbor,side))
        if(distance(from,to)>1e-8) faces.push({start:from,end:to})
      }
    }
    result.set(segment.id,faces)
  })
  return result
}
