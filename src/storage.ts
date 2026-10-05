import { BASE_DATABASE, DATABASE_NAME, openDatabase, scope } from './database'
import { acknowledgePhotoDeletions, pendingPhotoDeletions, thumbnailKey } from './photoStorage'
import { migrateRoomPhotos, photoFileIds } from './photos'
import { migrateRoomObjects } from './roomObjects'
import type { Project, Room } from './models'
import { generateId } from './domain'
import { ensureProjectMetadata } from './projectMetadata'
import { isMeasurementUnit } from './units'

export const SCHEMA_VERSION = 5
export { DATABASE_NAME, storageScope } from './database'
const BASE_JOURNAL = 'campo-autosave-journal-v1', BASE_LOCAL = 'campo-local-workspace-v1'
export const JOURNAL_KEY = `${BASE_JOURNAL}${scope}`
const LOCAL_KEY = `${BASE_LOCAL}${scope}`
export interface WorkspaceData { projects: Project[]; projectId: string; floorId: string; roomId: string }
export interface StoredWorkspace { schemaVersion: number; revision: string; savedAt: string; data: WorkspaceData }
export function restoreNavigation(data: WorkspaceData): WorkspaceData {
  const project = data.projects.find(item => item.id === data.projectId) ?? data.projects[0]
  const floor = project.floors.find(item => item.id === data.floorId) ?? project.floors[0]
  const containsRoom = (rooms: Room[]): boolean => rooms.some(room => room.id === data.roomId || containsRoom(room.subrooms))
  return { ...data, projectId: project.id, floorId: floor?.id ?? '', roomId: floor && containsRoom(floor.rooms) ? data.roomId : floor?.rooms[0]?.id ?? '' }
}
export function createSnapshot(data: WorkspaceData): StoredWorkspace {
  return { schemaVersion: SCHEMA_VERSION, revision: generateId(), savedAt: new Date().toISOString(), data }
}
// Validation checks the container without rounding, recalculating or repairing original measurements.
export function readSnapshot(value: unknown): StoredWorkspace {
  if (!value || typeof value !== 'object') throw new Error('O arquivo local de projetos é inválido. Os dados existentes foram preservados.')
  const record = value as StoredWorkspace
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2 && record.schemaVersion !== 3 && record.schemaVersion !== 4 && record.schemaVersion !== SCHEMA_VERSION) throw new Error('Esta versão dos dados locais não é compatível com a aplicação. Os projetos existentes foram preservados.')
  const number = (value: unknown) => value === null || typeof value === 'number'
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'string')
  const entity = (value: unknown): value is { id: string } => !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
  const counter = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  const checksValid=(checks:Room['technicalChecks'])=>checks===undefined || !!checks && typeof checks==='object' && !Array.isArray(checks) && Object.values(checks).every(check=>!!check && ['pending','ok','na'].includes(check.status) && (check.photoPrompted===undefined || typeof check.photoPrompted==='boolean') && (check.value===undefined || typeof check.value==='string') && (check.note===undefined || typeof check.note==='string'))
  // Validate element shapes before the UI can dereference them. Invalid measured
  // numbers (NaN, negatives, etc.) remain valid stored input for the checklist.
  const roomValid = (room: Room): boolean => entity(room) && checksValid(room.technicalChecks) && typeof room.name === 'string' && typeof room.floorId === 'string' && (room.displayId === undefined || typeof room.displayId === 'string') && number(room.ceilingHeightM)
    && ['walls', 'corners', 'diagonals', 'openings', 'internalWalls', 'pendingItems', 'subrooms'].every(key => Array.isArray(room[key as keyof Room]))
    && !!room.openingCounters && ['door', 'window', 'gap'].every(key => counter(room.openingCounters[key as keyof typeof room.openingCounters]))
    && counter(room.internalWallCounter)
    && room.walls.every(wall => entity(wall) && typeof wall.label === 'string' && number(wall.lengthM) && (wall.thickness === undefined || number(wall.thickness)) && (wall.wallType === undefined || ['masonry', 'drywall', 'concrete', 'glass', 'wood', 'partition', 'other'].includes(wall.wallType)) && (wall.customWallType === undefined || typeof wall.customWallType === 'string') && (!wall.sharedWallReference || typeof wall.sharedWallReference.roomId === 'string' && typeof wall.sharedWallReference.wallId === 'string'))
    && room.corners.every(corner => entity(corner) && strings(corner.wallIds) && number(corner.angleDegrees) && [null, 'assumed', 'informed', 'calculated'].includes(corner.angleSource))
    && room.diagonals.every(diagonal => entity(diagonal) && strings(diagonal.cornerIds) && number(diagonal.lengthM))
    && room.openings.every(opening => entity(opening) && typeof opening.label === 'string' && ['door', 'window', 'gap'].includes(opening.type) && typeof opening.wallId === 'string' && typeof opening.referenceCornerId === 'string' && [opening.widthM, opening.heightM, opening.sillHeightM, opening.offsetM].every(number))
    && room.internalWalls.every(wall => entity(wall) && typeof wall.label === 'string' && number(wall.lengthM) && number(wall.orientationDegrees) && !!wall.origin && (
      wall.origin.type === 'perimeter_wall' ? typeof wall.origin.wallId === 'string' && typeof wall.origin.referenceCornerId === 'string' && number(wall.origin.distanceM)
      : wall.origin.type === 'internal_wall' ? typeof wall.origin.internalWallId === 'string' && ['start', 'end'].includes(wall.origin.referenceEndpoint) && number(wall.origin.distanceM)
      : wall.origin.type === 'free' && !!wall.origin.position && typeof wall.origin.position.xM === 'number' && typeof wall.origin.position.yM === 'number'))
    && (room.objectCounter === undefined || counter(room.objectCounter))
    && (room.objects === undefined || Array.isArray(room.objects) && room.objects.every(object => entity(object) && typeof object.displayId === 'string' && object.roomId === room.id && typeof object.name === 'string' && (object.technicalItemKey===undefined || typeof object.technicalItemKey==='string') && ['furniture', 'equipment', 'object', 'other'].includes(object.category) && ['rectangle', 'circle', 'line'].includes(object.shape) && !!object.dimensions && typeof object.dimensions === 'object' && ['widthM', 'depthM', 'diameterM', 'lengthM'].every(key => object.dimensions[key as keyof typeof object.dimensions] === undefined || number(object.dimensions[key as keyof typeof object.dimensions])) && !!object.position && number(object.position.xM) && number(object.position.yM) && number(object.rotationDegrees) && (object.note === undefined || typeof object.note === 'string')))
    && (room.photos === undefined || Array.isArray(room.photos) && room.photos.every(photo => entity(photo) && typeof photo.originalFileName === 'string' && typeof photo.createdAt === 'string' && photo.roomId === room.id && typeof photo.fileId === 'string' && typeof photo.mimeType === 'string' && typeof photo.size === 'number' && photo.size >= 0 && Array.isArray(photo.tags) && photo.tags.every(tag => typeof tag === 'string') && (photo.note === undefined || typeof photo.note === 'string') && (photo.linkedEntityId === undefined || typeof photo.linkedEntityId === 'string') && (photo.linkedEntityType === undefined || ['technical_item', 'room', 'wall', 'door', 'window', 'gap', 'internal_wall', 'room_object'].includes(photo.linkedEntityType))))
    && room.pendingItems.every(item => entity(item) && typeof item.description === 'string' && typeof item.resolved === 'boolean')
    && room.subrooms.every(roomValid)
  const data = record.data
  if (typeof record.revision !== 'string' || typeof record.savedAt !== 'string' || !data || !Array.isArray(data.projects) || !data.projects.length || !['projectId', 'floorId', 'roomId'].every(key => typeof data[key as keyof WorkspaceData] === 'string') || !data.projects.every(project => project && checksValid(project.generalChecks) && typeof project.id === 'string' && typeof project.name === 'string' && Array.isArray(project.relationships) && Array.isArray(project.floors) && project.floors.every(floor => floor && typeof floor.id === 'string' && typeof floor.name === 'string' && Array.isArray(floor.rooms) && floor.rooms.every(roomValid)))) throw new Error('Os dados locais estão incompletos. Não foram sobrescritos.')
  if (!data.projects.every(project => project.relationships.every(relation => entity(relation) && typeof relation.sourceRoomId === 'string' && typeof relation.targetRoomId === 'string' && ['opening_connection', 'shared_wall', 'adjacency', 'manual_reference'].includes(relation.type)))) throw new Error('As relações locais estão incompletas. Os dados existentes foram preservados.')
  if (!data.projects.every(project => (project.measurementUnit === undefined || isMeasurementUnit(project.measurementUnit)) && (project.roomDisplayCounter === undefined || counter(project.roomDisplayCounter)))) throw new Error('Configuração do projeto inválida. Os dados existentes foram preservados.')
  if (record.schemaVersion < SCHEMA_VERSION) return { ...record, schemaVersion: SCHEMA_VERSION, data: { ...data, projects: data.projects.map(project => { const migrated = ensureProjectMetadata(project); return { ...migrated, floors: migrated.floors.map(floor => ({ ...floor, rooms: floor.rooms.map(migrateRoomObjects).map(migrateRoomPhotos) })) } }) } }
  return record
}
// The synchronous journal protects edits made immediately before closing the page.
// Special numeric values are preserved as well, so incomplete/invalid original inputs are not normalized.
export function encodeSnapshot(snapshot: StoredWorkspace): string {
  return JSON.stringify(snapshot, (_, value) => typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)) ? { $campoNumber: Object.is(value, -0) ? '-0' : String(value) } : value)
}
export function decodeSnapshot(text: string): StoredWorkspace {
  return readSnapshot(JSON.parse(text, (_, value) => value && typeof value === 'object' && Object.keys(value).length === 1 && '$campoNumber' in value ? value.$campoNumber === 'NaN' ? NaN : value.$campoNumber === 'Infinity' ? Infinity : value.$campoNumber === '-Infinity' ? -Infinity : value.$campoNumber === '-0' ? -0 : value : value))
}
async function loadFrom(databaseName: string, localKey: string, journalKey: string): Promise<StoredWorkspace | null> {
  if (!globalThis.indexedDB) {
    try {
      const local = localStorage.getItem(localKey), journal = localStorage.getItem(journalKey)
      const record = local ? decodeSnapshot(local) : null
      const recent = journal ? decodeSnapshot(journal) : null
      return recent && (!record || recent.savedAt >= record.savedAt) ? recent : record
    } catch (error) {
      if (error instanceof DOMException) { console.warn('Armazenamento local indisponível.', error); return null }
      throw error
    }
  }
  const db = await openDatabase(databaseName)
  const saved = await new Promise<unknown>((resolve, reject) => {
    const transaction = db.transaction('workspace', 'readonly')
    const request = transaction.objectStore('workspace').get('current')
    let result: unknown
    request.onsuccess = () => { result = request.result }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Leitura local interrompida.'))
  })
  const record = saved === undefined ? null : readSnapshot(saved)
  let journal: string | null = null
  try { journal = localStorage.getItem(journalKey) } catch { /* IndexedDB remains usable if the auxiliary journal is unavailable. */ }
  if (!journal) return record
  const recent = decodeSnapshot(journal)
  return !record || recent.savedAt >= record.savedAt ? recent : record
}
export const loadWorkspace = () => loadFrom(DATABASE_NAME, LOCAL_KEY, JOURNAL_KEY)
// Dados gravados antes do login (armazenamento sem usuário), para migração ao primeiro acesso.
export async function loadLegacyWorkspace(): Promise<StoredWorkspace | null> {
  if (!scope) return null
  try { return await loadFrom(BASE_DATABASE, BASE_LOCAL, BASE_JOURNAL) } catch (error) { console.warn('Dados locais anteriores ao login não puderam ser lidos.', error); return null }
}
export async function saveWorkspace(snapshot: StoredWorkspace): Promise<void> {
  readSnapshot(snapshot)
  if (!globalThis.indexedDB) { localStorage.setItem(LOCAL_KEY, encodeSnapshot(snapshot)); return }
  const db = await openDatabase()
  const deletedFiles = pendingPhotoDeletions(photoFileIds(snapshot.data.projects))
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['workspace', 'photoFiles'], 'readwrite', { durability: 'strict' })
    transaction.objectStore('workspace').put(snapshot, 'current')
    const files = transaction.objectStore('photoFiles'); deletedFiles.forEach(fileId => { files.delete(fileId); files.delete(thumbnailKey(fileId)) })
    transaction.oncomplete = () => { acknowledgePhotoDeletions(deletedFiles); resolve() }
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Gravação local interrompida.'))
  })
}
export function writeJournal(snapshot: StoredWorkspace) { localStorage.setItem(JOURNAL_KEY, encodeSnapshot(snapshot)) }
export function clearJournal(snapshot: StoredWorkspace) {
  try { const current = localStorage.getItem(JOURNAL_KEY); if (current && decodeSnapshot(current).revision === snapshot.revision) localStorage.removeItem(JOURNAL_KEY) } catch { /* Never remove an unreadable or newer journal. */ }
}
