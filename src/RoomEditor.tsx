import {roomWallHeight} from './ceilingHeight'
import AssemblyChangeNotice from './AssemblyChangeNotice'
import NextWallPanel from './NextWallPanel'
import CornerConnectionsPanel from './CornerConnectionsPanel'
import { CompletionStats } from './TechnicalChecklistPanel'
import { ElementPhotos } from './PhotoActions'
import RoomObjectEditor from './RoomObjectEditor'
import { MeasurementInput, useMeasurements } from './Measurement'
import type { WallType } from './models'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Room } from './models'
import CornerEditor from './CornerEditor'
import DiagonalEditor from './DiagonalEditor'
import GeometryStatus from './GeometryStatus'
import OpeningEditor from './OpeningEditor'
import InternalWallEditor from './InternalWallEditor'
import { SharedWalls } from './RoomConnections'
import type { RoomOption } from './RoomConnections'
import type { Project } from './models'
import type { ChecklistIssue } from './checklist'
import { ManualMarkers, RoomChecklistPanel } from './ChecklistPanel'
import { removePerimeterWall } from './deletions'
import type { RoomGeometry } from './roomGeometry'
import RoomSummary from './RoomSummary'
import { roomMetrics } from './metrics'
import { roomChecklist } from './checklist'
import { readSyncConfig } from './sync'
import type { ReactNode } from 'react'
import EnvironmentNavigation from './EnvironmentTabs'
import EnvironmentIssuesPanel from './EnvironmentIssuesPanel'
import { ENVIRONMENT_SECTIONS, nextEnvironmentSection, sectionForIssue } from './environmentNavigation'
import type { EnvironmentSection } from './environmentNavigation'
import { unitNames } from './units'
import type { MeasurementUnit } from './units'
export default function RoomEditor({ room, survey, onChange, relatedRooms, project, onNavigate, focusIssue, selectedObjectId, onSelectObject, section, onSectionChange, photosPanel, reportPanel, onUnitChange, onChangeProject }: { room: Room; survey: RoomGeometry; onChange: (room: Room) => void; relatedRooms: RoomOption[]; project: Project; onNavigate: (issue: ChecklistIssue) => void; focusIssue?: ChecklistIssue; selectedObjectId?: string; onSelectObject?: (id: string) => void; section?: EnvironmentSection; onSectionChange?: (section: EnvironmentSection) => void; photosPanel?: ReactNode; reportPanel?: ReactNode; onChangeProject?: (project:Project)=>void; onUnitChange?: (unit: MeasurementUnit) => void }) {
  const { unit,format } = useMeasurements()
  const [localSection,setLocalSection]=useState<EnvironmentSection>('summary')
  const activeSection=section ?? localSection
  const switchSection=(next:EnvironmentSection)=>{setLocalSection(next);onSectionChange?.(next);requestAnimationFrame(()=>editorRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))}
  useEffect(()=>{if(focusIssue && focusIssue.roomId===room.id) switchSection(sectionForIssue(room,focusIssue))},[focusIssue,room.id])
  useEffect(()=>{if(selectedObjectId && room.objects?.some(object=>object.id===selectedObjectId)) switchSection('objects')},[selectedObjectId,room.id])
  const editorRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focusIssue || focusIssue.roomId !== room.id) return
    let highlighted: HTMLElement | undefined
    const frame = requestAnimationFrame(() => {
    const root = editorRef.current
    const target = [...root?.querySelectorAll<HTMLElement>('[data-pending-element]') ?? []].find(element => element.dataset.pendingElement === (focusIssue.field === 'geometry' ? 'geometry' : focusIssue.elementId))
    if(!target) return
    const field = focusIssue.field
    const control = field ? [...target?.querySelectorAll<HTMLElement>('input,select,textarea') ?? []].find(element => element.dataset.pendingField === field || element.id.endsWith(`-${field}`) || (field === 'lengthM' && element.id === focusIssue.elementId)) : undefined
    let ancestor: HTMLElement | null | undefined = target; while (ancestor && ancestor !== root) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement }
    highlighted = control ?? target ?? undefined
    if (!highlighted) return
    highlighted.classList.add('pending-focus')
    highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (control) control.focus({ preventScroll: true })
    })
    return () => { cancelAnimationFrame(frame); highlighted?.classList.remove('pending-focus') }
  }, [focusIssue, room.id, activeSection])
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [message, setMessage] = useState('')
  const { perimeter: geometry, openings: openingLayout, internalWalls: internalWallLayout } = survey
  const [nextWall,setNextWall]=useState<false|'next'|'closure'>(false)
  function addWall(){setNextWall('next');setMessage('Informe o comprimento. Enter confirma e continua para a próxima parede.')}
  const wallTypes: Record<WallType, string> = { masonry: 'Alvenaria', drywall: 'Drywall', concrete: 'Concreto', glass: 'Vidro', wood: 'Madeira', partition: 'Divisória', other: 'Outro' }
  const metrics = useMemo(() => roomMetrics(room, survey), [room, survey])
  const status = useMemo(() => roomChecklist(room, project, survey), [room, project, survey])
  return <section className="editor environment-editor" ref={editorRef}>
    <div className="section-top"><div><span className="eyebrow">DADOS DO AMBIENTE</span><h2>{ENVIRONMENT_SECTIONS.find(section=>section.id===activeSection)?.label}</h2></div><span className={`pill ${status.complete?'pill-complete':''}`}>{status.complete?'✓ Completo':`Em levantamento · ${status.completeness}%`}</span></div>
    {onChangeProject&&<AssemblyChangeNotice project={project} onChange={onChangeProject} roomId={room.id}/>}<EnvironmentNavigation active={activeSection} onChange={switchSection}/>
    <div id="environment-content" className="environment-content" role="tabpanel" aria-labelledby={`environment-tab-${activeSection}`} tabIndex={0}>
    {activeSection==='summary' && <div className="environment-summary-panel"><p className="environment-id">{room.displayId || 'Ambiente'}</p><div className="fields" data-pending-element={room.id} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); const fields = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input')]; const next = fields[fields.indexOf(event.target as HTMLInputElement) + 1]; if (next) next.focus(); else switchSection('perimeter') } }}><label>Nome do ambiente<input data-pending-field="name" value={room.name} onChange={e => onChange({ ...room, name: e.target.value })} placeholder="Ex.: Sala de estar"/></label><label>Pé-direito <span>({unit})</span><span className="input-suffix"><MeasurementInput data-pending-field="ceilingHeightM" placeholder="0,00" value={room.ceilingHeightM} onValue={value => onChange({ ...room, ceilingHeightM: value })}/><span aria-hidden="true">{unit}</span></span></label><label>Fechamento superior<select value={room.ceilingType??'suspended'} onChange={e=>onChange({...room,ceilingType:e.target.value as 'suspended'|'slab'})}><option value="suspended">Forro</option><option value="slab">Laje</option></select></label><ManualMarkers room={room} elementId={room.id}/></div><p className="muted">{room.ceilingHeightM==null?'Pé-direito padrão: 2,50 m. ':''}Altura da parede para Revit: {roomWallHeight(room).wallHeightM.toLocaleString('pt-BR')} m. {(room.ceilingType??'suspended')==='suspended'?'Inclui 0,50 m automático acima do forro.':'Sem acréscimo acima da laje.'}</p>

      <label>Unidade do projeto<select value={unit} disabled={!onUnitChange} onChange={event=>onUnitChange?.(event.target.value as MeasurementUnit)}>{Object.entries(unitNames).map(([value,label])=><option key={value} value={value}>{label} ({value})</option>)}</select></label>
      <label>Observações gerais<textarea rows={3} maxLength={2000} value={room.notes ?? ''} onChange={event=>onChange({...room,notes:event.target.value})} placeholder="Condições do ambiente e observações de campo"/></label>
      <CompletionStats result={status}/><div className="summary-completeness"><progress value={status.completeness} max={100} aria-label="Completude do ambiente"/><span>{status.completeness}% completo · {status.issues.length} pendências</span><button onClick={()=>switchSection('issues')}>Conferir pendências →</button></div>
      <div className="module-overview">{[{id:'perimeter',label:'Paredes',count:room.walls.length},{id:'openings',label:'Aberturas',count:room.openings.length},{id:'internal',label:'Paredes internas',count:room.internalWalls.length},{id:'objects',label:'Objetos',count:room.objects?.length ?? 0},{id:'photos',label:'Fotos',count:room.photos?.length ?? 0}].map(item=><button key={item.id} onClick={()=>switchSection(item.id as EnvironmentSection)}><strong>{item.count}</strong><span>{item.label}</span></button>)}</div>
      <ElementPhotos room={room} type="room" entityId={room.id}/></div>}
    {activeSection==='perimeter' && <><label>Referência das medidas das paredes<select value={room.wallMeasurementFace ?? 'internal'} onChange={e=>onChange({...room,wallMeasurementFace:e.target.value as 'internal'|'external'})}><option value="internal">Face interna do ambiente</option><option value="external">Face externa</option></select></label><p className="angle-help">Os comprimentos e cantos informados correspondem à face selecionada. Trocar a referência não converte nem altera as medidas.</p><div className="wall-heading"><div><h3>Paredes do perímetro</h3><p>Cadastre as paredes na ordem do levantamento.</p></div><span className="count">{room.walls.length}</span></div>
    <div className="guidance" data-pending-element="geometry">A primeira parede ({room.walls[0]?.label ?? 'A'}) corresponde, por padrão, à parede da entrada principal. Cadastre as paredes no sentido horário.</div>
    <div className="wall-list">{room.walls.length === 0 ? <div className="empty"><span>＋</span><h3>A primeira parede é a A</h3><p>Adicione uma parede e registre seu comprimento.</p></div> : room.walls.map(wall => <div className="wall-row" key={wall.id} data-pending-element={wall.id}><span className="wall-badge">{wall.label}</span><label htmlFor={wall.id}>Parede {wall.label}<span>Comprimento ({unit})</span></label><div className="measurement"><MeasurementInput id={wall.id} ref={el => { inputs.current[wall.id] = el }} enterKeyHint="next" onKeyDown={event => { if(event.key==='Escape'){event.preventDefault();event.currentTarget.blur();setNextWall(false)} if (event.key === 'Enter' && wall.lengthM != null && wall.lengthM > 0) { event.preventDefault(); const next = room.walls[room.walls.findIndex(item => item.id === wall.id) + 1]; if (next) inputs.current[next.id]?.focus(); else addWall() } }} placeholder="0,00" value={wall.lengthM} onValue={value => onChange({ ...room, walls: room.walls.map(w => w.id === wall.id ? { ...w, lengthM: value } : w) })}/><span>{unit}</span></div><button className="remove-wall" aria-label={`Excluir parede ${wall.label}`} onClick={() => { if (window.confirm(`Excluir a parede ${wall.label}? As medidas de aberturas, PIs e diagonais serão mantidas, mas as referências afetadas precisarão ser reassociadas.`)) onChange(removePerimeterWall(room, wall.id)) }}>Remover</button><details className="ui-disclosure wall-options" open={focusIssue?.elementId===wall.id}><summary>Mais opções · parede {wall.label}</summary><div className="wall-properties"><label>Espessura ({unit}, opcional)<MeasurementInput data-pending-field="thickness" value={wall.thickness} onValue={value => onChange({ ...room, walls: room.walls.map(item => item.id === wall.id ? { ...item, thickness: value } : item) })}/></label><label>Material / tipo de parede<select value={wall.wallType ?? ''} onChange={event => onChange({ ...room, walls: room.walls.map(item => item.id === wall.id ? { ...item, wallType: event.target.value as WallType || undefined } : item) })}><option value="">Não informado</option>{Object.entries(wallTypes).map(([type, name]) => <option key={type} value={type}>{name}</option>)}</select></label>{wall.wallType === 'other' && <label>Nome do tipo<input value={wall.customWallType ?? ''} onChange={event => onChange({ ...room, walls: room.walls.map(item => item.id === wall.id ? { ...item, customWallType: event.target.value } : item) })}/></label>}</div><ElementPhotos room={room} type="wall" entityId={wall.id}/></details><ManualMarkers room={room} elementId={wall.id}/></div>)}</div>
    <div className="wall-actions"><button className="primary" onClick={addWall}>＋ Próxima parede</button></div>{nextWall&&<NextWallPanel key={`${nextWall}:${room.walls.length}`} closing={nextWall==='closure'} room={room} survey={survey} onChange={onChange} onClose={()=>setNextWall(false)}/>}
    {geometry.segments.length>=3&&<div className="closure-controls"><p>Distância restante até o início: {format(geometry.closureM)}.</p><button onClick={()=>{if(geometry.endpointsMeet)onChange({...room,perimeterClosed:true});else setNextWall('closure')}}>{geometry.endpointsMeet?'Confirmar perímetro fechado':'Fechar perímetro…'}</button><p className="angle-help">O ajuste considera paredes, diagonais, ângulos medidos e o fechamento, mantendo os valores originais registrados.</p><button onClick={()=>onChange({...room,geometryAdjustment:true,perimeterClosed:true})}>Ajustar geometria</button><button onClick={()=>{onChange({...room,geometryAdjustment:false});setMessage('Medidas mantidas. Confira os resíduos indicados no croqui.')}}>Manter medidas e revisar</button>{room.geometryAdjustment&&<button onClick={()=>onChange({...room,geometryAdjustment:false})}>Restaurar geometria sem ajuste</button>}</div>}
    <details className="ui-disclosure" open={geometry.autoNotes.length>0 || room.corners.some(c=>c.angleSource==='informed') || !!focusIssue && room.corners.some(c=>c.id===focusIssue.elementId)}><summary>Ângulos dos cantos</summary><CornerEditor room={room} onChange={onChange} calculations={geometry.calculations} autoNotes={geometry.autoNotes}/></details>
    <DiagonalEditor room={room} onChange={onChange} checks={geometry.diagonalChecks}/>
<details className="ui-disclosure"><summary>Vinculação entre ambientes</summary>{onChangeProject && <CornerConnectionsPanel project={project} room={room} onChange={onChangeProject}/>}
{room.walls.length > 0 && <SharedWalls room={room} rooms={relatedRooms} onChange={onChange}/>}</details><div className="mobile-geometry-status"><GeometryStatus geometry={geometry}/></div></>}
    {activeSection==='openings' && <OpeningEditor key={focusIssue?.id ?? 'openings'} room={room} onChange={onChange} focusId={focusIssue?.elementId} checks={openingLayout.checks} relatedRooms={relatedRooms} project={project} onProjectChange={onChangeProject}/>}
    {activeSection==='internal' && <><InternalWallEditor room={room} onChange={onChange} checks={internalWallLayout.checks}/><div className="internal-elements-guide"><h3>Outros elementos existentes</h3><p>Pilares, vigas aparentes, muretas, escadas, rampas, cobogós e grades podem ser identificados com nome, dimensões, posição e fotos no cadastro de objetos.</p><button onClick={()=>switchSection('objects')}>Cadastrar em Objetos →</button></div></>}
    {activeSection==='objects' && <RoomObjectEditor room={room} onChange={onChange} selectedId={selectedObjectId} onSelect={onSelectObject}/>}
    {activeSection==='photos' && (photosPanel ?? <p>Abra Fotos do projeto para registrar imagens.</p>)}
    {activeSection==='checklist' && <RoomChecklistPanel onProjectChange={onChangeProject} room={room} survey={survey} project={project} onChange={onChange} onNavigate={onNavigate}/>}
    {activeSection==='issues' && <EnvironmentIssuesPanel room={room} project={project} survey={survey} onNavigate={onNavigate}/>}
    {activeSection==='report' && <><RoomSummary metrics={metrics}/>{reportPanel}</>}
    </div><div className="module-flow"><span>{ENVIRONMENT_SECTIONS.find(section=>section.id===activeSection)?.description}</span><button className="primary" onClick={()=>switchSection(nextEnvironmentSection(activeSection))}>Próximo: {ENVIRONMENT_SECTIONS.find(section=>section.id===nextEnvironmentSection(activeSection))?.label} →</button></div>
    <p className="sr-only" role="status">{message}</p><p className="memory-note">{readSyncConfig()?'Salvamento automático neste aparelho e sincronização com o servidor; funciona também sem conexão.':'Salvamento automático neste navegador e dispositivo.'}</p>
  </section>
}
