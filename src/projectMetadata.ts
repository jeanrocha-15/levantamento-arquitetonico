import { nextVisualSequence } from './visualIds'
import type { Project, Room } from './models'
import { isMeasurementUnit } from './units'
export const roomDisplayId = (sequence: number) => `AMB-${String(sequence).padStart(3, '0')}`
// Immutable, idempotent migration: original measures and structural IDs stay untouched.
export function ensureProjectMetadata(project: Project): Project {
  const used = new Set<string>()
  let counter = project.roomDisplayCounter ?? 0
  const scan = (rooms: Room[]) => rooms.forEach(room => {
    if (room.displayId) { used.add(room.displayId); const match = /^AMB-(\d+)$/.exec(room.displayId); if (match) counter = Math.max(counter, Number(match[1])) }
    scan(room.subrooms)
  })
  project.floors.forEach(floor => scan(floor.rooms))
  const migrate = (rooms: Room[]): Room[] => rooms.map(room => {
    let displayId = room.displayId
    if (!displayId) { do { displayId = roomDisplayId(++counter) } while (used.has(displayId)); used.add(displayId) }
    return { ...room, displayId, subrooms: migrate(room.subrooms) }
  })
  const floors = project.floors.map(floor => ({ ...floor, rooms: migrate(floor.rooms) }))
  return { ...project, measurementUnit: isMeasurementUnit(project.measurementUnit) ? project.measurementUnit : 'm', roomDisplayCounter: counter, floors }
}

export function nextRoomSequence(project:Project) {
  const visit=(rooms:Room[]):string[]=>rooms.flatMap(r=>[r.displayId??'',...visit(r.subrooms)])
  return nextVisualSequence(project.floors.flatMap(f=>visit(f.rooms)),'AMB')
}
