import { dimensionLine } from './dimensions'
import type { Point } from './geometry'
import type { DimensionLine } from './dimensions'
export interface DimensionBox {x:number;y:number;width:number;height:number;polygon?:Point[]}
export interface DimensionRequest {key:string;a:Point;b:Point;text:string;thickness?:number;side?:1|-1}
export interface ArchitecturalDimension {request:DimensionRequest;line:DimensionLine;box:DimensionBox;conflict:boolean;side:1|-1}
export function overlaps(a:DimensionBox,b:DimensionBox){
 if(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y))return false
 const polygon=(b:DimensionBox)=>b.polygon??[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}],pa=polygon(a),pb=polygon(b)
 for(const p of [pa,pb])for(let i=0;i<p.length;i++){const next=p[(i+1)%p.length],axis={x:-(next.y-p[i].y),y:next.x-p[i].x};if(Math.hypot(axis.x,axis.y)<1e-12)continue;const aa=pa.map(q=>q.x*axis.x+q.y*axis.y),bb=pb.map(q=>q.x*axis.x+q.y*axis.y);if(Math.max(...aa)<=Math.min(...bb)||Math.max(...bb)<=Math.min(...aa))return false}
 return true
}
export function pointsBox(points:Point[],padding=0):DimensionBox{const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs)-padding,y=Math.min(...ys)-padding;const box:DimensionBox={x,y,width:Math.max(...xs)-x+padding,height:Math.max(...ys)-y+padding};if(points.length===2&&padding>0){const [a,b]=points,length=Math.hypot(b.x-a.x,b.y-a.y)||1,u={x:(b.x-a.x)/length,y:(b.y-a.y)/length},n={x:-u.y,y:u.x};box.polygon=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([end,side])=>{const p=end===-1?a:b;return{x:p.x+u.x*end*padding+n.x*side*padding,y:p.y+u.y*end*padding+n.y*side*padding}})}return box}
export function parallelOffset(offset:{dx:number;dy:number},angle:number){const r=angle*Math.PI/180,u={x:Math.cos(r),y:Math.sin(r)},distance=offset.dx*u.x+offset.dy*u.y;return {dx:u.x*distance,dy:u.y*distance}}
// Search along the same band first, then outward bands and finally the opposite side.
export function layoutDimensions(requests:DimensionRequest[],obstacles:DimensionBox[],font:number):Map<string,ArchitecturalDimension>{
 const occupied=[...obstacles],result=new Map<string,ArchitecturalDimension>()
 for(const request of requests){const length=Math.hypot(request.b.x-request.a.x,request.b.y-request.a.y);if(length<1e-9)continue
  const u={x:(request.b.x-request.a.x)/length,y:(request.b.y-request.a.y)/length},normal={x:u.y,y:-u.x},width=Math.max(font,request.text.length*font*.57),height=font*1.35
  let best:ArchitecturalDimension|undefined,bestScore=Infinity
  search:for(const side of [request.side??1,-(request.side??1)] as (1|-1)[])for(let band=0;band<10;band++)for(const shift of [0,1.5,-1.5,3,-3,6,-6,10,-10]){
   const n={x:normal.x*side,y:normal.y*side},line=dimensionLine(request.a,request.b,n,(request.thickness??0)+font*(2.5+band*2),font*.3,font*.55);if(!line)continue
   line.text={x:line.text.x+u.x*font*shift,y:line.text.y+u.y*font*shift};const r=line.angle*Math.PI/180,bw=Math.abs(width*Math.cos(r))+Math.abs(height*Math.sin(r)),bh=Math.abs(width*Math.sin(r))+Math.abs(height*Math.cos(r)),box={x:line.text.x-bw/2,y:line.text.y-bh/2,width:bw,height:bh,polygon:[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>({x:line.text.x+sx*width/2*Math.cos(r)-sy*height/2*Math.sin(r),y:line.text.y+sx*width/2*Math.sin(r)+sy*height/2*Math.cos(r)}))},stroke=pointsBox([line.from,line.to],font*.12)
   const score=occupied.filter(a=>overlaps(a,box)||overlaps(a,stroke)).length
   if(score<bestScore){best={request,line,box,conflict:score>0,side};bestScore=score}
   if(!score)break search
  }
  if(best){result.set(request.key,best);occupied.push(best.box,pointsBox([best.line.from,best.line.to],font*.12))}
 }
 return result
}
export const dimensionPoints=(d:ArchitecturalDimension)=>[d.line.from,d.line.to,{x:d.box.x,y:d.box.y},{x:d.box.x+d.box.width,y:d.box.y+d.box.height}]
