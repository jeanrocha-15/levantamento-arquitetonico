import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import ts from 'typescript'
const cache = new Map()
function moduleUrl(name) {
  if (cache.has(name)) return cache.get(name)
  let source = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  source = source.replace(/(['"])\.\/([^'"]+)\1/g, (_, quote, dependency) => JSON.stringify(moduleUrl(dependency)))
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  cache.set(name, url); return url
}
const { createRoom, id } = await import(moduleUrl('domain'))
const { getCorners } = await import(moduleUrl('corners'))
const { getWallReferences } = await import(moduleUrl('openings'))
const { roomChecklist, measurementTargets } = await import(moduleUrl('checklist'))
const { reconcileRelationships } = await import(moduleUrl('relationships'))
const { TECHNICAL_ITEMS } = await import(moduleUrl('technicalChecklist'))
const reviewedChecks=Object.fromEntries(TECHNICAL_ITEMS.filter(item=>!item.general).map(item=>[item.key,{status:'ok'}]))
const generalChecks=Object.fromEntries(TECHNICAL_ITEMS.filter(item=>item.general).map(item=>[item.key,{status:'na'}]))
const floorId = id()
const room = createRoom('Sala', floorId)
room.technicalChecks=reviewedChecks
room.ceilingHeightM = 2.8
room.walls = [4, 3, 4, 3].map((lengthM, i) => ({ id: id(), label: String.fromCharCode(65 + i), lengthM }))
room.corners = getCorners(room.walls, [])
const projectOf = r => ({ id: id(), name: 'Casa', generalChecks, floors: [{ id: floorId, name: 'Térreo', rooms: [r] }], relationships: [] })
const check = r => roomChecklist(r, projectOf(r))
assert.equal(check(room).completeness, 100)
assert.equal(check(room).complete, true)
const original = JSON.stringify(room)
const empty = createRoom('', floorId)
assert.deepEqual(roomChecklist(empty,{...projectOf(empty),generalChecks:{}}).issues.filter(item=>item.kind==='automatic').map(item => item.field), ['name', 'ceilingHeightM', 'geometry'])
assert.equal(roomChecklist(empty,{...projectOf(empty),generalChecks:{}}).completeness, 0)
const missing = { ...room, walls: room.walls.map((wall, i) => i === 2 ? { ...wall, lengthM: null } : wall) }
assert.ok(check(missing).issues.some(item => item.elementId === room.walls[2].id && item.field === 'lengthM'))
assert.equal(check(missing).checks.find(item=>item.key==='geometry').completed,true,'Comprimento ausente não duplica a obrigação dos ângulos')
assert.equal(check({ ...room, walls: room.walls.map((wall, i) => i === 2 ? { ...wall, lengthM: 3.8 } : wall) }).issues.some(item => item.description.startsWith('Grande divergência')), true)
const opening = { id: id(), type: 'door', label: 'P01', wallId: room.walls[0].id, referenceCornerId: getWallReferences(room.walls, room.corners, room.walls[0].id)[0].id, widthM: .8, heightM: 2.1, sillHeightM: null, offsetM: 0, doorKind: 'hinged', swing: 'inward', hinge: 'right' }
assert.equal(check({ ...room, openings: [opening] }).complete, true)
// Porta sem sentido de abertura: pendência própria (aviso, não bloqueia e entra na conferência das aberturas).
const unknownSwing = check({ ...room, openings: [{ ...opening, swing: undefined, hinge: undefined }] })
assert.ok(unknownSwing.issues.some(item => item.elementId === opening.id && item.field === 'doorKind' && item.description === 'P01: sentido de abertura não informado.'))
assert.ok(unknownSwing.completeness < 100)
assert.equal(check({ ...room, openings: [{ ...opening, doorKind: 'sliding', slideDirection: 'left' }] }).complete, true)
const incompleteDoor = { ...opening, widthM: null, heightM: 0, offsetM: null, referenceCornerId: '' }
assert.deepEqual(check({ ...room, openings: [incompleteDoor] }).issues.map(item => item.field), ['widthM', 'heightM', 'offsetM', 'referenceCornerId'])
const window = { ...opening, type: 'window', label: 'J01' }
assert.equal(check({ ...room, openings: [window] }).issues[0].field, 'sillHeightM')
assert.equal(check({ ...room, openings: [{ ...window, sillHeightM: 0 }] }).complete, true)
assert.ok(check({ ...room, openings: [{ ...opening, offsetM: 10 }] }).issues.some(item => item.description.includes('limite')))
const internal = { id: id(), label: 'PI01', origin: { type: 'perimeter_wall', wallId: room.walls[0].id, referenceCornerId: opening.referenceCornerId, distanceM: 1 }, lengthM: 1, orientationDegrees: 90 }
assert.equal(check({ ...room, internalWalls: [internal] }).complete, true)
assert.deepEqual(check({ ...room, internalWalls: [{ ...internal, lengthM: null, origin: { ...internal.origin, wallId: '', referenceCornerId: '', distanceM: null }, orientationDegrees: null }] }).issues.map(item => item.field), ['lengthM', 'origin', 'distanceM', 'orientationDegrees'])
const diagonal = { id: id(), cornerIds: [room.corners[0].id, room.corners[2].id], lengthM: 5, source: 'measured' }
assert.equal(check({ ...room, diagonals: [diagonal] }).complete, true)
assert.deepEqual(check({ ...room, diagonals: [{ ...diagonal, cornerIds: ['', ''], lengthM: NaN }] }).issues.map(item => item.field), ['lengthM', 'cornerIds'])
const flag = { id: id(), description: 'Parede C: Medida duvidosa', kind: 'manual', reason: 'doubtful', elementId: room.walls[2].id, field: 'lengthM', note: 'Conferir após remover armário', resolved: false }
const flagged = { ...room, pendingItems: [flag] }
assert.ok(check(flagged).completeness < 100)
assert.equal(check(flagged).complete, false)
assert.equal(check(flagged).issues[0].note, flag.note)
assert.equal(check({ ...flagged, pendingItems: [{ ...flag, resolved: true }] }).complete, true)
assert.ok(measurementTargets({ ...room, openings: [window], internalWalls: [internal], diagonals: [diagonal] }).some(item => item.field === 'sillHeightM'))
const orphan = { ...opening, connectedRoomId: 'deleted-room', connectedOpeningId: 'deleted-opening' }
let project = projectOf({ ...room, openings: [orphan] })
assert.equal(roomChecklist(project.floors[0].rooms[0], project).issues[0].kind, 'technical')
project = reconcileRelationships(project)
let cleaned = project.floors[0].rooms[0]
assert.equal(cleaned.openings[0].connectedRoomId, undefined)
assert.equal(cleaned.pendingItems.length, 1)
assert.equal(roomChecklist(cleaned, project).issues[0].kind, 'technical')
project = reconcileRelationships(project)
assert.equal(project.floors[0].rooms[0].pendingItems.length, 1, 'Avisos técnicos não duplicam em edições seguintes')
project.floors[0].rooms[0].pendingItems[0].resolved = true
assert.equal(roomChecklist(project.floors[0].rooms[0], project).complete, true)
const child = createRoom('Banheiro', floorId, room.id)
const independent = { ...room, subrooms: [child] }
assert.equal(check(independent).complete, true, 'Pendências dos filhos não entram no checklist do pai')
assert.equal(JSON.stringify(room), original, 'Checklist nunca altera medidas ou dados originais')
const linked = { ...room, walls: room.walls.map((wall, i) => i === 0 ? { ...wall, sharedWallReference: { roomId: 'missing', wallId: 'missing' } } : wall) }
assert.ok(check(linked).issues.some(item => item.kind === 'technical' && item.description.includes('compartilhada')))
const invalidRecord = projectOf({ ...room, subrooms: [child] })
invalidRecord.relationships = [{ id: id(), type: 'opening_connection', sourceRoomId: room.id, sourceElementId: room.walls[0].id, targetRoomId: child.id }]
assert.ok(roomChecklist(invalidRecord.floors[0].rooms[0], invalidRecord).issues.some(item => item.kind === 'technical'))
const sanitized = reconcileRelationships(invalidRecord)
assert.equal(sanitized.relationships.length, 0)
assert.equal(sanitized.floors[0].rooms[0].pendingItems[0].kind, 'technical')
console.log('Checklist: campos obrigatórios, completude, flags, avisos técnicos, resolução, isolamento e preservação OK.')
