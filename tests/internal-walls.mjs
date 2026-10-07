import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { moduleUrl } from './load.mjs'
const { getCorners } = await import(moduleUrl('corners'))
const { buildPerimeter } = await import(moduleUrl('geometry'))
const { getWallReferences, buildOpeningLayout } = await import(moduleUrl('openings'))
const { internalWallLabel, buildInternalWallLayout, fitInternalWallsSketch, placeInternalWallLabels } = await import(moduleUrl('internalWalls'))
const { getSketchLabelReservations } = await import(moduleUrl('sketchLabels'))
const { createRoom, id, updateRoom, findRoom } = await import(moduleUrl('domain'))
const almost = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`)
const walls = [2, 4, 2, 4].map((lengthM, index) => ({ id: id(), label: String.fromCharCode(65 + index), lengthM }))
const corners = getCorners(walls, [])
const perimeter = buildPerimeter(walls, corners)
const references = getWallReferences(walls, corners, walls[1].id)
const pi = { id: id(), label: 'PI01', origin: { type: 'perimeter_wall', wallId: walls[1].id, referenceCornerId: references[0].id, distanceM: 2 }, lengthM: 1, orientationDegrees: 90, thicknessM: 0.15, heightM: 2.5, note: 'Parede da casa de gás' }
const sourceSnapshot = JSON.stringify({ walls, corners, pi })
const perimeterSnapshot = JSON.stringify(perimeter)
const layout = buildInternalWallLayout(perimeter, walls, corners, [pi])
assert.equal(layout.placements.length, 1)
assert.equal(layout.checks[0].messages.length, 0)
assert.deepEqual(layout.placements[0].start, { x: 2, y: 2 })
assert.deepEqual(layout.placements[0].end, { x: 1, y: 2 })
assert.equal(JSON.stringify({ walls, corners, pi }), sourceSnapshot)
assert.equal(JSON.stringify(perimeter), perimeterSnapshot)
assert.equal(perimeter.closed, true)
assert.deepEqual(perimeter.segments.map(segment => segment.wall.label), ['A', 'B', 'C', 'D'])
assert.equal(fitInternalWallsSketch(perimeter, layout.placements), perimeter, 'PI dentro do enquadramento mantém a projeção anterior')
const fromEnd = buildInternalWallLayout(perimeter, walls, corners, [{ ...pi, origin: { ...pi.origin, referenceCornerId: references[1].id } }])
assert.deepEqual(fromEnd.placements[0].start, layout.placements[0].start)
assert.deepEqual(fromEnd.placements[0].end, layout.placements[0].end, 'O canto da distância não inverte a orientação')

for (const orientationDegrees of [0, 45, 82, 90, 180, 270, 360]) {
  const angled = buildInternalWallLayout(perimeter, walls, corners, [{ ...pi, orientationDegrees }]).placements[0]
  almost(Math.hypot(angled.end.x - angled.start.x, angled.end.y - angled.start.y), 1)
  const direction = perimeter.segments[1].direction
  almost(direction.x * angled.direction.x + direction.y * angled.direction.y, Math.cos(orientationDegrees * Math.PI / 180))
}
const angledCorners = corners.map((corner, index) => ({ ...corner, angleDegrees: index === 0 ? 82 : 90, angleSource: 'informed' }))
const angledPerimeter = buildPerimeter(walls, angledCorners)
const angledLayout = buildInternalWallLayout(angledPerimeter, walls, angledCorners, [pi]).placements[0]
almost(Math.hypot(angledLayout.start.x - angledPerimeter.segments[1].start.x, angledLayout.start.y - angledPerimeter.segments[1].start.y), 2)
almost(angledPerimeter.segments[1].direction.x * angledLayout.direction.x + angledPerimeter.segments[1].direction.y * angledLayout.direction.y, 0)
const diagonal = { id: id(), source: 'measured', cornerIds: [corners[0].id, corners[2].id], lengthM: 4.6 }
const calculatedPerimeter = buildPerimeter(walls, corners, [diagonal])
const calculatedPi = buildInternalWallLayout(calculatedPerimeter, walls, corners, [pi]).placements[0]
almost(calculatedPi.direction.x * calculatedPerimeter.segments[1].direction.x + calculatedPi.direction.y * calculatedPerimeter.segments[1].direction.y, 0)

for (const changes of [{ lengthM: null }, { lengthM: -1 }, { orientationDegrees: null }, { orientationDegrees: -1 }, { orientationDegrees: 361 }, { orientationDegrees: NaN }]) {
  const invalid = buildInternalWallLayout(perimeter, walls, corners, [{ ...pi, ...changes }])
  assert.equal(invalid.placements.length, 0)
  assert.ok(invalid.checks[0].messages.length > 0)
}
for (const originChanges of [{ distanceM: null }, { distanceM: -1 }, { distanceM: 4.1 }, { wallId: 'missing' }, { referenceCornerId: 'missing' }]) {
  const invalid = buildInternalWallLayout(perimeter, walls, corners, [{ ...pi, origin: { ...pi.origin, ...originChanges } }])
  assert.equal(invalid.placements.length, 0)
  assert.ok(invalid.checks[0].messages.length > 0)
}
assert.equal(buildInternalWallLayout(perimeter, walls, corners, [{ ...pi, origin: { ...pi.origin, distanceM: 0 } }]).placements.length, 1)
const optionalInvalid = buildInternalWallLayout(perimeter, walls, corners, [{ ...pi, thicknessM: -1, heightM: 0 }])
assert.equal(optionalInvalid.placements.length, 1)
assert.equal(optionalInvalid.checks[0].messages.length, 2)
const unmeasured = walls.map(wall => ({ ...wall, lengthM: null }))
assert.equal(buildInternalWallLayout(buildPerimeter(unmeasured), unmeasured, corners, [pi]).placements.length, 0)
for (const origin of [{ type: 'free', position: { xM: 1, yM: 2 } }, { type: 'internal_wall', internalWallId: id(), referenceEndpoint: 'end', distanceM: 0 }]) {
  const future = { ...pi, origin }
  const snapshot = JSON.stringify(future)
  assert.equal(buildInternalWallLayout(perimeter, walls, corners, [future]).placements.length, 0)
  assert.equal(JSON.stringify(future), snapshot)
}

const longPi = { ...pi, lengthM: 5 }
const longLayout = buildInternalWallLayout(perimeter, walls, corners, [longPi])
assert.deepEqual(longLayout.placements[0].end, { x: -3, y: 2 })
const fitted = fitInternalWallsSketch(perimeter, longLayout.placements)
assert.ok(fitted.scale <= perimeter.scale)
assert.notEqual(fitted, perimeter, 'O enquadramento pode apenas recentralizar, quando a escala já comporta a PI')
assert.equal(fitted.segments, perimeter.segments)
assert.equal(fitted.corners, perimeter.corners)
assert.equal(fitted.closed, perimeter.closed)
assert.equal(fitted.closureM, perimeter.closureM)
for (const placement of longLayout.placements) for (const point of [placement.start, placement.end]) {
  const screen = fitted.project(point)
  assert.ok(screen.x >= 80 && screen.x <= 360 && screen.y >= 85 && screen.y <= 265)
}
almost(Math.hypot(longLayout.placements[0].end.x - longLayout.placements[0].start.x, longLayout.placements[0].end.y - longLayout.placements[0].start.y), 5)
const opening = { id: id(), label: 'P01', type: 'door', wallId: walls[0].id, referenceCornerId: getWallReferences(walls, corners, walls[0].id)[0].id, offsetM: 0.32, widthM: 0.8, heightM: 2.1, sillHeightM: null }
assert.deepEqual(buildOpeningLayout(fitted, walls, corners, [opening]), buildOpeningLayout(perimeter, walls, corners, [opening]), 'PI não altera recortes ou posições das aberturas')
const labels = placeInternalWallLabels(layout.placements, perimeter.project, getSketchLabelReservations(perimeter, true))
assert.ok(labels[0].box.x >= 0 && labels[0].box.x + labels[0].box.width <= 440)
assert.ok(labels[0].box.y >= 0 && labels[0].box.y + labels[0].box.height <= 340)

const room = createRoom('Casa de gás'), otherRoom = createRoom('Cozinha')
room.walls = walls
room.corners = corners
room.openings = [{ ...opening, connectedRoomId: otherRoom.id, connectedOpeningId: id() }]
room.internalWalls = [pi]
room.internalWallCounter = 1
room.walls[0] = { ...walls[0], sharedWallReference: { roomId: otherRoom.id, wallId: id() } }
const relationship = { id: id(), sourceRoomId: room.id, sourceElementId: pi.id, targetRoomId: otherRoom.id, type: 'manual_reference' }
const idsBeforeRename = { room: room.id, wall: room.walls[0].id, corner: room.corners[0].id, opening: room.openings[0].id, internalWall: pi.id }
const renamed = findRoom(updateRoom([room], room.id, item => ({ ...item, name: 'Casa de gás renomeada' })), room.id)
assert.deepEqual({ room: renamed.id, wall: renamed.walls[0].id, corner: renamed.corners[0].id, opening: renamed.openings[0].id, internalWall: renamed.internalWalls[0].id }, idsBeforeRename)
assert.equal(relationship.sourceRoomId, renamed.id)
assert.equal(relationship.sourceElementId, renamed.internalWalls[0].id)
assert.equal(renamed.openings[0].connectedRoomId, otherRoom.id)
assert.deepEqual(renamed.walls[0].sharedWallReference, room.walls[0].sharedWallReference)
const relabeled = walls.map((wall, index) => ({ ...wall, label: `Nome ${index}` }))
assert.deepEqual(getCorners(relabeled, corners).map(corner => corner.id), corners.map(corner => corner.id))
assert.equal(new Set([...walls.map(wall => wall.id), ...corners.map(corner => corner.id), opening.id, pi.id, room.id, otherRoom.id, relationship.id]).size, 13)
assert.equal(otherRoom.internalWallCounter, 0)
assert.equal(otherRoom.internalWalls.length, 0)
assert.equal(room.subrooms.length, 0)
assert.equal(internalWallLabel(1), 'PI01')
assert.equal(internalWallLabel(100), 'PI100')

const typeProgram = ts.createProgram([fileURLToPath(new URL('./models.types.ts', import.meta.url))], { noEmit: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [], skipLibCheck: true })
const typeDiagnostics = ts.getPreEmitDiagnostics(typeProgram)
assert.equal(typeDiagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(typeDiagnostics, { getCanonicalFileName: name => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }))
console.log('PIs verificadas: exemplo 2 × 4 m, origem nos dois cantos, orientação, medidas preservadas, enquadramento gráfico, aberturas, IDs estáveis e modelos futuros tipados.')
