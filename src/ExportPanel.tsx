import LocalCleanupPanel from './LocalCleanupPanel'
import { scopedProject, exportScopeNames } from './exportScope'
import type { ExportScope } from './exportScope'
import { useRef, useState } from 'react'
import type { Floor, Project, Room } from './models'
import type { WorkspaceData } from './storage'
import ServerHistory from './ServerHistory'
import ProjectArchivePanel from './ProjectArchivePanel'
import PdfExportPanel from './PdfExportPanel'
import { createBackup, downloadText, importProjects, parseBackup, projectCsv } from './exporting'

// Exportações (relatório, planilha, backup) e importação de backup.
export default function ExportPanel({ workspace, project, floor, room, onImport, onReport, onChangeProject }: { workspace: WorkspaceData; project: Project; floor?: Floor; room?: Room; onImport: (data: WorkspaceData) => void; onReport: () => void; onChangeProject?:(project:Project)=>void }) {
  const [scope,setScope]=useState<ExportScope>(room?'room':'project')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string }>()
  const input = useRef<HTMLInputElement>(null)
  const run = (action: () => void) => { try { action() } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível exportar.' }) } }
  async function importFile(file: File) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('O arquivo é grande demais para um backup do LAC (máximo 20 MB).')
      const backup = parseBackup(await file.text())
      const result = importProjects(workspace, backup)
      if (result.replaced.length && !window.confirm(`O backup contém ${result.replaced.length === 1 ? 'o projeto' : 'os projetos'} “${result.replaced.join('”, “')}”, que já ${result.replaced.length === 1 ? 'existe' : 'existem'} aqui. ${backup.data.projects.some(p=>p.exportSelection)?'Restaurar somente o ambiente/pavimento exportado, preservando o restante do projeto?':'Substituir pela versão do backup?'}`)) { setMessage({ type: 'ok', text: 'Importação cancelada. Nada foi alterado.' }); return }
      onImport(result.data)
      setMessage({ type: 'ok', text: [result.added.length ? `Adicionado(s): ${result.added.join(', ')}.` : '', result.replaced.length ? `Substituído(s): ${result.replaced.join(', ')}.` : ''].filter(Boolean).join(' ') || 'Backup importado.' })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível importar o arquivo.' }) }
    finally { if (input.current) input.current.value = '' }
  }
  return <details className="export-panel"><summary>⇩ Exportar e importar</summary>
    <label>Escopo do JSON / backup<select value={scope} onChange={e=>setScope(e.target.value as ExportScope)}>{Object.entries(exportScopeNames).map(([value,label])=><option key={value} value={value} disabled={value==='room' && !room || ['floor','plan'].includes(value) && !floor}>{label}</option>)}</select></label><div className="export-actions">
      <button onClick={onReport}>Relatório (imprimir / PDF)</button>
      <button onClick={() => run(() => { const file = projectCsv(project); downloadText(file.fileName, file.text, 'text/csv;charset=utf-8'); setMessage({ type: 'ok', text: `Planilha ${file.fileName} gerada.` }) })}>Planilha do projeto (CSV)</button>
      <button onClick={() => run(() => { const file = createBackup({...workspace,projects:[scopedProject(project,scope,floor?.id,room?.id)]}, [project.id]); downloadText(file.fileName, file.text, 'application/json'); setMessage({ type: 'ok', text: `Backup ${file.fileName} gerado.` }) })}>Exportar {exportScopeNames[scope]} (JSON)</button>
      <button onClick={() => run(() => { const file = createBackup(workspace); downloadText(file.fileName, file.text, 'application/json'); setMessage({ type: 'ok', text: `Backup ${file.fileName} gerado.` }) })}>Backup de todos os projetos</button>
      <label className="import-button">Importar backup…<input ref={input} type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file) }}/></label>
    </div>
    <PdfExportPanel onChangeProject={onChangeProject} project={project} floor={floor} room={room}/>
    <ProjectArchivePanel workspace={workspace} project={project} onImport={onImport}/>
    <p className="muted">O arquivo .levantamento leva o projeto inteiro com as fotos; o backup JSON guarda as medidas (sem as imagens). Ambos podem ser importados em outro navegador ou aparelho.</p>
    <LocalCleanupPanel workspace={workspace} onReset={onImport}/>
    <ServerHistory/>
    {message && <p className={message.type === 'error' ? 'export-error' : 'export-ok'} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}
  </details>
}
