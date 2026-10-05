export type MeasurementSource = 'measured' | 'informed' | 'assumed' | 'calculated'
// Todos os comprimentos são armazenados em metros.
export type WallType = 'masonry' | 'drywall' | 'concrete' | 'glass' | 'wood' | 'partition' | 'other'
export interface SurveyPlacement { method:'diagonal'|'orthogonal'|'angle'|'closure'; referenceVertexId?:string; diagonalId?:string; side?:1|-1; angleDegrees?:number }
export interface Wall { surveyPlacement?:SurveyPlacement; id: string; label: string; lengthM: number | null; thickness?: number | null; wallType?: WallType; customWallType?: string; sharedWallReference?: { roomId: string; wallId: string; placementSide?: 'opposite' | 'same' } }
export type AngleSource = 'assumed' | 'informed' | 'calculated'
export interface Corner { id: string; wallIds: [string, string]; angleDegrees: number | null; angleSource: AngleSource | null }
export interface Diagonal { checkOnly?:boolean; vertexIds?:[string,string]; id: string; cornerIds: [string, string]; lengthM: number | null; source: 'measured' }
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
export type RoomRelationshipType = 'opening_connection' | 'shared_wall' | 'adjacency' | 'manual_reference' | 'corner'
export interface SpatialSide { roomId: string; elementId?: string; wallId?: string; face?: 'internal' | 'external' }
export interface SpatialConnection { id: string; type: 'opening' | 'corner' | 'shared_wall' | 'manual'; a: SpatialSide; b: SpatialSide; orientation?: 'normal' | 'inverted'; placementMode?: 'inside' | 'outside'; sharedWallId?: string; assembly?: boolean; flipped?: boolean; assemblyLocked?: boolean; assemblyDetached?: boolean; note?: string }
export interface RoomRelationship {
  id: string; type: RoomRelationshipType; sourceRoomId: string; sourceElementId?: string;
  targetRoomId: string; targetElementId?: string; note?: string; spatialConnectionId?: string; orientation?: 'normal' | 'inverted'; sourceFace?: 'internal' | 'external'; targetFace?: 'internal' | 'external'; placementMode?: 'inside' | 'outside'; sharedWallId?: string; derivedFromCornerId?: string
}
export interface PendingItem { id: string; description: string; resolved: boolean; kind?: 'manual' | 'technical'; reason?: 'check_on_site' | 'doubtful'; elementId?: string; field?: string; note?: string; issueKey?: string }
export type RoomObjectCategory = 'furniture' | 'equipment' | 'object' | 'other' | 'structural'
export type RoomObjectShape = 'rectangle' | 'circle' | 'line'
export type StructuralProfile = 'square' | 'rectangular' | 'circular' | 'I' | 'H' | 'T' | 'L' | 'U/C' | 'tubular' | 'custom'
export type StructuralMaterial = 'cast_concrete' | 'precast_concrete' | 'steel' | 'wood' | 'structural_masonry' | 'other'
export interface RoomObjectDimensions { widthM?: number | null; depthM?: number | null; diameterM?: number | null; lengthM?: number | null; heightM?: number | null; webM?: number | null; flangeM?: number | null }
export interface RoomObject {
  id: string; displayId: string; roomId: string; name: string;
  category: RoomObjectCategory; shape: RoomObjectShape; dimensions: RoomObjectDimensions;
  // Centro do objeto no sistema local: origem no início da primeira parede.
  position: { xM: number | null; yM: number | null }; rotationDegrees: number | null; technicalItemKey?: string; note?: string;
  structuralKind?: 'column' | 'beam'; profile?: StructuralProfile; customProfile?: string; material?: StructuralMaterial; customMaterial?: string;
  attachedWallId?: string; followWallAngle?: boolean; offset?: number | null; alongWallM?: number | null
}
export type CheckStatus = 'pending' | 'ok' | 'na'
export interface TechnicalCheck { status: CheckStatus; photoPrompted?: boolean; value?: string; note?: string }
export type PhotoEntityType = 'technical_item' | 'room' | 'wall' | 'door' | 'window' | 'gap' | 'internal_wall' | 'room_object' | 'roof'
// Fotos de telhado usam roofId, roomId vazio e coleção própria do projeto.
export interface Photo {
  id: string; originalFileName: string; createdAt: string; roomId: string;
  linkedEntityType?: PhotoEntityType; linkedEntityId?: string;
  roofId?: string; tags: string[]; note?: string; fileId: string; mimeType: string; size: number
}
export interface Room { geometryAdjustment?:boolean; perimeterClosed?:boolean; id: string; displayId?: string; name: string; floorId: string; parentRoomId?: string; ceilingHeightM: number | null; walls: Wall[]; corners: Corner[]; diagonals: Diagonal[]; openings: Opening[]; openingCounters: Record<OpeningType, number>; internalWalls: InternalWall[]; internalWallCounter: number; objects?: RoomObject[]; objectCounter?: number; structuralCounters?: { column: number; beam: number }; photos?: Photo[]; pendingItems: PendingItem[]; subrooms: Room[]; labelOffsets?: LabelOffsets; planLabelOffsets?:LabelOffsets; sketchLabelScale?: number; wallMeasurementFace?: 'internal' | 'external'; notes?: string; technicalChecks?: Record<string, TechnicalCheck> }
// Deslocamento manual dos rótulos do croqui (unidades do desenho), por chave estável: wall:<id>, angle:<id>, opening:<id>...
export type LabelOffsets = Record<string, { dx: number; dy: number; rotation?:number }>
export interface Floor { id: string; name: string; rooms: Room[] }
// Metros e graus, apenas na Planta Geral. Nunca são coordenadas do croqui individual.
export interface RoomPlacement { roomId: string; floorId: string; x: number; y: number; rotation: number; locked?: boolean }
export interface PlanPreferences { baseRoomId?: string; gridVisible?: boolean; gridStepM?: number; snap?: boolean; visibility?: Record<string, boolean | undefined> }
export interface WallCompatibility { id: string; connectionId: string; a: {roomId:string;wallId:string}; b: {roomId:string;wallId:string}; strategy: 'original'|'a'|'b'|'mean'|'manual'; valueM: number | null }
export interface RoofWater { inclinationPercent?: number | null; id: string; displayId: string; highSide: string; lowSide: string; highHeightM: number | null; lowHeightM: number | null; projectionM: number | null; direction: 'north' | 'east' | 'south' | 'west' | ''; checks?: Record<string, TechnicalCheck> }
export interface Roof { id: string; displayId: string; projectId: string; floorId?: string; name: string; shape: 'rectangular' | 'square'; lengthM: number | null; widthM: number | null; waterCount: 1 | 2 | 3 | 4; waters: RoofWater[]; note?: string; photos?: Photo[]; checks?: Record<string, TechnicalCheck> }
export interface Project { sheetLayouts?: Record<string, import('./pdf/sheetSettings').SheetLayout>; exportSelection?: {scope:'room'|'floor'|'plan';roomId?:string;floorId?:string}; openingCounters?: Record<OpeningType, number>; spatialConnections?: SpatialConnection[]; id: string; name: string; measurementUnit?: import('./units').MeasurementUnit; roomDisplayCounter?: number; floors: Floor[]; relationships: RoomRelationship[]; generalChecks?: Record<string, TechnicalCheck>; roofs?: Roof[]; roofCounter?: number; detachedRoofPhotos?: Photo[]; roomPlacements?: RoomPlacement[]; planPreferences?: Record<string, PlanPreferences>; wallCompatibilities?: WallCompatibility[] }
