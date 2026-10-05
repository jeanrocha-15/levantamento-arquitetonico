import { nextVisualSequence } from './visualIds'
import type { Room, RoomObject, StructuralMaterial, StructuralProfile } from './models'
import { generateId } from './domain'
export const materialNames:Record<StructuralMaterial,string>={cast_concrete:'Concreto moldado in loco',precast_concrete:'Concreto pré-moldado',steel:'Aço',wood:'Madeira',structural_masonry:'Alvenaria estrutural',other:'Outro'}
export const profileNames:Record<StructuralProfile,string>={square:'Quadrado',rectangular:'Retangular',circular:'Circular',I:'I',H:'H',T:'T',L:'L','U/C':'U/C',tubular:'Tubular',custom:'Personalizada'}
export function nextStructuralSequence(room:Room,kind:'beam'|'column') {
  const prefix=kind==='column'?'PIL':'VIG'
  return nextVisualSequence((room.objects??[]).map(o=>o.displayId),prefix)
}
export function createStructuralObject(room:Room,kind:'beam'|'column'):RoomObject {
  return {id:generateId(),roomId:room.id,shape:'rectangle',position:{xM:0,yM:0},rotationDegrees:0,displayId:`${kind==='column'?'PIL':'VIG'}-${String(nextStructuralSequence(room,kind)).padStart(3,'0')}`,name:kind==='column'?'Pilar':'Viga',category:'structural',structuralKind:kind,technicalItemKey:kind==='column'?'columns':'beams',profile:undefined,dimensions:{widthM:null,depthM:null,heightM:null,lengthM:null}}
}
const positive=(x:number|null|undefined)=>x!=null && Number.isFinite(x) && x>0
export function structuralVerification(object:RoomObject) {
  const d=object.dimensions,p=object.profile
  const shape=!!object.structuralKind && !!p && (p!=='custom' || !!object.customProfile?.trim())
  const material=!!object.material && (object.material!=='other' || !!object.customMaterial?.trim())
  const section=p==='circular'?positive(d.diameterM):positive(d.widthM) && (p==='square' || positive(object.structuralKind==='beam'?d.heightM:d.depthM))
  const profileThickness=!p || !['I','H','T','L','U/C','tubular'].includes(p) || positive(d.webM) && (p==='tubular' || positive(d.flangeM)) && d.webM! < (p==='tubular'?Math.min(d.widthM ?? 0,d.heightM ?? d.depthM ?? 0)/2:d.widthM ?? 0) && (p==='tubular' || d.flangeM! < (object.structuralKind==='beam'?d.heightM ?? d.widthM ?? 0:d.depthM ?? d.widthM ?? 0)/2)
  const dimensions=section && profileThickness && (object.structuralKind!=='beam' || positive(d.lengthM))
  return [{key:'shape',label:'Forma/perfil',completed:shape},{key:'dimensions',label:'Dimensões',completed:dimensions},{key:'material',label:'Material',completed:material}]
}
// Simple plan symbols for sections. Beam profiles are shown in their editor; its plan footprint is length × width.
export function columnProfilePoints(profile:StructuralProfile|undefined,width:number,height:number,web:number,flange:number):[number,number][]|undefined {
  const w=width/2,h=height/2,t=web/2,f=flange
  if(profile==='I'||profile==='H') return [[-w,-h],[w,-h],[w,-h+f],[t,-h+f],[t,h-f],[w,h-f],[w,h],[-w,h],[-w,h-f],[-t,h-f],[-t,-h+f],[-w,-h+f]]
  if(profile==='T') return [[-w,-h],[w,-h],[w,-h+f],[t,-h+f],[t,h],[-t,h],[-t,-h+f],[-w,-h+f]]
  if(profile==='L') return [[-w,-h],[-w+web,-h],[-w+web,h-f],[w,h-f],[w,h],[-w,h]]
  if(profile==='U/C') return [[-w,-h],[w,-h],[w,-h+f],[-w+web,-h+f],[-w+web,h-f],[w,h-f],[w,h],[-w,h]]
}
