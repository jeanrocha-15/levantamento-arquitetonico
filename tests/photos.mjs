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
const { createRoom } = await import(moduleUrl('domain'))
const { createRoomObject } = await import(moduleUrl('roomObjects'))
const { cleanProjectPhotoLinks, searchPhotos, parsePhotoTags, photoFileIds } = await import(moduleUrl('photos'))
const { createSnapshot, encodeSnapshot, decodeSnapshot, readSnapshot, SCHEMA_VERSION, saveWorkspace, loadWorkspace, DATABASE_NAME } = await import(moduleUrl('storage'))
const { queuePhotoDeletion, pendingPhotoDeletions, acknowledgePhotoDeletions, savePhotoFile, readPhotoFile, discardUnlinkedPhotoFile } = await import(moduleUrl('photoStorage'))
const room = createRoom('Cozinha', 'floor'), child = createRoom('Depósito', 'floor', room.id)
delete room.parentRoomId
room.displayId = 'AMB-001'; child.displayId = 'AMB-002'; room.subrooms = [child]
room.walls = [{id:'wall',label:'A',lengthM:3.75123456789}]
room.openings = [{id:'door',label:'P01',type:'door',wallId:'wall',referenceCornerId:'corner',offsetM:.32,widthM:.8,heightM:2.1,sillHeightM:null}]
const object = {...createRoomObject(child),name:'Compressor',category:'equipment'}
child.objects = [object]
const photo = (id,owner,type,linkedId,tags=[]) => ({id,fileId:id,roomId:owner.id,originalFileName:`${id}.jpg`,createdAt:'2026-10-03T12:00:00Z',mimeType:'image/jpeg',size:1200,tags,...(type ? {linkedEntityType:type,linkedEntityId:linkedId} : {})})
room.photos = [photo('door-photo',room,'door','door'), photo('wall-photo',room,'wall','wall',['fachada']),photo('general',room)]
child.photos = [photo('equipment',child,'room_object',object.id)]
const project = {id:'project',name:'Casa',floors:[{id:'floor',name:'Térreo',rooms:[room]}],relationships:[]}
const filters = {query:'',roomId:'',type:'',link:'all'}
const find = (query,extra={}) => searchPhotos(project,{...filters,query,...extra}).map(item=>item.photo.id)
assert.deepEqual(find('P01'),['door-photo'], 'Identificação da abertura é pesquisável sem tag manual')
assert.deepEqual(find('porta'),['door-photo'])
assert.deepEqual(find('compressor'),['equipment'])
assert.deepEqual(find(object.displayId),['equipment'])
assert.equal(find('AMB-001').length,3)
assert.equal(find('cozinha').length,3)
assert.deepEqual(find('deposito'),['equipment'], 'Busca ignora acentos')
assert.deepEqual(find('fachada'),['wall-photo'])
assert.deepEqual(find('wall-photo.jpg'),['wall-photo'])
assert.deepEqual(find('',{link:'unlinked'}),['general'])
assert.deepEqual(find('',{type:'door',link:'linked'}),['door-photo'])
assert.deepEqual(find('',{roomId:child.id}),['equipment'])
assert.deepEqual(parsePhotoTags('entrada, fachada;entrada\n medida-duvidosa'),['entrada','fachada','medida-duvidosa'])
const original = structuredClone(project)
const removed = structuredClone(project)
removed.floors[0].rooms[0].walls = []
removed.floors[0].rooms[0].openings = []
removed.floors[0].rooms[0].subrooms[0].objects = []
const cleaned = cleanProjectPhotoLinks(removed)
assert.equal(searchPhotos(cleaned,{...filters,link:'unlinked'}).length,4)
assert.deepEqual([...photoFileIds([cleaned])].sort(),['door-photo','equipment','general','wall-photo'], 'Excluir elementos conserva os arquivos fotográficos')
assert.deepEqual(project,original, 'Pesquisar e limpar cópias não altera os dados originais')
room.name = 'Cozinha Principal'; object.name = 'Compressor principal'
assert.deepEqual(find('P01'),['door-photo']); assert.deepEqual(find('compressor principal'),['equipment'])
const data = {projects:[project],projectId:'project',floorId:'floor',roomId:room.id}
const snapshot = createSnapshot(data)
assert.deepEqual(decodeSnapshot(encodeSnapshot(snapshot)),snapshot)
assert.equal(snapshot.schemaVersion,SCHEMA_VERSION)
assert.equal(JSON.stringify(snapshot).includes('data:image'),false)
for (const version of [1,2,3]) {
  const legacy = structuredClone(snapshot); legacy.schemaVersion = version
  delete legacy.data.projects[0].floors[0].rooms[0].photos
  delete legacy.data.projects[0].floors[0].rooms[0].subrooms[0].photos
  const migrated = readSnapshot(legacy)
  const restored = migrated.data.projects[0].floors[0].rooms[0]
  assert.equal(migrated.schemaVersion,SCHEMA_VERSION)
  assert.deepEqual(restored.photos,[]); assert.deepEqual(restored.subrooms[0].photos,[])
  assert.equal(restored.id,room.id); assert.equal(restored.walls[0].lengthM,3.75123456789)
  assert.deepEqual(restored.subrooms[0].objects,child.objects)
}
queuePhotoDeletion('door-photo'); queuePhotoDeletion('equipment')
assert.deepEqual(pendingPhotoDeletions(photoFileIds([project])),[], 'Um autosave antigo não remove arquivos ainda referenciados')
assert.deepEqual(pendingPhotoDeletions(new Set(['equipment'])),['door-photo'])
acknowledgePhotoDeletions(['door-photo','equipment'])
assert.deepEqual(pendingPhotoDeletions(new Set()),[])
await assert.rejects(savePhotoFile('test',new Blob(['original']),new Blob(['miniatura'])),/IndexedDB/, 'Sem IndexedDB, imagens nunca são enviadas para localStorage')
await import('fake-indexeddb/auto')
const journal = new Map()
globalThis.localStorage = {getItem:key=>journal.get(key)??null,setItem:(key,value)=>journal.set(key,value),removeItem:key=>journal.delete(key)}
// Start with an existing v1 database: the photo store must be added without losing workspace data.
const oldDb = await new Promise((resolve,reject)=>{const request=indexedDB.open(DATABASE_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
await new Promise((resolve,reject)=>{const tx=oldDb.transaction('workspace','readwrite');tx.objectStore('workspace').put(snapshot,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})
oldDb.close()
for (const fileId of photoFileIds([project])) await savePhotoFile(fileId,new Blob([`original:${fileId}`],{type:'image/jpeg'}),new Blob([`thumb:${fileId}`],{type:'image/jpeg'}))
await saveWorkspace(snapshot)
assert.deepEqual((await loadWorkspace()).data,data)
assert.equal(await (await readPhotoFile('door-photo')).text(),'original:door-photo')
assert.equal(await (await readPhotoFile('door-photo',true)).text(),'thumb:door-photo')
const reopened = await new Promise((resolve,reject)=>{const request=indexedDB.open(DATABASE_NAME,2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
assert.ok(reopened.objectStoreNames.contains('workspace'));assert.ok(reopened.objectStoreNames.contains('photoFiles'))
const reopenedBlob = await new Promise((resolve,reject)=>{const tx=reopened.transaction('photoFiles');const request=tx.objectStore('photoFiles').get('equipment');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
assert.equal(await reopenedBlob.text(),'original:equipment');reopened.close()
await saveWorkspace(createSnapshot({...data,projects:[cleaned]}))
assert.equal(await (await readPhotoFile('door-photo')).text(),'original:door-photo', 'Excluir elemento preserva o original')
queuePhotoDeletion('door-photo')
await saveWorkspace(snapshot)
assert.equal(await (await readPhotoFile('door-photo')).text(),'original:door-photo', 'Snapshot antigo não apaga foto referenciada')
const deleted = structuredClone(data);deleted.projects[0].floors[0].rooms[0].photos=room.photos.filter(photo=>photo.id!=='door-photo')
await saveWorkspace(createSnapshot(deleted))
assert.equal((await loadWorkspace()).data.projects[0].floors[0].rooms[0].photos.length,2)
await assert.rejects(readPhotoFile('door-photo'),/indisponível/)
await assert.rejects(readPhotoFile('door-photo',true),/indisponível/)
assert.equal(await (await readPhotoFile('equipment')).text(),'original:equipment', 'Excluir uma foto não afeta outra')
await savePhotoFile('failed-import',new Blob(['original']),new Blob(['thumb']))
await discardUnlinkedPhotoFile('failed-import')
await assert.rejects(readPhotoFile('failed-import'),/indisponível/)
assert.equal([...journal.values()].some(value=>value.includes('original:')),false)
console.log('Fotos: vínculos, busca, filtros, exclusão, IDs, migração, IndexedDB/Blobs, reabertura e medidas aprovados.')
