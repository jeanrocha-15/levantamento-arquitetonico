import assert from 'node:assert/strict'
import { moduleUrl } from './load.mjs'
const { createRoom, id, wallLabel } = await import(moduleUrl('domain'))
const { getCorners } = await import(moduleUrl('corners'))
const { removePerimeterWall, nextWallIndex } = await import(moduleUrl('deletions'))
const { reconcileRelationships } = await import(moduleUrl('relationships'))
const { createSnapshot, encodeSnapshot, decodeSnapshot, readSnapshot, restoreNavigation, SCHEMA_VERSION } = await import(moduleUrl('storage'))
const { Autosave, AUTOSAVE_DELAY_MS } = await import(moduleUrl('autosave'))
const floorId = id(), projectId = id()
const sala = createRoom('Sala', floorId), kitchen = createRoom('Cozinha', floorId), child = createRoom('Banheiro', floorId, sala.id)
delete sala.parentRoomId; delete kitchen.parentRoomId
sala.subrooms = [child]
for (const room of [sala, kitchen, child]) {
  room.walls = [4.123456789, 3, 4.123456789, 3].map((lengthM, index) => ({ id: id(), label: wallLabel(index), lengthM }))
  room.corners = getCorners(room.walls, [])
  room.ceilingHeightM = 2.8123456789
}
sala.corners[0] = { ...sala.corners[0], angleDegrees: 82.123456789, angleSource: 'informed' }
const opening = (room, label) => ({ id: id(), label, type: 'door', wallId: room.walls[0].id, referenceCornerId: room.corners[3].id, widthM: .8123456789, heightM: 2.1, offsetM: .323456789, sillHeightM: null })
kitchen.openings = [opening(kitchen, 'P02')]
sala.openings = [{ ...opening(sala, 'P01'), connectedRoomId: kitchen.id, connectedOpeningId: kitchen.openings[0].id }]
sala.walls[2].sharedWallReference = { roomId: kitchen.id, wallId: kitchen.walls[0].id }
sala.diagonals = [{ id: id(), cornerIds: [sala.corners[0].id, sala.corners[2].id], lengthM: 5.18123456789, source: 'measured' }]
sala.internalWalls = [{ id: id(), label: 'PI01', origin: { type: 'perimeter_wall', wallId: sala.walls[0].id, referenceCornerId: sala.corners[3].id, distanceM: 2.123456789 }, lengthM: 1.0123456789, orientationDegrees: 45.123456789, thicknessM: .15, heightM: 2.7, note: 'Manter medida original' }]
sala.internalWallCounter = 1
sala.pendingItems = [{ id: id(), description: 'Conferir no local', kind: 'manual', reason: 'check_on_site', elementId: sala.walls[0].id, field: 'lengthM', note: 'Conferir', resolved: false }]
let project = reconcileRelationships({ id: projectId, name: 'Casa', floors: [{ id: floorId, name: 'Térreo', rooms: [sala, kitchen] }], relationships: [] })
// The JSON journal omits absent optional properties; no field containing an actual measure changes.
const canonicalProject = JSON.parse(JSON.stringify(project))
const data = { projects: [canonicalProject], projectId, floorId, roomId: sala.id }
const snapshot = createSnapshot(data), before = structuredClone(snapshot)
const decoded = decodeSnapshot(encodeSnapshot(snapshot))
assert.deepEqual(decoded, snapshot)
assert.deepEqual(snapshot, before)
const restoredNavigation = restoreNavigation({ ...data, projectId: 'deleted', floorId: 'deleted', roomId: 'deleted' })
assert.equal(restoredNavigation.projectId, projectId)
assert.deepEqual(restoredNavigation.projects, data.projects, 'Recuperar navegação nunca altera entidades ou medidas')
assert.equal(decoded.schemaVersion, SCHEMA_VERSION)
assert.equal(decoded.data.projects[0].floors[0].rooms[0].openings[0].connectedOpeningId, kitchen.openings[0].id)
decoded.data.projects[0].floors[0].rooms[1].name = 'Cozinha Principal'
assert.equal(decoded.data.projects[0].floors[0].rooms[0].openings[0].connectedRoomId, kitchen.id)
assert.throws(() => readSnapshot({ ...snapshot, schemaVersion: 999 }), /compatível/)
assert.throws(() => readSnapshot({ ...snapshot, data: { ...data, projects: [] } }), /incompletos/)
const nonfinite = structuredClone(snapshot)
nonfinite.data.projects[0].floors[0].rooms[0].walls[0].lengthM = NaN
nonfinite.data.projects[0].floors[0].rooms[0].walls[1].lengthM = Infinity
nonfinite.data.projects[0].floors[0].rooms[0].walls[2].lengthM = -Infinity
nonfinite.data.projects[0].floors[0].rooms[0].walls[3].lengthM = -0
assert.deepEqual(decodeSnapshot(encodeSnapshot(nonfinite)), nonfinite)
let writes = [], journal, statuses = []
const dependencies = { save: async value => { writes.push(structuredClone(value)) }, journal: value => { journal = encodeSnapshot(value) }, clearJournal: value => { if (journal && decodeSnapshot(journal).revision === value.revision) journal = undefined }, onStatus: value => statuses.push(value) }
const autosave = new Autosave(dependencies)
autosave.schedule(snapshot)
const latest = createSnapshot({ ...data, roomId: child.id })
autosave.schedule(createSnapshot(data)); autosave.schedule(latest)
assert.equal(writes.length, 0)
assert.deepEqual(decodeSnapshot(journal), latest, 'Última edição protegida antes de finalizar o debounce')
await new Promise(resolve => setTimeout(resolve, AUTOSAVE_DELAY_MS + 50))
assert.equal(writes.length, 1)
assert.deepEqual(writes[0], latest)
assert.equal(journal, undefined)
assert.equal(statuses.at(-1), 'saved')
autosave.dispose()
let release, started = false
writes = []
const ordered = new Autosave({ ...dependencies, save: async value => { if (!started) { started = true; await new Promise(resolve => { release = resolve }) } writes.push(value.revision) } })
ordered.schedule(snapshot)
const firstFlush = ordered.flush()
ordered.schedule(latest)
assert.equal(decodeSnapshot(journal).revision, latest.revision)
const secondFlush = ordered.flush()
release(); await Promise.all([firstFlush, secondFlush])
assert.deepEqual(writes, [snapshot.revision, latest.revision], 'Gravações são sequenciais; uma antiga não vence a mais recente')
ordered.dispose()
let fail = true
const retries = new Autosave({ ...dependencies, save: async value => { if (fail) throw new Error('Disco indisponível'); writes.push(value.revision) } })
retries.schedule(snapshot); await retries.flush()
assert.equal(statuses.at(-1), 'error')
assert.equal(decodeSnapshot(journal).revision, snapshot.revision)
fail = false; await retries.flush()
assert.equal(statuses.at(-1), 'saved')
assert.equal(journal, undefined)
retries.dispose()
const removed = removePerimeterWall(project.floors[0].rooms[0], sala.walls[0].id)
assert.equal(removed.openings[0].wallId, '')
assert.equal(removed.openings[0].widthM, sala.openings[0].widthM)
assert.equal(removed.internalWalls[0].origin.wallId, '')
assert.equal(removed.internalWalls[0].lengthM, sala.internalWalls[0].lengthM)
assert.equal(removed.diagonals[0].lengthM, sala.diagonals[0].lengthM)
assert.ok(removed.corners.every(corner => !corner.wallIds.includes(sala.walls[0].id)))
assert.ok(removed.diagonals[0].cornerIds.every(cornerId => !cornerId || removed.corners.some(corner => corner.id === cornerId)))
assert.equal(wallLabel(nextWallIndex(removed)), 'A')
project = { ...project, floors: project.floors.map(floor => ({ ...floor, rooms: floor.rooms.map(room => room.id === kitchen.id ? removePerimeterWall(room, kitchen.walls[0].id) : room) })) }
project = reconcileRelationships(project)
assert.equal(project.floors[0].rooms[0].walls[2].sharedWallReference, undefined)
assert.ok(project.floors[0].rooms[0].pendingItems.some(item => item.kind === 'technical'))
console.log('Persistência: estrutura completa, precisão, IDs/vínculos, versão, journal, debounce, ordem, falha/retry e exclusões OK.')
