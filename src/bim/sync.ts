import type {LacExchange} from './types'
import {recordsOf} from './exchange'
export function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
  if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}'
  return JSON.stringify(value)??'null'
}
export type ChangeStatus='new_lac'|'changed_lac'|'removed_lac'|'new_revit'|'changed_revit'|'removed_revit'|'conflict'|'same'
export interface SyncChange {key:string;status:ChangeStatus;base:unknown;local:unknown;remote:unknown}
export function compareSync(base:Record<string,unknown>,local:Record<string,unknown>,remote:Record<string,unknown>,complete=true):SyncChange[]{
  return [...new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])].map(key=>{
    const b=base[key],l=local[key],r=remote[key]??(!complete?b:undefined),lc=canonical(l)!==canonical(b),rc=canonical(r)!==canonical(b)
    let status:ChangeStatus='same'
    if(lc&&rc&&canonical(l)!==canonical(r))status='conflict'
    else if(lc&&!rc)status=l===undefined?'removed_lac':b===undefined?'new_lac':'changed_lac'
    else if(rc&&canonical(l)!==canonical(r))status=r===undefined?'removed_revit':b===undefined?'new_revit':'changed_revit'
    return {key,status,base:b,local:l,remote:r}
  })
}
export function mergeExchange(local:LacExchange,remote:LacExchange,choices:Record<string,'local'|'remote'|'review'>):LacExchange {
  const changes=compareSync(local.syncMetadata.baseline??{},recordsOf(local),recordsOf(remote),remote.syncMetadata.complete),merged:Record<string,unknown>={}
  for(const c of changes){const choice=choices[c.key];if(c.status==='conflict'&&!choice)throw new Error('Escolha uma versão ou mantenha cada conflito para revisão.')
    const useRemote=choice==='remote'||(!choice&&['new_revit','changed_revit','removed_revit'].includes(c.status)),value=useRemote?c.remote:c.local
    if(value!==undefined)merged[c.key]=value
  }
  const result={...local,syncMetadata:{...remote.syncMetadata,baseline:recordsOf(remote)}}
  for(const key of ['levels','rooms','physicalWalls','openings','elements','connections'] as const)(result[key] as unknown[])=Object.entries(merged).filter(([id])=>id.startsWith(key+':')).map(([,v])=>v)
  const levels=new Set(result.levels.map(l=>l.lacId)),walls=new Set(result.physicalWalls.map(w=>w.lacId))
  if(result.rooms.some(r=>!levels.has(r.levelId))||result.physicalWalls.some(w=>!levels.has(w.baseLevelId))||result.openings.some(o=>!walls.has(o.hostWallId)))throw new Error('A escolha remove uma referência ainda utilizada. Resolva o pavimento/parede e seus dependentes juntos.')
  return result
}
