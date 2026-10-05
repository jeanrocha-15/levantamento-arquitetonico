import {useState} from 'react'
import type {RoomPlacement} from './models'
import type {SnapChoice} from './floorPlanConnections'
import {pointDistance,planTolerance} from './floorPlan'
import {useMeasurements} from './Measurement'

export default function PlanSnapControls({choices,current,onApply}:{choices:SnapChoice[];current?:RoomPlacement;onApply:(placement:RoomPlacement)=>void}) {
 const [choiceId,setChoice]=useState(''),{format}=useMeasurements()
 const choice=choices.find(c=>c.id===choiceId)??(choices.length===1?choices[0]:undefined)
 return <div className="plan-snap">
  {!choices.length?<p className="muted">Nenhum encaixe disponível. Posicione o ambiente relacionado ou cadastre uma relação. A montagem manual continua disponível.</p>:<label>Referência para o encaixe<select aria-label="Referência para o encaixe" value={choice?.id??''} onChange={event=>setChoice(event.target.value)}><option value="">Escolha uma referência</option>{choices.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
  {choices.length>1&&<p className="muted">Escolha a relação e o alinhamento. Nenhuma posição muda antes de aplicar.</p>}
  {choice&&choice.differenceM>planTolerance.lengthM&&<strong>Divergência: {format(choice.differenceM)}</strong>}
  {choice&&current&&pointDistance(current,choice.placement)<=planTolerance.snapM&&<small>Próximo: encaixe disponível</small>}
  <button disabled={!choice} onClick={()=>{if(choice)onApply(choice.placement)}}>Aplicar encaixe</button>
 </div>
}
