import type { Photo, PhotoEntityType } from './models'
import { generateId } from './domain'
import { createThumbnail, savePhotoFile, discardUnlinkedPhotoFile } from './photoStorage'
export async function importSurveyPhoto(file:File, roomId:string, target:{type:PhotoEntityType;id:string}|undefined, onAdd:(photo:Photo)=>void) {
  if(file.type && !file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.')
  const thumbnail=await createThumbnail(file), fileId=generateId()
  try {
    await savePhotoFile(fileId,file,thumbnail)
    const photo:Photo={id:fileId,fileId,originalFileName:file.name,createdAt:new Date().toISOString(),roomId,linkedEntityType:target?.type,linkedEntityId:target?.id,tags:[],mimeType:file.type || 'image/*',size:file.size}
    onAdd(photo); return photo
  } catch(error) { try { await discardUnlinkedPhotoFile(fileId) } catch { /* Arquivo órfão é preservado se a limpeza falhar. */ } throw error }
}
