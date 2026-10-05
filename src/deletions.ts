import { firstFreeNumber } from './visualIds'
import type { Room } from './models'
import { getCorners } from './corners'
// Preserve measured values on dependent elements; only their deleted references are cleared.
export function removePerimeterWall(room: Room, wallId: string): Room {
  const walls = room.walls.filter(wall => wall.id !== wallId)
  const corners = getCorners(walls, room.corners)
  const cornerIds = new Set(corners.map(corner => corner.id))
  return { ...room, walls, corners,
    openings: room.openings.map(opening => ({ ...opening, wallId: opening.wallId === wallId ? '' : opening.wallId, referenceCornerId: cornerIds.has(opening.referenceCornerId) ? opening.referenceCornerId : '' })),
    diagonals: room.diagonals.map(diagonal => ({ ...diagonal, cornerIds: diagonal.cornerIds.map(cornerId => cornerIds.has(cornerId) ? cornerId : '') as [string, string] })),
    internalWalls: room.internalWalls.map(wall => wall.origin.type === 'perimeter_wall' ? { ...wall, origin: { ...wall.origin, wallId: wall.origin.wallId === wallId ? '' : wall.origin.wallId, referenceCornerId: cornerIds.has(wall.origin.referenceCornerId) ? wall.origin.referenceCornerId : '' } } : wall),
  }
}
export function nextWallIndex(room: Room): number {
  return firstFreeNumber(room.walls.map(wall=>{let index=0;for(const letter of wall.label)index=index*26+letter.charCodeAt(0)-64;return index}))-1
}
