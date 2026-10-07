import assert from 'node:assert/strict'
import { moduleUrl } from './load.mjs'
const { buildPerimeter } = await import(moduleUrl('geometry'))
const { getCorners } = await import(moduleUrl('corners'))
const { buildOpeningLayout, getWallReferences, openingLabel, formatCm, placeOpeningLabels } = await import(moduleUrl('openings'))
const { createRoom } = await import(moduleUrl('domain'))
const walls = [4, 3, 4, 3].map((lengthM, i) => ({ id: String(i), label: String.fromCharCode(65 + i), lengthM }))
const corners = getCorners(walls, [])
const perimeter = buildPerimeter(walls, corners)
const referencesA = getWallReferences(walls, corners, '0')
assert.deepEqual(referencesA.map(ref => [ref.label, ref.endpoint]), [['DA', 'start'], ['AB', 'end']])
const door = { id: 'door', type: 'door', label: 'P01', wallId: '0', referenceCornerId: referencesA[1].id, offsetM: 0.32, widthM: 0.8, heightM: 2.1, sillHeightM: null }
const snapshot = JSON.stringify({ walls, corners, door })
const fromEnd = buildOpeningLayout(perimeter, walls, corners, [door])
assert.equal(JSON.stringify({ walls, corners, door }), snapshot)
assert.equal(fromEnd.placements.length, 1)
assert.ok(Math.abs(fromEnd.placements[0].fromM - 2.88) < 1e-8)
assert.ok(Math.abs(fromEnd.placements[0].toM - 3.68) < 1e-8)
assert.ok(Math.abs(Math.hypot(fromEnd.placements[0].referencePoint.x - fromEnd.placements[0].nearPoint.x, fromEnd.placements[0].referencePoint.y - fromEnd.placements[0].nearPoint.y) - 0.32) < 1e-8)
assert.equal(fromEnd.wallLayouts[0].solidRanges.length, 2)
assert.ok(Math.abs(fromEnd.wallLayouts[0].solidRanges[0].end.x - 2.88) < 1e-8)
assert.ok(Math.abs(fromEnd.wallLayouts[0].solidRanges[1].start.x - 3.68) < 1e-8)
assert.equal(fromEnd.checks[0].messages.length, 0)
const fromStart = buildOpeningLayout(perimeter, walls, corners, [{ ...door, referenceCornerId: referencesA[0].id }])
assert.ok(Math.abs(fromStart.placements[0].fromM - 0.32) < 1e-8)
assert.ok(Math.abs(fromStart.placements[0].toM - 1.12) < 1e-8)

const referencesC = getWallReferences(walls, corners, '2')
const window = { ...door, id: 'window', type: 'window', label: 'J01', wallId: '2', referenceCornerId: referencesC[1].id, offsetM: 0.25, widthM: 1.2, heightM: 1, sillHeightM: 1.1 }
const windows = buildOpeningLayout(perimeter, walls, corners, [window])
assert.ok(Math.abs(windows.placements[0].start.x - 1.45) < 1e-8)
assert.ok(Math.abs(windows.placements[0].end.x - 0.25) < 1e-8)
assert.equal(windows.checks[0].messages.length, 0)
assert.equal(formatCm(0.8), '80')
assert.equal(formatCm(2.1), '210')
assert.equal(formatCm(1.1), '110')
assert.equal(formatCm(null), '?')
assert.equal(openingLabel('door', 1), 'P01')
assert.equal(openingLabel('door', 100), 'P100')
assert.equal(openingLabel('window', 3), 'J03')
assert.equal(openingLabel('gap', 2), 'V02')
const roomA = createRoom('Sala'), roomB = createRoom('Banheiro')
roomA.openingCounters.door = 3
assert.equal(roomB.openingCounters.door, 0)
assert.notEqual(roomA.openings, roomB.openings)

const angledCorners = corners.map((corner, index) => ({ ...corner, angleDegrees: index === 0 ? 82 : 90, angleSource: 'informed' }))
const angled = buildPerimeter(walls, angledCorners)
const tilted = buildOpeningLayout(angled, walls, angledCorners, [{ ...door, wallId: '1', referenceCornerId: getWallReferences(walls, corners, '1')[0].id }])
const placed = tilted.placements[0]
assert.ok(Math.abs(Math.hypot(placed.start.x - angled.segments[1].start.x, placed.start.y - angled.segments[1].start.y) - 0.32) < 1e-8)
assert.ok(Math.abs(Math.hypot(placed.end.x - placed.start.x, placed.end.y - placed.start.y) - 0.8) < 1e-8)

const a = { ...door, referenceCornerId: referencesA[0].id, offsetM: 0.5 }
const b = { ...door, id: 'second', label: 'P02', referenceCornerId: referencesA[0].id, offsetM: 1, widthM: 1.2 }
const overlap = buildOpeningLayout(perimeter, walls, corners, [a, b])
assert.ok(overlap.checks.every(check => check.messages.some(message => message.includes('Sobreposição'))))
assert.equal(overlap.wallLayouts[0].solidRanges.length, 2)
assert.ok(Math.abs(overlap.wallLayouts[0].solidRanges[1].start.x - 2.2) < 1e-8)
const touching = buildOpeningLayout(perimeter, walls, corners, [a, { ...b, offsetM: 1.3 }])
assert.ok(touching.checks.every(check => check.messages.length === 0))
for (const changes of [{ widthM: 0 }, { widthM: null }, { offsetM: null }, { offsetM: -1 }, { offsetM: 4 }, { referenceCornerId: 'wrong' }, { wallId: 'missing' }]) {
  const invalid = buildOpeningLayout(perimeter, walls, corners, [{ ...door, ...changes }])
  assert.equal(invalid.placements.length, 0)
  assert.ok(invalid.checks[0].messages.length > 0)
  assert.equal(invalid.wallLayouts[0].solidRanges.length, 1)
}
const unmeasuredWalls = walls.map(wall => ({ ...wall, lengthM: null }))
assert.equal(buildOpeningLayout(buildPerimeter(unmeasuredWalls), unmeasuredWalls, corners, [door]).placements.length, 0)
const partial = buildOpeningLayout(perimeter, walls, corners, [{ ...door, heightM: null }])
assert.equal(partial.placements.length, 1)
assert.ok(partial.checks[0].messages.some(message => message.includes('Altura')))
assert.ok(buildOpeningLayout(perimeter, walls, corners, [{ ...window, sillHeightM: null }]).checks[0].messages.some(message => message.includes('Peitoril')))
assert.equal(buildOpeningLayout(perimeter, walls, corners, [{ ...window, sillHeightM: 0 }]).checks[0].messages.length, 0)
assert.equal(buildOpeningLayout(perimeter, walls, corners, [{ ...door, type: 'gap', label: 'V01' }]).placements.length, 1)
assert.equal(buildOpeningLayout(perimeter, walls, corners, [{ ...door, widthM: 4, offsetM: 0 }]).wallLayouts[0].solidRanges.length, 0)

const decimalWalls = [{ id: '0', label: 'A', lengthM: 0.3 }, walls[1]]
const decimalOpening = { ...door, referenceCornerId: getWallReferences(decimalWalls, [], '0')[0].id, widthM: 0.2, offsetM: 0.1 }
assert.equal(buildOpeningLayout(buildPerimeter(decimalWalls), decimalWalls, [], [decimalOpening]).placements.length, 1)
const oldReference = { ...door, referenceCornerId: referencesA[0].id }
const moreWalls = [...walls, { id: '4', label: 'E', lengthM: 1 }]
assert.equal(buildOpeningLayout(buildPerimeter(moreWalls, corners), moreWalls, corners, [oldReference]).placements.length, 0)
const labels = placeOpeningLabels(overlap.placements, perimeter.project, [])
for (const label of labels) {
  assert.ok(label.box.x >= 0 && label.box.x + label.box.width <= 440)
  assert.ok(label.box.y >= 0 && label.box.y + label.box.height <= 340)
}
assert.notDeepEqual({ x: labels[0].x, y: labels[0].y }, { x: labels[1].x, y: labels[1].y })
console.log('Aberturas verificadas: referência inicial/final, recorte da parede, posições inclinadas, unidades, tipos, sobreposições, limites e dados originais preservados.')
