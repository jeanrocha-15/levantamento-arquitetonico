import { TECHNICAL_ITEMS, technicalItemId } from './technicalChecklist'
import type { Photo, PhotoEntityType, Project, Room } from './models'
import { projectRooms } from './relationships'
import { objectCategoryNames } from './roomObjects'
export const photoTypeNames: Record<PhotoEntityType, string> = { technical_item: 'Item do checklist técnico', room: 'Ambiente em geral', wall: 'Parede externa', door: 'Porta', window: 'Janela', gap: 'Vão', internal_wall: 'Parede interna', room_object: 'Objeto/Móvel/Equipamento' }
export interface PhotoTarget { type: PhotoEntityType; id: string; label: string; searchText: string }
export function photoTargets(room: Room): PhotoTarget[] {
  return [
    ...TECHNICAL_ITEMS.filter(item=>!item.general).map(item=>({type:'technical_item' as const,id:technicalItemId(room,item.key),label:item.label,searchText: [item.group,item.label,room.technicalChecks?.[item.key]?.note].filter(Boolean).join(' ')})),
    { type: 'room', id: room.id, label: 'Ambiente em geral', searchText: `${room.displayId ?? ''} ${room.name}` },
    ...room.walls.map(wall => ({ type: 'wall' as const, id: wall.id, label: `Parede ${wall.label}`, searchText: `parede externa ${wall.label}` })),
    ...room.openings.map(opening => ({ type: opening.type, id: opening.id, label: `${opening.label} — ${photoTypeNames[opening.type]}`, searchText: `${opening.label} ${photoTypeNames[opening.type]} parede ${room.walls.find(wall => wall.id === opening.wallId)?.label ?? ''}` })),
    ...room.internalWalls.map(wall => ({ type: 'internal_wall' as const, id: wall.id, label: `${wall.label} — Parede interna`, searchText: `${wall.label} parede interna ${wall.note ?? ''}` })),
    ...(room.objects ?? []).map(object => ({ type: 'room_object' as const, id: object.id, label: `${object.displayId} — ${object.name}`, searchText: `${object.displayId} ${object.name} ${objectCategoryNames[object.category]} ${TECHNICAL_ITEMS.find(item=>item.key===object.technicalItemKey)?.label ?? ''}` })),
  ]
}
export function photoTarget(room: Room, photo: Pick<Photo, 'linkedEntityType' | 'linkedEntityId'>): PhotoTarget | undefined {
  return photoTargets(room).find(target => target.type === photo.linkedEntityType && target.id === photo.linkedEntityId)
}
export function cleanRoomPhotoLinks(room: Room): Room {
  return { ...room, photos: (room.photos ?? []).map(photo => photoTarget(room, photo) ? photo : { ...photo, linkedEntityType: undefined, linkedEntityId: undefined }), subrooms: room.subrooms.map(cleanRoomPhotoLinks) }
}
export function cleanProjectPhotoLinks(project: Project): Project {
  return { ...project, floors: project.floors.map(floor => ({ ...floor, rooms: floor.rooms.map(cleanRoomPhotoLinks) })) }
}
export function migrateRoomPhotos(room: Room): Room { return { ...room, photos: room.photos ?? [], subrooms: room.subrooms.map(migrateRoomPhotos) } }
export function parsePhotoTags(text: string): string[] { return [...new Set(text.split(/[,;\n]/).map(tag => tag.trim()).filter(Boolean))] }
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
export interface PhotoFilters { query: string; roomId: string; type: string; link: 'all' | 'linked' | 'unlinked' }
export function searchPhotos(project: Project, filters: PhotoFilters) {
  const words = normalize(filters.query).trim().split(/\s+/).filter(Boolean)
  return projectRooms(project).flatMap(room => (room.photos ?? []).map(photo => ({ room, photo, target: photoTarget(room, photo) }))).filter(({ room, photo, target }) => {
    if (filters.roomId && room.id !== filters.roomId || filters.type && target?.type !== filters.type) return false
    if (filters.link === 'linked' && !target || filters.link === 'unlinked' && target) return false
    const text = normalize([room.displayId, room.name, photo.originalFileName, ...photo.tags, photo.note, target?.label, target?.searchText, target && photoTypeNames[target.type]].filter(Boolean).join(' '))
    return words.every(word => text.includes(word))
  }).sort((a,b) => b.photo.createdAt.localeCompare(a.photo.createdAt))
}
export function photoFileIds(projects: Project[]): Set<string> { return new Set(projects.flatMap(project => projectRooms(project).flatMap(room => (room.photos ?? []).map(photo => photo.fileId)))) }
