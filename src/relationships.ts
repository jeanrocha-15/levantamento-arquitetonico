import { getCorners } from './corners'
import { prepareOpeningConnections, ensureUniqueOpeningLabels, reconcileSpatialConnections, openingConnectionStatus } from './spatialConnections'
import type { Project, Room, RoomRelationship } from './models'
import { id } from './domain'

export function flattenRooms(rooms: Room[]): Room[] {
  return rooms.flatMap(room => [room, ...flattenRooms(room.subrooms)])
}
export function projectRooms(project: Project): Room[] {
  return project.floors.flatMap(floor => flattenRooms(floor.rooms))
}
export function removeRoom(rooms: Room[], roomId: string): Room[] {
  return rooms.filter(room => room.id !== roomId).map(room => ({ ...room, subrooms: removeRoom(room.subrooms, roomId) }))
}
export interface RelationshipProblem { roomId: string; elementId?: string; key: string; description: string }
export function relationshipProblems(project: Project): RelationshipProblem[] {
  const rooms = projectRooms(project), byId = new Map(rooms.map(room => [room.id, room]))
  const problems: RelationshipProblem[] = []
  const add = (roomId: string, elementId: string | undefined, key: string, description: string) => problems.push({ roomId, elementId, key, description })
  for (const room of rooms) {
    for (const opening of room.openings) {
      if(openingConnectionStatus(opening,rooms)==='Divergente') add(room.id,opening.id,`opening-dimensions-${opening.id}`,`${opening.label}: dimensões divergentes da contraparte; confira o vínculo antes de editar.`)
      if (!opening.connectedRoomId && !opening.connectedOpeningId) continue
      const target = opening.connectedRoomId && byId.get(opening.connectedRoomId)
      if (!target) add(room.id, opening.id, `opening-room-${opening.id}`, `${opening.label}: esta abertura apontava para um ambiente inexistente ou sem destino definido.`)
      else if (target.id === room.id) add(room.id, opening.id, `opening-self-${opening.id}`, `${opening.label}: relação entre ambientes inválida.`)
      else if (opening.connectedOpeningId && !target.openings.some(item => item.id === opening.connectedOpeningId && item.id !== opening.id)) add(room.id, opening.id, `opening-target-${opening.id}`, `${opening.label}: abertura correspondente inexistente ou inválida.`)
    }
    for (const wall of room.walls) {
      const reference = wall.sharedWallReference
      if (!reference) continue
      const target = byId.get(reference.roomId)
      if (!target || target.id === room.id || !target.walls.some(item => item.id === reference.wallId && item.id !== wall.id)) add(room.id, wall.id, `wall-target-${wall.id}`, `Parede ${wall.label}: parede compartilhada sem parede correspondente válida.`)
    }
  }
  for (const relation of project.relationships) {
    const source = byId.get(relation.sourceRoomId), target = byId.get(relation.targetRoomId)
    const owns = (room: Room, elementId?: string) => !elementId || [...room.walls, ...room.openings, ...room.internalWalls, ...getCorners(room.walls,room.corners)].some(item => item.id === elementId)
    const correctElementTypes = source && target && (relation.type === 'opening_connection'
      ? source.openings.some(item => item.id === relation.sourceElementId) && (!relation.targetElementId || target.openings.some(item => item.id === relation.targetElementId))
      : relation.type === 'shared_wall' ? source.walls.some(item => item.id === relation.sourceElementId) && target.walls.some(item => item.id === relation.targetElementId) : true)
    if (!source || !target || source.id === target.id || !owns(source, relation.sourceElementId) || !owns(target, relation.targetElementId) || !correctElementTypes) {
      const survivor = source ?? target
      if (survivor) add(survivor.id, source ? relation.sourceElementId : relation.targetElementId, `relation-${relation.id}`, 'Relação estrutural órfã ou inválida. A referência foi removida; confira o vínculo no local.')
    }
  }
  return problems
}
// Called after every project edit: references and relationship records stay consistent.
// Physical openings are bilateral; original measures remain unchanged on migration.
export function reconcileRelationships(project: Project, previous?: Project): Project {
  project=ensureUniqueOpeningLabels(prepareOpeningConnections(project,previous))
  const problems = relationshipProblems(project)
  const rooms = projectRooms(project)
  const byId = new Map(rooms.map(room => [room.id, room]))
  const generated: RoomRelationship[] = []
  function relation(type: 'opening_connection' | 'shared_wall', source: Room, sourceElementId: string, targetRoomId: string, targetElementId?: string) {
    const previous = project.relationships.find(item => item.type === type && item.sourceRoomId === source.id && item.sourceElementId === sourceElementId)
    generated.push({ ...previous, id: previous?.id ?? id(), type, sourceRoomId: source.id, sourceElementId, targetRoomId, targetElementId })
  }
  function clean(room: Room, floorId: string, parentRoomId?: string): Room {
    const existingKeys = new Set(room.pendingItems.map(item => item.issueKey))
    // Keep a reviewable warning after clearing broken IDs, rather than silently losing the issue.
    const relevant = problems.filter(item => !item.key.startsWith('opening-dimensions-') && item.roomId === room.id && (!item.key.startsWith('relation-') || !problems.some(other => !other.key.startsWith('relation-') && other.roomId === item.roomId && other.elementId === item.elementId)))
    const additions = relevant.filter(item => !existingKeys.has(item.key))
    const manualItems = room.pendingItems.filter(item => item.kind === 'technical' || !item.elementId || [room, ...room.walls, ...room.openings, ...room.internalWalls, ...room.corners, ...room.diagonals].some(element => element.id === item.elementId))
    const existingIds = new Set([room, ...room.walls, ...room.openings, ...room.internalWalls, ...room.corners, ...room.diagonals].map(item => item.id))
    const clearDeletedTarget = <T extends { elementId?: string; field?: string }>(item: T): T => item.elementId && !existingIds.has(item.elementId) ? { ...item, elementId: undefined, field: undefined } : item
    return { ...room, floorId, parentRoomId, pendingItems: [...manualItems.map(item => clearDeletedTarget(relevant.some(problem => problem.key === item.issueKey) ? { ...item, resolved: false } : item)), ...additions.map(item => clearDeletedTarget({ id: id(), kind: 'technical' as const, description: item.description, elementId: item.elementId, issueKey: item.key, resolved: false }))],
      openings: room.openings.map(opening => {
        const target = opening.connectedRoomId && byId.get(opening.connectedRoomId)
        if (!target || target.id === room.id) {
          return { ...opening, connectedRoomId: undefined, connectedOpeningId: undefined }
        }
        const corresponding = target.openings.find(item => item.id === opening.connectedOpeningId && item.id !== opening.id)
        relation('opening_connection', room, opening.id, target.id, corresponding?.id)
        return { ...opening, connectedOpeningId: corresponding?.id }
      }),
      walls: room.walls.map(wall => {
        const reference = wall.sharedWallReference
        const target = reference && byId.get(reference.roomId)
        if (!reference || !target || target.id === room.id || !target.walls.some(item => item.id === reference.wallId && item.id !== wall.id)) {
          return { ...wall, sharedWallReference: undefined }
        }
        relation('shared_wall', room, wall.id, target.id, reference.wallId)
        return wall
      }),
      subrooms: room.subrooms.map(child => clean(child, floorId, room.id)),
    }
  }
  const floors = project.floors.map(floor => ({ ...floor, rooms: floor.rooms.map(room => clean(room, floor.id)) }))
  const retained = project.relationships.filter(item => {
    if (item.type === 'opening_connection' || item.type === 'shared_wall') return false
    const source = byId.get(item.sourceRoomId), target = byId.get(item.targetRoomId)
    const hasElement = (room: Room, elementId?: string) => !elementId || [...room.walls, ...room.openings, ...room.internalWalls, ...getCorners(room.walls,room.corners)].some(element => element.id === elementId)
    return source && target && source.id !== target.id && hasElement(source, item.sourceElementId) && hasElement(target, item.targetElementId)
  })
  const seen=new Set<string>()
  const unique=generated.filter(r=>{const key=r.type+[`${r.sourceRoomId}:${r.sourceElementId??''}`,`${r.targetRoomId}:${r.targetElementId??''}`].sort().join('|');if(seen.has(key))return false;seen.add(key);return true})
  const validIds = new Set([...retained, ...unique].map(item => item.id))
  const clearDivision = (room: Room): Room => ({ ...room, internalWalls: room.internalWalls.map(wall => !wall.formalDivisionRelationshipId || validIds.has(wall.formalDivisionRelationshipId)?wall:{...wall,formalDivisionRelationshipId:undefined}), subrooms: room.subrooms.map(clearDivision) })
  return reconcileSpatialConnections({ ...project, floors: floors.map(floor => ({ ...floor, rooms: floor.rooms.map(clearDivision) })), relationships: [...retained, ...unique] })
}
