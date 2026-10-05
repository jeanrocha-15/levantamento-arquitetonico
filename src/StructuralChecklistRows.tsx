import type { Room } from './models'
import type { ChecklistIssue } from './checklist'
import { structuralVerification } from './structural'
import { ElementPhotos } from './PhotoActions'
export default function StructuralChecklistRows({room,itemKey,onNavigate}:{room:Room;itemKey:string;onNavigate:(issue:ChecklistIssue)=>void}) {
  return <section className="technical-check-row"><h4>{itemKey==='beams'?'Vigas':'Pilares'} — verificações por elemento</h4><p>Forma, dimensões e material entram na conclusão uma vez por elemento cadastrado.</p>{room.objects?.filter(o=>o.category==='structural' && o.technicalItemKey===itemKey).map(object=><div key={object.id}><h4>{object.displayId} — {object.name}</h4>{structuralVerification(object).map(check=><button key={check.key} onClick={()=>onNavigate({id:`structural:${object.id}:${check.key}`,roomId:room.id,elementId:object.id,field:check.key,description:check.label,kind:'technical'})}>{check.completed?'✓':'⚠'} {check.label} →</button>)}<ElementPhotos room={room} type="room_object" entityId={object.id}/></div>)}</section>
}
