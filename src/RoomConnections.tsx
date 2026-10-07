import { useState } from 'react'
import { availableCounterpart, openingConnectionStatus } from './spatialConnections'
import type { Opening, Room } from './models'
export interface RoomOption { room: Room; path: string }
export function OpeningConnection({ opening, roomId, rooms, onChange, onCreate, floorId }: { floorId:string; opening: Opening; roomId:string; rooms: RoomOption[]; onChange: (change: Partial<Opening>) => void; onCreate?:(name:string,parentId?:string)=>void }) {
  const [creating,setCreating]=useState(false),[name,setName]=useState(''),[parent,setParent]=useState('')
  const target = rooms.find(item => item.room.id === opening.connectedRoomId)?.room
  const available=target?.openings.filter(item=>availableCounterpart(opening,roomId,item)) ?? []
  return <details className="optional-connections"><summary>{openingConnectionStatus(opening,rooms.map(r=>r.room))}{target ? ` · ${target.name}` : ''}</summary><div className="connection-fields">
    <label>Leva para<select value={opening.connectedRoomId ?? ''} onChange={event => onChange({ connectedRoomId: event.target.value || undefined, connectedOpeningId: undefined })}><option value="">Sem vínculo</option>{rooms.map(item => <option key={item.room.id} value={item.room.id}>{item.path}</option>)}</select></label>
    {onCreate && <button onClick={()=>setCreating(v=>!v)}>＋ Criar novo ambiente</button>}
    {creating && <div className="inline-room-create"><label>Nome do novo ambiente<input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Cozinha"/></label><label>Organização<select value={parent} onChange={e=>setParent(e.target.value)}><option value="">Ambiente no mesmo pavimento</option><option value={roomId}>Subambiente do ambiente atual</option>{rooms.filter(r=>r.room.floorId===floorId).map(r=><option key={r.room.id} value={r.room.id}>Subambiente de {r.room.name}</option>)}</select></label><button disabled={!name.trim()} onClick={()=>{onCreate?.(name.trim(),parent||undefined);setCreating(false);setName('');setParent('')}}>Criar e vincular</button><button onClick={()=>setCreating(false)}>Cancelar</button></div>}
    {target && <label>Abertura correspondente (opcional)<select value={opening.connectedOpeningId ?? ''} onChange={event => {
      const candidate=target.openings.find(o=>o.id===event.target.value)
      if(candidate && (!Object.is(candidate.widthM,opening.widthM)||!Object.is(candidate.heightM,opening.heightM)) && !window.confirm(`Usar as dimensões de ${target.name} / ${candidate.label} nas duas pontas? As futuras alterações de largura e altura serão sincronizadas.`))return
      onChange({ connectedOpeningId: event.target.value || undefined,...(candidate?{label:candidate.label,originOpeningId:candidate.originOpeningId??candidate.id}:{originOpeningId:undefined}) })
    }}><option value="">Não definida</option>{available.map(item => <option key={item.id} value={item.id}>{item.label} · Parede {target.walls.find(wall => wall.id === item.wallId)?.label ?? '?'}</option>)}</select></label>}
    <p className="angle-help">Uma abertura física possui uma única contraparte do mesmo tipo. Largura e altura vinculadas são sincronizadas. Posição e croquis continuam independentes.</p>
  </div></details>
}
export function SharedWalls({ room, rooms, onChange }: { room: Room; rooms: RoomOption[]; onChange: (room: Room) => void }) {
  return <details className="connection-editor" aria-label="Paredes compartilhadas"><summary>Paredes compartilhadas (opcional)</summary><p className="angle-help">Registre a parede correspondente em outro ambiente. O compartilhamento pode usar apenas um trecho da parede maior. As medidas permanecem independentes.</p>{room.walls.map(wall => {
    const target = rooms.find(item => item.room.id === wall.sharedWallReference?.roomId)?.room
    const update = (reference: typeof wall.sharedWallReference) => onChange({ ...room, walls: room.walls.map(item => item.id === wall.id ? { ...item, sharedWallReference: reference } : item) })
    return <div className="connection-fields" key={wall.id} role="group" aria-label={`Vínculo da parede ${wall.label}`}><label>Parede {wall.label} — compartilhada com<select value={target?.id ?? ''} onChange={event => { const next = rooms.find(item => item.room.id === event.target.value)?.room; update(next?.walls[0] ? { roomId: next.id, wallId: next.walls[0].id } : undefined) }}><option value="">Sem vínculo</option>{rooms.map(item => <option key={item.room.id} value={item.room.id} disabled={!item.room.walls.length}>{item.path}{!item.room.walls.length ? ' (sem paredes)' : ''}</option>)}</select></label>{target && <label>Parede correspondente<select value={wall.sharedWallReference?.wallId ?? ''} onChange={event => update({ ...wall.sharedWallReference, roomId: target.id, wallId: event.target.value })}>{target.walls.map(item => <option key={item.id} value={item.id}>Parede {item.label}</option>)}</select></label>}{target&&<label>Lado do compartilhamento<select aria-label={`Lado do compartilhamento da parede ${wall.label}`} value={wall.sharedWallReference?.placementSide??'opposite'} onChange={event=>update({...wall.sharedWallReference!,placementSide:event.target.value as 'opposite'|'same'})}><option value="opposite">Ambientes em lados opostos</option><option value="same">Mesmo lado — ambiente dentro do outro</option></select></label>}</div>
  })}</details>
}
