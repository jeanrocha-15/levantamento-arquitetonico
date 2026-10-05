import StructuralChecklistRows from './StructuralChecklistRows'
import { structuralVerification } from './structural'
import { createStructuralObject, nextStructuralSequence } from './structural'
import { useContext } from 'react'
import type { Project, Room, CheckStatus, TechnicalCheck } from './models'
import { TECHNICAL_GROUPS, TECHNICAL_ITEMS, technicalCheck, technicalItemId } from './technicalChecklist'
import { ElementPhotos, PhotoOfferContext } from './PhotoActions'
import type { ChecklistIssue } from './checklist'
import { roomChecklist } from './checklist'
import { createRoomObject, nextObjectSequence } from './roomObjects'

export function CompletionStats({result}:{result:Pick<ReturnType<typeof roomChecklist>,'completeness'|'checksCompleted'|'checksTotal'|'issues'|'photosCount'>}) {
  return <div className="completion-stats" aria-label="Andamento do levantamento"><span><strong>Levantamento: {result.completeness}%</strong></span><span>Verificações: {result.checksCompleted}/{result.checksTotal}</span><span>Pendências: {result.issues.length}</span><span>Fotos: {result.photosCount} registros</span></div>
}
export default function TechnicalChecklistPanel({room,project,onChange,onProjectChange,onNavigate,result:providedResult}:{room:Room;result?:ReturnType<typeof roomChecklist>;project:Project;onChange:(room:Room)=>void;onProjectChange?:(project:Project)=>void;onNavigate:(issue:ChecklistIssue)=>void}) {
  const offer=useContext(PhotoOfferContext)
  const result=providedResult ?? roomChecklist(room,project)
  const groupChecks=(group:string)=>{const retained=result.checks.filter(c=>c.group===group && result.obligations.some(o=>o.id===c.obligationId));return [...retained,...(group==='MEDIÇÕES'?(room.objects ?? []).filter(o=>o.category==='structural').flatMap(structuralVerification):[])]}
  return <div className="technical-checklist"><p className="angle-help">Pendente não conclui. OK confirma a verificação; as medidas cadastradas também precisam estar válidas. N/A conclui como não aplicável. Fotos são opcionais. Dados gerais são compartilhados por todos os ambientes do projeto.</p>{TECHNICAL_GROUPS.map(group=><details key={group} open={group==='MEDIÇÕES'}><summary>{group} <span>{groupChecks(group).filter(item=>item.completed).length}/{groupChecks(group).length}</span></summary>{TECHNICAL_ITEMS.filter(item=>item.group===group).map(item=>{
    const check=technicalCheck(room,project,item.key), entityId=technicalItemId(room,item.key), calculated=result.checks.find(row=>row.key===item.key)!
    const update=(changes:Partial<TechnicalCheck>)=>{
      const prompt=changes.status==='ok' && check.status!=='ok' && item.photo && !check.photoPrompted
      const next={...check,...changes,...(prompt?{photoPrompted:true}:{})}
      if(item.general) onProjectChange?.({...project,generalChecks:{...project.generalChecks,[item.key]:next}})
      else onChange({...room,technicalChecks:{...room.technicalChecks,[item.key]:next}})
      if(prompt) offer?.({roomId:room.id,type:'technical_item',entityId,label:item.label})
    }
    if(item.key==='facade') return <section className="technical-check-row" key={item.key} data-pending-element={entityId}><h4>Fachada — registro opcional</h4><p className="angle-help">Fora da porcentagem e das pendências automáticas.</p><label>Descrição da fachada<input maxLength={500} value={check.note ?? ''} onChange={event=>update({note:event.target.value})} onBlur={()=>{if(check.note?.trim() && !check.photoPrompted){update({photoPrompted:true});offer?.({roomId:room.id,type:'technical_item',entityId,label:item.label})}}}/></label><ElementPhotos room={room} type="technical_item" entityId={entityId}/></section>
    if(['beams','columns'].includes(item.key) && room.objects?.some(o=>o.category==='structural' && o.technicalItemKey===item.key)) return <StructuralChecklistRows key={item.key} room={room} itemKey={item.key} onNavigate={onNavigate}/>
    const objects=(room.objects ?? []).filter(object=>object.technicalItemKey===item.key || item.key==='objects' && !object.technicalItemKey)
    const first=objects[0]?.id ?? (item.key==='walls'?room.walls[0]?.id:item.key==='openings'?room.openings[0]?.id:item.key==='internalWalls'?room.internalWalls[0]?.id:item.key==='ceiling'||item.key==='geometry'?room.id:undefined)
    return <section className="technical-check-row" key={item.key} data-pending-element={entityId}><div><h4>{item.label}</h4><label>Status<select aria-label={`Status: ${item.label}`} data-pending-field={`check:${item.key}`} value={check.status} disabled={item.general && !onProjectChange} onChange={event=>update({status:event.target.value as CheckStatus})}><option value="pending">Pendente</option><option value="ok">OK</option><option value="na">N/A — não aplicável</option></select></label></div>{item.general && <label>{item.label}<input type={item.key.includes('Time')?'time':item.key==='phone'?'tel':'text'} maxLength={500} value={check.value ?? ''} disabled={!onProjectChange} onChange={event=>update({value:event.target.value})}/></label>}{!item.general && <label>Detalhes / observação<input maxLength={500} value={check.note ?? ''} onChange={event=>update({note:event.target.value})} onBlur={()=>{if(item.photo && check.status!=='na' && check.note?.trim() && !check.photoPrompted){update({photoPrompted:true});offer?.({roomId:room.id,type:'technical_item',entityId,label:item.label})}}} placeholder={item.group==='PRODUTOS PERIGOSOS'?'Registre produto, quantidade, material ou condição aplicável':'Condições verificadas no local'}/></label>}{check.status==='ok' && !calculated.dataValid && <p className="angle-help">Há dados incompletos ou medidas a conferir. O item ainda não conta como concluído.</p>}{first && <button onClick={()=>onNavigate({id:`check-element:${entityId}`,roomId:room.id,elementId:first,field:item.key==='ceiling'?'ceilingHeightM':item.key==='geometry'?'geometry':undefined,description:item.label,kind:'technical'})}>Abrir elemento / medidas →</button>}{['beams','columns','lowWalls','screens','stairs','ramps','panels','substation','transformers','generator','fuelGas','cylinders','tanks','hazardProduct'].includes(item.key) && <button onClick={()=>{
      const kind=item.key==='beams'?'beam':'column';const structural=['beams','columns'].includes(item.key);const object=structural?createStructuralObject(room,kind):{...createRoomObject(room),name:item.label,category:(item.group==='MEDIÇÕES'?'other':'equipment') as 'other'|'equipment',technicalItemKey:item.key}
      onChange({...room,objects:[...room.objects ?? [],object],...(structural?{structuralCounters:{column:room.structuralCounters?.column ?? 0,beam:room.structuralCounters?.beam ?? 0,[kind]:nextStructuralSequence(room,kind)}}:{}),objectCounter:nextObjectSequence(room),technicalChecks:{...room.technicalChecks,[item.key]:{...check,status:'pending',photoPrompted:true}}})
      onNavigate({id:`new:${object.id}`,roomId:room.id,elementId:object.id,description:item.label,kind:'technical'})
      offer?.({roomId:room.id,type:'room_object',entityId:object.id,label:`${object.displayId} — ${item.label}`})
    }}>＋ Cadastrar elemento</button>}{item.photo && <><small>Fotos da verificação</small><ElementPhotos room={room} type="technical_item" entityId={entityId}/>{objects.map(object=><div key={object.id}><small>{object.displayId} — {object.name}</small><ElementPhotos room={room} type="room_object" entityId={object.id}/></div>)}</>}</section>
  })}</details>)}</div>
}
