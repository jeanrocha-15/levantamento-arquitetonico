import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { moduleUrl } from './load.mjs'
const { createRoom } = await import(moduleUrl('domain'))
const { createRoomObject, nextObjectSequence, removeRoomObject, buildObjectPlacements, fitObjectsSketch, objectDimensionsLabel, objectProblems } = await import(moduleUrl('roomObjects'))
const { buildRoomGeometry } = await import(moduleUrl('roomGeometry'))
const { createSnapshot, readSnapshot, encodeSnapshot, decodeSnapshot, saveWorkspace, loadWorkspace, SCHEMA_VERSION } = await import(moduleUrl('storage'))
const { UnitContext } = await import(moduleUrl('Measurement'))
const { default: Sketch } = await import(moduleUrl('Sketch'))
const { default: RoomObjectEditor } = await import(moduleUrl('RoomObjectEditor'))
const room = createRoom('Sala', 'floor'), child = createRoom('Depósito', 'floor', room.id)
delete room.parentRoomId
room.subrooms = [child]
room.walls = [4,3,4,3].map((lengthM,index) => ({ id: `wall-${index}`, label: 'ABCD'[index], lengthM }))
const add = changes => { const object = { ...createRoomObject(room), ...changes }; room.objectCounter = nextObjectSequence(room); room.objects.push(object); return object }
const mesa = add({ name: 'Mesa', category: 'furniture', dimensions: { widthM: 1.2, depthM: .7 }, position: { xM: 1, yM: 1 } })
const botijao = add({ name: 'Botijão', category: 'object', shape: 'circle', dimensions: { diameterM: .4 }, position: { xM: 3, yM: 2 } })
const machine = add({ name: 'Compressor', category: 'equipment', dimensions: { widthM: .8, depthM: .5 }, position: { xM: 2.5, yM: 1 }, rotationDegrees: 45, note: 'Conferir acesso' })
const line = add({ name: 'Segmento', shape: 'line', dimensions: { lengthM: 1.8 }, position: { xM: 2, yM: 2.5 }, rotationDegrees: 90 })
assert.deepEqual(room.objects.map(object => object.displayId), ['OBJ-001','OBJ-002','OBJ-003','OBJ-004'])
assert.equal(new Set(room.objects.map(object => object.id)).size, 4)
const original = structuredClone(room), geometry = buildRoomGeometry(room)
for (const object of room.objects) assert.deepEqual(objectProblems(object), [])
const placements = buildObjectPlacements(room.objects)
assert.equal(placements.length, 4)
assert.equal(placements[0].widthM, 1.2)
assert.equal(placements[1].widthM, .4)
const diagonalCorner = placements[2].bounds[0]
assert.ok(Math.abs(diagonalCorner.x - (2.5 - .4 * Math.SQRT1_2 + .25 * Math.SQRT1_2)) < 1e-12)
assert.ok(Math.abs(diagonalCorner.y - (1 - .4 * Math.SQRT1_2 - .25 * Math.SQRT1_2)) < 1e-12)
const far = { ...machine, position: { xM: 20, yM: -10 } }, fitted = fitObjectsSketch(geometry.perimeter, buildObjectPlacements([far]))
for (const point of [...buildObjectPlacements([far])[0].bounds, ...geometry.perimeter.segments.flatMap(segment=>[segment.start,segment.end])]) {
  const screen = fitted.project(point)
  assert.ok(screen.x >= 79.99 && screen.x <= 360.01 && screen.y >= 84.99 && screen.y <= 265.01)
}
for (const unit of ['m','cm','mm']) {
  const svg = renderToStaticMarkup(React.createElement(UnitContext,{value:unit}, React.createElement(Sketch,{room,survey:geometry,selectedObjectId:machine.id})))
  assert.ok(svg.includes('rotate(45)'))
  assert.ok(svg.includes('OBJ-003'))
  assert.ok(svg.includes(objectDimensionsLabel(mesa,unit)))
  assert.ok(svg.includes(`data-object-id="${botijao.id}"`))
  const editor = renderToStaticMarkup(React.createElement(UnitContext,{value:unit},React.createElement(RoomObjectEditor,{room,onChange(){}})))
  assert.ok(editor.includes('Compressor'))
  assert.ok(editor.includes('Botijão'))
  assert.deepEqual(room, original, 'Troca de unidade/render nunca modifica dimensões, posições, rotação ou paredes')
}
const project = { id:'project',name:'Casa',measurementUnit:'cm',floors:[{id:'floor',name:'Térreo',rooms:[room]}],relationships:[] }
const data = {projects:[project],projectId:'project',floorId:'floor',roomId:room.id}
const snapshot = createSnapshot(data)
assert.deepEqual(decodeSnapshot(encodeSnapshot(snapshot)), snapshot)
assert.equal(decodeSnapshot(encodeSnapshot(snapshot)).data.projects[0].floors[0].rooms[0].objects[2].id, machine.id)
const removed = removeRoomObject(room,line.id)
assert.equal(nextObjectSequence(removed), 4)
assert.deepEqual(removed.walls, room.walls)
assert.deepEqual(removed.objects, room.objects.slice(0,3))
assert.deepEqual(child.objects, [], 'Objetos não aparecem em subambientes independentes')
assert.equal(createRoomObject(child).roomId, child.id)
const invalid = { ...mesa, dimensions: {widthM:NaN,depthM:.7} }
assert.equal(buildObjectPlacements([invalid]).length, 0)
assert.ok(objectProblems(invalid).length)
const malformed = structuredClone(snapshot); malformed.data.projects[0].floors[0].rooms[0].objects[0].roomId = 'other-room'
assert.throws(()=>readSnapshot(malformed), /incompletos/)
for (const version of [1,2]) {
  const old = structuredClone(snapshot)
  old.schemaVersion = version
  const oldRoom = old.data.projects[0].floors[0].rooms[0]
  delete oldRoom.objects; delete oldRoom.objectCounter
  delete oldRoom.subrooms[0].objects; delete oldRoom.subrooms[0].objectCounter
  const before = structuredClone(old)
  const migrated = readSnapshot(old)
  assert.equal(migrated.schemaVersion,SCHEMA_VERSION)
  assert.deepEqual(migrated.data.projects[0].floors[0].rooms[0].objects,[])
  assert.deepEqual(migrated.data.projects[0].floors[0].rooms[0].walls,room.walls)
  assert.deepEqual(migrated.data.projects[0].floors[0].rooms[0].subrooms[0].objects,[])
  assert.deepEqual(old,before,'Migração não modifica o registro antigo')
  assert.deepEqual(readSnapshot(migrated),migrated)
}
const indexedDescriptor=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'), localDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'), memory=new Map()
try {
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined})
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)}})
  await saveWorkspace(snapshot)
  assert.deepEqual(await loadWorkspace(),snapshot,'Salvamento e carregamento preservam objetos e UUIDs')
} finally {
  if(indexedDescriptor)Object.defineProperty(globalThis,'indexedDB',indexedDescriptor);else delete globalThis.indexedDB
  if(localDescriptor)Object.defineProperty(globalThis,'localStorage',localDescriptor);else delete globalThis.localStorage
}
console.log('Etapa 13: mesa, botijão, equipamento a 45°, segmento, unidades, posição/escala, UUIDs, exclusão isolada, migração e persistência OK.')
