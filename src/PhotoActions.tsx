import { createContext, useContext } from 'react'
import type { PhotoEntityType, Room } from './models'
export interface PhotoOfferRequest { roomId:string; type:PhotoEntityType; entityId:string; label:string }
export const PhotoOfferContext=createContext<((request:PhotoOfferRequest)=>void) | undefined>(undefined)
export interface PhotoRequest { roomId: string; type?: PhotoEntityType; entityId?: string; token: number }
export const PhotoActionsContext = createContext<((roomId: string, type?: PhotoEntityType, entityId?: string) => void) | undefined>(undefined)
export function ElementPhotos({ room, type, entityId }: { room: Room; type: PhotoEntityType; entityId: string }) {
  const open = useContext(PhotoActionsContext)
  if (!open) return null
  const count = (room.photos ?? []).filter(photo => photo.linkedEntityType === type && photo.linkedEntityId === entityId).length
  return <div className="element-photo-actions"><button type="button" onClick={() => open(room.id,type,entityId)}>📷 Adicionar foto</button><button type="button" onClick={() => open(room.id,type,entityId)}>Fotos vinculadas: {count}</button></div>
}
