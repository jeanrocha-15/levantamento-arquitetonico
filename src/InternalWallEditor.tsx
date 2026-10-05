import { nextVisualSequence } from './visualIds'
import { ElementPhotos } from './PhotoActions'
import { MeasurementInput, useMeasurements } from './Measurement'
import { ManualMarkers } from './ChecklistPanel'
import type { InternalWall, Room } from './models'
import { id } from './domain'
import { getWallReferences } from './openings'
import { internalWallLabel } from './internalWalls'
import type { InternalWallCheck } from './internalWalls'

export default function InternalWallEditor({ room, onChange, checks }: { room: Room; onChange: (room: Room) => void; checks: InternalWallCheck[] }) {
  const { unit, format } = useMeasurements()
  function addInternalWall() {
    const wall = room.walls[0]
    const reference = getWallReferences(room.walls, room.corners, wall.id)[0]
    const sequence = nextVisualSequence(room.internalWalls.map(w=>w.label),'PI')
    const internalWall: InternalWall = { id: id(), label: internalWallLabel(sequence), origin: { type: 'perimeter_wall', wallId: wall.id, referenceCornerId: reference.id, distanceM: null }, lengthM: null, orientationDegrees: 90, thicknessM: .15, heightM: null }
    onChange({ ...room, internalWalls: [...room.internalWalls, internalWall], internalWallCounter: sequence })
  }
  return <section className="internal-wall-editor" aria-label="Paredes internas">
    <h3>Paredes internas</h3>
    <p className="angle-help">Cada PI pertence somente a este ambiente e parte de uma parede do perímetro. A sequência A, B, C… permanece independente.</p>
    <button disabled={room.walls.length < 2} onClick={addInternalWall}>＋ Adicionar parede interna</button>
    {room.walls.length < 2 && <p className="angle-help">Cadastre pelo menos duas paredes para identificar os cantos de referência.</p>}
    {room.internalWalls.map(internalWall => {
      const origin = internalWall.origin
      const check = checks.find(check => check.id === internalWall.id)
      const update = (changes: Partial<InternalWall>) => onChange({ ...room, internalWalls: room.internalWalls.map(item => item.id === internalWall.id ? { ...item, ...changes } : item) })
      const field = (key: 'lengthM' | 'orientationDegrees' | 'thicknessM' | 'heightM', label: string) => <label htmlFor={`${internalWall.id}-${key}`}>{label}{key === 'orientationDegrees' ? <input id={`${internalWall.id}-${key}`} type="number" min="0" max="360" step="any" inputMode="decimal" value={internalWall[key] ?? ''} onChange={event => update({ [key]: event.target.value === '' ? null : Number(event.target.value) })}/> : <MeasurementInput id={`${internalWall.id}-${key}`} value={internalWall[key]} onValue={value => update({ [key]: value })}/>}</label>
      const wall = origin.type === 'perimeter_wall' ? room.walls.find(wall => wall.id === origin.wallId) : undefined
      const references = origin.type === 'perimeter_wall' ? getWallReferences(room.walls, room.corners, origin.wallId) : []
      const reference = origin.type === 'perimeter_wall' ? references.find(reference => reference.id === origin.referenceCornerId) : undefined
      return <section className="internal-wall-card" data-pending-element={internalWall.id} key={internalWall.id} aria-label={`Parede interna ${internalWall.label}`}>
        <div className="internal-wall-heading"><h4>{internalWall.label} <span>· Parede interna</span></h4><button onClick={() => onChange({ ...room, internalWalls: room.internalWalls.filter(item => item.id !== internalWall.id),openings:room.openings.filter(o=>o.wallId!==internalWall.id) })} aria-label={`Remover ${internalWall.label}`}>Remover</button></div>
        <ElementPhotos room={room} type="internal_wall" entityId={internalWall.id}/><ManualMarkers room={room} elementId={internalWall.id}/>{origin.type === 'perimeter_wall' && <>
          <div className="internal-wall-fields">
            <label>Parede de origem<select value={origin.wallId} onChange={event => { const wallId = event.target.value; update({ origin: { ...origin, wallId, referenceCornerId: getWallReferences(room.walls, room.corners, wallId)[0]?.id ?? '' } }) }}>{!wall && <option value={origin.wallId}>Parede fora do perímetro</option>}{room.walls.map(wall => <option key={wall.id} value={wall.id}>Parede {wall.label}</option>)}</select></label>
            <label>Canto de referência<select value={origin.referenceCornerId} onChange={event => update({ origin: { ...origin, referenceCornerId: event.target.value } })}>{!reference && <option value={origin.referenceCornerId}>Selecione um canto atual</option>}{references.map(reference => <option key={reference.id} value={reference.id}>{reference.label} — {reference.endpoint === 'start' ? 'início' : 'final'} da parede {wall?.label}</option>)}</select></label>
            <label className="internal-wall-offset">Distância do canto até o início da PI ({unit})<MeasurementInput value={origin.distanceM} onValue={value => update({ origin: { ...origin, distanceM: value } })}/></label>
            {field('lengthM', `Comprimento (${unit})`)}{field('orientationDegrees', 'Ângulo/orientação (°)')}
            {field('thicknessM', `Espessura (${unit}, opcional)`)}{field('heightM', `Altura (${unit}, opcional)`)}
            <label className="internal-wall-note">Observação (opcional)<textarea rows={2} value={internalWall.note ?? ''} onChange={event => update({ note: event.target.value })}/></label>
          </div>
          <p className="angle-help">Orientação no sentido horário, em relação ao sentido de cadastro da parede: 0° acompanha a parede; 90° aponta para o interior. Trocar o canto muda apenas a origem da distância.</p>
          <p className="internal-wall-summary">{internalWall.label} · Origem: Parede {wall?.label ?? '?'} · Canto {reference?.label ?? '?'}<br/>Distância: {format(origin.distanceM)} · Comprimento: {format(internalWall.lengthM)} · Orientação: {internalWall.orientationDegrees ?? '?'}°</p>
        </>}
        {check && check.messages.length > 0 && <div className="internal-wall-feedback" aria-live="polite">{check.messages.map(message => <p key={message}>{message}</p>)}</div>}
      </section>
    })}
  </section>
}
