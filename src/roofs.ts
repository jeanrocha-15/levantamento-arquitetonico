import type { Project,Roof,RoofWater } from './models'
import { generateId } from './domain'
export const roofDirections={north:'Norte / para cima',east:'Leste / direita',south:'Sul / para baixo',west:'Oeste / esquerda'}
export function roofSlope(water:RoofWater) {
  if(water.inclinationPercent!=null){const percent=water.inclinationPercent;if(!Number.isFinite(percent)||percent<0)return undefined;return {riseM:water.projectionM!=null && water.projectionM>0?water.projectionM*percent/100:null,percent,degrees:Math.atan(percent/100)*180/Math.PI,informed:true}}
  const {highHeightM:high,lowHeightM:low,projectionM:projection}=water
  if(high==null || low==null || projection==null || ![high,low,projection].every(Number.isFinite) || high<0 || low<0 || high<low || projection<=0) return undefined
  const rise=high-low
  return {riseM:rise,percent:rise/projection*100,degrees:Math.atan2(rise,projection)*180/Math.PI}
}
export function nextRoofSequence(project:Project) {return Math.max(project.roofCounter ?? 0,...(project.roofs ?? []).map(r=>Number(/^TEL-(\d+)$/.exec(r.displayId)?.[1] ?? 0)))+1}
export function roofWaters(count:number):RoofWater[] {
  return Array.from({length:count},(_,index)=>({id:generateId(),displayId:`AG-${String(index+1).padStart(2,'0')}`,highSide:'',lowSide:'',highHeightM:null,lowHeightM:null,projectionM:null,direction:'' as const}))
}
export function createRoof(project:Project,floorId?:string):Roof {return {id:generateId(),displayId:`TEL-${String(nextRoofSequence(project)).padStart(3,'0')}`,projectId:project.id,floorId,name:'Novo telhado',shape:'rectangular',lengthM:null,widthM:null,waterCount:2,waters:roofWaters(2),photos:[]}}
export function changeWaterCount(roof:Roof,count:1|2|3|4):Roof {
  // Keep measurements and IDs of existing waters. Reducing requires UI confirmation.
  const defaults=roofWaters(count)
  return {...roof,waterCount:count,waters:defaults.map((water,index)=>roof.waters[index] ?? water)}
}
const positive=(n:number|null)=>n!=null && Number.isFinite(n) && n>0
export function roofChecklist(roof:Roof) {
  const waters=roof.waters
  const checks=[
    {key:'dimensions',label:'Dimensões',valid:positive(roof.lengthM)&&positive(roof.widthM)&&(roof.shape!=='square'||roof.lengthM===roof.widthM)},
    {key:'waterCount',label:'Quantidade de águas',valid:[1,2,3,4].includes(roof.waterCount)&&waters.length===roof.waterCount},
    {key:'direction',label:'Sentido do caimento',valid:waters.length>0&&waters.every(w=>!!w.direction)},
    {key:'slope',label:'Inclinação por água',valid:waters.length>0&&waters.every(w=>!!roofSlope(w))},
  ].map(c=>({...c,completed:roof.checks?.[c.key]?.status==='na' || c.valid}))
  return {checks,obligations:checks.map(c=>({id:`${roof.id}:check:${c.key}`,completed:c.completed})),issues:checks.filter(c=>!c.completed).map(c=>({id:`roof:${roof.id}:${c.key}`,roomId:roof.id,elementId:roof.id,field:`roof:${c.key}`,description:`${roof.displayId} — ${c.label}: pendente.`,kind:'technical' as const})),completeness:Math.round(checks.filter(c=>c.completed).length/checks.length*100)}
}
