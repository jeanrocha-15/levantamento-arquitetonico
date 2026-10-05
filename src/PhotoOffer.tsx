import { useRef, useState } from 'react'
import type { Photo } from './models'
import type { PhotoOfferRequest } from './PhotoActions'
import { importSurveyPhoto } from './photoImport'
export default function PhotoOffer({request,onAdd,onClose}:{request:PhotoOfferRequest;onAdd:(photo:Photo)=>void;onClose:()=>void}) {
  const camera=useRef<HTMLInputElement>(null), gallery=useRef<HTMLInputElement>(null)
  const [busy,setBusy]=useState(false), [error,setError]=useState('')
  async function register(files:File[]) {
    if(busy || !files.length) return
    setBusy(true);setError('')
    try { for(const file of files) await importSurveyPhoto(file,request.roomId,{type:request.type,id:request.entityId},onAdd);onClose() }
    catch(error){setError(error instanceof Error?error.message:'Não foi possível registrar a foto.')}
    finally {setBusy(false)}
  }
  return <section className="photo-offer" aria-label="Foto opcional do novo item"><div><strong>Registrar foto de {request.label}?</strong><p>A imagem ficará vinculada a este item. É opcional e não muda a conclusão.</p></div><div><button disabled={busy} onClick={()=>camera.current?.click()}>📷 Tirar foto</button><button disabled={busy} onClick={()=>gallery.current?.click()}>🖼 Importar</button><button disabled={busy} onClick={onClose}>Agora não</button></div><input ref={camera} className="sr-only" tabIndex={-1} type="file" accept="image/*" capture="environment" aria-label="Foto opcional pela câmera" onChange={event=>{const files=[...event.target.files ?? []];event.target.value='';void register(files)}}/><input ref={gallery} className="sr-only" type="file" accept="image/*" multiple aria-label="Importar foto opcional" onChange={event=>{const files=[...event.target.files ?? []];event.target.value='';void register(files)}}/>{busy && <p role="status">Registrando foto…</p>}{error && <p role="alert">{error}</p>}</section>
}
