import { useRef,useState } from 'react'
import type { ReactNode } from 'react'
import type { LabelOffsets } from './models'
import { readableRotation } from './labelRotation'
export interface PlanLabelControls {enabled?:boolean;offsets?:LabelOffsets;onSelect?:(key:string)=>void;onChange?:(key:string,value:{dx:number;dy:number;rotation?:number})=>void}
export default function PlanLabel({id,x,y,angle=0,size,children,controls}:{id:string;x:number;y:number;angle?:number;size:number;children:ReactNode;controls?:PlanLabelControls}) {
 const saved=controls?.offsets?.[id]??{dx:0,dy:0},[live,setLive]=useState<typeof saved>(),session=useRef<{pointer:number;x:number;y:number;scale:number;offset:typeof saved}|undefined>(undefined),offset=live??saved
 return <g transform={`translate(${offset.dx} ${offset.dy}) rotate(${readableRotation(offset.rotation??angle)} ${x} ${y})`}><text x={x} y={y} fontSize={size} textAnchor="middle" fill="var(--plan-text)" style={{pointerEvents:controls?.enabled?'auto':'none',cursor:controls?.enabled?'move':undefined}} onPointerDown={e=>{if(!controls?.enabled)return;e.stopPropagation();const matrix=e.currentTarget.ownerSVGElement?.getScreenCTM();session.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,scale:matrix?.a?1/matrix.a:1,offset:saved};e.currentTarget.setPointerCapture(e.pointerId);controls.onSelect?.(id)}} onPointerMove={e=>{const s=session.current;if(!s||s.pointer!==e.pointerId)return;e.stopPropagation();setLive({...s.offset,dx:s.offset.dx+(e.clientX-s.x)*s.scale,dy:s.offset.dy+(e.clientY-s.y)*s.scale})}} onPointerUp={e=>{if(!session.current)return;e.stopPropagation();if(live)controls?.onChange?.(id,live);session.current=undefined;setLive(undefined)}} onPointerCancel={()=>{session.current=undefined;setLive(undefined)}}>{children}</text></g>
}
