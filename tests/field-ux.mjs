import assert from 'node:assert/strict'
import { moduleUrl } from './load.mjs'
const { generateId, createRoom }=await import(moduleUrl('domain'))
const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'), originalCrypto=globalThis.crypto
try {
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:originalCrypto.getRandomValues.bind(originalCrypto)}})
  const ids=new Set(Array.from({length:5000},()=>generateId()))
  assert.equal(ids.size,5000)
  assert.ok([...ids].every(value=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)))
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined})
  assert.equal(new Set(Array.from({length:5000},()=>generateId())).size,5000)
} finally { Object.defineProperty(globalThis,'crypto',descriptor) }
const { buildPerimeter }=await import(moduleUrl('geometry'))
const { getSketchLabelLayout }=await import(moduleUrl('sketchLabels'))
for(const lengths of [[4,3,4,3],[1,.5,1,.5],[4,3,2,1,2,2]]) {
  const room=createRoom('Teste')
  room.walls=lengths.map((lengthM,i)=>({id:generateId(),label:String.fromCharCode(65+i),lengthM}))
  const before=structuredClone(room), geometry=buildPerimeter(room.walls,room.corners,room.diagonals), closure=geometry.closureM
  const layout=getSketchLabelLayout(geometry)
  assert.equal(layout.positions.size,lengths.length*3+1)
  assert.ok(layout.boxes.every(box=>box.x>=10 && box.y>=45 && box.x+box.width<=430 && box.y+box.height<=320))
  assert.deepEqual(room,before)
  assert.equal(geometry.closureM,closure)
}
const storage=await import(moduleUrl('storage'))
const previousIndexedDB=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'), previousLocal=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
const memory=new Map()
try {
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined})
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)}})
  const room=createRoom('Sala','floor')
  const snapshot=storage.createSnapshot({projects:[{id:'project',name:'Teste',floors:[{id:'floor',name:'Térreo',rooms:[room]}],relationships:[]}],projectId:'project',floorId:'floor',roomId:room.id})
  await storage.saveWorkspace(snapshot)
  assert.equal((await storage.loadWorkspace()).data.projects[0].floors[0].rooms[0].id,room.id)
} finally {
  if(previousIndexedDB)Object.defineProperty(globalThis,'indexedDB',previousIndexedDB);else delete globalThis.indexedDB
  if(previousLocal)Object.defineProperty(globalThis,'localStorage',previousLocal);else delete globalThis.localStorage
}
console.log('Campo: IDs sem randomUUID/crypto, fallback local, anotações em limites e medidas preservadas OK.')
