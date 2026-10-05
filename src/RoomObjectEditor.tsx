import { TECHNICAL_ITEMS } from './technicalChecklist'
import { ElementPhotos, PhotoOfferContext } from './PhotoActions'
import { useContext, useEffect, useRef, useState } from 'react'
import type { Room, RoomObject, RoomObjectCategory, RoomObjectShape, RoomObjectDimensions } from './models'
import { MeasurementInput, useMeasurements } from './Measurement'
import { createRoomObject, nextObjectSequence, objectCategoryNames, objectShapeNames, objectProblems, removeRoomObject } from './roomObjects'

export default function RoomObjectEditor({ room, onChange, selectedId, onSelect }: { room: Room; onChange: (room: Room) => void; selectedId?: string; onSelect?: (id: string) => void }) {
  const offer=useContext(PhotoOfferContext)
  const { unit } = useMeasurements()
  const section = useRef<HTMLElement>(null)
  const [deletingId, setDeletingId] = useState<string>()
  useEffect(() => { section.current?.querySelector<HTMLButtonElement>('[data-cancel-object-delete]')?.focus() }, [deletingId])
  useEffect(() => {
    const card = [...section.current?.querySelectorAll<HTMLElement>('[data-object-card]') ?? []].find(element => element.dataset.objectCard === selectedId)
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }) }
  }, [selectedId])
  const add = () => { const object = createRoomObject(room); onChange({ ...room, objects: [...room.objects ?? [], object], objectCounter: nextObjectSequence(room), technicalChecks:{...room.technicalChecks,objects:{status:'pending',photoPrompted:true}} }); onSelect?.(object.id);offer?.({roomId:room.id,type:'room_object',entityId:object.id,label:object.displayId}) }
  return <section className="room-object-editor" ref={section} aria-label="Objetos do ambiente">
    <h3>Objetos, móveis e equipamentos</h3>
    <p className="angle-help">Posicione pelo centro. A origem X=0, Y=0 é o início da primeira parede: X acompanha essa parede; Y aponta para baixo no croqui. A posição e as dimensões usam {unit}.</p>
    <button onClick={add}>＋ Adicionar objeto</button>
    {(room.objects ?? []).map(object => {
      const update = (changes: Partial<RoomObject>) => onChange({ ...room, objects: (room.objects ?? []).map(item => item.id === object.id ? { ...item, ...changes } : item) })
      const dimension = (key: keyof RoomObjectDimensions, label: string) => <label>{label} ({unit})<MeasurementInput value={object.dimensions[key]} onValue={value => update({ dimensions: { ...object.dimensions, [key]: value } })}/></label>
      return <section key={object.id} data-object-card={object.id} data-pending-element={object.id} className={`room-object-card ${selectedId === object.id ? 'object-selected' : ''}`} aria-label={`${object.displayId} ${object.name}`}>
        <div className="opening-heading"><h4>{object.displayId}</h4><button onClick={() => setDeletingId(object.id)} aria-label={`Remover ${object.displayId}`}>Remover</button></div>
        {deletingId === object.id && <div className="object-delete-confirmation" role="alertdialog" aria-labelledby={`delete-object-${object.id}`} onKeyDown={event => { if (event.key === 'Escape') setDeletingId(undefined) }}><p id={`delete-object-${object.id}`}>Excluir {object.displayId} — {object.name || 'Sem nome'}?</p><button data-cancel-object-delete onClick={() => setDeletingId(undefined)}>Cancelar</button><button onClick={() => { onChange(removeRoomObject(room, object.id)); setDeletingId(undefined) }}>Confirmar exclusão</button></div>}
        <ElementPhotos room={room} type="room_object" entityId={object.id}/>
        <div className="object-fields">
          <label>Nome do objeto<input value={object.name} onChange={event => update({ name: event.target.value })}/></label>
          <label>Categoria<select value={object.category} onChange={event => update({ category: event.target.value as RoomObjectCategory })}>{Object.entries(objectCategoryNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Item técnico<select value={object.technicalItemKey ?? ''} onChange={event=>{update({technicalItemKey:event.target.value || undefined});if(event.target.value) offer?.({roomId:room.id,type:'room_object',entityId:object.id,label:`${object.displayId} — ${TECHNICAL_ITEMS.find(item=>item.key===event.target.value)?.label}`})}}><option value="">Objeto/equipamento geral</option>{TECHNICAL_ITEMS.filter(item=>!item.general && !['walls','ceiling','geometry','openings','internalWalls','objects'].includes(item.key)).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>Forma<select value={object.shape} onChange={event => update({ shape: event.target.value as RoomObjectShape })}>{Object.entries(objectShapeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          {object.shape === 'rectangle' && <>{dimension('widthM', 'Largura')}{dimension('depthM', 'Profundidade')}</>}
          {object.shape === 'circle' && dimension('diameterM', 'Diâmetro')}
          {object.shape === 'line' && dimension('lengthM', 'Comprimento')}
          <label>Centro X ({unit})<MeasurementInput value={object.position.xM} onValue={value => update({ position: { ...object.position, xM: value } })}/></label>
          <label>Centro Y ({unit})<MeasurementInput value={object.position.yM} onValue={value => update({ position: { ...object.position, yM: value } })}/></label>
          <label>Rotação (°)<input type="number" step="any" inputMode="decimal" value={object.rotationDegrees ?? ''} onChange={event => update({ rotationDegrees: event.target.value === '' ? null : Number(event.target.value) })}/></label>
          <label className="object-note">Observação (opcional)<textarea rows={2} value={object.note ?? ''} onChange={event => update({ note: event.target.value })}/></label>
        </div>
        <div className="opening-feedback" aria-live="polite">{objectProblems(object).map(message => <p key={message}>{message}</p>)}</div>
      </section>
    })}
  </section>
}
