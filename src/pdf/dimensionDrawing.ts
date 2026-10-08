import type { PdfPage, Pt } from './pdfWriter'
import type { ArchitecturalDimension } from '../architecturalDimensions'
export function drawArchitecturalDimension(page:PdfPage,d:ArchitecturalDimension,at:(p:Pt)=>Pt,font=2.5,showLines=true){
 const {line,request}=d,previous=page.group;page.group=request.key
 if(showLines)for(const [a,b] of [[line.from,line.to],...line.ticks])page.line(at(a),at(b),{width:.15})
 if(showLines)for(const [a,b] of [[request.a,line.from],[request.b,line.to]])page.line(at(a),at(b),{width:.15,dimensionAnchor:true})
 page.text(at(line.text),request.text,font,{align:'center',rotate:line.angle,key:request.key});page.group=previous
}
