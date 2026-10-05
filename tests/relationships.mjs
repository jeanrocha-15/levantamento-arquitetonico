import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import ts from 'typescript'
const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const domainUrl = url(transpile('../src/domain.ts'))
const { createRoom, id } = await import(domainUrl)
const { load } = await import('./load.mjs')
const { reconcileRelationships, removeRoom, projectRooms } = await load('relationships')
const floorId = id(), secondFloorId = id()
const sala = createRoom('Sala', floorId), bathroom = createRoom('Banheiro', floorId, sala.id), kitchen = createRoom('Cozinha', secondFloorId)
sala.subrooms.push(bathroom)
const wall = () => ({ id: id(), label: 'A', lengthM: 4 })
sala.walls.push(wall()); kitchen.walls.push(wall()); bathroom.walls.push(wall())
const door = (room, type = 'door') => ({ id: id(), label: 'P01', type, wallId: room.walls[0].id, referenceCornerId: '', offsetM: .3, widthM: .8, heightM: 2.1, sillHeightM: null })
sala.openings.push(door(sala)); kitchen.openings.push(door(kitchen)); bathroom.openings.push(door(bathroom, 'gap'))
sala.openings[0].connectedRoomId = kitchen.id
sala.openings[0].connectedOpeningId = kitchen.openings[0].id
sala.walls[0].sharedWallReference = { roomId: kitchen.id, wallId: kitchen.walls[0].id }
let project = { id: id(), name: 'Casa', floors: [{ id: floorId, name: 'Térreo', rooms: [sala] }, { id: secondFloorId, name: 'Superior', rooms: [kitchen] }], relationships: [] }
const original = JSON.stringify(project)
project = reconcileRelationships(project)
assert.equal(project.floors[0].rooms[0].walls[0].lengthM,JSON.parse(original).floors[0].rooms[0].walls[0].lengthM,'A sincronização não modifica medidas')
assert.equal(project.relationships.length, 2)
assert.equal(projectRooms(project).length, 3)
assert.equal(projectRooms(project)[1].parentRoomId, sala.id)
assert.equal(projectRooms(project)[1].floorId, floorId)
const relationIds = project.relationships.map(item => item.id)
project.floors[1].rooms[0].name = 'Cozinha renomeada'
project = reconcileRelationships(project)
assert.deepEqual(project.relationships.map(item => item.id), relationIds)
assert.equal(project.floors[0].rooms[0].subrooms[0].openings[0].connectedRoomId, undefined)
project.floors[1].rooms[0].openings = []
project = reconcileRelationships(project)
assert.equal(project.floors[0].rooms[0].openings[0].connectedRoomId, kitchen.id)
assert.equal(project.floors[0].rooms[0].openings[0].connectedOpeningId, undefined)
assert.equal(project.relationships.find(item => item.type === 'opening_connection').targetElementId, undefined)
project.floors[0].rooms[0].openings[0].connectedRoomId = undefined
project = reconcileRelationships(project)
assert.deepEqual(project.relationships.map(item => item.type), ['shared_wall'])
project.floors[1].rooms[0].walls = []
project = reconcileRelationships(project)
assert.equal(project.floors[0].rooms[0].walls[0].sharedWallReference, undefined)
assert.equal(project.relationships.length, 0)
project.floors[0].rooms[0].openings[0].connectedRoomId = sala.id
project.floors[0].rooms[0].openings[0].connectedOpeningId = sala.openings[0].id
project.floors[0].rooms[0].walls[0].sharedWallReference = { roomId: sala.id, wallId: sala.walls[0].id }
project = reconcileRelationships(project)
assert.equal(project.relationships.length, 0)
assert.equal(project.floors[0].rooms[0].openings[0].connectedRoomId, undefined)
assert.equal(project.floors[0].rooms[0].walls[0].sharedWallReference, undefined)
project.floors[0].rooms[0].openings[0].connectedRoomId = bathroom.id
project.floors[0].rooms[0].openings[0].connectedOpeningId = bathroom.openings[0].id
project = reconcileRelationships(project)
assert.equal(project.relationships.length, 1)
project.floors[0].rooms = removeRoom(project.floors[0].rooms, bathroom.id)
project = reconcileRelationships(project)
assert.equal(project.relationships.length, 0)
assert.equal(project.floors[0].rooms[0].openings[0].connectedRoomId, undefined)
project.floors[0].rooms[0].subrooms.push(createRoom('Outro', floorId, sala.id))
assert.equal(removeRoom(project.floors[0].rooms, sala.id).length, 0)
project.floors[0].rooms[0].openings[0].connectedRoomId = kitchen.id
project = reconcileRelationships(project)
project.floors = project.floors.filter(item => item.id !== secondFloorId)
project = reconcileRelationships(project)
assert.equal(project.relationships.length, 0)
assert.equal(project.floors[0].rooms[0].openings[0].connectedRoomId, undefined)
console.log('Relações: hierarquia independente, IDs estáveis, vínculos, validação e limpeza de exclusões OK.')
