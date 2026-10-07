import type { RoomGeometry } from './roomGeometry'
import type { FaceSegment } from './wallFaces'
export function openingFrame(geometry:RoomGeometry['perimeter'],placement:RoomGeometry['openings']['placements'][number],referenceFace:'internal'|'external'|'center'='internal'):FaceSegment {
 const wall=geometry.segments.find(s=>s.wall.id===placement.wall.id)
 return {id:placement.wall.id,start:wall?.start??placement.start,end:wall?.end??placement.end,thickness:placement.wall.thickness,referenceFace}
}
