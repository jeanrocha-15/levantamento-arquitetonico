import type { Project } from '../models'
import { projectRooms } from '../relationships'
import { sheetSourceKey } from './sheetComposer'
import type { SheetSource } from './sheetComposer'
import type { SheetLayout } from './sheetSettings'
import { validSheetLayout } from './sheetSettings'
export type PdfOutputMode='single'|'separate'
export interface PdfComposition {id:string;name:string;sourceKeys:string[];outputMode:PdfOutputMode;layouts?:Record<string,SheetLayout>}
export function compositionSources(project:Project):SheetSource[] {return [...project.floors.map(floor=>({kind:'plan' as const,floor})),...projectRooms(project).map(room=>({kind:'room' as const,room})),...(project.roofs??[]).map(roof=>({kind:'roof' as const,roof}))]}
export function resolveComposition(project:Project,keys:string[]) {const available=new Map(compositionSources(project).map(s=>[sheetSourceKey(s),s]));return [...new Set(keys)].flatMap(key=>available.has(key)?[available.get(key)!]:[])}
export function reorderKeys(keys:string[],from:string,to:string) {const next=keys.filter(k=>k!==from),index=next.indexOf(to);if(from===to||index<0)return keys;next.splice(index,0,from);return next}
export function validComposition(value:unknown):value is PdfComposition {if(!value||typeof value!=='object')return false;const c=value as PdfComposition;return typeof c.id==='string'&&typeof c.name==='string'&&Array.isArray(c.sourceKeys)&&c.sourceKeys.every(k=>typeof k==='string'&&/^(room|plan|roof):.+$/.test(k))&&new Set(c.sourceKeys).size===c.sourceKeys.length&&['single','separate'].includes(c.outputMode)&&(c.layouts===undefined||!!c.layouts&&typeof c.layouts==='object'&&!Array.isArray(c.layouts)&&Object.values(c.layouts).every(validSheetLayout))}
