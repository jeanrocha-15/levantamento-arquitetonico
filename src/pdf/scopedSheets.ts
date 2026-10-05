import type { Project } from '../models'
import type { ExportScope } from '../exportScope'
import { projectRooms } from '../relationships'
import { drawRoomSheet, roomExtent } from './roomSheet'
import { drawPlanSheet, planExtent } from './planSheet'
import { drawRoofSheet, roofExtent } from './roofSheet'
import { buildPdf } from './pdfWriter'
import type { SheetOption, DrawingExtent } from './sheetLayout'
import type { PdfLayers } from './sheetDecorations'

export function scopedSheets(project:Project,scope:ExportScope,floorId?:string,roomId?:string) {
  const rooms=projectRooms(project),floors=project.floors.filter(f=>scope==='project'||f.id===floorId)
  if(scope==='room')return rooms.filter(r=>r.id===roomId).map(room=>({kind:'room' as const,room}))
  if(scope==='plan')return floors.map(floor=>({kind:'plan' as const,floor}))
  return [
    ...floors.filter(f=>project.roomPlacements?.some(p=>p.floorId===f.id)).map(floor=>({kind:'plan' as const,floor})),
    ...rooms.filter(r=>scope==='project'||r.floorId===floorId).map(room=>({kind:'room' as const,room})),
    ...(project.roofs??[]).filter(r=>scope==='project'||r.floorId===floorId).map(roof=>({kind:'roof' as const,roof})),
  ]
}
export function scopedExtent(project:Project,scope:ExportScope,floorId:string|undefined,roomId:string|undefined,option:SheetOption,layers:PdfLayers):DrawingExtent|undefined {
  const sheets=scopedSheets(project,scope,floorId,roomId)
  if(!sheets.length)return undefined
  const extents=sheets.map(s=>s.kind==='room'?roomExtent(s.room,layers):s.kind==='plan'?planExtent(project,s.floor.id,layers):roofExtent(project,s.roof,option))
  return {width:Math.max(...extents.map(e=>e.width)),height:Math.max(...extents.map(e=>e.height)),extraHeightMm:Math.max(...extents.map(e=>'extraHeightMm' in e?Number(e.extraHeightMm):0))}
}
export function scopedPdf(project:Project,scope:ExportScope,floorId:string|undefined,roomId:string|undefined,option:SheetOption,layers:PdfLayers,responsible?:string) {
  const sheets=scopedSheets(project,scope,floorId,roomId),date=new Date()
  const pages=sheets.map(s=>s.kind==='room'?drawRoomSheet({project,room:s.room,floor:project.floors.find(f=>f.id===s.room.floorId),option,layers,responsible,date}).page:s.kind==='plan'?drawPlanSheet({project,floor:s.floor,option,layers,responsible,date}).page:drawRoofSheet({project,roof:s.roof,option,responsible,date}).page)
  pages.forEach((page,i)=>page.text({x:page.widthMm-14,y:page.heightMm-5},`${i+1}/${pages.length}`,2.5,{align:'right'}))
  return {bytes:buildPdf(pages,project.name),fileName:`campo-${scope}-${option.sheet}-1-${option.scale}.pdf`,pages:pages.length}
}
