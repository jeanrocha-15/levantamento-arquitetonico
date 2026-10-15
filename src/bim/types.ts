import type {Room, RoomPlacement, SpatialConnection} from '../models'
export interface Identity {lacId?:string; revitUniqueId?:string}
export type XYZ=[number,number,number]
export interface PhysicalWall {lacId:string;revitUniqueId?:string;start:XYZ;end:XYZ;curve?:unknown;thickness:number|null;baseLevelId:string;height:number|null;topLevelId?:string;material?:string;roomIds:string[];surveyRefs:{roomId:string;wallId:string}[]}
export interface PhysicalOpening {note?:string;lacId:string;revitUniqueId?:string;hostWallId:string;levelId:string;type:'door'|'window'|'gap';position:XYZ;width:number|null;height:number|null;sill:number|null;roomRefs:{roomId:string;openingId:string}[]}
export interface PhysicalElement {lacId:string;revitUniqueId?:string;category:string;type:string;levelId:string;position:XYZ;rotation:number;width?:number;depth?:number;height?:number;hostId?:string;roomId?:string;objectId?:string;editable:false|'limited';representation:XYZ[];source?:unknown;issue?:string}
export interface ExchangeLevel {lacId:string;name:string;elevation:number;revitUniqueId?:string}
export interface ExchangeRoom {lacId:string;revitUniqueId?:string;levelId:string;name:string;boundary:XYZ[];survey:Room;placement:RoomPlacement}
export interface RevitMapping {category:string;type:string;family?:string;typeUniqueId?:string}
export interface LacExchange {format:'lac-exchange';schemaVersion:1;units:'m';project:{lacId:string;name:string;sourceDocumentId?:string};levels:ExchangeLevel[];rooms:ExchangeRoom[];physicalWalls:PhysicalWall[];openings:PhysicalOpening[];elements:PhysicalElement[];connections:SpatialConnection[];revitMappings:RevitMapping[];syncMetadata:{exportedAt:string;baseline?:Record<string,unknown>;complete:boolean;warnings:string[]}}
export interface BimState {sourceDocumentId?:string;physicalWalls:PhysicalWall[];openings:PhysicalOpening[];elements:PhysicalElement[];revitMappings:RevitMapping[];baseline?:Record<string,unknown>;pendingBaseline?:Record<string,unknown>;lastSync?:string;history?:{at:string;records:Record<string,unknown>}[];warnings:string[]}
