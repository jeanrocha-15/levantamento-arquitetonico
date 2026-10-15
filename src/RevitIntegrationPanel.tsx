import {useRef,useState} from 'react'
import type {Project} from './models'
import RevitExportPanel from './RevitExportPanel'
import {createSnapshot,readSnapshot} from './storage'
import {downloadText} from './exporting'
import {importRevitInventory} from './bim/importRevit'
import {createLacExchange,projectFromExchange,recordsOf,saveExchangeIdentity,preserveFieldData} from './bim/exchange'
import {compareSync,mergeExchange} from './bim/sync'
import type {LacExchange} from './bim/types'

export default function RevitIntegrationPanel({project,projects,onChange,onImport}:{project:Project;projects:Project[];onChange:(p:Project)=>void;onImport:(p:Project)=>void}) {
 const [tab,setTab]=useState('import'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[incoming,setIncoming]=useState<LacExchange>(),[choices,setChoices]=useState<Record<string,'local'|'remote'|'review'>>({})
 const input=useRef<HTMLInputElement>(null)
 const [elementId,setElementId]=useState('')
 const selectedElement=project.bim?.elements.find(e=>e.lacId===elementId)
 const current=createLacExchange(project),localChanges=compareSync(project.bim?.baseline??{},recordsOf(current),project.bim?.baseline??{},false).filter(c=>c.status!=='same')
 const existing=incoming&&projects.find(p=>p.id===incoming.project.lacId||p.bim?.sourceDocumentId&&p.bim.sourceDocumentId===incoming.project.sourceDocumentId)
 const local=existing?createLacExchange(existing):undefined
 const changes=incoming&&local?compareSync(local.syncMetadata.baseline??{},recordsOf(local),recordsOf(incoming),incoming.syncMetadata.complete).filter(c=>c.status!=='same'):[]
 async function read(file:File){setBusy(true);setMessage('');setIncoming(undefined);setChoices({});try{
  if(file.size>50*1024*1024)throw new Error('Arquivo acima de 50 MB. Exporte por pavimento ou use modo Essencial.')
  const raw=JSON.parse(await file.text())
  const exchange: LacExchange=raw.format==='lac-exchange'?raw:createLacExchange(importRevitInventory(raw))
  if(raw.format==='revit-lac-exchange')exchange.syncMetadata.complete=raw.scope?.allLevels!==false
  const previous=projects.find(p=>p.id===exchange.project.lacId||p.bim?.sourceDocumentId===exchange.project.sourceDocumentId&&!!p.bim?.sourceDocumentId)
  if(previous?.bim?.pendingBaseline&&!previous.bim.baseline)exchange.syncMetadata.complete=false
  if(raw.format==='revit-lac-exchange'&&previous){
   // Revit inventory does not author LAC-only connections or field notes.
   const prior=createLacExchange(previous),roomIds=new Set(exchange.rooms.map(r=>r.lacId))
   exchange.connections=prior.connections.filter(c=>roomIds.has(c.a.roomId)&&roomIds.has(c.b.roomId))
   for(const room of exchange.rooms){const old=prior.rooms.find(r=>r.lacId===room.lacId);if(old){for(const key of ['photos','notes','technicalChecks','pendingItems','labelOffsets','planLabelOffsets','sketchLabelScale'] as const)Object.assign(room.survey,{[key]:old.survey[key]})}}
  }
  projectFromExchange(exchange);setIncoming(exchange)
 }catch(error){setMessage(error instanceof Error?error.message:'Não foi possível ler o arquivo.')}finally{setBusy(false);if(input.current)input.current.value=''}}
 function confirm(){if(!incoming)return;try{
  const merged=local?mergeExchange(local,incoming,choices):incoming,converted=projectFromExchange(merged),next=existing?preserveFieldData(existing,converted):converted
  next.bim!.baseline=incoming.syncMetadata.complete?recordsOf(incoming):{...existing?.bim?.baseline,...recordsOf(incoming)}
  if(existing){next.id=existing.id;next.bim!.history=[...(existing.bim?.history??[]).slice(-9),{at:new Date().toISOString(),records:recordsOf(local!)}];next.bim!.warnings.push(...changes.filter(c=>choices[c.key]==='review').map(c=>`Revisar conflito: ${c.key}`))}
  readSnapshot(createSnapshot({projects:[next],projectId:next.id,floorId:next.floors[0]?.id??'',roomId:next.floors.flatMap(f=>f.rooms)[0]?.id??''}));onImport(next);setIncoming(undefined);setMessage('Modelo importado. Abra a Planta Geral ou um ambiente para editar.')
 }catch(error){setMessage(error instanceof Error?error.message:'Falha na importação.')}}
 const labels:Record<string,string>={new_lac:'Novo no LAC',changed_lac:'Alterado no LAC',removed_lac:'Removido no LAC',new_revit:'Novo no Revit',changed_revit:'Alterado no Revit',removed_revit:'Removido no Revit',conflict:'Conflito: alterado nos dois'}
 return <section className="editor"><h2>Integração Revit</h2><nav className="export-actions" aria-label="Fluxo Revit"><button aria-pressed={tab==='import'} onClick={()=>setTab('import')}>Revit → LAC</button><button aria-pressed={tab==='export'} onClick={()=>setTab('export')}>LAC → Revit</button></nav>
 <p>Última sincronização: {project.bim?.lastSync?new Date(project.bim.lastSync).toLocaleString('pt-BR'):'ainda não realizada'}</p><p>Alterações LAC: {localChanges.length} · Alterações Revit: {incoming?changes.filter(c=>c.status.endsWith('revit')).length:'importe o arquivo para comparar'} · Conflitos: {changes.filter(c=>c.status==='conflict').length}</p>
 {tab==='import'?<><h3>Importar modelo para edição</h3><p>Converte pavimentos, ambientes e referências físicas. Paredes e aberturas compartilhadas mantêm uma identidade única. Elementos sem conversão ficam identificados na planta para revisão.</p><input hidden ref={input} type="file" accept=".json,.lacx,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void read(file)}}/><button className="primary" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Preparando…':'Importar modelo Revit / LAC Exchange'}</button>
 {incoming&&<><h3>{incoming.project.name}</h3><p>{incoming.levels.length} pavimentos · {incoming.rooms.length} ambientes · {incoming.physicalWalls.length} paredes físicas · {incoming.openings.length} aberturas · {incoming.elements.length} elementos simplificados.</p><p>{existing?'Atualizar projeto existente por identidade permanente.':'Criar projeto independente, preservando os levantamentos existentes.'}</p>
 {changes.length>0&&<details open><summary>Alterações e conflitos ({changes.length})</summary>{changes.map(c=><div key={c.key}><p>{labels[c.status]} · {(c.remote as {name?:string})?.name??(c.local as {name?:string})?.name??c.key.split(':')[0]}</p><select aria-label={'Resolver '+c.key} value={choices[c.key]??''} onChange={e=>setChoices({...choices,[c.key]:e.target.value as 'local'|'remote'|'review'})}><option value="">{c.status==='conflict'?'Escolha como resolver':'Aplicar alteração do lado de origem'}</option><option value="local">Usar LAC</option><option value="remote">Usar Revit</option><option value="review">Manter para revisão</option></select><details><summary>Comparar versões</summary><pre style={{maxHeight:240,overflow:'auto',whiteSpace:'pre-wrap'}}>{JSON.stringify({ultimaVersao:c.base,LAC:c.local,Revit:c.remote},null,2)}</pre></details></div>)}</details>}
 <details><summary>Avisos de compatibilização ({incoming.syncMetadata.warnings.length})</summary><ul>{incoming.syncMetadata.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details><button className="primary" disabled={changes.some(c=>c.status==='conflict'&&!choices[c.key])} onClick={confirm}>Confirmar importação e abrir Planta Geral</button></>}
 </>:<><h3>Enviar modelo simplificado</h3><p>Gera LAC Exchange (.lacx) com níveis, ambientes, paredes físicas, aberturas, elementos e identidades de sincronização.</p><button onClick={()=>{try{const data=createLacExchange(project);if(data.syncMetadata.warnings.length){setMessage(data.syncMetadata.warnings.join(' '));if(!window.confirm('Há avisos de compatibilização. Exportar para revisão?'))return}downloadText('LAC-Exchange.lacx',JSON.stringify(data),'application/json');onChange(saveExchangeIdentity(project,data))}catch(e){setMessage(e instanceof Error?e.message:'Falha ao exportar')}}}>Exportar LAC Exchange</button><details><summary>Exportação anterior (compatibilidade)</summary><RevitExportPanel project={project}/></details></>}
 <details><summary>Pavimentos e elevações</summary>{project.floors.map(f=><label key={f.id}>{f.name} — elevação (m)<input type="number" step="0.01" value={f.elevation??0} onChange={e=>{if(e.target.value!==''&&Number.isFinite(e.target.valueAsNumber))onChange({...project,floors:project.floors.map(x=>x.id===f.id?{...x,elevation:e.target.valueAsNumber}:x)})}}/></label>)}</details>
 {project.bim&&<><details><summary>Elementos importados fora dos ambientes</summary><select value={elementId} onChange={e=>setElementId(e.target.value)}><option value="">Selecionar elemento</option>{project.bim.elements.filter(e=>!e.objectId).map((e,i)=><option key={e.lacId} value={e.lacId}>{i+1} · {e.type}</option>)}</select>{selectedElement&&<><p>{selectedElement.issue}</p><label>Pavimento<select value={selectedElement.levelId} onChange={e=>onChange({...project,bim:{...project.bim!,elements:project.bim!.elements.map(x=>x.lacId===elementId?{...x,levelId:e.target.value}:x)}})}>{project.floors.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>{(['width','depth','height','rotation'] as const).map(field=><label key={field}>{{width:'Largura (m)',depth:'Profundidade (m)',height:'Altura (m)',rotation:'Rotação (°)'}[field]}<input type="number" step="0.01" disabled={selectedElement.editable===false} value={selectedElement[field]??''} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))onChange({...project,bim:{...project.bim!,elements:project.bim!.elements.map(x=>x.lacId===elementId?{...x,[field]:e.target.valueAsNumber}:x)}})}}/></label>)}</>}</details><details><summary>Dados Revit</summary><p>{project.bim.elements.filter(e=>e.editable===false).length} elementos com edição limitada. {project.bim.history?.length??0} versões anteriores preservadas.</p><ul>{project.bim.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details></>}{message&&<p role="status">{message}</p>}</section>
}
