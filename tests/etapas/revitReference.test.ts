import 'fake-indexeddb/auto'
import {describe,it,expect} from 'vitest'
import {parseRevitReference,referenceStorage} from '../../src/revitReference'
const example={format:'revit-lac-exchange',schemaVersion:1,units:'m',source:{title:'Arquitetônico',documentId:'source-id'},elements:[{elementId:'9007199254740993',kind:'room',areaM2:10,boundaryLoops:[[]]}]}
describe('Revit reference import',()=>{
  it('preserves source IDs and rejects backups and unsupported units',()=>{
    expect(parseRevitReference(JSON.stringify(example)).elements[0].elementId).toBe('9007199254740993')
    expect(()=>parseRevitReference(JSON.stringify({projects:[]}))).toThrow()
    expect(()=>parseRevitReference(JSON.stringify({...example,units:'ft'}))).toThrow()
  })
  it('stores the original file independently for each project',async()=>{
    const blob=new Blob([JSON.stringify(example)],{type:'application/json'})
    await referenceStorage('project-a',blob)
    expect(await (await referenceStorage('project-a'))?.text()).toBe(await blob.text())
    expect(await referenceStorage('project-b')).toBeUndefined()
  })
})

