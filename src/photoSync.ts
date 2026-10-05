import type { Project } from './models'
import { allProjectPhotos } from './photos'

// Sincronização dos ARQUIVOS das fotos (os metadados vão junto com o projeto). Envia as fotos
// que o servidor ainda não tem e baixa as que faltam neste aparelho. Nunca apaga nada no servidor.
export interface RemotePhoto { fileId: string; mimeType: string; thumbnail: boolean }
export interface PhotoTransport {
  list(): Promise<RemotePhoto[]>
  upload(fileId: string, original: Blob, mimeType: string): Promise<void>
  uploadThumbnail(fileId: string, thumbnail: Blob): Promise<void>
  download(fileId: string, thumbnail?: boolean): Promise<Blob>
}
export interface LocalPhotoFiles {
  read(fileId: string, thumbnail?: boolean): Promise<Blob | undefined>
  save(fileId: string, original: Blob, thumbnail: Blob): Promise<void>
}
export interface PhotoSyncResult { uploaded: string[]; downloaded: string[]; missing: string[]; failed: string[] }
export function referencedPhotos(projects: Project[]) {
  const files = new Map<string, string>()
  for (const project of projects) for (const photo of allProjectPhotos(project)) if (!files.has(photo.fileId)) files.set(photo.fileId, photo.mimeType || 'image/jpeg')
  return files
}
export async function syncPhotoFiles(projects: Project[], transport: PhotoTransport, local: LocalPhotoFiles, onProgress?: (remaining: number) => void): Promise<PhotoSyncResult> {
  const wanted = referencedPhotos(projects)
  const remote = new Map((await transport.list()).map(item => [item.fileId, item]))
  const result: PhotoSyncResult = { uploaded: [], downloaded: [], missing: [], failed: [] }
  const work = [...wanted]
  let remaining = work.length
  for (const [fileId, mimeType] of work) {
    onProgress?.(remaining--)
    try {
      const mine = await local.read(fileId)
      const theirs = remote.get(fileId)
      if (mine && !theirs) {
        await transport.upload(fileId, mine, mine.type || mimeType)
        const thumbnail = await local.read(fileId, true)
        if (thumbnail) await transport.uploadThumbnail(fileId, thumbnail)
        result.uploaded.push(fileId)
      } else if (mine && theirs && !theirs.thumbnail) {
        const thumbnail = await local.read(fileId, true)
        if (thumbnail) await transport.uploadThumbnail(fileId, thumbnail)
      } else if (!mine && theirs) {
        const original = await transport.download(fileId)
        const thumbnail = theirs.thumbnail ? await transport.download(fileId, true).catch(() => original) : original
        await local.save(fileId, original, thumbnail)
        result.downloaded.push(fileId)
      } else if (!mine && !theirs) result.missing.push(fileId)
    } catch { result.failed.push(fileId) }
  }
  onProgress?.(0)
  return result
}
export function httpPhotoTransport(endpoint: string, csrf: string, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): PhotoTransport {
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetchImpl(`${endpoint}${path}`, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { 'X-CSRF-Token': csrf, ...init.headers } })
    if (!response.ok) throw new Error(`Erro ${response.status} ao sincronizar fotos.`)
    return response
  }
  return {
    async list() { return (await (await call('', { headers: { Accept: 'application/json' } })).json()) as RemotePhoto[] },
    async upload(fileId, original, mimeType) { await call(`/${encodeURIComponent(fileId)}`, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: original }) },
    async uploadThumbnail(fileId, thumbnail) { await call(`/${encodeURIComponent(fileId)}/thumbnail`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: thumbnail }) },
    async download(fileId, thumbnail = false) { return (await call(`/${encodeURIComponent(fileId)}${thumbnail ? '?thumbnail=1' : ''}`)).blob() },
  }
}
