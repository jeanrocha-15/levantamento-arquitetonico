import { solveSurveyGeometry } from './surveySolver'
import type { Corner, Diagonal, Wall } from './models'
import { getCorners, validAngle } from './corners'
import { resolveDiagonalAngles } from './diagonals'
import { closureSeverity, geometryTolerance } from './tolerances'
import { solveClosureAngles } from './angles'
export interface AutoAngleNote { cornerId: string; message: string }
export interface Point { x: number; y: number }
export function buildPerimeter(walls: Wall[], savedCorners: Corner[] = [], diagonals: Diagonal[] = [], options:{adjust?:boolean;closed?:boolean}={}) {
  const originalCorners = getCorners(walls, savedCorners)
  const resolved = resolveDiagonalAngles(walls, originalCorners, diagonals)
  const encounters = resolved.visualCorners.map(corner => ({ ...corner }))
  const calculations = [...resolved.calculations]
  // Encontros em modo automático que as diagonais não resolveram:
  // tenta o fechamento do perímetro. Ângulos informados nunca são substituídos.
  const autoNotes: AutoAngleNote[] = []
  const targets = originalCorners.map((corner, index) => ({ corner, index })).filter(({ corner }) => corner.angleSource === 'calculated' && !calculations.some(item => item.cornerId === corner.id)).map(({ index }) => index)
  if (targets.length && walls.length >= 3 && !walls.some(w=>w.surveyPlacement) && !options.adjust) {
    const solution = solveClosureAngles(walls, encounters.map((corner, index) => targets.includes(index) ? null : corner.angleDegrees), targets)
    if (solution.ok) solution.angles.forEach((angle, index) => {
      encounters[index] = { ...encounters[index], angleDegrees: angle, angleSource: 'calculated' }
      calculations.push({ cornerId: encounters[index].id, angleDegrees: angle, angleSource: 'calculated', diagonalIds: [], method: 'closure' })
    })
    else targets.forEach(index => autoNotes.push({ cornerId: originalCorners[index].id, message: solution.reason }))
  } else if (targets.length && !walls.some(w=>w.surveyPlacement) && !options.adjust) targets.forEach(index => autoNotes.push({ cornerId: originalCorners[index].id, message: 'Cadastre pelo menos 3 paredes para calcular ângulos.' }))
  let heading = 0
  let cursor: Point = { x: 0, y: 0 }
  let segments = walls.map((wall, index) => {
    if (index > 0) {
      const angle = encounters[index - 1].angleDegrees
      // Ângulo interno: 90° vira à direita; 270° cria um canto reentrante.
      // Um encontro indefinido usa 90° somente na visualização provisória.
      heading += (180 - (validAngle(angle) ? angle : 90)) * Math.PI / 180
    }
    const snap = (value: number) => Math.abs(value) < 1e-12 ? 0 : value
    const direction = { x: snap(Math.cos(heading)), y: snap(Math.sin(heading)) }
    const measured = wall.lengthM !== null && Number.isFinite(wall.lengthM) && wall.lengthM > 0
    // A referência visual nunca substitui a medida original.
    const length = measured ? wall.lengthM! : 1
    const end = { x: cursor.x + direction.x * length, y: cursor.y + direction.y * length }
    const segment = { wall, start: cursor, end, direction, measured }
    cursor = end
    return segment
  })
  const seed = [{ x: 0, y: 0 }, ...segments.map(segment => segment.end)]
  const useSolver=walls.length>0&&(walls.some(w=>w.surveyPlacement)||diagonals.some(d=>!d.checkOnly)||!!options.adjust)
  const solution=useSolver?solveSurveyGeometry(walls,originalCorners,diagonals,seed,options):undefined
  if(solution){segments=segments.map((s,i)=>{const start=solution.points[i],end=solution.points[i+1],length=Math.hypot(end.x-start.x,end.y-start.y)||1;return {...s,start,end,direction:{x:(end.x-start.x)/length,y:(end.y-start.y)/length}}});cursor=segments.at(-1)!.end;heading=Math.atan2(segments.at(-1)!.direction.y,segments.at(-1)!.direction.x);encounters.forEach((c,i)=>{const solved=solution.visualAngles[i];if(c.angleSource!=='informed'||options.adjust){if(Math.abs((c.angleDegrees??90)-solved)>.00001||c.angleSource==='calculated'||options.adjust){encounters[i]={...c,angleDegrees:solved,angleSource:'calculated'};const previous=calculations.findIndex(x=>x.cornerId===c.id);const calculation={cornerId:c.id,angleDegrees:solved,angleSource:'calculated' as const,diagonalIds:diagonals.filter(d=>!d.checkOnly).map(d=>d.id),method:'diagonal' as const};if(previous>=0)calculations[previous]=calculation;else calculations.push(calculation)}}})}
  const residuals=solution?.residuals??[]
  const points = [{ x: 0, y: 0 }, ...segments.map(segment => segment.end)]
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x))
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y))
  const scale = Math.min(280 / Math.max(maxX - minX, 0.01), 180 / Math.max(maxY - minY, 0.01))
  const project = (point: Point): Point => ({ x: 220 + (point.x - (minX + maxX) / 2) * scale, y: 175 + (point.y - (minY + maxY) / 2) * scale })
  const allMeasured = segments.length > 0 && segments.every(segment => segment.measured)
  const closureM = Math.hypot(cursor.x, cursor.y)
  const allAnglesDefined = encounters.length > 0 && encounters.every(corner => validAngle(corner.angleDegrees))
  const lastAngle = encounters.at(-1)?.angleDegrees ?? null
  const finalHeading = heading + (180 - (validAngle(lastAngle) ? lastAngle : 90)) * Math.PI / 180
  const orientationMismatch = Math.abs(Math.atan2(Math.sin(finalHeading), Math.cos(finalHeading))) * 180 / Math.PI
  const endpointsMeet = allMeasured && segments.length >= 3 && closureM < geometryTolerance.numericalEpsilon
  const closed = endpointsMeet && allAnglesDefined && orientationMismatch < geometryTolerance.numericalEpsilon
  const corners = encounters.map((corner, index) => {
    const incoming = segments[index].direction
    const angle = validAngle(corner.angleDegrees) ? corner.angleDegrees : 90
    const bisector = headingAt(incoming) + Math.PI - angle * Math.PI / 360
    const closing = index === walls.length - 1
    // O canto final é o início de A. O extremo solto da última parede continua separado.
    return { ...corner, label: `${walls[index].label}${walls[(index + 1) % walls.length].label}`, position: closing ? segments[0].start : segments[index].end, labelDirection: { x: Math.cos(bisector), y: Math.sin(bisector) }, incoming, visualAngle: angle, closing }
  })
  const diagonalSegments = diagonals.flatMap(diagonal => {
    if(diagonal.vertexIds){const vertex=(id:string)=>id==='origin'?{position:segments[0]?.start,label:'Origem A'}:(()=>{const index=walls.findIndex(w=>w.id===id),s=segments[index];return s?{position:s.end,label:index<walls.length-1?`${s.wall.label}${walls[index+1].label}`:`Ponta ${s.wall.label}`}:undefined})();const from=vertex(diagonal.vertexIds[0]),to=vertex(diagonal.vertexIds[1]);if(!from?.position||!to?.position||from===to||diagonal.lengthM==null||!Number.isFinite(diagonal.lengthM)||diagonal.lengthM<=0)return [];const drawnLengthM=Math.hypot(from.position.x-to.position.x,from.position.y-to.position.y);return [{diagonal,start:from.position,end:to.position,label:`${from.label}–${to.label}`,drawnLengthM,differenceM:Math.abs(drawnLengthM-diagonal.lengthM)}]}
    const from = corners.find(corner => corner.id === diagonal.cornerIds[0])
    const to = corners.find(corner => corner.id === diagonal.cornerIds[1])
    if (!from || !to || from.id === to.id || diagonal.lengthM === null || !Number.isFinite(diagonal.lengthM) || diagonal.lengthM <= 0) return []
    const drawnLengthM = Math.hypot(from.position.x - to.position.x, from.position.y - to.position.y)
    return [{ diagonal, start: from.position, end: to.position, label: `${from.label}–${to.label}`, drawnLengthM, differenceM: Math.abs(drawnLengthM - diagonal.lengthM) }]
  })
  const diagonalChecks = resolved.diagnostics.map(diagnostic => {
    const segment = diagonalSegments.find(item => item.diagonal.id === diagnostic.id)
    const messages = [...diagnostic.messages]
    const originalDiagonal=diagonals.find(d=>d.id===diagnostic.id);if(originalDiagonal?.vertexIds&&originalDiagonal.vertexIds.some(id=>id!=='origin'&&!walls.some(w=>w.id===id)))messages.push('Referência de vértice inexistente. Reassocie a diagonal sem alterar a medida registrada.')
    if (segment && allMeasured && segment.differenceM > geometryTolerance.diagonalDifferenceWarningM) messages.push('A diagonal medida difere da distância no croqui. Verifique as medidas informadas.')
    return { ...diagnostic, messages, drawnLengthM:segment?.drawnLengthM??null,differenceM: segment?.differenceM ?? null }
  })
  return { residuals,solverNotes:solution?.notes??[],segments, corners, scale, project, closed, endpointsMeet, closureM, allMeasured, allAnglesDefined, orientationMismatch, calculations, autoNotes, diagonalSegments, diagonalChecks, closureSeverity: closureSeverity(closureM) }
}

function headingAt(direction: Point) { return Math.atan2(direction.y, direction.x) }
