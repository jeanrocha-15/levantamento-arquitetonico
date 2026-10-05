import { useRef } from 'react'
import { reorderKeys } from './pdf/compositions'
export default function DrawingOrderList({keys,names,active,onSelect,onReorder}:{keys:string[];names:Record<string,string>;active?:string;onSelect?:(key:string)=>void;onReorder:(keys:string[])=>void}) {
 const dragging=useRef<string>('')
 function shift(index:number,delta:number){const next=[...keys];[next[index],next[index+delta]]=[next[index+delta],next[index]];onReorder(next)}
 return <ol className="pdf-page-order">{keys.map((key,index)=><li key={key} draggable onDragStart={e=>{dragging.current=key;e.dataTransfer.setData('text/plain',key);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{dragging.current=''}} onDragOver={e=>{if(dragging.current)e.preventDefault()}} onDrop={e=>{e.preventDefault();if(dragging.current)onReorder(reorderKeys(keys,dragging.current,key));dragging.current=''}}><button className={active===key?'primary':''} onClick={()=>onSelect?.(key)} title="Arraste para alterar a ordem">⋮⋮ {index+1}. {names[key]??key}</button><button aria-label={`Subir ${names[key]}`} disabled={index===0} onClick={()=>shift(index,-1)}>↑</button><button aria-label={`Descer ${names[key]}`} disabled={index===keys.length-1} onClick={()=>shift(index,1)}>↓</button></li>)}</ol>
}
