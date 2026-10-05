import type { Project,Room } from './models'
import { roomChecklist } from './checklist'
import type { ChecklistIssue } from './checklist'
import type { RoomGeometry } from './roomGeometry'
import { IssueList } from './ChecklistPanel'
export default function EnvironmentIssuesPanel({room,project,survey,onNavigate}:{room:Room;project:Project;survey:RoomGeometry;onNavigate:(issue:ChecklistIssue)=>void}) {
  const result=roomChecklist(room,project,survey)
  return <section className="environment-issues" aria-label="Pendências do ambiente"><h3>{result.issues.length ? `${result.issues.length} pendências para conferir`:'Tudo conferido'}</h3><p className="angle-help">Os alertas não impedem continuar o levantamento. Toque para abrir a categoria e o campo correspondente.</p>{(['automatic','manual','technical'] as const).map(kind=>{
    const issues=result.issues.filter(issue=>issue.kind===kind)
    return issues.length ? <details key={kind} open><summary>{kind==='automatic'?'Dados e medidas':kind==='manual'?'Conferir no local / medidas duvidosas':'Relações e pendências técnicas'} <span>{issues.length}</span></summary><IssueList issues={issues} onNavigate={onNavigate}/></details>:null
  })}</section>
}
