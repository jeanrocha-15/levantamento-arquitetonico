import type { Room } from './models'
import { buildPerimeter } from './geometry'
import { buildOpeningLayout } from './openings'
import { buildInternalWallLayout } from './internalWalls'

// One immutable, derived result can be shared by form, sketch and checklist.
// No calculations are written back into the measured Room.
export function buildRoomGeometry(room: Room) {
  const perimeter = buildPerimeter(room.walls, room.corners, room.diagonals,{adjust:room.geometryAdjustment,closed:room.perimeterClosed})
  const internalWalls=buildInternalWallLayout(perimeter,room.walls,room.corners,room.internalWalls)
  return {
    perimeter,
    openings: buildOpeningLayout(perimeter, room.walls, room.corners, room.openings,internalWalls.placements),
    internalWalls,
  }
}
export type RoomGeometry = ReturnType<typeof buildRoomGeometry>
