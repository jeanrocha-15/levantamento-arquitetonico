import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import assert from 'node:assert/strict'
import { moduleUrl } from './load.mjs'
const { createRoom, generateId, updateRoom, wallLabel } = await import(moduleUrl('domain'))
const { getCorners } = await import(moduleUrl('corners'))
const { buildPerimeter } = await import(moduleUrl('geometry'))
const { buildOpeningLayout } = await import(moduleUrl('openings'))
const { buildInternalWallLayout, fitInternalWallsSketch } = await import(moduleUrl('internalWalls'))
const { getSketchLabelLayout } = await import(moduleUrl('sketchLabels'))
const { roomChecklist } = await import(moduleUrl('checklist'))
const { buildRoomGeometry } = await import(moduleUrl('roomGeometry'))
const { reconcileRelationships, removeRoom } = await import(moduleUrl('relationships'))
const { removePerimeterWall } = await import(moduleUrl('deletions'))
const storage = await import(moduleUrl('storage'))
const { Autosave } = await import(moduleUrl('autosave'))
const { default: Sketch } = await import(moduleUrl('Sketch'))
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } return value }
function rectangle(name, floorId) {
  const room = createRoom(name, floorId)
  room.ceilingHeightM = 2.8123456789
  room.walls = [4.123456789, 3, 4.123456789, 3].map((lengthM, i) => ({ id: generateId(), label: wallLabel(i), lengthM }))
  room.corners = getCorners(room.walls, [])
  return room
}
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
const originalCrypto = globalThis.crypto
const indexedDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const memory = new Map()
try {
  // All entities, relationship IDs and snapshot revisions use the HTTP-compatible fallback.
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto) } })
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) } })
  const floorId = generateId(), sala = rectangle('Sala', floorId), kitchen = rectangle('Cozinha', floorId), child = rectangle('Banheiro', floorId)
  child.parentRoomId = sala.id; sala.subrooms = [child]
  const opening = (room, type, label, offsetM) => ({ id: generateId(), label, type, wallId: room.walls[0].id, referenceCornerId: room.corners[3].id, widthM: .8123456789, heightM: 2.1123456789, sillHeightM: type === 'window' ? 1.1123456789 : null, offsetM })
  kitchen.openings = [opening(kitchen, 'door', 'P01', .1), opening(kitchen, 'door', 'P02', 1.1)]
  sala.openings = [opening(sala, 'door', 'P01', .01), opening(sala, 'window', 'J01', 1.1), opening(sala, 'gap', 'V01', 2.2)]
  sala.openings[0].connectedRoomId = kitchen.id; sala.openings[0].connectedOpeningId = kitchen.openings[1].id
  sala.walls[2].sharedWallReference = { roomId: kitchen.id, wallId: kitchen.walls[0].id }
  sala.corners[0] = { ...sala.corners[0], angleDegrees: 82.123456789, angleSource: 'informed' }
  sala.diagonals = [{ id: generateId(), cornerIds: [sala.corners[0].id, sala.corners[2].id], lengthM: 5.18123456789, source: 'measured' }]
  sala.internalWalls = [{ id: generateId(), label: 'PI01', origin: { type: 'perimeter_wall', wallId: sala.walls[0].id, referenceCornerId: sala.corners[3].id, distanceM: 2.123456789 }, lengthM: 1.0123456789, orientationDegrees: 90, thicknessM: .15123456789, heightM: 2.7123456789 }]
  sala.pendingItems = ['check_on_site', 'doubtful'].map(reason => ({ id: generateId(), kind: 'manual', reason, elementId: sala.walls[2].id, field: 'lengthM', description: reason, resolved: false }))
  const original = { id: generateId(), name: 'Revisão', floors: [{ id: floorId, name: 'Térreo', rooms: [sala, kitchen] }], relationships: [] }
  const before = structuredClone(original)
  freeze(original)
  const project = reconcileRelationships(original)
  const geometry = buildPerimeter(sala.walls, sala.corners, sala.diagonals)
  const openings = buildOpeningLayout(geometry, sala.walls, sala.corners, sala.openings)
  assert.equal(openings.placements.length, 3)
  const internal = buildInternalWallLayout(geometry, sala.walls, sala.corners, sala.internalWalls)
  getSketchLabelLayout(fitInternalWallsSketch(geometry, internal.placements))
  const svg = renderToStaticMarkup(React.createElement(Sketch, { room: sala, survey: buildRoomGeometry(sala) }))
  for (const element of ['Porta P01', 'Janela J01', 'Vão V01', 'Parede interna PI01', 'Diagonal medida', 'viewBox="0 0 440 340"']) assert.ok(svg.includes(element), element)
  const withoutA = removePerimeterWall(sala, sala.walls[0].id)
  const removedSvg = renderToStaticMarkup(React.createElement(Sketch, { room: withoutA, survey: buildRoomGeometry(withoutA) }))
  assert.ok(removedSvg.includes('Entrada principal · B'), 'Entrada acompanha primeira parede sobrevivente')
  assert.ok(!removedSvg.includes('Entrada principal · A'))
  roomChecklist(sala, project)
  const shared = buildRoomGeometry(sala)
  const { project: sharedProjection, ...sharedValues } = shared.perimeter
  const { project: independentProjection, ...independentValues } = geometry
  assert.deepEqual(sharedValues, independentValues)
  geometry.segments.forEach(segment => assert.deepEqual(sharedProjection(segment.end), independentProjection(segment.end)))
  assert.deepEqual(roomChecklist(sala, project, shared), roomChecklist(sala, project), 'Compartilhar geometria mantém os mesmos avisos e completude')
  removePerimeterWall(sala, sala.walls[0].id)
  assert.deepEqual(original, before, 'Nenhuma operação derivada/de exclusão muta dados originais congelados')
  assert.deepEqual(project.floors[0].rooms[0].walls.map(w => w.lengthM), sala.walls.map(w => w.lengthM))
  const relationIds = project.relationships.map(r => r.id)
  const renamed = reconcileRelationships({ ...project, floors: [{ ...project.floors[0], rooms: updateRoom(project.floors[0].rooms, kitchen.id, room => ({ ...room, name: 'Cozinha Principal' })) }] })
  assert.deepEqual(renamed.relationships.map(r => r.id), relationIds)
  const snapshot = storage.createSnapshot({ projects: [renamed], projectId: project.id, floorId, roomId: sala.id })
  for (const key of ['walls', 'corners', 'openings', 'diagonals', 'internalWalls', 'pendingItems']) {
    const broken = structuredClone(snapshot)
    broken.data.projects[0].floors[0].rooms[0][key].push(null)
    assert.throws(() => storage.readSnapshot(broken), /incompletos/, `${key}: forma inválida detectada antes de renderizar`)
  }
  await storage.saveWorkspace(snapshot)
  assert.deepEqual(await storage.loadWorkspace(), storage.decodeSnapshot(storage.encodeSnapshot(snapshot)))
  const stale = { ...snapshot, revision: generateId(), savedAt: '2000-01-01T00:00:00.000Z' }
  storage.writeJournal(stale)
  assert.equal((await storage.loadWorkspace()).revision, snapshot.revision, 'Journal antigo não substitui gravação mais recente no fallback')
  const latest = { ...snapshot, revision: generateId(), savedAt: '2099-01-01T00:00:00.000Z' }
  storage.writeJournal(latest)
  assert.equal((await storage.loadWorkspace()).revision, latest.revision)
  storage.clearJournal(snapshot)
  assert.equal((await storage.loadWorkspace()).revision, latest.revision, 'Limpar revisão antiga preserva edição recente')
  const removed = reconcileRelationships({ ...renamed, floors: [{ ...renamed.floors[0], rooms: removeRoom(renamed.floors[0].rooms, kitchen.id) }] })
  assert.equal(removed.relationships.length, 0)
  assert.equal(removed.floors[0].rooms[0].openings[0].connectedRoomId, undefined)
  assert.equal(removed.floors[0].rooms[0].walls[2].sharedWallReference, undefined)
  assert.equal(removed.floors[0].rooms[0].subrooms[0].walls.length, 4)
  assert.equal(buildPerimeter(child.walls, child.corners).segments.length, 4)
  const unchanged = updateRoom(project.floors[0].rooms, 'missing', room => room)
  assert.equal(unchanged, project.floors[0].rooms)
  const updated = updateRoom(project.floors[0].rooms, child.id, room => ({ ...room, name: 'Banheiro revisado' }))
  assert.equal(updated[1], project.floors[0].rooms[1], 'Edição de subambiente preserva identidade de ambientes não afetados')
  // Simultaneous pagehide/visibilitychange/manual flush must not spin on a permanent failure.
  let attempts = 0, release, status, failure = true
  const saver = new Autosave({ journal: () => {}, clearJournal: () => {}, onStatus: next => { status = next }, save: async () => { attempts++; if (attempts === 1) await new Promise(resolve => { release = resolve }); if (failure) throw new Error('Falha simulada') } })
  saver.schedule(snapshot)
  const first = saver.flush(), second = saver.flush()
  release()
  await Promise.all([first, second])
  assert.equal(attempts, 1); assert.equal(status, 'error')
  failure = false; await saver.flush()
  assert.equal(attempts, 2); assert.equal(status, 'saved')
  saver.dispose()
  console.log('Estabilização: dados congelados/precisão, hierarquia, fallback com entidades/vínculos, exclusão, journal recente e falhas concorrentes sem loop OK.')
} finally {
  Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
  for (const [key, descriptor] of [['indexedDB', indexedDescriptor], ['localStorage', localDescriptor]]) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
}
