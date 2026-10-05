import { reconcileRelationships } from './relationships'
import { BASE_DATABASE, DATABASE_NAME, openDatabase, scope } from './database'
import { acknowledgePhotoDeletions, pendingPhotoDeletions, thumbnailKey } from './photoStorage'
import { migrateRoomPhotos, photoFileIds } from './photos'
import { migrateRoomObjects } from './roomObjects'
import type { Project, Room } from './models'
import { generateId } from './domain'
import { ensureProjectMetadata } from './projectMetadata'
import { isMeasurementUnit } from './units'

export const SCHEMA_VERSION = 9
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
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2 && record.schemaVersion !== 3 && record.schemaVersion !== 4 && record.schemaVersion !== 5 && record.schemaVersion !== 6 && record.schemaVersion !== 7 && record.schemaVersion !== 8 && record.schemaVersion !== SCHEMA_VERSION) throw new Error('Esta versão dos dados locais não é compatível com a aplicação. Os projetos existentes foram preservados.')
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
    && room.walls.every(wall => entity(wall) && typeof wall.label === 'string' && number(wall.lengthM) && (wall.thickness === undefined || number(wall.thickness)) && (wall.wallType === undefined || ['masonry', 'drywall', 'concrete', 'glass', 'wood', 'partition', 'other'].includes(wall.wallType)) && (wall.customWallType === undefined || typeof wall.customWallType === 'string') && (!wall.sharedWallReference || typeof wall.sharedWallReference.roomId === 'string' && typeof wall.sharedWallReference.wallId === 'string' && (wall.sharedWallReference.placementSide===undefined || ['same','opposite'].includes(wall.sharedWallReference.placementSide))))
    && room.corners.every(corner => entity(corner) && strings(corner.wallIds) && number(corner.angleDegrees) && [null, 'assumed', 'informed', 'calculated'].includes(corner.angleSource))
    && room.diagonals.every(diagonal => entity(diagonal) && strings(diagonal.cornerIds) && number(diagonal.lengthM))
    && room.openings.every(opening => entity(opening) && typeof opening.label === 'string' && ['door', 'window', 'gap'].includes(opening.type) && typeof opening.wallId === 'string' && typeof opening.referenceCornerId === 'string' && [opening.widthM, opening.heightM, opening.sillHeightM, opening.offsetM].every(number))
    && room.internalWalls.every(wall => entity(wall) && typeof wall.label === 'string' && number(wall.lengthM) && number(wall.orientationDegrees) && !!wall.origin && (
      wall.origin.type === 'perimeter_wall' ? typeof wall.origin.wallId === 'string' && typeof wall.origin.referenceCornerId === 'string' && number(wall.origin.distanceM)
      : wall.origin.type === 'internal_wall' ? typeof wall.origin.internalWallId === 'string' && ['start', 'end'].includes(wall.origin.referenceEndpoint) && number(wall.origin.distanceM)
      : wall.origin.type === 'free' && !!wall.origin.position && typeof wall.origin.position.xM === 'number' && typeof wall.origin.position.yM === 'number'))
    && (room.wallMeasurementFace===undefined || ['internal','external'].includes(room.wallMeasurementFace))
    && (room.structuralCounters===undefined || counter(room.structuralCounters.column) && counter(room.structuralCounters.beam))
    && (room.objectCounter === undefined || counter(room.objectCounter))
    && (room.objects === undefined || Array.isArray(room.objects) && room.objects.every(object => entity(object) && typeof object.displayId === 'string' && object.roomId === room.id && typeof object.name === 'string' && (object.technicalItemKey===undefined || typeof object.technicalItemKey==='string') && ['furniture', 'equipment', 'object', 'other', 'structural'].includes(object.category) && ['rectangle', 'circle', 'line'].includes(object.shape) && !!object.dimensions && typeof object.dimensions === 'object' && ['widthM', 'depthM', 'diameterM', 'lengthM','heightM','webM','flangeM'].every(key => object.dimensions[key as keyof typeof object.dimensions] === undefined || number(object.dimensions[key as keyof typeof object.dimensions])) && !!object.position && number(object.position.xM) && number(object.position.yM) && number(object.rotationDegrees) && (object.structuralKind===undefined || ['column','beam'].includes(object.structuralKind)) && (object.profile===undefined || ['square','rectangular','circular','I','H','T','L','U/C','tubular','custom'].includes(object.profile)) && (object.material===undefined || ['cast_concrete','precast_concrete','steel','wood','structural_masonry','other'].includes(object.material)) && ['customProfile','customMaterial','attachedWallId'].every(key=>object[key as 'customProfile']===undefined || typeof object[key as 'customProfile']==='string') && (object.followWallAngle===undefined || typeof object.followWallAngle==='boolean') && (object.offset===undefined || number(object.offset)) && (object.alongWallM===undefined || number(object.alongWallM)) && (object.note === undefined || typeof object.note === 'string')))
    && (room.photos === undefined || Array.isArray(room.photos) && room.photos.every(photo => entity(photo) && typeof photo.originalFileName === 'string' && typeof photo.createdAt === 'string' && photo.roomId === room.id && typeof photo.fileId === 'string' && typeof photo.mimeType === 'string' && typeof photo.size === 'number' && photo.size >= 0 && Array.isArray(photo.tags) && photo.tags.every(tag => typeof tag === 'string') && (photo.note === undefined || typeof photo.note === 'string') && (photo.linkedEntityId === undefined || typeof photo.linkedEntityId === 'string') && (photo.linkedEntityType === undefined || ['technical_item', 'room', 'wall', 'door', 'window', 'gap', 'internal_wall', 'room_object'].includes(photo.linkedEntityType))))
    && room.pendingItems.every(item => entity(item) && typeof item.description === 'string' && typeof item.resolved === 'boolean')
    && room.subrooms.every(roomValid)
  const data = record.data
  if (typeof record.revision !== 'string' || typeof record.savedAt !== 'string' || !data || !Array.isArray(data.projects) || !data.projects.length || !['projectId', 'floorId', 'roomId'].every(key => typeof data[key as keyof WorkspaceData] === 'string') || !data.projects.every(project => project && checksValid(project.generalChecks) && typeof project.id === 'string' && typeof project.name === 'string' && Array.isArray(project.relationships) && Array.isArray(project.floors) && project.floors.every(floor => floor && typeof floor.id === 'string' && typeof floor.name === 'string' && Array.isArray(floor.rooms) && floor.rooms.every(roomValid)))) throw new Error('Os dados locais estão incompletos. Não foram sobrescritos.')
  if (!data.projects.every(project => project.relationships.every(relation => entity(relation) && typeof relation.sourceRoomId === 'string' && typeof relation.targetRoomId === 'string' && ['opening_connection', 'shared_wall', 'adjacency', 'manual_reference', 'corner'].includes(relation.type)))) throw new Error('As relações locais estão incompletas. Os dados existentes foram preservados.')
  if (!data.projects.every(project => (project.measurementUnit === undefined || isMeasurementUnit(project.measurementUnit)) && (project.roomDisplayCounter === undefined || counter(project.roomDisplayCounter)))) throw new Error('Configuração do projeto inválida. Os dados existentes foram preservados.')
  const roofPhotoValid=(photo:import('./models').Photo)=>entity(photo) && photo.roomId==='' && typeof photo.originalFileName==='string' && typeof photo.createdAt==='string' && typeof photo.fileId==='string' && typeof photo.mimeType==='string' && typeof photo.size==='number' && photo.size>=0 && Array.isArray(photo.tags) && photo.tags.every(tag=>typeof tag==='string') && (photo.note===undefined || typeof photo.note==='string') && (photo.linkedEntityType===undefined || photo.linkedEntityType==='roof') && (photo.linkedEntityId===undefined || typeof photo.linkedEntityId==='string') && (photo.roofId===undefined || typeof photo.roofId==='string')
  if(!data.projects.every(project=>(project.roofCounter===undefined || counter(project.roofCounter)) && (project.detachedRoofPhotos===undefined || Array.isArray(project.detachedRoofPhotos) && project.detachedRoofPhotos.every(photo=>roofPhotoValid(photo) && photo.roofId===undefined && photo.linkedEntityId===undefined)) && (project.roofs===undefined || Array.isArray(project.roofs) && project.roofs.every(roof=>entity(roof) && roof.projectId===project.id && typeof roof.displayId==='string' && typeof roof.name==='string' && (roof.floorId===undefined || typeof roof.floorId==='string') && ['rectangular','square'].includes(roof.shape) && number(roof.lengthM) && number(roof.widthM) && [1,2,3,4].includes(roof.waterCount) && checksValid(roof.checks) && (roof.note===undefined || typeof roof.note==='string') && Array.isArray(roof.waters) && roof.waters.every(water=>entity(water) && typeof water.displayId==='string' && typeof water.highSide==='string' && typeof water.lowSide==='string' && [water.highHeightM,water.lowHeightM,water.projectionM].every(number) && ['','north','east','south','west'].includes(water.direction) && checksValid(water.checks) && (water.inclinationPercent===undefined || number(water.inclinationPercent))) && (roof.photos===undefined || Array.isArray(roof.photos) && roof.photos.every(photo=>roofPhotoValid(photo) && photo.roofId===roof.id && photo.linkedEntityId===roof.id)))))) throw new Error('Dados de telhados inválidos. Os projetos existentes foram preservados.')
  if(!data.projects.every(project=>project.roomPlacements===undefined || Array.isArray(project.roomPlacements) && project.roomPlacements.every((p,index,list)=>p && typeof p.roomId==='string' && typeof p.floorId==='string' && (p.locked===undefined || typeof p.locked==='boolean') && [p.x,p.y,p.rotation].every(value=>typeof value==='number' && Number.isFinite(value)) && list.findIndex(other=>other.roomId===p.roomId)===index && project.floors.some(f=>f.id===p.floorId && (function contains(rooms:Room[]):boolean{return rooms.some(r=>r.id===p.roomId || contains(r.subrooms))})(f.rooms))))) throw new Error('Posições da Planta Geral inválidas. Os dados existentes foram preservados.')
  if(!data.projects.every(p=>p.openingCounters===undefined || !!p.openingCounters && ['door','window','gap'].every(key=>counter(p.openingCounters![key as keyof typeof p.openingCounters])))) throw new Error('Numeração de aberturas inválida. Os dados foram preservados.')
  if(!data.projects.every(p=>p.spatialConnections===undefined || Array.isArray(p.spatialConnections) && p.spatialConnections.every(c=>entity(c) && ['opening','corner','shared_wall','manual'].includes(c.type) && [c.a,c.b].every(side=>!!side && typeof side.roomId==='string' && (side.elementId===undefined || typeof side.elementId==='string') && (side.wallId===undefined || typeof side.wallId==='string') && (side.face===undefined || ['internal','external'].includes(side.face))) && ['assembly','flipped','assemblyLocked','assemblyDetached'].every(key=>c[key as 'assembly']===undefined||typeof c[key as 'assembly']==='boolean') && (c.orientation===undefined || ['normal','inverted'].includes(c.orientation)) && (c.placementMode===undefined || ['inside','outside'].includes(c.placementMode)) && (c.sharedWallId===undefined || typeof c.sharedWallId==='string')))) throw new Error('Conexões espaciais inválidas. Os dados foram preservados.')
  if(!data.projects.every(p=>(p.planPreferences===undefined || !!p.planPreferences && typeof p.planPreferences==='object' && !Array.isArray(p.planPreferences) && Object.values(p.planPreferences).every(v=>!!v && typeof v==='object' && (v.baseRoomId===undefined || typeof v.baseRoomId==='string') && ['snap','gridVisible'].every(key=>v[key as 'snap']===undefined || typeof v[key as 'snap']==='boolean') && (v.gridStepM===undefined || Number.isFinite(v.gridStepM) && v.gridStepM>0) && (v.visibility===undefined || !!v.visibility && typeof v.visibility==='object' && Object.values(v.visibility).every(x=>x===undefined || typeof x==='boolean')))) && (p.wallCompatibilities===undefined || Array.isArray(p.wallCompatibilities) && p.wallCompatibilities.every(c=>entity(c) && typeof c.connectionId==='string' && [c.a,c.b].every(s=>!!s && typeof s.roomId==='string' && typeof s.wallId==='string') && ['original','a','b','mean','manual'].includes(c.strategy) && (c.valueM===null || Number.isFinite(c.valueM) && c.valueM>0)))))throw new Error('Configurações de montagem inválidas. Os dados foram preservados.')
  if (record.schemaVersion < 8) return { ...record, schemaVersion: SCHEMA_VERSION, data: { ...data, projects: data.projects.map(project => { const migrated = ensureProjectMetadata(project); return omitUndefined(reconcileRelationships({ ...migrated, floors: migrated.floors.map(floor => ({ ...floor, rooms: floor.rooms.map(migrateRoomObjects).map(migrateRoomPhotos) })) })) }) } }
  return {...record,schemaVersion:SCHEMA_VERSION}
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

// JSON omits absent optional properties; keep migrated data in that same shape
// without serializing or normalizing original numeric measurements.
function omitUndefined<T>(value:T):T {
  if(Array.isArray(value))return value.map(omitUndefined) as T
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,omitUndefined(v)])) as T
  return value
}
