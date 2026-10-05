import { duplicatePlanOpenings } from '../planOpeningVisibility'
import { objectLayerVisible } from './sheetDecorations'
import { objectDimensionsLabel } from '../roomObjects'
import { roomLabelPosition } from './labelPosition'
import { architecturalPoints } from './architecturalPoints'
import type { Project,Floor } from '../models'
import { buildPlanRoom,floorRooms,floorPlacements,worldPoint,planBounds } from '../floorPlan'
import { sharedPlanFaces } from '../floorPlanFaces'
import { columnProfilePoints } from '../structural'
import { formatMeasurement } from '../units'
import { PdfPage,buildPdf } from './pdfWriter'
import type { Pt } from './pdfWriter'
import { drawingArea,paperSize,fitMessage,optionLabel } from './sheetLayout'
import type { SheetOption } from './sheetLayout'
import { defaultPdfLayers,drawTitleBlock,drawObjectCaption } from './sheetDecorations'
import type { PdfLayers } from './sheetDecorations'
export function planExtent(project:Project,floorId:string,layers=defaultPdfLayers) {const placements=floorPlacements(project,floorId),shapes=floorRooms(project,floorId).filter(r=>placements.some(p=>p.roomId===r.id)).map(buildPlanRoom),points=shapes.flatMap(s=>architecturalPoints(s,layers).map(p=>worldPoint(p,placements.find(x=>x.roomId===s.room.id)!)));return {...planBounds(points),shapes,placements}}
export function drawPlanSheet({project,floor,option,layers=defaultPdfLayers,responsible,date=new Date(),preview,layout}:{project:Project;floor:Floor;option:SheetOption;layers?:PdfLayers;responsible?:string;date?:Date;preview?:boolean;layout?:import('./sheetSettings').SheetLayout}) {
 const extent=planExtent(project,floor.id,layout?defaultPdfLayers:layers);if(!extent.placements.length)throw new Error('Insira pelo menos um ambiente na Planta Geral deste pavimento.')
 const problem=fitMessage(extent,option);if(problem && !preview)throw new Error(problem.replace('O ambiente','A Planta Geral'))
 const paper=paperSize(option),area=drawingArea(option),page=new PdfPage(paper.width,paper.height),k=1000/option.scale,origin={x:area.x+(area.width-extent.width*k)/2,y:area.y+(area.height-extent.height*k)/2},toPaper=(p:Pt)=>({x:origin.x+(p.x-extent.minX)*k,y:origin.y+(p.y-extent.minY)*k}),unit=project.measurementUnit??'m',f=(n:number|null|undefined)=>formatMeasurement(n,unit),shared=sharedPlanFaces(project,floor.id,extent.placements)
 const suppressedOpenings=duplicatePlanOpenings(project,floor.id,extent.placements)
 for(const shape of extent.shapes){const room=shape.room,placement=extent.placements.find(p=>p.roomId===room.id)!,at=(p:Pt)=>toPaper(worldPoint(p,placement))
  if(layers.walls){for(const [id,faces] of shape.faces)if(!shared.suppressed.has(`${room.id}:${id}`))faces.forEach(face=>page.line(at(face.start),at(face.end),{width:.35}));for(const faces of shape.internalFaces.values())faces.forEach(face=>page.line(at(face.start),at(face.end),{width:.3}))}
  const roomLabel=[layers.ids?room.displayId:'',layers.names?room.name:''].filter(Boolean).join(' — '),visibleObjects=shape.objects.filter(o=>objectLayerVisible(o.object,layers))
  page.text(roomLabelPosition(shape.polygon.map(at),visibleObjects.map(o=>o.bounds.map(at)),roomLabel),roomLabel,3,{align:'center',font:'bold',key:`${room.id}|room`})
  if(layers.measurements||layers.ids)shape.survey.perimeter.segments.forEach(s=>{const a=at(s.start),b=at(s.end),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,labelOffset=Math.max(0,s.wall.thickness??0)*k+5;let angle=Math.atan2(dy,dx)*180/Math.PI;if(angle>90)angle-=180;else if(angle< -90)angle+=180;page.text({x:(a.x+b.x)/2+dy/length*labelOffset,y:(a.y+b.y)/2-dx/length*labelOffset},[layers.ids?s.wall.label:'',layers.measurements?`${f(s.wall.lengthM)}`:''].filter(Boolean).join(' · '),2.5,{align:'center',rotate:angle,key:`${room.id}|wall:${s.wall.id}`})})
  if(layers.openings)for(const o of shape.survey.openings.placements.filter(o=>!suppressedOpenings.has(`${room.id}:${o.opening.id}`))){const a=at(o.start),b=at(o.end),length=Math.hypot(b.x-a.x,b.y-a.y)||1,n={x:-(b.y-a.y)/length,y:(b.x-a.x)/length}
   if(o.opening.type==='door'){if(o.opening.doorKind==='sliding')page.line({x:a.x+n.x*1,y:a.y+n.y*1},{x:b.x+n.x*1,y:b.y+n.y*1},{width:.2});else {const hinge=o.opening.hinge==='right'?b:a,other=o.opening.hinge==='right'?a:b,sign=o.opening.swing==='outward'?-1:1,open={x:hinge.x+n.x*length*sign,y:hinge.y+n.y*length*sign};page.line(hinge,open,{width:.25});page.curve(other,{x:other.x+(open.x-hinge.x)*.5523,y:other.y+(open.y-hinge.y)*.5523},{x:open.x+(other.x-hinge.x)*.5523,y:open.y+(other.y-hinge.y)*.5523},open,{width:.15})}}
   if(o.opening.type==='window')page.line(a,b,{width:.18,dash:[1,1]})
   const labelAt={x:(a.x+b.x)/2+n.x*5,y:(a.y+b.y)/2+n.y*5},openingLines=[layers.ids?o.opening.label:'',layers.measurements?`${formatMeasurement(o.opening.widthM,unit,false)} × ${f(o.opening.heightM)}`:'',layers.measurements&&o.opening.type==='window'?`P=${f(o.opening.sillHeightM)}`:''].filter(Boolean)
   openingLines.forEach((line,i)=>page.text({x:labelAt.x,y:labelAt.y+i*2.6},line,2.2,{align:'center',key:`${room.id}|opening:${o.opening.id}:line:${i}`,rotate:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}))
  }
  if(layers.ids||layers.measurements)shape.survey.internalWalls.placements.forEach(pi=>{const a=at(pi.start),b=at(pi.end);page.text({x:(a.x+b.x)/2+2,y:(a.y+b.y)/2-2},[layers.ids?pi.internalWall.label:'',layers.measurements?f(pi.internalWall.lengthM):''].filter(Boolean).join(' '),2.2,{key:`${room.id}|internal:${pi.internalWall.id}`,rotate:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI})})
  for(const o of shape.objects){if(!(objectLayerVisible(o.object,layers)))continue
   const center=at(o.center),bounds=o.bounds.map(at),profile=o.object.structuralKind==='column'?columnProfilePoints(o.object.profile,o.widthM,o.heightM,o.object.dimensions.webM??0,o.object.dimensions.flangeM??0):undefined
   if(profile){const rad=(o.object.rotationDegrees??0)*Math.PI/180;page.polyline(profile.map(([x,y])=>at({x:o.center.x+x*Math.cos(rad)-y*Math.sin(rad),y:o.center.y+x*Math.sin(rad)+y*Math.cos(rad)})),{width:.2},true)}else if(o.object.shape==='circle')page.circle(center,o.widthM*k/2,{width:.2});else if(o.object.shape==='line')page.line(bounds[0],bounds.at(-1)!,{width:.2});else page.polyline(bounds,{width:.2},true)
   drawObjectCaption(page,center,[layers.ids?o.object.displayId:'',layers.names?o.object.name:'',layers.measurements?objectDimensionsLabel(o.object,unit):''],o.widthM*k,`${room.id}|object:${o.object.id}`,placement.rotation+(o.object.rotationDegrees??0))
  }
 }
 if(layers.walls)shared.faces.forEach(s=>s.ranges.forEach(r=>page.line(toPaper(r.start),toPaper(r.end),{width:.35})))
 const missing=floorRooms(project,floor.id).length-extent.placements.length
 drawTitleBlock(page,{project,floor,title:`Planta Geral — ${floor.name}`,option,date,responsible,layout,notes:[`${extent.placements.length} ambiente(s) posicionado(s). ${missing} ainda não posicionado(s).`,...(extent.shapes.some(s=>!s.survey.perimeter.closed)?['Geometria aproximada em um ou mais ambientes.']:[])]})
 return {page,toPaper,extent}
}
export function planSheetPdf(input:Parameters<typeof drawPlanSheet>[0]) {const {page}=drawPlanSheet(input);return {bytes:buildPdf(page,`Planta Geral — ${input.floor.name} — ${optionLabel(input.option)}`),fileName:`campo-planta-${input.floor.name.replace(/[^\p{L}\p{N}-]/gu,'-')}-${input.option.sheet}-1-${input.option.scale}.pdf`}}
