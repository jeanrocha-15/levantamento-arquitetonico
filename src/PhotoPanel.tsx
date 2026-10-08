import { importSurveyPhoto } from './photoImport'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Photo, Project, Room } from './models'
import type { PhotoRequest } from './PhotoActions'
import { projectRooms } from './relationships'
import { parsePhotoTags, photoTargets, photoTypeNames, searchPhotos,searchRoofPhotos,allProjectPhotos } from './photos'
import type { PhotoFilters } from './photos'
import { readPhotoFile } from './photoStorage'

function usePhotoUrl(fileId: string, thumbnail: boolean) {
  const [url, setUrl] = useState(''), [error, setError] = useState('')
  // Recarrega quando o arquivo chega de outro aparelho (sincronização de fotos).
  const [arrived, setArrived] = useState(0)
  useEffect(() => { const listener = (event: Event) => { if ((event as CustomEvent<string>).detail === fileId) setArrived(value => value + 1) }; window.addEventListener('campo-photo-available', listener); return () => window.removeEventListener('campo-photo-available', listener) }, [fileId])
  useEffect(() => {
    let disposed = false, objectUrl = ''
    setUrl(''); setError('')
    void readPhotoFile(fileId,thumbnail).then(blob => { if (!disposed) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } }).catch(error => { if (!disposed) setError(error instanceof Error ? error.message : 'Não foi possível abrir a imagem.') })
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [fileId,thumbnail,arrived])
  return { url, error }
}
export function Thumbnail({ photo }: { photo: Photo }) {
  const { url, error } = usePhotoUrl(photo.fileId,true)
  return url ? <img className="photo-thumbnail" src={url} alt={photo.originalFileName} loading="lazy" decoding="async"/> : <div className="photo-thumbnail photo-placeholder">{error ? 'Miniatura indisponível' : 'Carregando…'}</div>
}
export function FullPhoto({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const { url, error } = usePhotoUrl(photo.fileId,false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog className="photo-viewer" ref={dialog} aria-label={`Foto ${photo.originalFileName}`} onCancel={onClose}><div><strong>{photo.originalFileName}</strong><button onClick={onClose} autoFocus>Fechar foto</button></div>{url ? <img src={url} alt={photo.note || photo.originalFileName}/> : <p role="status">{error || 'Abrindo foto…'}</p>}</dialog>
}
function PhotoCard({ photo, room, onUpdate, onDelete, onView, onNavigate }: { photo: Photo; room: Room; onUpdate: (roomId: string,id: string,changes: Partial<Photo>) => void; onDelete: (roomId: string,id: string) => void; onView: (photo: Photo) => void; onNavigate: (roomId: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tags, setTags] = useState(photo.tags.join(', '))
  useEffect(() => { setTags(photo.tags.join(', ')) }, [photo.tags])
  const targets = photoTargets(room)
  const key = photo.linkedEntityType && photo.linkedEntityId ? `${photo.linkedEntityType}:${photo.linkedEntityId}` : ''
  return <article className="photo-card" aria-label={photo.originalFileName}>
    <button className="photo-preview-button" onClick={() => onView(photo)} aria-label={`Abrir foto ${photo.originalFileName}`}><Thumbnail photo={photo}/></button>
    <h4>{photo.originalFileName}</h4><button className="photo-room-link" onClick={() => onNavigate(room.id)}>{room.displayId} — {room.name || 'Sem nome'}</button>
    <p className="photo-date">Registrada em {new Date(photo.createdAt).toLocaleString('pt-BR')}</p>
    <details className="ui-disclosure"><summary>Vínculo, tags e observação</summary><div className="ui-options-grid"><label>Vínculo<select value={targets.some(target => `${target.type}:${target.id}` === key) ? key : ''} onChange={event => { const target = targets.find(target => `${target.type}:${target.id}` === event.target.value); onUpdate(room.id,photo.id,{ linkedEntityType: target?.type, linkedEntityId: target?.id }) }}><option value="">Sem vínculo específico</option>{targets.map(target => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.label}</option>)}</select></label>
    <label>Tags (separadas por vírgula)<input value={tags} onChange={event => setTags(event.target.value)} onBlur={() => onUpdate(room.id,photo.id,{ tags: parsePhotoTags(tags) })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }}/></label>
    <label>Observação<textarea rows={2} value={photo.note ?? ''} onChange={event => onUpdate(room.id,photo.id,{ note: event.target.value })}/></label>
    </div></details><button className="button-danger button-tertiary" onClick={() => setConfirmDelete(true)}>Excluir foto</button>
    {confirmDelete && <div className="object-delete-confirmation" role="alertdialog" aria-label={`Excluir ${photo.originalFileName}?`}><p>Excluir esta foto e seu arquivo deste navegador?</p><button onClick={() => setConfirmDelete(false)} autoFocus>Cancelar</button><button onClick={() => onDelete(room.id,photo.id)}>Confirmar exclusão</button></div>}
  </article>
}
export default function PhotoPanel({ project, request, initialRoomId, onAdd, onUpdate, onDelete, onNavigate, onNavigateRoof }: { project: Project; request?: PhotoRequest; initialRoomId?: string; onAdd: (photo: Photo) => void; onUpdate: (roomId: string,id: string,changes: Partial<Photo>) => void; onDelete: (roomId: string,id: string) => void; onNavigate: (roomId: string) => void;onNavigateRoof?:(roofId:string)=>void }) {
  const rooms = useMemo(() => projectRooms(project), [project])
  const [uploadRoomId, setUploadRoomId] = useState(request?.roomId ?? initialRoomId ?? rooms[0]?.id ?? '')
  const [targetKey, setTargetKey] = useState('')
  const [filters, setFilters] = useState<PhotoFilters>({ query: '', roomId: initialRoomId ?? '', type: '', link: 'all' })
  const [visible, setVisible] = useState(24)
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('')
  const [viewing, setViewing] = useState<Photo>()
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null), panel = useRef<HTMLElement>(null)
  const uploadRoom = rooms.find(room => room.id === uploadRoomId)
  const targets = uploadRoom ? photoTargets(uploadRoom) : []
  const results = useMemo(() => searchPhotos(project,filters), [project,filters])
  const roofResults=useMemo(()=>searchRoofPhotos(project,filters),[project,filters])
  const [roofPhotoDeleting,setRoofPhotoDeleting]=useState<string>()
  useEffect(() => {
    if (!request) return
    setUploadRoomId(request.roomId); setTargetKey(request.type && request.entityId ? `${request.type}:${request.entityId}` : '')
    setFilters({ query: '', roomId: request.roomId, type: request.type ?? '', link: request.type ? 'linked' : 'all' })
    panel.current?.scrollIntoView({behavior:'smooth',block:'start'})
  }, [request])
  useEffect(() => { setVisible(24) }, [filters])
  useEffect(() => { if (viewing && !allProjectPhotos(project).some(photo=>photo.id===viewing.id)) setViewing(undefined) }, [project,viewing])
  async function importFiles(files: File[]) {
    if (!uploadRoom || busy) return
    const roomId = uploadRoom.id, target = targets.find(target => `${target.type}:${target.id}` === targetKey)
    setBusy(true); setError(''); setStatus('Preparando fotos…')
    let imported = 0; const failures: string[] = []
    for (const file of files) {
      try {
        await importSurveyPhoto(file,roomId,target,onAdd)
        imported++; setStatus(`${imported} foto(s) registrada(s)…`)
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Não foi possível registrar a foto.'}`)
      }
    }
    setBusy(false); setStatus(`${imported} foto(s) registrada(s).`); setError(failures.join(' '))
  }
  return <section className="photo-panel" ref={panel} aria-label="Fotos do projeto">
    <h2>FOTOS</h2><p className="angle-help">Fotos ficam neste navegador e dispositivo. Fotos de ambientes e telhados ficam vinculadas ao seu cadastro.</p>
    <div className="photo-upload-fields"><label>Ambiente para novas fotos<select value={uploadRoom?.id ?? ''} disabled={busy} onChange={event => { setUploadRoomId(event.target.value); setTargetKey('') }}><option value="" disabled>Selecione um ambiente</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.displayId} — {room.name || 'Sem nome'}</option>)}</select></label><label>Vincular novas fotos a<select value={targets.some(target => `${target.type}:${target.id}` === targetKey) ? targetKey : ''} disabled={busy || !uploadRoom} onChange={event => setTargetKey(event.target.value)}><option value="">Sem vínculo específico</option>{targets.map(target => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.label}</option>)}</select></label></div>
    <div className="photo-capture-actions"><button disabled={busy || !uploadRoom} onClick={() => camera.current?.click()}>📷 Tirar foto</button><button disabled={busy || !uploadRoom} onClick={() => gallery.current?.click()}>🖼 Escolher imagem</button></div>
    <input ref={camera} className="sr-only" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-label="Arquivo da câmera" onChange={event => { const files = [...event.target.files ?? []]; event.target.value = ''; void importFiles(files) }}/>
    <input ref={gallery} className="sr-only" type="file" accept="image/*" multiple tabIndex={-1} aria-label="Imagens da galeria" onChange={event => { const files = [...event.target.files ?? []]; event.target.value = ''; void importFiles(files) }}/>
    {!uploadRoom && <p>Crie ou selecione um ambiente para registrar fotos.</p>}<p role="status">{status}</p>{error && <p className="photo-error" role="alert">{error}</p>}
    <label>Pesquisar fotos<input type="search" value={filters.query} placeholder="P01, AMB-001, compressor, tag ou arquivo…" onChange={event => setFilters({ ...filters, query: event.target.value })}/></label>
    <div className="quick-photo-filters" role="group" aria-label="Filtros rápidos de fotos">{(['all','linked','unlinked'] as const).map(link=><button key={link} aria-pressed={filters.link===link} onClick={()=>setFilters({...filters,link,type:link==='unlinked'?'':filters.type})}>{link==='all'?'Todas':link==='linked'?'Com vínculo':'Sem vínculo'}</button>)}<button onClick={()=>setFilters({query:'',roomId:initialRoomId ?? '',type:'',link:'all'})}>Limpar filtros</button></div><div className="photo-filters"><label>Filtrar ambiente<select value={filters.roomId} onChange={event => setFilters({ ...filters, roomId: event.target.value })}><option value="">Todos os ambientes</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.displayId} — {room.name || 'Sem nome'}</option>)}</select></label><label>Tipo de elemento<select value={filters.type} onChange={event => setFilters({ ...filters, type: event.target.value })}><option value="">Todos os tipos</option>{Object.entries(photoTypeNames).map(([type,name]) => <option key={type} value={type}>{name}</option>)}</select></label><label>Situação do vínculo<select value={filters.link} onChange={event => setFilters({ ...filters, link: event.target.value as PhotoFilters['link'] })}><option value="all">Todas as fotos</option><option value="linked">Com vínculo</option><option value="unlinked">Sem vínculo</option></select></label></div>
    <p>{results.length+roofResults.length} foto(s) encontrada(s)</p><div className="photo-grid">{results.slice(0,visible).map(({ photo,room }) => <PhotoCard key={photo.id} photo={photo} room={room} onUpdate={onUpdate} onDelete={onDelete} onView={setViewing} onNavigate={onNavigate}/>)}{roofResults.slice(0,Math.max(0,visible-results.length)).map(({photo,roof})=><article key={photo.id} className="photo-card"><button onClick={()=>setViewing(photo)} aria-label={`Abrir foto ${photo.originalFileName}`}><Thumbnail photo={photo}/></button><h4>{photo.originalFileName}</h4>{roof?<button onClick={()=>onNavigateRoof?.(roof.id)}>{roof.displayId} — {roof.name}</button>:<p>Foto de telhado sem vínculo</p>}<label>Tags<input value={photo.tags.join(', ')} onChange={e=>onUpdate(roof?.id ?? '',photo.id,{tags:parsePhotoTags(e.target.value)})}/></label><label>Observação<textarea value={photo.note ?? ''} onChange={e=>onUpdate(roof?.id ?? '',photo.id,{note:e.target.value})}/></label><button onClick={()=>setRoofPhotoDeleting(photo.id)}>Excluir foto</button>{roofPhotoDeleting===photo.id && <div role="alertdialog" aria-label="Excluir foto do telhado?"><button onClick={()=>setRoofPhotoDeleting(undefined)}>Cancelar</button><button onClick={()=>{onDelete(roof?.id ?? '',photo.id);setRoofPhotoDeleting(undefined)}}>Confirmar exclusão</button></div>}</article>)}</div>
    {visible < results.length+roofResults.length && <button onClick={() => setVisible(value => value+24)}>Mostrar mais fotos</button>}
    {viewing && <FullPhoto key={viewing.id} photo={viewing} onClose={() => setViewing(undefined)}/>}
  </section>
}
