import type {LacExchange} from './types'
import {buildWallFaces} from '../wallFaces'
import type {PlanVisibility} from '../FloorPlanCanvas'
export const visiblePhysicalWalls=(exchange:LacExchange,floorId:string)=>exchange.physicalWalls.filter(w=>w.baseLevelId===floorId||w.roomIds.some(id=>exchange.rooms.some(r=>r.lacId===id&&r.levelId===floorId)))
export function bimPlanPoints(exchange:LacExchange,floorId:string){return [...visiblePhysicalWalls(exchange,floorId).flatMap(w=>[w.start,w.end]),...exchange.elements.filter(e=>e.levelId===floorId&&!e.objectId).flatMap(e=>e.representation.length?e.representation:[e.position])].map(p=>({x:p[0],y:-p[1]}))}
export default function BimPlanLayer({exchange,floorId,font,visibility}:{exchange:LacExchange;floorId:string;font:number;visibility:PlanVisibility}){
 return <g aria-label="Modelo físico Revit">{visiblePhysicalWalls(exchange,floorId).map(w=>{
  if(w.curve){const curve=w.curve as {hostSamples?:number[][]};return curve.hostSamples?<polyline key={w.lacId} points={curve.hostSamples.map(p=>`${p[0]},${-p[1]}`).join(' ')} fill="none" stroke="var(--plan-line)" strokeDasharray="4 3" vectorEffect="non-scaling-stroke"><title>Parede curva Revit — representação aproximada, edição limitada</title></polyline>:null}
  const start={x:w.start[0],y:-w.start[1]},end={x:w.end[0],y:-w.end[1]},length=Math.hypot(end.x-start.x,end.y-start.y);if(!length)return null
  const at=(t:number)=>({x:start.x+(end.x-start.x)*t/length,y:start.y+(end.y-start.y)*t/length})
  const cuts=exchange.openings.filter(o=>o.hostWallId===w.lacId&&o.width&&o.width>0).map(o=>{const t=((o.position[0]-start.x)*(end.x-start.x)+(-o.position[1]-start.y)*(end.y-start.y))/length;return [Math.max(0,t-o.width!/2),Math.min(length,t+o.width!/2)]}).sort((a,b)=>a[0]-b[0])
  let cursor=0;const solids:{start:typeof start;end:typeof end}[]=[];for(const [a,b] of cuts){if(a>cursor)solids.push({start:at(cursor),end:at(a)});cursor=Math.max(cursor,b)}if(cursor<length)solids.push({start:at(cursor),end})
  const faces=buildWallFaces([{id:w.lacId,start,end,thickness:w.thickness,referenceFace:'center'}],new Map([[w.lacId,solids]])).get(w.lacId)??[]
  return <g key={w.lacId}><title>Parede física compartilhada</title>{faces.map((f,i)=><line key={i} x1={f.start.x} y1={f.start.y} x2={f.end.x} y2={f.end.y} stroke="var(--plan-line)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"/>)}</g>
 })}{exchange.elements.filter(e=>e.levelId===floorId&&!e.objectId&&(e.category==='Column'||e.category==='Beam'?visibility.structural:e.category==='Equipment'?visibility.equipment:visibility.objects)).map(e=>{
  const points=e.representation.length?e.representation:[e.position],xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y
  return <g key={e.lacId} stroke="var(--plan-object)" fill="none"><title>{e.type} — Revit: {e.issue??'edição limitada'}</title>{e.width&&e.depth?<rect x={-e.width/2} y={-e.depth/2} width={e.width} height={e.depth} transform={`translate(${e.position[0]} ${-e.position[1]}) rotate(${-e.rotation})`} vectorEffect="non-scaling-stroke"/>:width>0&&height>0?<rect x={x} y={y} width={width} height={height} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>:<circle cx={x} cy={y} r={font*.5} vectorEffect="non-scaling-stroke"/>}{visibility.ids&&<text x={x} y={y} fontSize={font*.65} stroke="none" fill="var(--plan-text)">R · {e.category}</text>}</g>
 })}</g>
}
