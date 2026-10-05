import type { Room } from './models'
import type { ChecklistIssue } from './checklist'
export const ENVIRONMENT_SECTIONS = [
  {id:'summary',label:'Resumo',description:'Identificação e dados gerais'},
  {id:'perimeter',label:'Perímetro',description:'Paredes, encontros e diagonais'},
  {id:'openings',label:'Aberturas',description:'Portas, janelas e vãos'},
  {id:'internal',label:'Elementos internos',description:'Paredes internas e elementos existentes'},
  {id:'objects',label:'Objetos',description:'Móveis, equipamentos e objetos técnicos'},
  {id:'photos',label:'Fotos',description:'Registro, vínculos e pesquisa'},
  {id:'checklist',label:'Checklist',description:'Conferência e marcações do levantamento'},
  {id:'issues',label:'Pendências',description:'O que falta conferir neste ambiente'},
  {id:'report',label:'Relatório',description:'Quantitativos, PDF e arquivos do projeto'},
] as const
export type EnvironmentSection = typeof ENVIRONMENT_SECTIONS[number]['id']
export function nextEnvironmentSection(section:EnvironmentSection):EnvironmentSection {
  const flow:EnvironmentSection[]=['summary','perimeter','openings','internal','objects','photos','checklist','issues']
  return flow[(flow.indexOf(section)+1)%flow.length]
}
export function sectionForIssue(room:Room,issue:ChecklistIssue):EnvironmentSection {
  if(issue.elementId===room.id && issue.field!=='geometry') return 'summary'
  if(issue.field==='geometry' || room.walls.some(x=>x.id===issue.elementId) || room.corners.some(x=>x.id===issue.elementId) || room.diagonals.some(x=>x.id===issue.elementId)) return 'perimeter'
  if(room.openings.some(x=>x.id===issue.elementId)) return 'openings'
  if(room.internalWalls.some(x=>x.id===issue.elementId)) return 'internal'
  if(room.objects?.some(x=>x.id===issue.elementId)) return 'objects'
  return 'issues'
}
