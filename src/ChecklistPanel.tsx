import { isGeneralCheckField } from './technicalChecklist'
import TechnicalChecklistPanel, { CompletionStats } from './TechnicalChecklistPanel'
import { useMemo, useState } from 'react'
import type { Project, Room } from './models'
import { id } from './domain'
import { roomChecklist, measurementTargets, projectChecklistSummary } from './checklist'
import type { ChecklistIssue } from './checklist'
import { flattenRooms } from './relationships'
import type { RoomGeometry } from './roomGeometry'

export function ManualMarkers({ room, elementId }: { room: Room; elementId: string }) {
  const items = room.pendingItems.filter(item => !item.resolved && item.elementId === elementId)
  return items.length ? <div className="manual-markers">{items.map(item => <span key={item.id} title={item.note}>{item.kind === 'technical' ? '⚠ Pendência técnica' : `⚑ ${item.reason === 'doubtful' ? 'Medida duvidosa' : 'Conferir no local'}`}{item.field ? ` · ${measurementTargets(room).find(target => target.elementId === elementId && target.field === item.field)?.label.split(' — ')[1] ?? item.field}` : ''}{item.note && <small>{item.note}</small>}</span>)}</div> : null
}
export function IssueList({ issues, onNavigate }: { issues: ChecklistIssue[]; onNavigate: (issue: ChecklistIssue) => void }) {
  return <ul className="issue-list">{issues.map(issue => <li key={issue.id}><button onClick={() => onNavigate(issue)}><span>{issue.kind === 'manual' ? '⚑' : '⚠'}</span><span>{issue.description}{issue.note && <small>{issue.note}</small>}<small>{issue.kind === 'technical' ? 'Pendência técnica' : issue.kind === 'manual' ? 'Marcação manual' : 'Verificação automática'}</small></span><span aria-hidden="true">→</span></button></li>)}</ul>
}
export function RoomChecklistPanel({ room, project, survey, onChange, onNavigate, onProjectChange }: { room: Room; project: Project; survey?: RoomGeometry; onChange: (room: Room) => void; onProjectChange?: (project:Project)=>void; onNavigate: (issue: ChecklistIssue) => void }) {
  const result = useMemo(() => roomChecklist(room, project, survey), [room, project, survey])
  const targets = useMemo(() => measurementTargets(room), [room])
  const [targetKey, setTargetKey] = useState(room.id)
  const [reason, setReason] = useState<'check_on_site' | 'doubtful'>('check_on_site')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')
  const target = targets.find(item => item.key === targetKey) ?? targets[0]
  const stored = room.pendingItems
  return <section className="checklist-panel" aria-label="Checklist do ambiente">
    <CompletionStats result={result}/><TechnicalChecklistPanel result={result} room={room} project={project} onChange={onChange} onProjectChange={onProjectChange} onNavigate={onNavigate}/><div className="completeness"><div><h3>Checklist do ambiente</h3><strong>{result.completeness}% completo</strong><p>{result.complete ? '✓ Completa — sem pendências' : `⚠ ${result.issues.length} pendência${result.issues.length === 1 ? '' : 's'}`}</p></div><progress aria-label="Completude do ambiente" value={result.completeness} max={100}/></div>
    <p className="angle-help">A porcentagem considera o preenchimento dos dados necessários. Mesmo com 100%, confira os alertas e as medidas duvidosas.</p>
    <details><summary>Ver pendências do ambiente ({result.issues.length})</summary><IssueList issues={result.issues} onNavigate={onNavigate}/></details>
    <details><summary>Marcar medida ou elemento para conferir</summary><form className="manual-form" onSubmit={event => {
      event.preventDefault()
      const description = `${target.label}: ${reason === 'doubtful' ? 'Medida duvidosa' : 'Conferir no local'}`
      const existing = stored.find(item => !item.resolved && item.kind !== 'technical' && item.elementId === target.elementId && item.field === target.field && item.reason === reason)
      const item = { id: existing?.id ?? id(), description, kind: 'manual' as const, reason, elementId: target.elementId, field: target.field, note: note.trim(), resolved: false }
      onChange({ ...room, pendingItems: existing ? stored.map(saved => saved.id === existing.id ? item : saved) : [...stored, item] }); setNote(''); setStatus('Marcação registrada.')
    }}>
      <label>Medida ou elemento<select value={target.key} onChange={event => setTargetKey(event.target.value)}>{targets.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>Marcação<select value={reason} onChange={event => setReason(event.target.value as typeof reason)}><option value="check_on_site">Conferir no local</option><option value="doubtful">Medida duvidosa</option></select></label>
      <label>Observação da pendência (opcional)<input maxLength={240} value={note} onChange={event => setNote(event.target.value)}/></label><button type="submit">⚑ Registrar marcação</button>
    </form><p role="status">{status}</p></details>
    {stored.length > 0 && <details><summary>Gerenciar marcações e avisos técnicos</summary><ul className="stored-pending">{stored.map(item => <li key={item.id}><label><input type="checkbox" checked={item.resolved} onChange={event => onChange({ ...room, pendingItems: stored.map(saved => saved.id === item.id ? { ...saved, resolved: event.target.checked } : saved) })}/><span>{item.description}{item.note && <small>{item.note}</small>}<small>{item.resolved ? 'Conferida' : 'A conferir'} · {item.kind === 'technical' ? 'Técnica' : 'Manual'}</small></span></label><button onClick={() => onChange({ ...room, pendingItems: stored.filter(saved => saved.id !== item.id) })} aria-label={`Excluir marcação: ${item.description}`}>Remover</button></li>)}</ul></details>}
  </section>
}
export function ProjectChecklistPanel({ project, onNavigate }: { project: Project; onNavigate: (issue: ChecklistIssue) => void }) {
  function entries(rooms: Room[], parent = ''): { room: Room; path: string }[] { return rooms.flatMap(room => [{ room, path: parent + (room.name || 'Sem nome') }, ...entries(room.subrooms, parent + (room.name || 'Sem nome') + ' / ')]) }
  const results = useMemo(() => new Map(project.floors.flatMap(floor => flattenRooms(floor.rooms)).map(room => [room.id, roomChecklist(room, project)])), [project])
  const summary=projectChecklistSummary(project,[...results.values()]), count=summary.issues.length
  const generalIssues=summary.issues.filter(issue=>isGeneralCheckField(issue.field))
  return <section className="editor project-checklist" aria-label="Pendências do projeto"><span className="eyebrow">ANTES DE SAIR DA OBRA</span><h2>Pendências do projeto</h2><CompletionStats result={summary}/>{generalIssues.length>0 && <details open><summary>Dados gerais do projeto</summary><IssueList issues={generalIssues} onNavigate={onNavigate}/></details>}<p>{count ? `⚠ ${count} pendências a conferir` : '✓ Nenhuma pendência nos ambientes cadastrados'}</p>{!project.floors.length && <p>Cadastre um pavimento e seus ambientes para iniciar a conferência.</p>}{project.floors.map(floor => <section key={floor.id}><h3>{floor.name || 'Pavimento sem nome'}</h3>{!floor.rooms.length && <p>Sem ambientes cadastrados.</p>}{entries(floor.rooms).map(({ room, path }) => {
    const result = results.get(room.id)!
    return <div className="project-room-check" key={room.id}><h4><button onClick={() => onNavigate({ id: `room:${room.id}`, roomId: room.id, elementId: room.id, description: path, kind: 'automatic' })}>{path} →</button></h4><p>{result.completeness}% completo · {result.complete ? '✓ Completa' : `⚠ ${result.issues.length} pendência${result.issues.length === 1 ? '' : 's'}`}</p><IssueList issues={result.issues.filter(issue=>!isGeneralCheckField(issue.field))} onNavigate={onNavigate}/></div>
  })}</section>)}</section>
}
