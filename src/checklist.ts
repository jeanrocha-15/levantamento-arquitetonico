import { structuralVerification } from './structural'
import { roofChecklist } from './roofs'
import { COMPLETION_ITEMS, TECHNICAL_ITEMS, technicalCheck, technicalItemId, itemKeyForEntity, validGeneralValue } from './technicalChecklist'
import { objectProblems } from './roomObjects'
import { formatMeasurement } from './units'
import type { CheckStatus, Project, Room } from './models'
import { getWallReferences } from './openings'
import { buildRoomGeometry } from './roomGeometry'
import type { RoomGeometry } from './roomGeometry'
import { validAngle, getCorners } from './corners'
import { geometryTolerance } from './tolerances'
import { relationshipProblems } from './relationships'
import { projectRooms } from './relationships'
import { isGeneralCheckField } from './technicalChecklist'

export interface ChecklistIssue { id: string; roomId: string; elementId?: string; field?: string; description: string; kind: 'automatic' | 'manual' | 'technical'; note?: string }
export interface CheckTarget { key: string; elementId: string; field?: string; label: string }
export function measurementTargets(room: Room): CheckTarget[] {
  const targets: CheckTarget[] = []
  const add = (elementId: string, label: string, fields: [string, string][] = []) => {
    targets.push({ key: elementId, elementId, label })
    for (const [field, caption] of fields) targets.push({ key: `${elementId}:${field}`, elementId, field, label: `${label} — ${caption}` })
  }
  add(room.id, 'Ambiente', [['name', 'nome'], ['ceilingHeightM', 'pé-direito']])
  room.walls.forEach(wall => add(wall.id, `Parede ${wall.label}`, [['lengthM', 'comprimento'], ['thickness', 'espessura']]))
  getCorners(room.walls, room.corners).forEach((corner, index) => add(corner.id, `Canto ${room.walls[index].label}${room.walls[(index + 1) % room.walls.length].label}`, [['angleDegrees', 'ângulo']]))
  room.openings.forEach(opening => add(opening.id, opening.label, [['widthM', 'largura'], ['heightM', 'altura'], ...(opening.type === 'window' ? [['sillHeightM', 'peitoril']] as [string, string][] : []), ['offsetM', 'posição'], ['referenceCornerId', 'canto de referência']]))
  room.diagonals.forEach((diagonal, index) => add(diagonal.id, `Diagonal ${index + 1}`, [['lengthM', 'distância'], ['cornerIds', 'cantos']]))
  room.internalWalls.forEach(wall => add(wall.id, wall.label, [['lengthM', 'comprimento'], ['origin', 'origem'], ['distanceM', 'posição'], ['orientationDegrees', 'orientação'], ['thicknessM', 'espessura'], ['heightM', 'altura']]))
  ;(room.objects ?? []).forEach(object=>add(object.id, `${object.displayId} — ${object.name}`, [['name','nome'],['position','posição'],['dimensions','dimensões'],['rotationDegrees','rotação'],...(object.category==='structural'?[['shape','forma/perfil'],['material','material']] as [string,string][]:[])]))
  TECHNICAL_ITEMS.forEach(item=>add(technicalItemId(room,item.key),item.label,[[`check:${item.key}`,'verificação técnica']]))
  return targets
}
// Porta de abrir: para onde abre e lado da dobradiça; de correr: para onde corre. Sem isso o croqui mostra o símbolo tracejado.
export function doorOperationKnown(opening: Pick<import('./models').Opening, 'doorKind' | 'swing' | 'hinge' | 'slideDirection'>) {
  return (opening.doorKind ?? 'hinged') === 'hinged' ? !!opening.swing && !!opening.hinge : !!opening.slideDirection
}
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0
export function roomChecklist(room: Room, project: Project, survey?: RoomGeometry) {
  const issues: ChecklistIssue[] = []
  const validity = new Map<string, boolean>()
  const mark = (key:string, valid:boolean) => validity.set(key, (validity.get(key) ?? true) && valid)
  const require = (valid: boolean, elementId: string, field: string, description: string) => {
    mark(itemKeyForEntity(room,elementId,field),valid)
    if (!valid) issues.push({ id: `auto:${elementId}:${field}`, roomId: room.id, elementId, field, description, kind: 'automatic' })
  }
  const warning = (elementId: string, field: string, description: string) => {
    mark(itemKeyForEntity(room,elementId,field),false)
    if (!issues.some(item => item.elementId === elementId && item.description === description)) issues.push({ id: `warning:${elementId}:${field}`, roomId: room.id, elementId, field, description, kind: 'automatic' })
  }
  require(!!room.name.trim(), room.id, 'name', 'Nome do ambiente ausente.')
  require(positive(room.ceilingHeightM), room.id, 'ceilingHeightM', 'Pé-direito não informado ou inválido.')
  mark('walls',room.walls.length>0)
  room.walls.forEach(wall => require(positive(wall.lengthM), wall.id, 'lengthM', `Parede ${wall.label} sem comprimento válido.`))
  room.walls.forEach(wall => { if (wall.thickness != null && !positive(wall.thickness)) warning(wall.id, 'thickness', `Parede ${wall.label}: espessura opcional inválida.`) })
  const derived = survey ?? buildRoomGeometry(room)
  const geometry = derived.perimeter
  // Comprimentos já são avaliados em Paredes; aqui avaliamos os encontros.
  const sufficient = room.walls.length >= 3 && geometry.allAnglesDefined
  require(sufficient, room.id, 'geometry', 'Geometria insuficiente: confira paredes, comprimentos e ângulos.')
  if (room.walls.length >= 3 && geometry.allMeasured && geometry.allAnglesDefined && (geometry.closureM > geometryTolerance.closureWarningM || geometry.orientationMismatch > geometryTolerance.angleDifferenceWarningDegrees)) warning(room.id, 'geometry', `Grande divergência de fechamento (${formatMeasurement(geometry.closureM, project.measurementUnit ?? 'm')}). Verifique as medidas e os ângulos.`)
  geometry.corners.forEach(corner => {
    if (!validAngle(corner.angleDegrees)) warning(corner.id, 'angleDegrees', `Canto ${corner.label}: ângulo ainda não definido ou inválido.`)
  })
  room.openings.forEach(opening => {
    const label = opening.label
    require(positive(opening.widthM), opening.id, 'widthM', `${label} sem largura válida.`)
    require(positive(opening.heightM), opening.id, 'heightM', `${label} sem altura válida.`)
    if (opening.type === 'window') require(nonnegative(opening.sillHeightM), opening.id, 'sillHeightM', `${label} sem peitoril válido.`)
    if (opening.type === 'door' && !doorOperationKnown(opening)) warning(opening.id, 'doorKind', `${label}: sentido de abertura não informado.`)
    require([...room.walls,...room.internalWalls].some(wall => wall.id === opening.wallId) && nonnegative(opening.offsetM), opening.id, 'offsetM', `${label}: posição não definida ou inválida.`)
    require(getWallReferences(room.walls, room.corners, opening.wallId,room.internalWalls).some(corner => corner.id === opening.referenceCornerId), opening.id, 'referenceCornerId', `${label}: canto de referência ausente ou inexistente.`)
  })
  // Existing positional checks also cover overlap and measurements outside their wall.
  derived.openings.checks.forEach(check => {
    if (issues.some(item => item.elementId === check.id && item.id.startsWith('auto:'))) return
    check.messages.forEach((message, index) => warning(check.id, `opening-check-${index}`, `${room.openings.find(item => item.id === check.id)?.label}: ${message}`))
  })
  const internalLayout = derived.internalWalls
  room.internalWalls.forEach(wall => {
    require(positive(wall.lengthM), wall.id, 'lengthM', `${wall.label} sem comprimento válido.`)
    const origin = wall.origin
    const validOrigin = origin.type === 'perimeter_wall' && room.walls.some(item => item.id === origin.wallId)
    require(validOrigin, wall.id, 'origin', `${wall.label}: origem não definida ou indisponível nesta etapa.`)
    const validPosition = origin.type === 'perimeter_wall' && nonnegative(origin.distanceM) && getWallReferences(room.walls, room.corners, origin.wallId).some(item => item.id === origin.referenceCornerId)
    require(validPosition, wall.id, 'distanceM', `${wall.label}: posição insuficiente; confira distância e canto de referência.`)
    require(nonnegative(wall.orientationDegrees) && wall.orientationDegrees! <= 360, wall.id, 'orientationDegrees', `${wall.label}: orientação não definida ou inválida.`)
  })
  internalLayout.checks.forEach(check => {
    if (issues.some(item => item.elementId === check.id && item.id.startsWith('auto:'))) return
    check.messages.forEach((message, index) => warning(check.id, `internal-check-${index}`, `${room.internalWalls.find(item => item.id === check.id)?.label}: ${message}`))
  })
  const corners = getCorners(room.walls, room.corners)
  room.diagonals.forEach((diagonal, index) => {
    require(positive(diagonal.lengthM), diagonal.id, 'lengthM', `Diagonal ${index + 1}: valor ausente ou inválido.`)
    require(diagonal.vertexIds?diagonal.vertexIds[0]!==diagonal.vertexIds[1]&&diagonal.vertexIds.every(id=>id==='origin'||room.walls.some(w=>w.id===id)):diagonal.cornerIds[0] !== diagonal.cornerIds[1] && diagonal.cornerIds.every(cornerId => corners.some(corner => corner.id === cornerId)), diagonal.id, 'cornerIds', `Diagonal ${index + 1}: referência inexistente ou cantos iguais.`)
  })
  geometry.diagonalChecks.forEach(check => {
    if (issues.some(item => item.elementId === check.id && item.id.startsWith('auto:'))) return
    // Notes describing the calculation's assumptions are not missing survey measurements.
    check.messages.filter(message => !message.startsWith('Diagonal de conferência:') && !message.startsWith('Geometria aproximada.') && !message.startsWith('Para este quadrilátero') && !message.startsWith('Os cantos são vizinhos') && !message.startsWith('Dados insuficientes para calcular novos ângulos')).forEach((message, index) => warning(check.id, `diagonal-check-${index}`, `Diagonal: ${message}`))
  })
  ;(room.objects ?? []).forEach(object=> {
    if(object.category==='structural') {if(!object.attachedWallId && (object.position.xM==null || object.position.yM==null)) require(false,object.id,'position','Posição do elemento estrutural não definida.');return}
    objectProblems(object).forEach((message,index)=>require(false,object.id,`object-check-${index}`,`${object.displayId} — ${object.name}: ${message}`))
    if(!objectProblems(object).length) mark(itemKeyForEntity(room,object.id),true)
  })
  room.pendingItems.filter(item => !item.resolved).forEach(item => issues.push({ id: item.id, roomId: room.id, elementId: item.elementId, field: item.field, description: item.description, note: item.note, kind: item.kind ?? 'manual' }))
  relationshipProblems(project).filter(item => item.roomId === room.id && !room.pendingItems.some(pending => pending.issueKey === item.key)).forEach(item => issues.push({ id: `technical:${item.key}`, roomId: room.id, elementId: item.elementId, description: item.description, kind: 'technical' }))
  // Cada categoria técnica é uma obrigação: as medidas já existentes validam essa
  // mesma obrigação, sem adicionar uma segunda contagem pelo item do checklist.
  issues.filter(issue=>issue.kind!=='automatic').forEach(issue=>mark(itemKeyForEntity(room,issue.elementId,issue.field),false))
  const checks=COMPLETION_ITEMS.map(item=>{
    const check=technicalCheck(room,project,item.key), valid=validity.get(item.key) ?? true
    const valueValid=!item.general || validGeneralValue(item.key,check.value)
    const verifiable=item.general || validity.has(item.key)
    const status:CheckStatus=check.status==='na'?'na':verifiable?(valid && valueValid?'ok':'pending'):check.status
    const completed=status==='na' || status==='ok' && valid && valueValid
    if(!completed && !issues.some(issue=>itemKeyForEntity(room,issue.elementId,issue.field)===item.key)) issues.push({id:`check:${room.id}:${item.key}`,roomId:room.id,elementId:technicalItemId(room,item.key),field:`check:${item.key}`,description:`${item.group} — ${item.label}: ${check.status==='ok'?'dados incompletos ou medidas a conferir':'pendente'}.`,kind:'technical'})
    return {...item,...check,status,automatic:verifiable,completed,dataValid:valid && valueValid,id:technicalItemId(room,item.key),obligationId:`${item.general?project.id:room.id}:check:${item.key}`}
  })
  const structuralObjects=(room.objects ?? []).filter(o=>o.category==='structural')
  const structuralChecks=structuralObjects.flatMap(object=>structuralVerification(object).map(check=>({...check,id:`${object.id}:check:${check.key}`})))
  structuralObjects.forEach(object=>structuralVerification(object).filter(c=>!c.completed).forEach(c=>issues.push({id:`structural:${object.id}:${c.key}`,roomId:room.id,elementId:object.id,field:c.key,description:`${object.displayId} — ${c.label}: pendente.`,kind:'technical'})))
  const countedChecks=checks.filter(check=>!structuralObjects.some(o=>o.technicalItemKey===check.key))
  const nameComplete=validity.get('name') ?? false
  const filled=countedChecks.filter(check=>check.completed).length+structuralChecks.filter(c=>c.completed).length+Number(nameComplete), total=countedChecks.length+structuralChecks.length+1
  // N/A dispensa as exigências automáticas desta categoria. Marcações manuais
  // e problemas estruturais continuam disponíveis para revisão explícita.
  const activeIssues=issues.filter(issue=>!(issue.id.startsWith('check:') && structuralObjects.some(o=>`check:${room.id}:${o.technicalItemKey}`===issue.id))).filter(issue=>issue.kind!=='automatic' || technicalCheck(room,project,itemKeyForEntity(room,issue.elementId,issue.field)).status!=='na')
  return { issues:activeIssues, completeness: Math.round(100 * filled / total), complete: activeIssues.length === 0 && filled===total, checks, checksCompleted:filled-Number(nameComplete), checksTotal:countedChecks.length+structuralChecks.length, photosCount:room.photos?.length ?? 0, obligations:[...countedChecks.map(check=>({id:check.obligationId,completed:check.completed})),...structuralChecks.map(c=>({id:c.id,completed:c.completed})),{id:`${room.id}:name`,completed:nameComplete}] }
}
export function projectChecklistSummary(project:Project, results=projectRooms(project).map(room=>roomChecklist(room,project))) {
  const obligations=new Map<string,boolean>(), issues=new Map<string,ChecklistIssue>()
  for(const result of results) {
    for(const item of result.obligations) obligations.set(item.id,(obligations.get(item.id) ?? true) && item.completed)
    for(const issue of result.issues) issues.set(isGeneralCheckField(issue.field)?`${project.id}:${issue.field}`:issue.id,issue)
  }
  for(const roof of project.roofs ?? []) {const result=roofChecklist(roof);result.obligations.forEach(c=>obligations.set(c.id,c.completed));result.issues.forEach(issue=>issues.set(issue.id,issue))}
  const checks=[...obligations].filter(([id])=>id.includes(':check:'))
  return {completeness:obligations.size?Math.round(100*[...obligations.values()].filter(Boolean).length/obligations.size):0,checksTotal:checks.length,checksCompleted:checks.filter(([,completed])=>completed).length,issues:[...issues.values()],photosCount:results.reduce((sum,result)=>sum+result.photosCount,0)+(project.roofs ?? []).reduce((sum,r)=>sum+(r.photos?.length ?? 0),0)+(project.detachedRoofPhotos?.length ?? 0)}
}

// Persist derived statuses at edit boundaries, retaining manual N/A and observations.
export function recalculateChecklist(project:Project):Project {
  const visit=(rooms:Room[]):Room[]=>rooms.map(room=>{
    const result=roomChecklist(room,project),checks={...room.technicalChecks}
    result.checks.filter(c=>c.automatic&&!c.general).forEach(c=>{checks[c.key]={...checks[c.key],status:c.status}})
    return {...room,technicalChecks:checks,subrooms:visit(room.subrooms)}
  })
  const generalChecks={...project.generalChecks}
  TECHNICAL_ITEMS.filter(item=>item.general).forEach(item=>{const check=generalChecks[item.key];if(check?.status!=='na')generalChecks[item.key]={...check,status:validGeneralValue(item.key,check?.value)?'ok':'pending'}})
  return {...project,generalChecks,floors:project.floors.map(f=>({...f,rooms:visit(f.rooms)}))}
}
