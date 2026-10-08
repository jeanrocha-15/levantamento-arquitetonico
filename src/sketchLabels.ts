import { formatMeasurement } from './units'
import type { MeasurementUnit } from './units'
import type { buildPerimeter } from './geometry'
import type { LabelBox } from './openings'
export function getSketchLabelLayout(geometry: ReturnType<typeof buildPerimeter>, unit: MeasurementUnit = 'm', includeWallLabels = true) {
  const positions = new Map<string, { x: number; y: number; box: LabelBox }>()
  const boxes: LabelBox[] = []
  const place = (key: string, x: number, y: number, width: number, height: number) => {
    const candidates = [[0,0],[0,-18],[0,18],[-20,0],[20,0],[-20,-18],[20,-18],[-20,18],[20,18],[0,-32],[0,32]]
    const choices = candidates.map(([dx,dy]) => {
      const cx = Math.max(10 + width/2, Math.min(430-width/2, x+dx)), cy = Math.max(45+height/2, Math.min(320-height/2,y+dy))
      const box = { x: cx-width/2, y: cy-height/2, width, height }
      const overlap = boxes.reduce((sum, other) => sum + Math.max(0, Math.min(box.x+width,other.x+other.width+3)-Math.max(box.x,other.x-3))*Math.max(0,Math.min(box.y+height,other.y+other.height+3)-Math.max(box.y,other.y-3)),0)
      return { x: cx, y: cy, box, score: overlap*100 + Math.hypot(cx-x,cy-y) }
    }).sort((a,b)=>a.score-b.score)
    positions.set(key, choices[0]); boxes.push(choices[0].box)
  }
  geometry.corners.forEach(corner => {
    const point = geometry.project(corner.position), direction = corner.labelDirection
    place(`corner:${corner.id}`,point.x-direction.x*15,point.y-direction.y*15,30,18)
    place(`angle:${corner.id}`,point.x+direction.x*30,point.y+direction.y*30,58,26)
  })
  if(includeWallLabels)geometry.segments.forEach(segment => {
    const point = geometry.project({x:(segment.start.x+segment.end.x)/2,y:(segment.start.y+segment.end.y)/2})
    place(`wall:${segment.wall.id}`,point.x+segment.direction.y*27,point.y-segment.direction.x*27,Math.max(80, formatMeasurement(segment.wall.lengthM, unit).length*7+8),34)
  })
  const first = geometry.segments[0]
  if (first) {
    const point = geometry.project({x:(first.start.x+first.end.x)/2,y:(first.start.y+first.end.y)/2})
    place('entry',point.x-first.direction.y*62,point.y+first.direction.x*62,112,18)
  }
  geometry.diagonalSegments.forEach(segment => {
    const point = geometry.project({x:(segment.start.x+segment.end.x)/2,y:(segment.start.y+segment.end.y)/2})
    place(`diagonal:${segment.diagonal.id}`,point.x,point.y,Math.max(74,formatMeasurement(segment.diagonal.lengthM,unit).length*6+8),30)
  })
  return { positions, boxes }
}

export function getSketchLabelReservations(geometry: ReturnType<typeof buildPerimeter>, includeEntry = false): LabelBox[] {
  const layout = getSketchLabelLayout(geometry)
  return layout.boxes.filter(box => includeEntry || box !== layout.positions.get('entry')?.box)
}
