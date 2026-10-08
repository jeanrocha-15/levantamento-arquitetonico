import { surveyDimensions } from '../surveyDimensions'
import { layoutDimensions,dimensionPoints } from '../architecturalDimensions'
import type { PlanRoom } from '../floorPlan'
import type { RoomPlacement } from '../models'
import type { MeasurementUnit } from '../units'
import { formatMeasurement } from '../units'
import type { PdfLayers } from './sheetDecorations'
import type { SheetLayout } from './sheetSettings'
export function pdfDimensionLayout(shown:{shape:PlanRoom;placement?:RoomPlacement}[],font:number,unit:MeasurementUnit,layers:PdfLayers,layout?:SheetLayout){
 const source=surveyDimensions(shown,font,n=>formatMeasurement(n,unit))
 const requests=source.requests.map(r=>({...r,text:[layers.ids?r.text.split(' · ')[0]:'',layers.measurements?r.text.split(' · ').slice(1).join(' · '):''].filter(Boolean).join(' · '),side:layout?.labelOverrides[r.key]?.side??r.side}))
 const dimensions=(layers.measurements||layers.ids)?layoutDimensions(requests,source.obstacles,font):new Map()
 return {dimensions,points:[...dimensions.values()].flatMap(dimensionPoints),annotationPoints:source.obstacles.flatMap(b=>[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y+b.height}])}
}
