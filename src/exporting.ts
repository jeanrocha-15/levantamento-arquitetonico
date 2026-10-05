import { mergeScopedProject } from './exportScope'
import type { Project, Room } from './models'
import type { StoredWorkspace, WorkspaceData } from './storage'
import { createSnapshot, decodeSnapshot, encodeSnapshot, restoreNavigation } from './storage'
import { getCorners } from './corners'
import { buildRoomGeometry } from './roomGeometry'
import { roomMetrics } from './metrics'
import { roomChecklist } from './checklist'
import { doorDescription, openingNames } from './openings'

export const BACKUP_FORMAT = 'campo-levantamento-backup'
const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'levantamento'
const stamp = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// ---------- Backup JSON ----------
// Usa o mesmo envelope e codificação do armazenamento local, preservando também valores inválidos (NaN, -0).
export function createBackup(data: WorkspaceData, projectIds?: string[]): { fileName: string; text: string } {
  const projects = projectIds ? data.projects.filter(project => projectIds.includes(project.id)) : data.projects
  if (!projects.length) throw new Error('Não há projeto para exportar.')
  const first = projects[0]
  const snapshot = createSnapshot(restoreNavigation({ ...data, projects, projectId: projectIds ? first.id : data.projectId }))
  const text = encodeSnapshot({ ...snapshot, format: BACKUP_FORMAT } as StoredWorkspace)
  const name = projectIds && projects.length === 1 ? slug(first.name) : 'todos-os-projetos'
  return { fileName: `campo-${name}-${stamp()}.json`, text }
}

export function parseBackup(text: string): StoredWorkspace {
  try { return decodeSnapshot(text) } catch (error) {
    if (error instanceof SyntaxError) throw new Error('O arquivo não é um backup válido do Campo (JSON ilegível). Nada foi alterado.')
    if (error instanceof Error && error.message.includes('versão')) throw new Error('Este backup foi gerado por uma versão incompatível do Campo. Nada foi alterado.')
    throw new Error('O arquivo não é um backup válido do Campo ou está incompleto. Nada foi alterado.')
  }
}

export interface ImportResult { data: WorkspaceData; added: string[]; replaced: string[] }
// Projetos do backup entram no levantamento atual. Um projeto com o mesmo ID é substituído
// (a interface pede confirmação antes); os demais projetos permanecem intactos.
export function importProjects(current: WorkspaceData, backup: StoredWorkspace): ImportResult {
  const incoming = backup.data.projects
  const added: string[] = [], replaced: string[] = []
  const projects = current.projects.map(project => {
    const match = incoming.find(item => item.id === project.id)
    if (!match) return project
    replaced.push(match.name); return mergeScopedProject(project,match)
  })
  for (const project of incoming) if (!current.projects.some(item => item.id === project.id)) { projects.push({...project,exportSelection:undefined}); added.push(project.name) }
  const target = incoming[0]
  return { data: restoreNavigation({ projects, projectId: target.id, floorId: target.floors[0]?.id ?? '', roomId: target.floors[0]?.rooms[0]?.id ?? '' }), added, replaced }
}

// ---------- Planilha CSV (Excel/LibreOffice em pt-BR) ----------
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4, useGrouping: false })
const num = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? decimal.format(value) : ''
function cell(value: string | number | null | undefined): string {
  let text = typeof value === 'number' ? num(value) : String(value ?? '')
  // Evita que textos digitados sejam interpretados como fórmulas pela planilha.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
export const CSV_HEADER = ['Pavimento', 'Ambiente', 'Caminho', 'Elemento', 'Identificação', 'Comprimento (m)', 'Largura (m)', 'Altura (m)', 'Peitoril (m)', 'Distância (m)', 'Referência', 'Ângulo (°)', 'Área (m²)', 'Observação']

function cornerLabel(room: Room, cornerId: string) {
  const corner = getCorners(room.walls, room.corners).find(item => item.id === cornerId)
  if (!corner) return ''
  return corner.wallIds.map(wallId => room.walls.find(wall => wall.id === wallId)?.label ?? '?').join('')
}
const wallName = (room: Room, wallId: string) => room.walls.find(wall => wall.id === wallId)?.label ?? ''

export function projectRows(project: Project): (string | number | null)[][] {
  const rows: (string | number | null)[][] = []
  const roomsById = new Map<string, string>()
  const visit = (rooms: Room[], path: string, floorName: string, collect: (room: Room, path: string, floor: string) => void) => rooms.forEach(room => { const current = `${path} / ${room.name || 'Sem nome'}`; collect(room, current, floorName); visit(room.subrooms, current, floorName, collect) })
  project.floors.forEach(floor => visit(floor.rooms, floor.name || 'Sem nome', floor.name, (room, path) => roomsById.set(room.id, path)))
  project.floors.forEach(floor => visit(floor.rooms, floor.name || 'Sem nome', floor.name, (room, path, floorName) => {
    const survey = buildRoomGeometry(room)
    const metrics = roomMetrics(room, survey)
    const status = roomChecklist(room, project, survey)
    const base = [floorName, room.name, path]
    rows.push([...base, 'Ambiente', room.name, metrics.perimeterM, null, room.ceilingHeightM, null, null, null, null, metrics.floorAreaM2, `${status.complete ? 'Completo' : `Em levantamento (${status.completeness}%)`}${metrics.areaApproximate && metrics.floorAreaM2 !== null ? ' · área aproximada' : ''}`])
    room.walls.forEach(wall => rows.push([...base, 'Parede', wall.label, wall.lengthM, null, null, null, null, wall.sharedWallReference ? `Compartilhada com ${roomsById.get(wall.sharedWallReference.roomId) ?? '?'}` : '', null, null, '']))
    // Ângulos de visualização: incluem os calculados por diagonais, com a origem indicada.
    survey.perimeter.corners.forEach(corner => rows.push([...base, 'Canto', corner.label, null, null, null, null, null, corner.angleSource === 'assumed' ? 'presumido' : corner.angleSource === 'informed' ? 'informado' : corner.angleSource === 'calculated' ? 'calculado' : 'não definido', corner.angleDegrees, null, '']))
    room.diagonals.forEach((diagonal, index) => rows.push([...base, 'Diagonal', `D${index + 1} ${survey.perimeter.diagonalSegments.find(d=>d.diagonal.id===diagonal.id)?.label??diagonal.cornerIds.map(cornerId => cornerLabel(room, cornerId)).join('–')}`, diagonal.lengthM, null, null, null, null, '', null, null, '']))
    room.openings.forEach(opening => rows.push([...base, openingNames[opening.type], opening.label, null, opening.widthM, opening.heightM, opening.type === 'window' ? opening.sillHeightM : null, opening.offsetM, `Parede ${wallName(room, opening.wallId)} · canto ${cornerLabel(room, opening.referenceCornerId)}`, null, opening.widthM && opening.heightM ? opening.widthM * opening.heightM : null, [doorDescription(opening), opening.connectedRoomId ? `Leva para ${roomsById.get(opening.connectedRoomId) ?? '?'}` : ''].filter(Boolean).join(' · ')]))
    room.internalWalls.forEach(wall => rows.push([...base, 'Parede interna', wall.label, wall.lengthM, wall.thicknessM ?? null, wall.heightM ?? null, null, wall.origin.type === 'perimeter_wall' ? wall.origin.distanceM : null, wall.origin.type === 'perimeter_wall' ? `Parede ${wallName(room, wall.origin.wallId)} · canto ${cornerLabel(room, wall.origin.referenceCornerId)}` : '', wall.orientationDegrees, null, wall.note ?? '']))
    room.pendingItems.filter(item => !item.resolved).forEach(item => rows.push([...base, 'Pendência', item.kind === 'technical' ? 'Técnica' : item.reason === 'doubtful' ? 'Medida duvidosa' : 'Conferir no local', null, null, null, null, null, '', null, null, [item.description, item.note].filter(Boolean).join(' — ')]))
  }))
  return rows
}

export function projectCsv(project: Project): { fileName: string; text: string } {
  const lines = [CSV_HEADER, ...projectRows(project)].map(row => row.map(cell).join(';'))
  return { fileName: `campo-${slug(project.name)}-${stamp()}.csv`, text: `\uFEFF${lines.join('\r\n')}\r\n` }
}

// ---------- Download no navegador ----------
export function downloadText(fileName: string, text: string, type: string) { downloadBlob(fileName, new Blob([text], { type })) }
export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = fileName; link.rel = 'noopener'
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
