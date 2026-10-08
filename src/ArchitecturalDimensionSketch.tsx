import type { ArchitecturalDimension } from './architecturalDimensions'
import { Movable } from './sketchDrag'
import PlanLabel from './PlanLabel'
import type { PlanLabelControls } from './PlanLabel'
export default function ArchitecturalDimensionSketch({dimension,font=10,planControls,plan=false,showLines=true}:{dimension:ArchitecturalDimension;font?:number;planControls?:PlanLabelControls;plan?:boolean;showLines?:boolean}){
 const {line,request,box}=dimension,id=request.key.split('|')[1]
 return <g className="architectural-dimension svg-dimension" fill="none" pointerEvents="none">{showLines&&<><line x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}/>{[[request.a,line.from],[request.b,line.to],...line.ticks].map(([a,b],i)=><line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>)}</>}{plan?<PlanLabel id={id} x={line.text.x} y={line.text.y} angle={line.angle} size={font} controls={planControls} dimension>{request.text}</PlanLabel>:<Movable id={id} box={box} angle={line.angle} parallel title={request.text}><text className="wall-label" x={line.text.x} y={line.text.y} textAnchor="middle" dominantBaseline="middle" style={{fontSize:font}}>{request.text}</text></Movable>}{dimension.conflict&&<title>Não foi encontrada uma posição livre para esta cota. Confira os rótulos próximos.</title>}</g>
}
