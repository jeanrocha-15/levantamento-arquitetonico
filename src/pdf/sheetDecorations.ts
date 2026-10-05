import type { Project,Floor } from '../models'
import { PdfPage,textWidthMm } from './pdfWriter'
import { MARGIN_MM,TITLE_BLOCK_MM,optionLabel,mmOnPaper } from './sheetLayout'
import type { SheetOption } from './sheetLayout'
export interface PdfLayers {walls:boolean;ids:boolean;names:boolean;measurements:boolean;openings:boolean;objects:boolean;equipment:boolean;structural:boolean}
export const defaultPdfLayers:PdfLayers={walls:true,ids:true,names:true,measurements:true,openings:true,objects:true,equipment:true,structural:true}
export function wrapText(text:string,width:number,size=3) {const lines:string[]=[];let line='';for(const word of text.replace(/\r/g,'').split(/\s+/)){if(textWidthMm(line?line+' '+word:word,size)<=width){line=line?line+' '+word:word;continue}if(line)lines.push(line);line='';for(const char of word){if(textWidthMm(line+char,size)>width){lines.push(line);line=''}line+=char}}if(line)lines.push(line);return lines}
export function scaleBar(scale:number,maxWidthMm=65) {const maximum=maxWidthMm*scale/1000,order=10**Math.floor(Math.log10(maximum/3)),step=[1,2,5,10].map(n=>n*order).filter(n=>n*3<=maximum).at(-1)??order/10;return {stepM:step,totalM:step*3,widthMm:mmOnPaper(step*3,scale)}}
export function drawTitleBlock(page:PdfPage,{project,floor,title,option,date=new Date(),responsible,notes=[]}:{project:Project;floor?:Floor;title:string;option:SheetOption;date?:Date;responsible?:string;notes?:string[]}) {
 const top=page.heightMm-MARGIN_MM-TITLE_BLOCK_MM,x=MARGIN_MM+4,width=page.widthMm-2*MARGIN_MM-8
 page.rect(MARGIN_MM,MARGIN_MM,page.widthMm-2*MARGIN_MM,page.heightMm-2*MARGIN_MM,{width:.35});page.line({x:MARGIN_MM,y:top},{x:page.widthMm-MARGIN_MM,y:top},{width:.35})
 wrapText(title,width,4).slice(0,2).forEach((line,i)=>page.text({x,y:top+7+i*4.5},line,4,{font:'bold'}))
 wrapText(`Projeto: ${project.name} · Pavimento: ${floor?.name??'—'}`,width,2.8).slice(0,2).forEach((line,i)=>page.text({x,y:top+18+i*3.4},line,2.8))
 page.text({x,y:top+27},`Data: ${date.toLocaleDateString('pt-BR')} · Escala 1:${option.scale} · Folha ${optionLabel(option).split(' 1:')[0]} · 01`,2.8)
 const resp=responsible??project.generalChecks?.responsible?.value??'Não informado',bar=scaleBar(option.scale,Math.min(65,width/3)),barX=page.widthMm-MARGIN_MM-8-bar.widthMm,barY=top+37
 wrapText(`Responsável: ${resp}`,Math.max(60,width-bar.widthMm-14),2.8).slice(0,2).forEach((line,i)=>page.text({x,y:top+34+i*3.5},line,2.8))
 const stepMm=mmOnPaper(bar.stepM,option.scale);for(let i=0;i<3;i++)page.rect(barX+i*stepMm,barY,stepMm,2,{width:.18,fillGray:i%2?1:0})
 for(let i=0;i<=3;i++)page.text({x:barX+i*stepMm,y:barY+6},`${(i*bar.stepM).toLocaleString('pt-BR',{maximumFractionDigits:6})}${i===3?' m':''}`,2.3,{align:'center'})
 page.text({x:barX,y:barY-2},`Escala gráfica · 1:${option.scale}`,2.3)
 notes.flatMap(n=>wrapText(n,width,2.5)).slice(0,2).forEach((n,i)=>page.text({x,y:top+47+i*3},n,2.5))
 page.text({x,y:top+58},'Imprimir em 100% / Tamanho real para preservar a escala.',2.6,{font:'bold'})
}
