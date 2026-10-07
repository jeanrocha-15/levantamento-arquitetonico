import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { moduleUrl } from './load.mjs'
const { parseMeasurement, formatMeasurement, toDisplay, toCanonical, displayMeasurementInput } = await import(moduleUrl('units'))
const { ensureProjectMetadata, roomDisplayId, nextRoomSequence } = await import(moduleUrl('projectMetadata'))
const { createRoom } = await import(moduleUrl('domain'))
const { readSnapshot, createSnapshot, encodeSnapshot, decodeSnapshot, SCHEMA_VERSION } = await import(moduleUrl('storage'))
const { buildRoomGeometry } = await import(moduleUrl('roomGeometry'))
const { getCorners } = await import(moduleUrl('corners'))
const { default: Sketch } = await import(moduleUrl('Sketch'))
const { default: RoomEditor } = await import(moduleUrl('RoomEditor'))
const { UnitContext } = await import(moduleUrl('Measurement'))
assert.equal(parseMeasurement('3,75', 'm'), 3.75)
assert.equal(parseMeasurement('375', 'cm'), 3.75)
assert.equal(parseMeasurement('3750', 'mm'), 3.75)
assert.equal(parseMeasurement('', 'mm'), null)
assert.ok(Number.isNaN(parseMeasurement('3abc', 'm')))
assert.equal(formatMeasurement(3.75, 'm'), '3,75 m')
assert.equal(formatMeasurement(3.75, 'cm'), '375 cm')
assert.equal(formatMeasurement(.15, 'mm'), '150 mm')
const room = createRoom('Sala', 'floor'), child = createRoom('Banheiro', 'floor', room.id)
delete room.parentRoomId
room.subrooms = [child]; room.ceilingHeightM = 2.8123456789
room.walls = [3.75, 3, 3.75, 3].map((lengthM, index) => ({ id: `wall-${index}`, label: 'ABCD'[index], lengthM, thickness: .15, wallType: 'other', customWallType: 'Painel acústico' }))
room.corners = getCorners(room.walls, [])
room.corners[0] = { ...room.corners[0], angleDegrees: 82.123456789, angleSource: 'informed' }
room.openings = [{ id: 'door', label: 'P01', type: 'door', wallId: 'wall-0', referenceCornerId: room.corners[3].id, offsetM: .32, widthM: .8, heightM: 2.1, sillHeightM: null, connectedRoomId: child.id }]
room.diagonals = [{ id: 'diag', cornerIds: [room.corners[0].id, room.corners[2].id], lengthM: 5.18123456789, source: 'measured' }]
room.internalWalls = [{ id: 'pi', label: 'PI01', lengthM: 1.25, thicknessM: .12, heightM: 2.5, orientationDegrees: 90, origin: { type: 'perimeter_wall', wallId: 'wall-0', referenceCornerId: room.corners[3].id, distanceM: 1 } }]
const project = { id: 'project', name: 'Casa', floors: [{ id: 'floor', name: 'Térreo', rooms: [room] }], relationships: [{ id: 'relationship', type: 'opening_connection', sourceRoomId: room.id, sourceElementId: 'door', targetRoomId: child.id }] }
const data = { projects: [project], projectId: project.id, floorId: 'floor', roomId: room.id }
const original = structuredClone(data)
const legacy = { ...createSnapshot(data), schemaVersion: 1 }
const migrated = readSnapshot(legacy)
assert.equal(migrated.schemaVersion, SCHEMA_VERSION)
const restored = migrated.data.projects[0], restoredRoom = restored.floors[0].rooms[0]
assert.equal(restored.measurementUnit, 'm')
assert.equal(restoredRoom.displayId, 'AMB-001')
assert.equal(restoredRoom.subrooms[0].displayId, 'AMB-002')
assert.equal(restoredRoom.id, room.id)
assert.equal(restoredRoom.walls[0].lengthM, 3.75)
assert.deepEqual(restored.relationships.map(({spatialConnectionId,targetElementId,...r})=>r), project.relationships.map(({spatialConnectionId,targetElementId,...r})=>r))
assert.deepEqual(restoredRoom.openings.map(({connectedOpeningId,originOpeningId,...o})=>o), room.openings.map(({connectedOpeningId,originOpeningId,...o})=>o))
assert.equal(restoredRoom.openings[0].originOpeningId, room.openings[0].id)
assert.deepEqual(restoredRoom.diagonals, room.diagonals)
assert.deepEqual(restoredRoom.corners, room.corners)
assert.deepEqual(restoredRoom.internalWalls, room.internalWalls)
assert.deepEqual(data, original, 'Migração não modifica os dados originais')
assert.deepEqual(readSnapshot(migrated), migrated, 'Migração idempotente')
assert.deepEqual(decodeSnapshot(encodeSnapshot(migrated)), migrated)
const renamed = ensureProjectMetadata({ ...restored, floors: [{ ...restored.floors[0], rooms: [{ ...restoredRoom, name: 'Sala Principal' }] }] })
assert.equal(renamed.floors[0].rooms[0].displayId, 'AMB-001')
const deleted = ensureProjectMetadata({ ...restored, floors: [] })
assert.equal(roomDisplayId(nextRoomSequence(deleted)), 'AMB-001', 'Reutiliza numeração visual após excluir')
const partial = ensureProjectMetadata({ ...project, floors: [{ ...project.floors[0], rooms: [{ ...room, displayId: 'AMB-009' }] }] })
assert.equal(partial.floors[0].rooms[0].subrooms[0].displayId, 'AMB-010')
const survey = buildRoomGeometry(restoredRoom), geometryBefore = structuredClone(survey.perimeter.segments)
for (const unit of ['mm', 'cm', 'm', 'mm', 'm']) {
  const changed = { ...restored, measurementUnit: unit }
  const snapshot = createSnapshot({ ...migrated.data, projects: [changed] })
  assert.deepEqual(decodeSnapshot(encodeSnapshot(snapshot)).data.projects[0], changed)
  assert.deepEqual(changed.floors, restored.floors, 'Trocar unidade não altera nenhuma medida')
  for (const value of [3.75, .15, .8, 2.1, 2.8123456789]) assert.ok(Math.abs(toCanonical(toDisplay(value, unit), unit) - value) < 1e-12)
  const tree = React.createElement(UnitContext, { value: unit }, React.createElement(Sketch, { room: restoredRoom, survey }))
  const svg = renderToStaticMarkup(tree)
  assert.ok(svg.includes(formatMeasurement(3.75, unit)))
  assert.ok(svg.includes(formatMeasurement(.32, unit)))
  assert.ok(svg.includes('has-thickness'), 'A parede com espessura usa duas faces gráficas')
  assert.ok((svg.match(/class="wall-stroke"/g) ?? []).length > survey.perimeter.segments.length, 'As faces permanecem desenhadas ao trocar unidade')
  const editor = renderToStaticMarkup(React.createElement(UnitContext, { value: unit }, React.createElement(RoomEditor, { section: 'perimeter', room: restoredRoom, survey, project: changed, relatedRooms: [], onChange() {}, onNavigate() {} })))
  // Campos fora de edição mostram o padrão brasileiro (3,75 m · 375 cm · 3750 mm), sem alterar o valor salvo.
  assert.ok(editor.includes(`value="${displayMeasurementInput(3.75, unit)}"`))
  assert.equal(parseMeasurement(displayMeasurementInput(3.75, unit), unit), 3.75)
  assert.ok(editor.includes('Painel acústico'))
  assert.deepEqual(survey.perimeter.segments, geometryBefore)
}
assert.throws(() => readSnapshot({ ...migrated, data: { ...migrated.data, projects: [{ ...restored, measurementUnit: 'km' }] } }), /inválida/)
console.log('Etapa 12: conversão/parsing, unidades em formulários/SVG, medidas originais, migração, persistência, espessura/tipo e IDs estáveis sem reutilização OK.')
assert.equal(displayMeasurementInput(2.8, 'm'), '2,80')
assert.equal(displayMeasurementInput(2.8, 'mm'), '2800')
assert.equal(displayMeasurementInput(2.8123456789, 'm'), '2,8123456789')
assert.equal(displayMeasurementInput(null, 'm'), '')
