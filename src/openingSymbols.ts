import type { Opening, OpeningMaterial, DoorVisualType, WindowVisualType } from './models'
import type { Point } from './geometry'
import { windowFaces } from './wallFaces'
import type { FaceSegment } from './wallFaces'
export const doorVisualNames:Record<DoorVisualType,string>={single:'Abrir 1 folha',double:'Abrir 2 folhas',slide_one:'Correr para 1 lado',slide_both:'Correr para 2 lados',slide_two:'Correr 2 folhas',pivot:'Pivotante',folding:'Sanfonada',gap:'Vão',other:'Outro'}
export const windowVisualNames:Record<WindowVisualType,string>={fixed:'Fixa',slide2:'Correr 2 folhas',slide3:'Correr 3 folhas',slide4:'Correr 4 folhas',casement:'Abrir',awning:'Maxim-ar',tilt:'Basculante',louver:'Veneziana',other:'Outro'}
export const openingMaterialNames:Record<OpeningMaterial,string>={wood:'Madeira',glass:'Vidro',aluminum:'Alumínio',steel:'Aço',pvc:'PVC',mixed:'Misto',other:'Outro'}
export const visualDoor=(o:Opening):DoorVisualType=>o.doorVisualType??(o.doorKind==='sliding'?'slide_one':'single')
export type SymbolPart={kind:'line';a:Point;b:Point}|{kind:'curve';a:Point;c1:Point;c2:Point;b:Point}
// Canonical real coordinates. SVG and PDF use precisely the same leaves and curves.
export function openingSymbol(opening:Opening,start:Point,end:Point,frame:FaceSegment,mode:'simplified'|'architectural'='architectural'):SymbolPart[] {
 const width=Math.hypot(end.x-start.x,end.y-start.y);if(!width)return []
 const u={x:(end.x-start.x)/width,y:(end.y-start.y)/width},sign=opening.swing==='outward'?-1:1,n={x:-u.y*sign,y:u.x*sign},result:SymbolPart[]=[]
 const point=(along:number,offset=0)=>({x:start.x+u.x*along+n.x*offset,y:start.y+u.y*along+n.y*offset})
 const line=(a:Point,b:Point)=>result.push({kind:'line',a,b})
 if(opening.type==='window'){
  windowFaces(frame,start,end).forEach(f=>line(f.start,f.end))
  if(mode==='simplified')return result
  const type=opening.windowVisualType??'fixed',count=type==='slide3'?3:type==='slide4'?4:type==='slide2'?2:type==='louver'?6:1
  const depth=frame.thickness&&frame.thickness>0?frame.thickness:.05
  const offset=frame.referenceFace==='external'?depth:0
  for(let i=1;i<count;i++)line(point(width*i/count,offset),point(width*i/count,offset-depth))
  if(['casement','awning','tilt'].includes(type)){line(point(0),point(width/2,depth*.7));line(point(width/2,depth*.7),point(width))}
  return result
 }
 const type=visualDoor(opening);if(opening.type==='gap'||type==='gap')return result
 if(mode==='simplified'){line(start,end);return result}
 const leaf=(hinge:Point,closed:Point)=>{const radius=Math.hypot(closed.x-hinge.x,closed.y-hinge.y),open={x:hinge.x+n.x*radius,y:hinge.y+n.y*radius};line(hinge,open);result.push({kind:'curve',a:closed,c1:{x:closed.x+(open.x-hinge.x)*.5523,y:closed.y+(open.y-hinge.y)*.5523},c2:{x:open.x+(closed.x-hinge.x)*.5523,y:open.y+(closed.y-hinge.y)*.5523},b:open})}
 const arrow=(a:Point,toward:number,length:number)=>{const tip={x:a.x+u.x*toward*length,y:a.y+u.y*toward*length};line(a,tip);for(const side of [-1,1])line(tip,{x:tip.x-u.x*toward*length*.25+n.x*side*length*.2,y:tip.y-u.y*toward*length*.25+n.y*side*length*.2})}
 if(type.startsWith('slide')){
  const count=type==='slide_one'?1:2
  for(let i=0;i<count;i++){const a=point(width*i/count,.025*(i+1)),b=point(width*(i+1)/count,.025*(i+1));line(a,b);arrow(point(width*(i+.5)/count,.04*(i+1)),type==='slide_both'?(i===0?-1:1):opening.slideDirection==='right'?1:-1,width/count*.3)}
 }else if(type==='double'){leaf(start,point(width/2));leaf(end,point(width/2))}
 else if(type==='pivot'){const hinge=point(width*.2);line(point(width*.2,-width*.2),hinge);leaf(hinge,end)}
 else if(type==='folding'){const count=Math.max(2,Math.min(8,opening.leafCount??4));for(let i=0;i<count;i++)line(point(width*i/count,i%2?.08:0),point(width*(i+1)/count,(i+1)%2?.08:0))}
 else if(type==='other'){line(start,end)}
 else leaf(opening.hinge==='right'?end:start,opening.hinge==='right'?start:end)
 return result
}
