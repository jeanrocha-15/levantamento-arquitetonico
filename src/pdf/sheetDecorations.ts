import type { Project,Floor } from '../models'
import { PdfPage,textWidthMm } from './pdfWriter'
import { MARGIN_MM,TITLE_BLOCK_MM,optionLabel,mmOnPaper } from './sheetLayout'
import type { SheetLayout } from './sheetSettings'
import type { RoomObject } from '../models'
export function objectLayerVisible(object:RoomObject,layers:PdfLayers) {return object.category==='structural'?layers.structural && (object.structuralKind==='beam'?layers.beams!==false:layers.columns!==false):object.category==='equipment'?layers.equipment:layers.objects}
import type { SheetOption } from './sheetLayout'
export interface PdfLayers {walls:boolean;ids:boolean;names:boolean;measurements:boolean;openings:boolean;objects:boolean;equipment:boolean;structural:boolean;beams?:boolean;columns?:boolean;annotations?:boolean}
export const defaultPdfLayers:PdfLayers={walls:true,ids:true,names:true,measurements:true,openings:true,objects:true,equipment:true,structural:true,beams:true,columns:true,annotations:true}
export function wrapText(text:string,width:number,size=3) {const lines:string[]=[];let line='';for(const word of text.replace(/\r/g,'').split(/\s+/)){if(textWidthMm(line?line+' '+word:word,size)<=width){line=line?line+' '+word:word;continue}if(line)lines.push(line);line='';for(const char of word){if(textWidthMm(line+char,size)>width){lines.push(line);line=''}line+=char}}if(line)lines.push(line);return lines}
export function scaleBar(scale:number,maxWidthMm=65) {const maximum=maxWidthMm*scale/1000,order=10**Math.floor(Math.log10(maximum/3)),step=[1,2,5,10].map(n=>n*order).filter(n=>n*3<=maximum).at(-1)??order/10;return {stepM:step,totalM:step*3,widthMm:mmOnPaper(step*3,scale)}}
export function drawTitleBlock(page:PdfPage,{project,floor,title,option,date=new Date(),responsible,notes=[],layout}:{project:Project;floor?:Floor;title:string;option:SheetOption;date?:Date;responsible?:string;notes?:string[];layout?:SheetLayout}) {
 const top=page.heightMm-MARGIN_MM-TITLE_BLOCK_MM,x=MARGIN_MM+4,width=(layout?Math.min(180,page.widthMm-2*MARGIN_MM):page.widthMm-2*MARGIN_MM)-8
 page.section='paper'
 page.rect(MARGIN_MM,MARGIN_MM,page.widthMm-2*MARGIN_MM,page.heightMm-2*MARGIN_MM,{width:.35});page.section='title';page.rect(MARGIN_MM,top,width+8,TITLE_BLOCK_MM,{width:.35});page.line({x:MARGIN_MM,y:top},{x:MARGIN_MM+width+8,y:top},{width:.35})
 if(layout?.titleBlockFields.title!==false) wrapText(title,width,4).slice(0,2).forEach((line,i)=>page.text({x,y:top+7+i*4.5},line,4,{font:'bold'}))
 wrapText([layout?.titleBlockFields.project!==false?`Projeto: ${project.name}`:'',layout?.titleBlockFields.floor!==false?`Pavimento: ${floor?.name??'—'}`:''].filter(Boolean).join(' · '),width,2.8).slice(0,2).forEach((line,i)=>page.text({x,y:top+18+i*3.4},line,2.8))
 page.text({x,y:top+27},[layout?.titleBlockFields.date!==false?`Data: ${date.toLocaleDateString('pt-BR')}`:'',layout?.titleBlockFields.scale!==false?`Escala 1:${option.scale}`:'',layout?.titleBlockFields.sheet!==false?`Folha ${optionLabel(option).split(' 1:')[0]}`:''].filter(Boolean).join(' · '),2.8)
 const resp=responsible??project.generalChecks?.responsible?.value??'Não informado',bar=scaleBar(option.scale,Math.min(65,width/3)),barX=x+width-4-bar.widthMm,barY=top+37
 if(layout?.titleBlockFields.responsible!==false) wrapText(`Responsável: ${resp}`,Math.max(60,width-bar.widthMm-14),2.8).slice(0,2).forEach((line,i)=>page.text({x,y:top+34+i*3.5},line,2.8))
 if(layout?.titleBlockFields.scaleBar!==false) { const stepMm=mmOnPaper(bar.stepM,option.scale);for(let i=0;i<3;i++)page.rect(barX+i*stepMm,barY,stepMm,2,{width:.18,fillGray:i%2?1:0})
 for(let i=0;i<=3;i++)page.text({x:barX+i*stepMm,y:barY+6},`${(i*bar.stepM).toLocaleString('pt-BR',{maximumFractionDigits:6})}${i===3?' m':''}`,2.3,{align:'center'})
 page.text({x:barX,y:barY-2},`Escala gráfica · 1:${option.scale}`,2.3)
 }
 [...(layout?.notes?wrapText(layout.notes,width,2.5):[]),...notes.flatMap(n=>wrapText(n,width,2.5)).slice(0,2)].forEach((n,i)=>page.text({x,y:top+47+i*3},n,2.5))
 page.section='paper'
 page.text({x,y:page.heightMm-5},'Imprimir em 100% / Tamanho real para preservar a escala.',2.6,{font:'bold'})
 page.section='drawing'
}

// Separate captions avoid concatenated labels extending across small objects.
export function drawObjectCaption(page:PdfPage,center:{x:number;y:number},labels:string[],widthMm:number,key?:string,rotate=0) {
 const size=2,lines=labels.flatMap((label,sourceIndex)=>label?wrapText(label,Math.max(12,widthMm-2),size).map((text,lineIndex)=>({text,id:`${sourceIndex}:${lineIndex}`})):[])
 const top=center.y-(lines.length-1)*1.25+.7
 lines.forEach((line,index)=>page.text({x:center.x,y:top+index*2.5},line.text,size,{align:'center',gray:.3,key:key?`${key}:line:${line.id}`:undefined,rotate}))
}
