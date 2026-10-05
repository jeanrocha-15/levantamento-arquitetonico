import { ElementPhotos } from './PhotoActions'
import { MeasurementInput, useMeasurements } from './Measurement'
import { ManualMarkers } from './ChecklistPanel'
import type { Opening, OpeningType, Room } from './models'
import { id } from './domain'
import { doorDescription, getWallReferences, openingLabel, openingNames } from './openings'
import type { OpeningCheck } from './openings'
import { OpeningConnection } from './RoomConnections'
import OpeningElevation from './OpeningElevation'
import type { RoomOption } from './RoomConnections'
import { useEffect, useState } from 'react'

export default function OpeningEditor({ room, onChange, checks, relatedRooms = [], focusId }: { room: Room; onChange: (room: Room) => void; checks: OpeningCheck[]; relatedRooms?: RoomOption[]; focusId?: string }) {
  const { unit, format } = useMeasurements()
  const [typeFilter,setTypeFilter]=useState('')
  const [wallFilter,setWallFilter]=useState('')
  useEffect(()=>{if(focusId){setTypeFilter('');setWallFilter('')}},[focusId])
  const canAdd = room.walls.length >= 2
  function addOpening(type: OpeningType) {
    const wall = room.walls[0]
    const reference = getWallReferences(room.walls, room.corners, wall.id)[0]
    const sequence = room.openingCounters[type] + 1
    const opening: Opening = { id: id(), label: openingLabel(type, sequence), type, wallId: wall.id, referenceCornerId: reference.id, offsetM: null, widthM: null, heightM: null, sillHeightM: null, ...(type === 'door' ? { doorKind: 'hinged' as const } : {}) }
    onChange({ ...room, openings: [...room.openings, opening], openingCounters: { ...room.openingCounters, [type]: sequence } })
    setTypeFilter(type); setWallFilter('')
  }
  return <section className="opening-editor" aria-label="Aberturas nas paredes">
    <h3>Portas, janelas e vãos</h3>
    <p className="angle-help">Medidas em {unit}. A distância parte do canto escolhido até a borda mais próxima da abertura. O croqui acompanha a unidade do projeto.</p>
    <div className="opening-actions">{(['door', 'window', 'gap'] as const).map(type => <button key={type} disabled={!canAdd} onClick={() => addOpening(type)}>＋ {openingNames[type]}</button>)}</div>
    <div className="category-filters"><label>Mostrar tipo<select value={typeFilter} onChange={event=>setTypeFilter(event.target.value)}><option value="">Todos os tipos</option>{Object.entries(openingNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Mostrar parede<select value={wallFilter} onChange={event=>setWallFilter(event.target.value)}><option value="">Todas as paredes</option>{[...room.walls,...room.internalWalls].map(wall=><option key={wall.id} value={wall.id}>Parede {wall.label}</option>)}</select></label></div>
    {!canAdd && <p className="angle-help">Cadastre pelo menos duas paredes para identificar os cantos de referência.</p>}
    {room.openings.filter(opening=>(!typeFilter || opening.type===typeFilter) && (!wallFilter || opening.wallId===wallFilter)).map(opening => {
      const references = getWallReferences(room.walls, room.corners, opening.wallId,room.internalWalls)
      const reference = references.find(item => item.id === opening.referenceCornerId)
      const wall = [...room.walls,...room.internalWalls].find(item => item.id === opening.wallId)
      const check = checks.find(item => item.id === opening.id)
      const update = (changes: Partial<Opening>) => onChange({ ...room, openings: room.openings.map(item => item.id === opening.id ? { ...item, ...changes } : item) })
      const field = (key: 'widthM' | 'heightM' | 'sillHeightM' | 'offsetM', label: string) => <label htmlFor={`${opening.id}-${key}`}>{label}<MeasurementInput id={`${opening.id}-${key}`} value={opening[key]} onValue={value => update({ [key]: value })}/></label>
      return <section className="opening-card" data-pending-element={opening.id} key={opening.id} aria-label={`${openingNames[opening.type]} ${opening.label}`}>
        <div className="opening-heading"><h4>{opening.label} <span>· {openingNames[opening.type]}</span></h4><button onClick={() => onChange({ ...room, openings: room.openings.filter(item => item.id !== opening.id) })} aria-label={`Remover ${opening.label}`}>Remover</button></div>
        <ElementPhotos room={room} type={opening.type} entityId={opening.id}/><ManualMarkers room={room} elementId={opening.id}/><div className="opening-fields">
          <label>Parede<select value={opening.wallId} onChange={event => { const wallId = event.target.value; update({ wallId, referenceCornerId: getWallReferences(room.walls, room.corners, wallId,room.internalWalls)[0]?.id ?? '' }) }}>{!wall && <option value={opening.wallId}>Parede fora do perímetro</option>}{[...room.walls,...room.internalWalls].map(item => <option key={item.id} value={item.id}>Parede {item.label}</option>)}</select></label>
          <label>Canto de referência<select value={opening.referenceCornerId} onChange={event => update({ referenceCornerId: event.target.value })}>{!reference && <option value={opening.referenceCornerId}>Selecione um canto atual</option>}{references.map(item => <option key={item.id} value={item.id}>{item.label} — {item.endpoint === 'start' ? 'início' : 'final'} da parede {wall?.label}</option>)}</select></label>
          {field('widthM', `Largura (${unit})`)}{field('heightM', `Altura (${unit})`)}
          {opening.type === 'window' && field('sillHeightM', `Peitoril (${unit})`)}
          <div className="opening-offset">{field('offsetM', `Distância do canto até a borda da abertura (${unit})`)}</div>
          {opening.type === 'door' && <fieldset className="door-operation">
            <legend>Funcionamento da porta <span>(esquerda/direita vistas de dentro do ambiente, olhando para a parede)</span></legend>
            <label>Tipo de porta<select id={`${opening.id}-doorKind`} value={opening.doorKind ?? 'hinged'} onChange={event => update({ doorKind: event.target.value === 'sliding' ? 'sliding' : 'hinged' })}><option value="hinged">De abrir (com giro)</option><option value="sliding">De correr</option></select></label>
            {(opening.doorKind ?? 'hinged') === 'hinged' ? <>
              <label>Abre para<select value={opening.swing ?? ''} onChange={event => update({ swing: event.target.value === 'inward' || event.target.value === 'outward' ? event.target.value : undefined })}><option value="">Não informado</option><option value="inward">Dentro do ambiente</option><option value="outward">Fora do ambiente</option></select></label>
              <label>Dobradiça<select value={opening.hinge ?? ''} onChange={event => update({ hinge: event.target.value === 'left' || event.target.value === 'right' ? event.target.value : undefined })}><option value="">Não informado</option><option value="left">À esquerda</option><option value="right">À direita</option></select></label>
            </> : <>
              <label>Corre para<select value={opening.slideDirection ?? ''} onChange={event => update({ slideDirection: event.target.value === 'left' || event.target.value === 'right' ? event.target.value : undefined })}><option value="">Não informado</option><option value="left">Para a esquerda</option><option value="right">Para a direita</option></select></label>
              <label>Folha pelo lado<select value={opening.swing ?? ''} onChange={event => update({ swing: event.target.value === 'inward' || event.target.value === 'outward' ? event.target.value : undefined })}><option value="">Não informado</option><option value="inward">De dentro do ambiente</option><option value="outward">De fora do ambiente</option></select></label>
            </>}
          </fieldset>}
        </div>
        <p className="opening-summary">{opening.label} · Parede {wall?.label ?? '?'} · {format(opening.widthM, false)} × {format(opening.heightM)}{opening.type === 'window' ? ` · P=${format(opening.sillHeightM)}` : ''}<br/>{format(opening.offsetM)} do canto {reference?.label ?? '?'} até a borda mais próxima.{opening.type === 'door' && <><br/>{doorDescription(opening)}.</>}</p>
        <OpeningElevation room={room} opening={opening}/>
        {opening.type !== 'window' && <OpeningConnection opening={opening} rooms={relatedRooms} onChange={update}/>}
        {check && check.messages.length > 0 && <div className="opening-feedback" aria-live="polite">{check.messages.map(message => <p key={message}>{message}</p>)}</div>}
      </section>
    })}
  </section>
}
