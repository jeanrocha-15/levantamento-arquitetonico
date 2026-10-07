import { buildRoomGeometry } from './roomGeometry'
import { MeasurementInput, useMeasurements } from './Measurement'
import { ManualMarkers } from './ChecklistPanel'
import type { Room } from './models'
import { getCorners } from './corners'
import { id } from './domain'
import type { buildPerimeter } from './geometry'
import { diagonalSuggestion } from './diagonalSuggestion'

export default function DiagonalEditor({ room, onChange, checks }: { room: Room; onChange: (room: Room) => void; checks: ReturnType<typeof buildPerimeter>['diagonalChecks'] }) {
  const { unit, format } = useMeasurements()
  const corners = getCorners(room.walls, room.corners)
  const label = (cornerId: string) => {
    const index = corners.findIndex(corner => corner.id === cornerId)
    return index < 0 ? 'Canto fora do perímetro' : `${room.walls[index].label}${room.walls[(index + 1) % room.walls.length].label}`
  }
  return <section className="diagonal-editor" aria-label="Diagonais medidas">
    <h3>Diagonais medidas</h3>
    <p className="angle-help">Selecione dois cantos e registre a distância medida em {unit}. Diagonais participam da geometria por padrão. Marque conferência para apenas comparar o valor medido com o desenho.</p>
    {room.diagonals.map((diagonal, index) => {
      const check = checks.find(item => item.id === diagonal.id)
      const suggestion=diagonalSuggestion(room,diagonal)
      const update = (changes: Partial<typeof diagonal>) => onChange({ ...room, perimeterClosed:room.perimeterClosed||buildRoomGeometry(room).perimeter.endpointsMeet, diagonals: room.diagonals.map(item => item.id === diagonal.id ? { ...item, ...changes } : item) })
      return <div className="diagonal-card" data-pending-element={diagonal.id} key={diagonal.id}>
        <div className="diagonal-heading"><h4>Diagonal {index + 1}</h4><button onClick={() => onChange({ ...room, perimeterClosed:room.perimeterClosed||buildRoomGeometry(room).perimeter.endpointsMeet, diagonals: room.diagonals.filter(item => item.id !== diagonal.id) })} aria-label={`Remover diagonal ${index + 1}`}>Remover</button></div>
        <label className="plan-checkbox"><input type="checkbox" checked={!!diagonal.checkOnly} onChange={e=>update({checkOnly:e.target.checked})}/>Somente conferência — não altera a geometria</label><ManualMarkers room={room} elementId={diagonal.id}/><div className="diagonal-fields">{([0, 1] as const).map(endpoint => <label key={endpoint}>Canto {endpoint === 0 ? 'inicial' : 'final'}<select value={diagonal.vertexIds?.[endpoint]??diagonal.cornerIds[endpoint]} onChange={event => { if(diagonal.vertexIds){const vertexIds:[string,string]=[...diagonal.vertexIds];vertexIds[endpoint]=event.target.value;update({vertexIds,cornerIds:vertexIds});return}const cornerIds: [string, string] = [...diagonal.cornerIds]; cornerIds[endpoint] = event.target.value; update({ cornerIds }) }}>
          {!diagonal.vertexIds&&!corners.some(corner => corner.id === diagonal.cornerIds[endpoint]) && <option value={diagonal.cornerIds[endpoint]}>Canto fora do perímetro</option>}
          {diagonal.vertexIds?<><option value="origin">Início de A</option>{room.walls.map((wall,i)=><option key={wall.id} value={wall.id}>{i<room.walls.length-1?`Canto ${wall.label}${room.walls[i+1].label}`:`Ponta ${wall.label}`}</option>)}</>:corners.map(corner => <option key={corner.id} value={corner.id}>{label(corner.id)}</option>)}
        </select></label>)}<label>Distância medida ({unit})<MeasurementInput id={`${diagonal.id}-lengthM`} value={diagonal.lengthM} onValue={value => update({ lengthM: value })}/></label></div>
        <p>Sugestão pelo croqui: {suggestion==null?'Referências insuficientes':format(suggestion)} <button disabled={suggestion==null} onClick={()=>update({lengthM:suggestion})}>Usar sugestão</button></p><div className="diagonal-feedback" aria-live="polite">{check?.messages.map(message => <p key={message}>{message}</p>)}{check?.differenceM !== null && check?.differenceM !== undefined && <p>Medida informada: {format(diagonal.lengthM)} · Valor resultante: {format(check.drawnLengthM)} · Diferença: {format(check.differenceM)}.</p>}</div>
      </div>
    })}
    <button disabled={corners.length < 3} onClick={() => onChange({ ...room, perimeterClosed:room.perimeterClosed||buildRoomGeometry(room).perimeter.endpointsMeet, diagonals: [...room.diagonals, { id: id(), cornerIds: [corners[0].id, corners[Math.min(2, corners.length - 1)].id], lengthM: null, source: 'measured' }] })}>＋ Adicionar diagonal</button>
    {corners.length < 3 && <p className="angle-help">Cadastre pelo menos três paredes para selecionar uma diagonal.</p>}
  </section>
}
