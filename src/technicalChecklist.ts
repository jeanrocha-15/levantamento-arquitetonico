import type { Project, Room, TechnicalCheck } from './models'

export const TECHNICAL_GROUPS = ['DADOS GERAIS', 'MEDIÇÕES', 'ELÉTRICA/GÁS', 'PRODUTOS PERIGOSOS'] as const
export const TECHNICAL_ITEMS = [
  ...[['client','Cliente'],['contact','Contato'],['phone','Telefone'],['address','Endereço'],['responsible','Responsável'],['startTime','Hora início'],['endTime','Hora fim']].map(([key,label])=>({key,label,group:'DADOS GERAIS',general:true,photo:false})),
  ...[['walls','Paredes'],['ceiling','Pé-direito'],['geometry','Ângulos/diagonais'],['openings','Portas/portões/janelas/vãos'],['internalWalls','Paredes internas (PI)'],['objects','Objetos/equipamentos'],['beams','Vigas'],['columns','Pilares'],['lowWalls','Muretas'],['screens','Áreas vazadas/cobogó/grades'],['stairs','Escadas'],['ramps','Rampas'],['facade','Fachada']].map(([key,label])=>({key,label,group:'MEDIÇÕES',general:false,photo:['beams','columns','objects','facade'].includes(key)})),
  ...[['panels','Quadros'],['substation','Subestação'],['transformers','Transformadores'],['generator','Gerador'],['fuelGas','GLP/GNV'],['cylinders','Cilindros']].map(([key,label])=>({key,label,group:'ELÉTRICA/GÁS',general:false,photo:true})),
  ...[['hazardIdentification','Identificação'],['hazardStorage','Armazenagem'],['hazardCapacity','Capacidade'],['tanks','Tanques'],['hazardMaterial','Material'],['hazardPressure','Pressurização'],['hazardProduct','Produto armazenado']].map(([key,label])=>({key,label,group:'PRODUTOS PERIGOSOS',general:false,photo:true})),
] as const
// Fachada oferece registro fotográfico; não é uma exigência de conclusão.
export const COMPLETION_ITEMS=TECHNICAL_ITEMS.filter(item=>item.key!=='facade')
export function technicalItemId(room: Room, key: string) { return `${room.id}:check:${key}` }
export function technicalCheck(room: Room, project: Project, key: string): TechnicalCheck {
  const general=TECHNICAL_ITEMS.find(item=>item.key===key)?.general
  return (general ? project.generalChecks?.[key] : room.technicalChecks?.[key]) ?? {status:'pending'}
}
export function itemKeyForEntity(room: Room, elementId?: string, field?: string): string {
  if(field?.startsWith('check:')) return field.slice(6)
  const key=checklistKeyFromId(room,elementId)
  if(key) return key
  if(elementId===room.id) return field==='ceilingHeightM'?'ceiling':field==='geometry'?'geometry':'name'
  if(room.walls.some(x=>x.id===elementId)) return 'walls'
  if(room.openings.some(x=>x.id===elementId)) return 'openings'
  if(room.internalWalls.some(x=>x.id===elementId)) return 'internalWalls'
  const object=room.objects?.find(x=>x.id===elementId)
  if(object) return COMPLETION_ITEMS.some(item=>!item.general && item.key===object.technicalItemKey)?object.technicalItemKey!:'objects'
  return 'geometry'
}
export function checklistKeyFromId(room:Room,elementId?:string) { return elementId?.startsWith(`${room.id}:check:`)?elementId.slice(`${room.id}:check:`.length):undefined }
export function isGeneralCheckField(field?:string) { return !!field?.startsWith('check:') && TECHNICAL_ITEMS.some(item=>item.general && item.key===field.slice(6)) }
