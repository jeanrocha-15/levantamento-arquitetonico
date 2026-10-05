export type MeasurementSource = 'measured' | 'informed' | 'assumed' | 'calculated'
// Todos os comprimentos são armazenados em metros.
export type WallType = 'masonry' | 'drywall' | 'concrete' | 'glass' | 'wood' | 'partition' | 'other'
export interface Wall { id: string; label: string; lengthM: number | null; thickness?: number | null; wallType?: WallType; customWallType?: string; sharedWallReference?: { roomId: string; wallId: string } }
export type AngleSource = 'assumed' | 'informed' | 'calculated'
export interface Corner { id: string; wallIds: [string, string]; angleDegrees: number | null; angleSource: AngleSource | null }
export interface Diagonal { id: string; cornerIds: [string, string]; lengthM: number | null; source: 'measured' }
// method: 'diagonal' (lei dos cossenos/diagonais) ou 'closure' (fechamento do perímetro com as paredes medidas).
export interface AngleCalculation { cornerId: string; angleDegrees: number; angleSource: 'calculated'; diagonalIds: string[]; method?: 'diagonal' | 'closure' }
export type OpeningType = 'door' | 'window' | 'gap'
// Portas: doorKind 'hinged' (de abrir, com giro) ou 'sliding' (de correr).
// swing: para dentro/fora do ambiente. hinge/slideDirection: esquerda/direita vistas de dentro do ambiente, olhando para a parede.
export type DoorKind = 'hinged' | 'sliding'
export type DoorSwing = 'inward' | 'outward'
export type DoorSide = 'left' | 'right'
export interface Opening { id: string; label: string; wallId: string; type: OpeningType; referenceCornerId: string; offsetM: number | null; widthM: number | null; heightM: number | null; sillHeightM: number | null; connectedRoomId?: string; connectedOpeningId?: string; doorKind?: DoorKind; swing?: DoorSwing; hinge?: DoorSide; slideDirection?: DoorSide }
export type InternalWallOrigin =
  | { type: 'perimeter_wall'; wallId: string; referenceCornerId: string; distanceM: number | null }
  | { type: 'internal_wall'; internalWallId: string; referenceEndpoint: 'start' | 'end'; distanceM: number | null }
  | { type: 'free'; position: { xM: number; yM: number } }
export interface InternalWall {
  id: string; label: string; origin: InternalWallOrigin; lengthM: number | null;
  // Ângulo horário relativo ao sentido da origem; origens livres usarão o eixo x local.
  orientationDegrees: number | null; thicknessM?: number | null; heightM?: number | null; note?: string;
  formalDivisionRelationshipId?: string
}
export type RoomRelationshipType = 'opening_connection' | 'shared_wall' | 'adjacency' | 'manual_reference'
export interface RoomRelationship {
  id: string; type: RoomRelationshipType; sourceRoomId: string; sourceElementId?: string;
  targetRoomId: string; targetElementId?: string; note?: string
}
export interface PendingItem { id: string; description: string; resolved: boolean; kind?: 'manual' | 'technical'; reason?: 'check_on_site' | 'doubtful'; elementId?: string; field?: string; note?: string; issueKey?: string }
export type RoomObjectCategory = 'furniture' | 'equipment' | 'object' | 'other'
export type RoomObjectShape = 'rectangle' | 'circle' | 'line'
export interface RoomObjectDimensions { widthM?: number | null; depthM?: number | null; diameterM?: number | null; lengthM?: number | null }
export interface RoomObject {
  id: string; displayId: string; roomId: string; name: string;
  category: RoomObjectCategory; shape: RoomObjectShape; dimensions: RoomObjectDimensions;
  // Centro do objeto no sistema local: origem no início da primeira parede.
  position: { xM: number | null; yM: number | null }; rotationDegrees: number | null; note?: string
}
export type PhotoEntityType = 'room' | 'wall' | 'door' | 'window' | 'gap' | 'internal_wall' | 'room_object'
export interface Photo {
  id: string; originalFileName: string; createdAt: string; roomId: string;
  linkedEntityType?: PhotoEntityType; linkedEntityId?: string;
  tags: string[]; note?: string; fileId: string; mimeType: string; size: number
}
export interface Room { id: string; displayId?: string; name: string; floorId: string; parentRoomId?: string; ceilingHeightM: number | null; walls: Wall[]; corners: Corner[]; diagonals: Diagonal[]; openings: Opening[]; openingCounters: Record<OpeningType, number>; internalWalls: InternalWall[]; internalWallCounter: number; objects?: RoomObject[]; objectCounter?: number; photos?: Photo[]; pendingItems: PendingItem[]; subrooms: Room[]; labelOffsets?: LabelOffsets; sketchLabelScale?: number }
// Deslocamento manual dos rótulos do croqui (unidades do desenho), por chave estável: wall:<id>, angle:<id>, opening:<id>...
export type LabelOffsets = Record<string, { dx: number; dy: number }>
export interface Floor { id: string; name: string; rooms: Room[] }
export interface Project { id: string; name: string; measurementUnit?: import('./units').MeasurementUnit; roomDisplayCounter?: number; floors: Floor[]; relationships: RoomRelationship[] }
