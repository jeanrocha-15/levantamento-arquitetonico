import { repairSheetDimensions } from './dimensionRepair'
import { drawingArea } from './sheetLayout'
import { parallelOffset } from '../architecturalDimensions'
import type { Project } from '../models'
import { projectRooms } from '../relationships'
import { buildPlanRoom, worldPoint } from '../floorPlan'
import { fitObjectsSketch } from '../roomObjects'
import { fitInternalWallsSketch } from '../internalWalls'
import { roomGhosts } from '../roomGhosts'
import { readableRotation } from '../labelRotation'
import { formatMeasurement } from '../units'
import { drawRoomSheet } from './roomSheet'
import { drawPlanSheet } from './planSheet'
import { drawRoofSheet } from './roofSheet'
import { PdfPage, textWidthMm } from './pdfWriter'
import type { PdfSceneItem, Pt } from './pdfWriter'
import { sheetOption } from './sheetSettings'
import type { SheetLayout } from './sheetSettings'
import { wrapText } from './sheetDecorations'
import type { scopedSheets } from './scopedSheets'
export type SheetSource=ReturnType<typeof scopedSheets>[number]
export function sheetSourceKey(source:SheetSource) {return source.kind+':'+(source.kind==='room'?source.room.id:source.kind==='plan'?source.floor.id:source.roof.id)}
export function sheetSourceName(source:SheetSource) {return source.kind==='room'?`${source.room.displayId} — ${source.room.name}`:source.kind==='plan'?`Planta Geral — ${source.floor.name}`:`${source.roof.displayId} — ${source.roof.name}`}
function replay(page:PdfPage,item:PdfSceneItem,offset:Pt,rotation?:number,key?:string) {
 page.group=item.group
 const p=(pt:Pt)=>({x:pt.x+offset.x,y:pt.y+offset.y});page.section=item.section
 switch(item.kind){
 case 'line':page.line(p(item.a),p(item.b),item.style);break
 case 'polyline':page.polyline(item.points.map(p),item.style,item.close);break
 case 'rect':page.rect(item.x+offset.x,item.y+offset.y,item.w,item.h,item.style);break
 case 'curve':page.curve(p(item.a),p(item.c1),p(item.c2),p(item.b),item.style);break
 case 'circle':page.circle(p(item.center),item.r,item.style);break
 case 'text':page.text(p(item.at),item.text,item.sizeMm,{...item.options,rotate:rotation??item.options.rotate,key});break
 }
}
export function sceneBounds(items:PdfSceneItem[]) {
 const points=items.flatMap(i=>{
 switch(i.kind){case 'line':return [i.a,i.b];case 'polyline':return i.points;case 'curve':return [i.a,i.c1,i.c2,i.b];case 'circle':return [{x:i.center.x-i.r,y:i.center.y-i.r},{x:i.center.x+i.r,y:i.center.y+i.r}];case 'rect':return [{x:i.x,y:i.y},{x:i.x+i.w,y:i.y+i.h}];case 'text':{
 const width=textWidthMm(i.text,i.sizeMm,i.options.font),shift=i.options.align==='center'?width/2:i.options.align==='right'?width:0,angle=(i.options.rotate??0)*Math.PI/180
 return [[-shift,-i.sizeMm],[width-shift,-i.sizeMm],[width-shift,i.sizeMm*.25],[-shift,i.sizeMm*.25]].map(([x,y])=>({x:i.at.x+x*Math.cos(angle)-y*Math.sin(angle),y:i.at.y+x*Math.sin(angle)+y*Math.cos(angle)}))
 }}})
 if(!points.length)return undefined
 return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))}
}
export function composeSheet(project:Project,source:SheetSource,layout:SheetLayout,numbering?:{index:number;total:number}) {
 const option=sheetOption(layout),layers=layout.visibleLayers,rooms=projectRooms(project),k=1000/option.scale
 const drawing=source.kind==='room'?drawRoomSheet({project,room:source.room,floor:project.floors.find(f=>f.id===source.room.floorId),option,layers,preview:true,layout,responsible:layout.responsible}):source.kind==='plan'?drawPlanSheet({project,floor:source.floor,option,layers,preview:true,layout,responsible:layout.responsible}):drawRoofSheet({project,roof:source.roof,option,layers,preview:true,layout,responsible:layout.responsible})
 const raw=drawing.page,covered=new Set(source.kind==='room'?[source.room.id]:source.kind==='plan'?(project.roomPlacements??[]).filter(p=>p.floorId===source.floor.id).map(p=>p.roomId):[])
 const allActive=(project.wallCompatibilities??[]).filter(c=>c.strategy!=='original'&&project.spatialConnections?.some(link=>link.id===c.connectionId&&!link.assemblyDetached)&&c.valueM!=null&&Number.isFinite(c.valueM)&&c.valueM>0&&[c.a,c.b].every(s=>rooms.find(r=>r.id===s.roomId)?.walls.some(w=>w.id===s.wallId)))
 const active=allActive.filter(c=>[c.a,c.b].some(s=>covered.has(s.roomId)))
 const legendLines:string[]=[]
 active.forEach(c=>{
 const ref=`N${allActive.indexOf(c)+1}`,parts=[c.a,c.b].map(side=>{const room=rooms.find(r=>r.id===side.roomId)!,wall=room.walls.find(w=>w.id===side.wallId)!;return `${room.name} ${wall.label}: ${formatMeasurement(wall.lengthM,project.measurementUnit??'m')}`})
 legendLines.push(...wrapText(`${ref} — ${parts.join(' / ')} · Valor adotado: ${formatMeasurement(c.valueM,project.measurementUnit??'m')}`,Math.min(180,raw.widthMm-20)-8,2.5))
 for(const side of [c.a,c.b]){if(!covered.has(side.roomId))continue;const room=rooms.find(r=>r.id===side.roomId)!,segment=buildPlanRoom(room).survey.perimeter.segments.find(s=>s.wall.id===side.wallId);if(!segment)continue;let mid={x:(segment.start.x+segment.end.x)/2,y:(segment.start.y+segment.end.y)/2};if(source.kind==='plan'){const placement=project.roomPlacements?.find(p=>p.roomId===room.id);if(!placement)continue;mid=worldPoint(mid,placement)}const at=drawing.toPaper(mid);raw.section='drawing';raw.text({x:at.x+2,y:at.y-2},ref,2.5,{font:'bold',key:`${room.id}|compatibility:${c.id}`})}
 })
 if(active.length){const h=9+legendLines.length*3.5,x=layout.titleBlockPosition.x,y=layout.titleBlockPosition.y-h-3;raw.section='legend';raw.rect(x,y,Math.min(180,raw.widthMm-20),h,{width:.2});raw.text({x:x+4,y:y+5},'COMPATIBILIZAÇÕES',2.7,{font:'bold'});legendLines.forEach((line,i)=>raw.text({x:x+4,y:y+9+i*3.5},line,2.5))}
 const sketchScales=new Map<string,number>()
 if(source.kind==='room'){
 const shape=buildPlanRoom(source.room),internal=fitInternalWallsSketch(shape.survey.perimeter,shape.survey.internalWalls.placements),extra=[...[...shape.faces.values(),...shape.internalFaces.values()].flat().flatMap(f=>[f.start,f.end]),...shape.survey.internalWalls.placements.flatMap(p=>[p.start,p.end]),...roomGhosts(project,source.room).flatMap(g=>g.segments.flatMap(s=>[s.start,s.end]))]
 sketchScales.set(source.room.id,fitObjectsSketch(internal,shape.objects,extra).scale)
 }
 let page=new PdfPage(raw.widthMm,raw.heightMm);const titleOrigin={x:10,y:raw.heightMm-74}
 let textIndex=0
 for(const item of raw.scene){
 let offset={x:0,y:0},angle=item.kind==='text'?item.options.rotate??0:undefined,key=item.kind==='text'?item.options.key:undefined
 if(item.section==='drawing'){
 offset={x:layout.drawingOffsetX,y:layout.drawingOffsetY}
 if(item.kind==='text'){
 key??=`${sheetSourceKey(source)}|annotation:${textIndex++}`
 const [roomId,labelKey]=key.split('|'),room=rooms.find(r=>r.id===roomId),baseKey=labelKey?.replace(/:line:.*$/,'')
 const inherited=baseKey&&(source.kind==='plan'?room?.planLabelOffsets:room?.labelOffsets)?.[baseKey]
 if(inherited){const factor=source.kind==='plan'?k:k/(sketchScales.get(roomId)??1);const shift=!!baseKey&&/^(wall|internal):/.test(baseKey)?parallelOffset(inherited,angle??0):inherited;offset.x+=shift.dx*factor;offset.y+=shift.dy*factor;if(!(baseKey&&/^(wall|internal):/.test(baseKey)))angle=inherited.rotation??angle}
 const override=layout.labelOverrides[key]
 if(override){const shift=!!baseKey&&/^(wall|internal):/.test(baseKey)?parallelOffset(override,angle??0):override;offset.x+=shift.dx;offset.y+=shift.dy;if(!(baseKey&&/^(wall|internal):/.test(baseKey)))angle=override.rotation??angle}
 angle=readableRotation(angle??0)
 }
 }else if(item.section==='title')offset={x:layout.titleBlockPosition.x-titleOrigin.x,y:layout.titleBlockPosition.y-titleOrigin.y}
 replay(page,item,offset,angle,key)
 }
 const area=drawingArea(option),repaired=repairSheetDimensions(page.scene,{x:area.x,y:area.y,width:area.width,height:area.height})
 if(repaired.repositioned){const next=new PdfPage(page.widthMm,page.heightMm);for(const item of repaired.scene)replay(next,item,{x:0,y:0});page=next}
 let autoRepositioned=false
 const completeBounds=sceneBounds(page.scene.filter(i=>i.section==='drawing'))
 if(completeBounds&&layout.drawingOffsetX===0&&layout.drawingOffsetY===0&&completeBounds.maxX-completeBounds.minX<=area.width&&completeBounds.maxY-completeBounds.minY<=area.height){const dx=Math.max(area.x-completeBounds.minX,Math.min(0,area.x+area.width-completeBounds.maxX)),dy=Math.max(area.y-completeBounds.minY,Math.min(0,area.y+area.height-completeBounds.maxY));if(dx||dy){const next=new PdfPage(page.widthMm,page.heightMm);for(const item of page.scene)replay(next,item,item.section==='drawing'?{x:dx,y:dy}:{x:0,y:0});page=next;autoRepositioned=true}}
 if(numbering&&numbering.total>1){page.section='paper';page.text({x:page.widthMm-14,y:page.heightMm-5},`${numbering.index+1}/${numbering.total}`,2.5,{align:'right'})}
 const drawingBounds=sceneBounds(page.scene.filter(i=>i.section==='drawing')),furnitureBounds=sceneBounds(page.scene.filter(i=>i.section==='title'||i.section==='legend'))
 const outside=(b:ReturnType<typeof sceneBounds>)=>!!b&&(b.minX<9.8||b.minY<9.8||b.maxX>page.widthMm-9.8||b.maxY>page.heightMm-9.8)
 const clipped=outside(drawingBounds)||outside(furnitureBounds)
 const overlaps=!!drawingBounds&&!!furnitureBounds&&drawingBounds.minX<furnitureBounds.maxX&&drawingBounds.maxX>furnitureBounds.minX&&drawingBounds.minY<furnitureBounds.maxY&&drawingBounds.maxY>furnitureBounds.minY
 return {page,drawingBounds,clipped,overlaps,compatibilities:active.length,dimensionConflicts:repaired.unresolved,autoRepositioned}
}
