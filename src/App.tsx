import ResizableWorkspace from './ResizableWorkspace'
import { nextRoomSequence } from './projectMetadata'
import { nextVisualSequence } from './visualIds'
import { recalculateChecklist } from './checklist'
import FloorPlanPanel from './FloorPlanPanel'
import { cleanRoomPlacements } from './floorPlan'
import RoofsPanel from './RoofsPanel'
import PhotoOffer from './PhotoOffer'
import { PhotoOfferContext } from './PhotoActions'
import type { PhotoOfferRequest } from './PhotoActions'
import PhotoPanel from './PhotoPanel'
import WorkspaceHeader from './WorkspaceHeader'
import type { EnvironmentSection } from './environmentNavigation'
import { PhotoActionsContext } from './PhotoActions'
import type { PhotoRequest } from './PhotoActions'
import type { Photo, PhotoEntityType } from './models'
import { cleanProjectPhotoLinks, cleanRoomPhotoLinks, photoFileIds } from './photos'
import { queuePhotoDeletion } from './photoStorage'
import { UnitContext } from './Measurement'
import { ensureProjectMetadata, roomDisplayId } from './projectMetadata'
import { unitNames, isMeasurementUnit } from './units'
import UserMenu from './UserMenu'
import { InlineName, ItemMenu } from './ItemMenu'
import { useEffect, useMemo, useRef, useState } from 'react'
import { UndoHistory } from './undo'
import { applyTheme, isTheme, loadTheme, saveTheme } from './theme'
import type { ThemePreference } from './theme'
import type { Project, Room } from './models'
import { createRoom, findRoom, id, updateRoom } from './domain'
import RoomEditor from './RoomEditor'
import Sketch from './Sketch'
import { flattenRooms, reconcileRelationships, removeRoom } from './relationships'
import type { RoomOption } from './RoomConnections'
import { ProjectChecklistPanel } from './ChecklistPanel'
import type { ChecklistIssue } from './checklist'
import { useLocalWorkspace } from './useLocalWorkspace'
import { buildRoomGeometry } from './roomGeometry'
import ExportPanel from './ExportPanel'
import SyncConflicts from './SyncConflicts'
import type { SyncConflict } from './sync'
import Report from './Report'
import { syncStatusLong, syncStatusShort } from './sync'

function RoomTree({ rooms, selected, onSelect, onAdd, onDelete }: { rooms: Room[]; selected: string; onSelect: (id: string) => void; onAdd: (parent: string) => void; onDelete: (room: Room) => void }) {
  return <ul className="room-tree">{rooms.map(room => <li key={room.id}><div className="tree-row"><button className={selected === room.id ? 'selected' : ''} onClick={() => onSelect(room.id)}>▧ <span>{room.displayId && <small className="room-display-id">{room.displayId} </small>}{room.name || 'Sem nome'}</span></button><ItemMenu label={room.name || 'Ambiente sem nome'} actions={[{ label: 'Adicionar subambiente', onSelect: () => onAdd(room.id) }, { label: 'Excluir', danger: true, onSelect: () => onDelete(room) }]}/></div>{room.subrooms.length > 0 && <RoomTree rooms={room.subrooms} selected={selected} onSelect={onSelect} onAdd={onAdd} onDelete={onDelete}/>}</li>)}</ul>
}
const initialFloorId = id()
const initialRoom = createRoom('Sala', initialFloorId)
const initialFloor = { id: initialFloorId, name: 'Térreo', rooms: [initialRoom] }
const initialProject: Project = ensureProjectMetadata({ id: id(), name: 'Meu levantamento', floors: [initialFloor], relationships: [] })

export default function App() {
  const { workspace, setWorkspace, ready, loadError, status, saveError, retrySave, syncStatus, syncPending, syncMessage, retrySync, photoPending, conflicts, dismissConflict } = useLocalWorkspace({ projects: [initialProject], projectId: initialProject.id, floorId: initialFloor.id, roomId: initialRoom.id })
  const { projects, projectId, floorId, roomId } = workspace
  const workspaceRef = useRef(workspace); workspaceRef.current = workspace
  // Desfazer: só dados dos projetos (não a navegação). Incluir/excluir foto reinicia o histórico,
  // para que desfazer nunca deixe uma foto sem arquivo nem descarte um arquivo ainda vinculado.
  const history = useRef(new UndoHistory<Project[]>())
  const [undoSize, setUndoSize] = useState(0)
  const [photoOffer,setPhotoOffer]=useState<PhotoOfferRequest>()
  const [redoSize,setRedoSize]=useState(0)
  const [roomSection,setRoomSection]=useState<{roomId:string;section:EnvironmentSection}>()
  function setProjects(action: Project[] | ((projects: Project[]) => Project[])) {
    history.current.record(workspaceRef.current.projects); setUndoSize(history.current.size); setRedoSize(0)
    setWorkspace(current => {
    const next = typeof action === 'function' ? action(current.projects) : action
    const before = photoFileIds(current.projects), after = photoFileIds(next)
    before.forEach(fileId => { if (!after.has(fileId)) queuePhotoDeletion(fileId) })
    if (before.size !== after.size || [...after].some(fileId => !before.has(fileId))) { history.current.clear(); queueMicrotask(() => {setUndoSize(0);setRedoSize(0)}) }
    return { ...current, projects: next }
  }) }
  function undo() {
    const previous = history.current.undo(workspaceRef.current.projects); setUndoSize(history.current.size); setRedoSize(history.current.redoSize)
    if (!previous) return
    setWorkspace(current => {
      const project = previous.find(item => item.id === current.projectId) ?? previous[0]
      const floor = project?.floors.find(item => item.id === current.floorId) ?? project?.floors[0]
      const roomId = floor && findRoom(floor.rooms, current.roomId) ? current.roomId : floor?.rooms[0]?.id ?? ''
      return { ...current, projects: previous, projectId: project?.id ?? current.projectId, floorId: floor?.id ?? '', roomId }
    })
  }
  function redo() {
    const previous = history.current.redo(workspaceRef.current.projects); setUndoSize(history.current.size); setRedoSize(history.current.redoSize)
    if (!previous) return
    setWorkspace(current => {
      const project = previous.find(item => item.id === current.projectId) ?? previous[0]
      const floor = project?.floors.find(item => item.id === current.floorId) ?? project?.floors[0]
      const roomId = floor && findRoom(floor.rooms, current.roomId) ? current.roomId : floor?.rooms[0]?.id ?? ''
      return { ...current, projects: previous, projectId: project?.id ?? current.projectId, floorId: floor?.id ?? '', roomId }
    })
  }
  const undoRef = useRef(undo); undoRef.current = undo
  const redoRef=useRef(redo);redoRef.current=redo
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if ((event.ctrlKey || event.metaKey) && !target?.closest('input,textarea,select,[contenteditable=true]')) {
        if(event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redoRef.current():undoRef.current()}
        else if(event.key.toLowerCase()==='y'){event.preventDefault();redoRef.current()}
      }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])
  function resolveConflict(conflict: SyncConflict, keep: 'local' | 'remote') {
    const original = projects.find(item => item.id === conflict.projectId), copy = projects.find(item => item.id === conflict.copyId)
    if (original && copy) {
      const removed = keep === 'local' ? original.id : copy.id
      setProjects(items => items.filter(item => item.id !== removed).map(item => keep === 'local' && item.id === copy.id ? { ...item, name: original.name } : item))
      if (projectId === removed) { const next = keep === 'local' ? copy : original; setProjectId(next.id); setFloorId(next.floors[0]?.id ?? ''); setRoomId(next.floors[0]?.rooms[0]?.id ?? '') }
    }
    dismissConflict(conflict.id)
  }
  function setProjectId(value: string) { setWorkspace(current => ({ ...current, projectId: value })) }
  function setFloorId(value: string) { setWorkspace(current => ({ ...current, floorId: value })) }
  function setRoomId(value: string) { setWorkspace(current => ({ ...current, roomId: value })) }
  const [theme, setTheme] = useState<ThemePreference>(loadTheme)
  const [showPhotos, setShowPhotos] = useState(false)
  const [photoRequest, setPhotoRequest] = useState<PhotoRequest>()
  const [showRoofs,setShowRoofs]=useState(false)
  const [showPlan,setShowPlan]=useState(false)
  const [selectedRoofId,setSelectedRoofId]=useState<string>()
  const [showProjectChecklist, setShowProjectChecklist] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [objectSelection, setObjectSelection] = useState<{ roomId: string; objectId: string }>()
  const [focusIssue, setFocusIssue] = useState<ChecklistIssue>()
  const [showReport, setShowReport] = useState(false)
  // Um único lugar para renomear: projeto e pavimento no próprio item (⋯ → Renomear, edição ali mesmo);
  // ambiente e subambiente só no campo "Nome do ambiente" da tela do ambiente (sem atalho duplicado no menu).
  const [renaming, setRenaming] = useState<string>()
  const project = projects.find(p => p.id === projectId)!
  const floor = project.floors.find(f => f.id === floorId)
  const room = floor && findRoom(floor.rooms, roomId)
  const activeSection:EnvironmentSection=room && roomSection?.roomId===room.id ? roomSection.section : 'summary'
  function changeSection(section:EnvironmentSection){setShowPlan(false);setShowRoofs(false);if(room) setRoomSection({roomId:room.id,section});setShowPhotos(false);setShowProjectChecklist(false);setShowReport(false);setNavigationOpen(false)}
  function showGlobalPhotos(){setShowPlan(false);setShowRoofs(false);setShowPhotos(value=>!value);setPhotoRequest(undefined);setShowProjectChecklist(false);setShowReport(false);setNavigationOpen(false)}
  function showGlobalIssues(){setShowPlan(false);setShowRoofs(false);setShowProjectChecklist(value=>!value);setShowPhotos(false);setShowReport(false);setNavigationOpen(false)}
  function returnToRoom(){setShowPlan(false);setShowRoofs(false);setShowPhotos(false);setShowProjectChecklist(false);setShowReport(false)}
  const survey = useMemo(() => room ? buildRoomGeometry(room) : undefined, [room?.walls, room?.corners, room?.diagonals, room?.openings, room?.internalWalls])
  const selectedObjectId = objectSelection?.roomId === room?.id ? objectSelection?.objectId : undefined
  function selectObject(objectId: string) { if (room) { returnToRoom(); setRoomSection({roomId:room.id,section:'objects'}); setNavigationOpen(false); setObjectSelection({ roomId: room.id, objectId }); setFocusIssue(undefined) } }
  function openPhotos(targetRoomId: string, type?: PhotoEntityType, entityId?: string) { setShowPlan(false);setShowRoofs(false); setShowPhotos(false);setShowProjectChecklist(false);setShowReport(false);setRoomSection({roomId:targetRoomId,section:'photos'}); setPhotoRequest(current => ({ roomId: targetRoomId, type, entityId, token: (current?.token ?? 0) + 1 })) }
  function addPhoto(photo: Photo) {
    if (!workspaceRef.current.projects.some(project => project.floors.some(floor => findRoom(floor.rooms,photo.roomId)))) throw new Error('O ambiente foi excluído antes de registrar a foto.')
    setProjects(items => items.map(p => ({ ...p, floors: p.floors.map(f => ({ ...f, rooms: updateRoom(f.rooms,photo.roomId,r => cleanRoomPhotoLinks({ ...r, photos: [...r.photos ?? [], photo] })) })) })))
  }
  function updatePhoto(targetRoomId: string, photoId: string, changes: Partial<Photo>) { if(!targetRoomId || project.roofs?.some(r=>r.id===targetRoomId)){changeProject(p=>({...p,roofs:p.roofs?.map(r=>r.id===targetRoomId?{...r,photos:r.photos?.map(photo=>photo.id===photoId?{...photo,tags:changes.tags ?? photo.tags,note:changes.note ?? photo.note}:photo)}:r),detachedRoofPhotos:p.detachedRoofPhotos?.map(photo=>photo.id===photoId?{...photo,tags:changes.tags ?? photo.tags,note:changes.note ?? photo.note}:photo)}));return} setProjects(items => items.map(p => ({ ...p, floors: p.floors.map(f => ({ ...f, rooms: updateRoom(f.rooms,targetRoomId,r => cleanRoomPhotoLinks({ ...r, photos: (r.photos ?? []).map(photo => photo.id === photoId ? { ...photo, ...changes, id: photo.id, roomId: r.id, fileId: photo.fileId } : photo) })) })) }))) }
  function deletePhoto(targetRoomId: string, photoId: string) { if(!targetRoomId || project.roofs?.some(r=>r.id===targetRoomId)){changeProject(p=>({...p,roofs:p.roofs?.map(r=>r.id===targetRoomId?{...r,photos:r.photos?.filter(photo=>photo.id!==photoId)}:r),detachedRoofPhotos:p.detachedRoofPhotos?.filter(photo=>photo.id!==photoId)}));return} setProjects(items => items.map(p => ({ ...p, floors: p.floors.map(f => ({ ...f, rooms: updateRoom(f.rooms,targetRoomId,r => ({ ...r, photos: (r.photos ?? []).filter(photo => photo.id !== photoId) })) })) }))) }
  function navigatePhotoRoom(targetRoomId: string) { const targetFloor = project.floors.find(floor => findRoom(floor.rooms,targetRoomId)); if (targetFloor) { setFloorId(targetFloor.id); setRoomId(targetRoomId); setFocusIssue(undefined); setShowPhotos(false) } }
  function navigateIssue(issue: ChecklistIssue) {
    if(issue.field?.startsWith('roof:')){setSelectedRoofId(issue.elementId);setShowPlan(false);setShowRoofs(true);setShowProjectChecklist(false);setShowPhotos(false);setShowReport(false);setNavigationOpen(false);return}

    const targetFloor = project.floors.find(item => findRoom(item.rooms, issue.roomId))
    if (!targetFloor) return
    const targetRoom=findRoom(targetFloor.rooms,issue.roomId)
    setObjectSelection(issue.elementId && (targetRoom?.objects?.some(object=>object.id===issue.elementId) || issue.id.startsWith('new:')) ? {roomId:issue.roomId,objectId:issue.elementId}:undefined)
    setFloorId(targetFloor.id); setRoomId(issue.roomId); returnToRoom(); setFocusIssue({ ...issue })
  }
  const relatedRooms: RoomOption[] = project.floors.flatMap(f => {
    function options(rooms: Room[], path: string): RoomOption[] { return rooms.flatMap(r => [{ room: r, path: `${path} / ${r.name || 'Sem nome'}` }, ...options(r.subrooms, `${path} / ${r.name || 'Sem nome'}`)]) }
    return options(f.rooms, f.name || 'Sem nome')
  }).filter(item => item.room.id !== roomId)
  function changeProject(change: (p: Project) => Project) { setProjects(items => items.map(p => p.id === projectId ? cleanRoomPlacements(cleanProjectPhotoLinks(recalculateChecklist(reconcileRelationships(change(p),p)))) : p)) }
  function deleteRoom(target: Room) {
    if (!window.confirm(`Excluir “${target.name}” e seus subambientes? As medidas e os vínculos serão removidos.`)) return
    changeProject(p => ({ ...p, floors: p.floors.map(f => ({ ...f, rooms: removeRoom(f.rooms, target.id) })) }))
    if (flattenRooms([target]).some(item => item.id === roomId)) setRoomId(target.parentRoomId ?? '')
  }
  function deleteFloor(targetId: string) {
    const target = project.floors.find(item => item.id === targetId)!
    if (!window.confirm(`Excluir o pavimento “${target.name}” e todos os seus ambientes?`)) return
    changeProject(p => ({ ...p, floors: p.floors.filter(item => item.id !== targetId),roofs:p.roofs?.map(r=>r.floorId===targetId?{...r,floorId:undefined}:r) }))
    if (floorId === targetId) { const next = project.floors.find(item => item.id !== targetId); setFloorId(next?.id ?? ''); setRoomId(next?.rooms[0]?.id ?? '') }
  }
  function deleteProject() {
    if (!window.confirm(`Excluir o projeto “${project.name}” e todos os seus dados?`)) return
    const remaining = projects.filter(item => item.id !== projectId)
    const next = remaining[0] ?? { id: id(), name: 'Novo projeto', measurementUnit: 'm' as const, roomDisplayCounter: 0, floors: [], relationships: [] }
    setProjects(remaining.length ? remaining : [next]); setProjectId(next.id); setFloorId(next.floors[0]?.id ?? ''); setRoomId(next.floors[0]?.rooms[0]?.id ?? '')
  }
  function addProject() { const next: Project = { id: id(), name: `Projeto ${nextVisualSequence(projects.map(p=>p.name),'Projeto')}`, measurementUnit: 'm', roomDisplayCounter: 0, floors: [], relationships: [] }; setProjects([...projects, next]); setProjectId(next.id); setFloorId(''); setRoomId('') }
  function addFloor() { const next = { id: id(), name: `Pavimento ${nextVisualSequence(project.floors.map(f=>f.name),'Pavimento')}`, rooms: [] }; changeProject(p => ({ ...p, floors: [...p.floors, next] })); setFloorId(next.id); setRoomId('') }
  function addRoom(parent?: string) {
    if (!floor) return
    const sequence = nextRoomSequence(project)
    const next = { ...createRoom(parent ? 'Novo subambiente' : 'Novo ambiente', floor.id, parent), displayId: roomDisplayId(sequence) }
    changeProject(p => ({ ...p, roomDisplayCounter: sequence, floors: p.floors.map(f => f.id === floorId ? { ...f, rooms: parent ? updateRoom(f.rooms, parent, r => ({ ...r, subrooms: [...r.subrooms, next] })) : [...f.rooms, next] } : f) }))
    setRoomId(next.id)
    setRoomSection({roomId:next.id,section:'summary'});returnToRoom();setPhotoOffer({roomId:next.id,type:'room',entityId:next.id,label:next.name})
    setNavigationOpen(false)
  }

  function changeRoom(next: Room) { changeProject(p => ({ ...p, floors: p.floors.map(f => f.id === floorId ? { ...f, rooms: updateRoom(f.rooms, next.id, () => next) } : f) })) }
  if (!ready) return <main className="loading-workspace"><h1>LAC</h1>{loadError ? <><p role="alert">{loadError}</p><button onClick={() => window.location.reload()}>Tentar novamente</button></> : <p role="status">Abrindo seus projetos…</p>}</main>
  return <PhotoOfferContext value={setPhotoOffer}><PhotoActionsContext value={openPhotos}><UnitContext value={project.measurementUnit ?? 'm'}><WorkspaceHeader projectName={project.name} roomName={showPlan?'Planta Geral':showRoofs?'Telhados do projeto':room ? `${room.displayId ?? ''} — ${room.name || 'Sem nome'}` : 'Organize seu levantamento'} theme={theme} onThemeChange={value=>{if(isTheme(value)){setTheme(value);saveTheme(value);applyTheme(value)}}} onUndo={undo} onRedo={redo} undoCount={undoSize} redoCount={redoSize} onPhotos={showGlobalPhotos} onIssues={showGlobalIssues}><div className="save-indicator"><span className="session" role="status" aria-live="polite">{status === 'saving' ? 'Salvando...' : status === 'saved' ? '✓ Salvo localmente' : 'Não foi possível salvar'}</span>{status === 'error' && <button onClick={retrySave}>Tentar salvar novamente</button>}{syncStatus !== 'off' && <span className={`sync-status sync-${syncStatus === 'synced' ? 'synced' : 'pending'}`} title={syncMessage || syncStatusLong(syncStatus, syncPending)} role="status" aria-live="polite"><span aria-hidden="true">☁ </span>{syncStatus === 'synced' && photoPending > 0 ? `Sincronizando... (${photoPending} foto${photoPending > 1 ? 's' : ''})` : syncStatusShort[syncStatus]}{syncStatus !== 'synced' && syncPending > 0 ? ` (${syncPending})` : ''}<span className="sr-only">. {syncStatusLong(syncStatus, syncPending)}</span></span>}{syncStatus === 'auth' && <a className="sync-login" href="entrar">Entrar</a>}{syncStatus === 'error' && <button onClick={retrySync}>Tentar sincronizar</button>}</div><UserMenu/></WorkspaceHeader>
    {saveError && <div className="save-error" role="alert">{saveError} Os dados continuam abertos para edição. Tente salvar novamente antes de fechar.</div>}
    <button className="mobile-navigation" aria-expanded={navigationOpen} aria-controls="project-navigation" onClick={() => setNavigationOpen(value => !value)}>{navigationOpen ? 'Recolher projeto' : '☰ Projeto e ambientes'}</button><div className={`app-shell ${navigationOpen ? 'nav-open' : ''}`}><nav id="project-navigation" className={`sidebar ${navigationOpen ? 'navigation-open' : ''}`} aria-label="Organização do levantamento"><div className="sidebar-title"><span className="eyebrow">SEU LEVANTAMENTO</span><button onClick={addProject} aria-label="Criar projeto" title="Criar projeto">＋</button></div>
      <div className="field-label" id="project-label">Projeto</div>
      <div className="item-row">{renaming === projectId ? <InlineName value={project.name} label="Nome do projeto" onCommit={name => changeProject(p => ({ ...p, name }))} onDone={() => setRenaming(undefined)}/> : <select aria-labelledby="project-label" value={projectId} onChange={e => { const next = projects.find(p => p.id === e.target.value)!; setProjectId(next.id); setFloorId(next.floors[0]?.id || ''); setRoomId(next.floors[0]?.rooms[0]?.id || '') }}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}<ItemMenu label={`Projeto ${project.name}`} actions={[{ label: 'Renomear projeto', onSelect: () => setRenaming(projectId) }, { label: 'Excluir projeto', danger: true, onSelect: deleteProject }]}/></div>
      <label>Unidade de medida<select value={project.measurementUnit ?? 'm'} onChange={event => { const unit = event.target.value; if (isMeasurementUnit(unit)) changeProject(p => ({ ...p, measurementUnit: unit })) }}>{Object.entries(unitNames).map(([unit, name]) => <option key={unit} value={unit}>{name} ({unit})</option>)}</select></label>
      <div className="nav-heading"><h3>Pavimentos</h3><button onClick={addFloor} aria-label="Adicionar pavimento">＋</button></div>
      {project.floors.map(f => <div key={f.id} className="floor-block"><div className="item-row">{renaming === f.id ? <InlineName value={f.name} label="Nome do pavimento" onCommit={name => changeProject(p => ({ ...p, floors: p.floors.map(item => item.id === f.id ? { ...item, name } : item) }))} onDone={() => setRenaming(undefined)}/> : <button className={`floor-button ${floorId === f.id ? 'active' : ''}`} onClick={() => { setFloorId(f.id); setRoomId(f.rooms[0]?.id || '') }}>▱ {f.name || 'Sem nome'}</button>}<ItemMenu label={`Pavimento ${f.name || 'sem nome'}`} actions={[{ label: 'Renomear pavimento', onSelect: () => setRenaming(f.id) }, { label: 'Excluir pavimento', danger: true, onSelect: () => deleteFloor(f.id) }]}/></div>{floorId === f.id && <><RoomTree rooms={f.rooms} selected={roomId} onSelect={value => { setRoomId(value); returnToRoom(); setNavigationOpen(false) }} onAdd={addRoom} onDelete={deleteRoom}/><button className="new-room" onClick={() => addRoom()}>＋ Novo ambiente</button></>}</div>)}
      <button onClick={()=>{setShowPlan(true);setShowRoofs(false);setShowPhotos(false);setShowProjectChecklist(false);setShowReport(false);setNavigationOpen(false);if(!floorId&&project.floors[0])setFloorId(project.floors[0].id)}} aria-expanded={showPlan}>▦ PLANTA GERAL</button>{!project.floors.length && <p className="muted">Adicione um pavimento para começar.</p>}<button onClick={()=>{setShowPlan(false);setShowRoofs(true);setShowPhotos(false);setShowProjectChecklist(false);setShowReport(false);setNavigationOpen(false)}} aria-expanded={showRoofs}>⌂ TELHADOS</button><button onClick={showGlobalPhotos} aria-expanded={showPhotos}>📷 FOTOS</button><button onClick={showGlobalIssues} aria-expanded={showProjectChecklist}>⚑ Pendências do projeto</button><ExportPanel onChangeProject={next=>changeProject(()=>next)} workspace={workspace} project={project} floor={floor} room={room} onImport={data => { history.current.clear(); setUndoSize(0); setRedoSize(0); setWorkspace(data);setShowPlan(false); setShowReport(false); setNavigationOpen(false) }} onReport={() => { setShowPlan(false);setShowRoofs(false);setShowReport(true); setNavigationOpen(false); window.scrollTo(0, 0) }}/><div className="sidebar-foot">Projeto → Pavimento → Ambiente → Subambiente</div>
    </nav><main><SyncConflicts conflicts={conflicts} projects={projects} onResolve={resolveConflict} onDismiss={dismissConflict}/>{!showPlan && !showRoofs && photoOffer && photoOffer.roomId===room?.id && <PhotoOffer key={photoOffer.entityId} request={photoOffer} onAdd={addPhoto} onClose={()=>setPhotoOffer(current=>current?.entityId===photoOffer.entityId?undefined:current)}/>}<div className="page-heading"><p className="breadcrumb">{project.name} <span>/</span> {showPlan?'Planta Geral':showRoofs?'Telhados':floor?.name || 'Sem pavimento'}</p><h1>{!showPlan && !showRoofs && room?.displayId && <small className="room-heading-id">{room.displayId} — </small>}{showPlan?'Planta Geral':showRoofs?'Telhados do projeto':room?.name || 'Organize seu levantamento'}</h1><p>Meça, registre e mantenha as informações do ambiente em um só lugar.</p></div><ResizableWorkspace disabled={showPlan||showRoofs} className={`${showPlan?'plan-mode':showRoofs?'roof-mode':''}`}><div className="editor-column">{(showPlan || showRoofs || showPhotos || showProjectChecklist || showReport) && <button className="back-to-environment" onClick={returnToRoom}>← Voltar ao ambiente</button>}{showPlan ? <FloorPlanPanel key={project.id} project={project} floorId={floorId} onFloor={setFloorId} onChange={next=>changeProject(()=>next)} onOpenRoom={target=>{const f=project.floors.find(f=>findRoom(f.rooms,target));if(f){setFloorId(f.id);setRoomId(target);returnToRoom()}}}/> : showRoofs ? <RoofsPanel key={project.id} project={project} initialRoofId={selectedRoofId} onChange={next=>changeProject(()=>next)}/> : showReport ? <Report project={project} onClose={returnToRoom}/> : showPhotos ? <PhotoPanel key={project.id} project={project} request={photoRequest} onAdd={addPhoto} onUpdate={updatePhoto} onDelete={deletePhoto} onNavigate={navigatePhotoRoom} onNavigateRoof={roofId=>navigateIssue({id:`roof:${roofId}`,roomId:roofId,elementId:roofId,field:'roof:navigation',description:'',kind:'technical'})}/> : showProjectChecklist ? <ProjectChecklistPanel project={project} onNavigate={navigateIssue}/> : room ? <RoomEditor onChangeProject={next=>changeProject(()=>next)} section={activeSection} onSectionChange={changeSection} onUnitChange={unit=>changeProject(p=>({...p,measurementUnit:unit}))} photosPanel={<PhotoPanel key={project.id+room.id} initialRoomId={room.id} project={project} request={photoRequest?.roomId===room.id?photoRequest:undefined} onAdd={addPhoto} onUpdate={updatePhoto} onDelete={deletePhoto} onNavigate={navigatePhotoRoom} onNavigateRoof={roofId=>navigateIssue({id:`roof:${roofId}`,roomId:roofId,elementId:roofId,field:'roof:navigation',description:'',kind:'technical'})}/>} reportPanel={<ExportPanel onChangeProject={next=>changeProject(()=>next)} workspace={workspace} project={project} floor={floor} room={room} onImport={data=>{history.current.clear();setUndoSize(0);setRedoSize(0);setWorkspace(data);returnToRoom()}} onReport={()=>setShowReport(true)}/>} selectedObjectId={selectedObjectId} onSelectObject={selectObject} key={room.id} room={room} survey={survey!} onChange={changeRoom} relatedRooms={relatedRooms} project={project} onNavigate={navigateIssue} focusIssue={focusIssue?.roomId === room.id ? focusIssue : undefined}/> : <section className="editor empty"><h2>{floor ? 'Crie seu primeiro ambiente' : 'Crie um pavimento'}</h2><p>Cada ambiente terá suas próprias medidas e seu próprio croqui.</p><button className="primary" onClick={() => floor ? addRoom() : addFloor()}>{floor ? '＋ Novo ambiente' : '＋ Novo pavimento'}</button></section>}</div>{!showPlan && !showRoofs && <Sketch project={project} selectedObjectId={selectedObjectId} onSelectObject={selectObject} key={'sketch-' + (room?.id ?? 'empty')} room={room} survey={survey} onLabelScaleChange={room ? scale => changeRoom({ ...room, sketchLabelScale: scale }) : undefined} onLabelOffsetsChange={room ? offsets => changeRoom({ ...room, labelOffsets: offsets }) : undefined} onObjectsChange={room ? objects => changeRoom({ ...room, objects }) : undefined} onFocusField={room ? (elementId, field) => navigateIssue({ id: `sketch:${elementId}:${Date.now()}`, roomId: room.id, elementId, field, description: '', kind: 'automatic' }) : undefined} focusElementId={focusIssue?.roomId === room?.id ? focusIssue?.elementId : undefined}/>}</ResizableWorkspace></main></div></UnitContext></PhotoActionsContext></PhotoOfferContext>
}
