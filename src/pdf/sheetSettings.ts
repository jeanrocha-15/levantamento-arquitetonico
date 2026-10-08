import type { PdfLayers } from './sheetDecorations'
import { defaultPdfLayers } from './sheetDecorations'
import { paperSize, SCALES, SHEETS } from './sheetLayout'
import type { Orientation, SheetOption, SheetSize } from './sheetLayout'
export type TitleBlockField = 'title'|'project'|'floor'|'date'|'scale'|'sheet'|'responsible'|'scaleBar'
export interface SheetLayout {
 paperSize:SheetSize; orientation:Orientation; scale:number
 // Todas as posições e offsets são milímetros na folha, não medidas do levantamento.
 drawingOffsetX:number; drawingOffsetY:number
 visibleLayers:PdfLayers
 labelOverrides:Record<string,{dx:number;dy:number;rotation?:number;side?:1|-1}>
 titleBlockPosition:{x:number;y:number}
 titleBlockFields:Record<TitleBlockField,boolean>
 notes:string; responsible?:string
}
export function sheetOption(layout:SheetLayout):SheetOption {return {sheet:layout.paperSize,orientation:layout.orientation,scale:layout.scale}}
export function defaultSheetLayout(option:SheetOption={sheet:'A3',orientation:'landscape',scale:50}):SheetLayout {
 const paper=paperSize(option)
 return {paperSize:option.sheet,orientation:option.orientation,scale:option.scale,drawingOffsetX:0,drawingOffsetY:0,visibleLayers:{...defaultPdfLayers},labelOverrides:{},titleBlockPosition:{x:10,y:paper.height-74},titleBlockFields:{title:true,project:true,floor:true,date:true,scale:true,sheet:true,responsible:true,scaleBar:true},notes:''}
}
export function validSheetLayout(value:unknown):value is SheetLayout {
 if(!value||typeof value!=='object')return false
 const v=value as SheetLayout,finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)
 return v.paperSize in SHEETS && ['portrait','landscape'].includes(v.orientation) && SCALES.some(s=>s===v.scale) && finite(v.drawingOffsetX)&&finite(v.drawingOffsetY) && !!v.titleBlockPosition && finite(v.titleBlockPosition.x)&&finite(v.titleBlockPosition.y) && typeof v.notes==='string' && (v.responsible===undefined||typeof v.responsible==='string') && !!v.visibleLayers && Object.keys(defaultPdfLayers).every(k=>typeof v.visibleLayers[k as keyof PdfLayers]==='boolean') && !!v.titleBlockFields && Object.keys(defaultSheetLayout().titleBlockFields).every(k=>typeof v.titleBlockFields[k as TitleBlockField]==='boolean') && !!v.labelOverrides && !Array.isArray(v.labelOverrides) && Object.values(v.labelOverrides).every(o=>!!o&&finite(o.dx)&&finite(o.dy)&&(o.rotation===undefined||finite(o.rotation))&&(o.side===undefined||o.side===1||o.side===-1))
}
