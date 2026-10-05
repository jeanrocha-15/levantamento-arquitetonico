import { roomLabelPosition } from './labelPosition'
import { columnProfilePoints } from '../structural'
import { buildPlanRoom,planBounds } from '../floorPlan'
import { architecturalPoints } from './architecturalPoints'
import { drawTitleBlock,defaultPdfLayers,drawObjectCaption } from './sheetDecorations'
import type { PdfLayers } from './sheetDecorations'
import { buildWallFaces } from '../wallFaces'
import type { Floor, Project, Room } from '../models'
import { buildRoomGeometry } from '../roomGeometry'
import { buildObjectPlacements, objectDimensionsLabel } from '../roomObjects'
import { doorDrawing } from '../openings'
import { validAngle } from '../corners'
import { formatMeasurement } from '../units'
import { insideNormal } from '../dimensions'
import { PdfPage, buildPdf } from './pdfWriter'
import type { Pt } from './pdfWriter'
import { drawingArea, fitMessage, mmOnPaper, optionLabel, paperSize } from './sheetLayout'
import type { SheetOption } from './sheetLayout'

const degrees = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
// Extensão do desenho em metros (geometria de visualização; as medidas originais não mudam).
export function roomExtent(room:Room,layers=defaultPdfLayers) {const shape=buildPlanRoom(room);return {...planBounds(architecturalPoints(shape,layers)),survey:shape.survey}}

export const isApproximate = (survey: ReturnType<typeof buildRoomGeometry>) => survey.perimeter.calculations.length > 0 || !survey.perimeter.closed

export interface SheetInput { project: Project; floor?: Floor; room: Room; option: SheetOption; date?: Date; layers?:PdfLayers; responsible?:string }
// Monta a prancha. Retorna também o transformador metro→mm, usado nos testes de escala.
export function drawRoomSheet({ project, floor, room, option, date = new Date(),layers=defaultPdfLayers,responsible }: SheetInput) {
  const extent = roomExtent(room,layers)
  const problem = fitMessage(extent, option)
  if (problem) throw new Error(problem)
  const unit = project.measurementUnit ?? 'm'
  const f = (value: number | null | undefined) => formatMeasurement(value, unit)
  const paper = paperSize(option), area = drawingArea(option)
  const page = new PdfPage(paper.width, paper.height)
  const k = 1000 / option.scale // mm de papel por metro
  const origin = { x: area.x + (area.width - extent.width * k) / 2, y: area.y + (area.height - extent.height * k) / 2 }
  const toPaper = (p: Pt): Pt => ({ x: origin.x + (p.x - extent.minX) * k, y: origin.y + (p.y - extent.minY) * k })
  const { perimeter, openings, internalWalls } = extent.survey
  const vertices = perimeter.segments.map(segment => toPaper(segment.start))
  const center = vertices.length ? { x: vertices.reduce((t, p) => t + p.x, 0) / vertices.length, y: vertices.reduce((t, p) => t + p.y, 0) / vertices.length } : origin
  const thin = { width: .18 }, medium = { width: .35 }
  const faces=buildWallFaces(perimeter.segments.map(s=>({id:s.wall.id,start:s.start,end:s.end,thickness:s.wall.thickness,referenceFace:room.wallMeasurementFace ?? 'internal'})),new Map(openings.wallLayouts.map(w=>[w.wallId,w.solidRanges])))
  // Paredes: trechos cheios (sem as aberturas). A espessura vai para fora da linha medida (face interna).
  for (const segment of perimeter.segments) {
    const ranges = faces.get(segment.wall.id) ?? []
    const a = toPaper(segment.start), b = toPaper(segment.end)
    const inside = insideNormal(a, b, center)
    const thickness = segment.wall.thickness != null && Number.isFinite(segment.wall.thickness) && segment.wall.thickness > 0 ? mmOnPaper(segment.wall.thickness, option.scale) : 0
    for (const range of layers.walls?ranges:[]) {
      const from = toPaper(range.start), to = toPaper(range.end)
      page.line(from, to, { width: .5, dash: segment.measured ? undefined : [2, 1.5] })
    }
    // Comprimento da parede, do lado de fora.
    const middle = { x: (a.x + b.x) / 2 - inside.x * (thickness + 5), y: (a.y + b.y) / 2 - inside.y * (thickness + 5) }
    let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (angle > 90) angle -= 180; else if (angle < -90) angle += 180
    if(layers.measurements||layers.ids) page.text({ x: middle.x, y: middle.y + 1.2 }, [layers.ids?segment.wall.label:'',layers.measurements?(segment.measured?f(segment.wall.lengthM):'sem medida'):''].filter(Boolean).join('  '), 3, { align: 'center', rotate: angle, font: 'bold' })
  }
  if (layers.walls && perimeter.allMeasured && !perimeter.endpointsMeet && perimeter.segments.length >= 3) page.line(toPaper(perimeter.segments.at(-1)!.end), toPaper(perimeter.segments[0].start), { width: .2, dash: [1, 1], gray: .4 })
  // Ângulos internos.
  for (const corner of layers.measurements?perimeter.corners:[]) {
    const at = toPaper(corner.position)
    const label = { x: at.x + corner.labelDirection.x * 7, y: at.y + corner.labelDirection.y * 7 }
    const text = validAngle(corner.angleDegrees) ? `${corner.angleSource === 'calculated' ? '~' : ''}${degrees.format(corner.angleDegrees)}°${corner.angleSource === 'assumed' ? ' (pres.)' : ''}` : '?°'
    page.text({ x: label.x, y: label.y + 1 }, text, 2.4, { align: 'center', gray: .2 })
  }
  // Diagonais medidas.
  for (const diagonal of layers.measurements?perimeter.diagonalSegments:[]) {
    const a = toPaper(diagonal.start), b = toPaper(diagonal.end)
    page.line(a, b, { width: .15, dash: [1.5, 1.2], gray: .45 })
    page.text({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 1 }, `${diagonal.label} ${f(diagonal.diagonal.lengthM)}`, 2.2, { align: 'center', gray: .4 })
  }
  // Portas, janelas e vãos.
  for (const placement of layers.openings?openings.placements:[]) {
    const { opening } = placement
    const a = toPaper(placement.start), b = toPaper(placement.end)
    const inside = insideNormal(a, b, center)
    const jamb = (p: Pt) => page.line({ x: p.x - inside.x * 1.5, y: p.y - inside.y * 1.5 }, { x: p.x + inside.x * 1.5, y: p.y + inside.y * 1.5 }, medium)
    jamb(a); jamb(b)
    if (opening.type === 'window') [-.6, .6].forEach(offset => page.line({ x: a.x + inside.x * offset, y: a.y + inside.y * offset }, { x: b.x + inside.x * offset, y: b.y + inside.y * offset }, thin))
    const door = doorDrawing(opening, a, b, { x: (b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y), y: (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y) })
    if (door?.kind === 'hinged') {
      const [hinge, open] = door.leaf, other = Math.hypot(a.x - hinge.x, a.y - hinge.y) < 1e-6 ? b : a
      page.line(hinge, open, medium)
      const c = .5523
      page.curve(other, { x: other.x + (open.x - hinge.x) * c, y: other.y + (open.y - hinge.y) * c }, { x: open.x + (other.x - hinge.x) * c, y: open.y + (other.y - hinge.y) * c }, open, { width: .15, dash: door.specified ? undefined : [1, 1] })
    } else if (door?.kind === 'sliding') { page.line(door.leaf[0], door.leaf[1], medium); if (door.track) page.line(door.track[0], door.track[1], { width: .15, dash: [1, 1] }) }
    const textAt = { x: (a.x + b.x) / 2 + inside.x * 6, y: (a.y + b.y) / 2 + inside.y * 6 }
    const lines = [layers.ids?opening.label:'', ...(layers.measurements?[`${formatMeasurement(opening.widthM, unit, false)} × ${f(opening.heightM)}`, ...(opening.type === 'window' ? [`P=${f(opening.sillHeightM)}`] : []), `${f(opening.offsetM)} de ${placement.reference.label}`]:[])].filter(Boolean)
    lines.forEach((line, index) => page.text({ x: textAt.x, y: textAt.y + index * 3 }, line, index === 0 ? 2.4 : 2.1, { align: 'center', font: index === 0 ? 'bold' : 'regular', gray: index === 0 ? 0 : .3 }))
  }
  const piFaces=buildWallFaces(internalWalls.placements.map(p=>({id:p.internalWall.id,start:p.start,end:p.end,thickness:p.internalWall.thicknessM,referenceFace:room.wallMeasurementFace ?? 'internal'})),new Map(openings.wallLayouts.map(w=>[w.wallId,w.solidRanges])))
  // Paredes internas (PI).
  for (const item of internalWalls.placements) {
    const a = toPaper(item.start), b = toPaper(item.end)
    for(const face of layers.walls?piFaces.get(item.internalWall.id) ?? []:[]) page.line(toPaper(face.start),toPaper(face.end),{width:.35})
    if(layers.measurements||layers.ids) page.text({ x: (a.x + b.x) / 2 + 2, y: (a.y + b.y) / 2 - 1.5 }, [layers.ids?item.internalWall.label:'',layers.measurements?f(item.internalWall.lengthM):''].filter(Boolean).join(' '), 2.3)
  }
  // Objetos.
  for (const item of buildObjectPlacements(room.objects ?? [], [...perimeter.segments,...internalWalls.placements.map(p=>({wall:{id:p.internalWall.id},start:p.start,end:p.end}))])) {
    if(!(item.object.category==='structural'?layers.structural:item.object.category==='equipment'?layers.equipment:layers.objects))continue
    const bounds = item.bounds.map(toPaper), c = toPaper(item.center)
    const profile=item.object.structuralKind==='column'?columnProfilePoints(item.object.profile,item.widthM,item.heightM,item.object.dimensions.webM??0,item.object.dimensions.flangeM??0):undefined
    if(profile){const rad=(item.object.rotationDegrees??0)*Math.PI/180;page.polyline(profile.map(([x,y])=>toPaper({x:item.center.x+x*Math.cos(rad)-y*Math.sin(rad),y:item.center.y+x*Math.sin(rad)+y*Math.cos(rad)})),{width:.2,gray:.3},true)}
    else if (item.object.shape === 'circle') page.circle(c, mmOnPaper(item.widthM, option.scale) / 2, { width: .2, gray: .3 })
    else if (item.object.shape === 'line') page.line(bounds[0], bounds[bounds.length - 1], { width: .3, gray: .3 })
    else page.polyline(bounds, { width: .2, gray: .3 }, true)
    drawObjectCaption(page,c,[layers.ids?item.object.displayId:'',layers.names?item.object.name:'',layers.measurements?objectDimensionsLabel(item.object,unit):''],item.widthM*k)
  }
  const roomLabel=[layers.ids?room.displayId:'',layers.names?room.name:''].filter(Boolean).join(' — '),visibleObjects=buildPlanRoom(room).objects.filter(o=>o.object.category==='structural'?layers.structural:o.object.category==='equipment'?layers.equipment:layers.objects)
  if(roomLabel)page.text(roomLabelPosition(vertices,visibleObjects.map(o=>o.bounds.map(toPaper)),roomLabel),roomLabel,3,{align:'center',font:'bold'})
  drawTitleBlock(page,{project,floor,title:`${room.displayId ?? ''} — ${room.name}`,option,date,responsible,notes:[`Pé-direito: ${f(room.ceilingHeightM)}`,...(isApproximate(extent.survey)?['Geometria aproximada baseada no levantamento de campo.']:[])]})
  return { page, toPaper, extent, label: optionLabel(option) }
}

export function roomSheetPdf(input: SheetInput) {
  const { page, label } = drawRoomSheet(input)
  const slug = (input.room.displayId ?? input.room.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return { bytes: buildPdf(page, `${input.room.displayId ?? ''} ${input.room.name} — ${label}`.trim()), fileName: `campo-${slug || 'ambiente'}-${input.option.sheet}-1-${input.option.scale}.pdf` }
}
