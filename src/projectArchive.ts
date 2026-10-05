import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Photo, Project } from './models'
import type { StoredWorkspace, WorkspaceData } from './storage'
import { SCHEMA_VERSION, createSnapshot, encodeSnapshot, restoreNavigation } from './storage'
import { parseBackup } from './exporting'
import { allProjectPhotos } from './photos'
import { cloneWithNewIds } from './projectClone'

// Arquivo de projeto (.levantamento = ZIP): project.json (mesmo envelope/versão do armazenamento local,
// com tudo: pavimentos, ambientes, paredes, unidades, tipos, diagonais, aberturas, PI, objetos, relações,
// pendências e metadados das fotos) + photos/<fileId> (original) + photos/thumbs/<fileId>.jpg.
export const ARCHIVE_FORMAT = 'campo-levantamento-projeto'
export const ARCHIVE_EXTENSION = '.levantamento'
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024
export interface PhotoFiles { original: Blob; thumbnail?: Blob }
export type ReadPhoto = (fileId: string) => Promise<PhotoFiles | undefined>
export interface ArchiveContents { snapshot: StoredWorkspace; project: Project; files: Map<string, PhotoFiles>; missingFiles: string[] }

const projectPhotos = (project: Project): Photo[] => allProjectPhotos(project)
const extension = (photo: Photo) => (/\.([a-z0-9]{1,5})$/i.exec(photo.originalFileName)?.[1] ?? photo.mimeType.split('/')[1] ?? 'bin').toLowerCase()
const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'levantamento'

export async function createProjectArchive(data: WorkspaceData, projectId: string, readPhoto: ReadPhoto, now = new Date()) {
  const project = data.projects.find(item => item.id === projectId)
  if (!project) throw new Error('Não há projeto para exportar.')
  const snapshot = createSnapshot(restoreNavigation({ ...data, projects: [project], projectId }))
  const photos = projectPhotos(project)
  const entries: Record<string, Uint8Array> = {}
  const index: { photoId: string; fileId: string; roomId: string; path: string; thumbnail?: string }[] = []
  const missing: string[] = []
  for (const photo of photos) {
    if (index.some(item => item.fileId === photo.fileId)) continue
    const files = await readPhoto(photo.fileId).catch(() => undefined)
    if (!files) { missing.push(photo.originalFileName); continue }
    const path = `photos/${photo.fileId}.${extension(photo)}`
    entries[path] = new Uint8Array(await files.original.arrayBuffer())
    const thumbnail = files.thumbnail ? `photos/thumbs/${photo.fileId}.jpg` : undefined
    if (thumbnail) entries[thumbnail] = new Uint8Array(await files.thumbnail!.arrayBuffer())
    index.push({ photoId: photo.id, fileId: photo.fileId, roomId: photo.roomId, path, thumbnail })
  }
  const manifest = { format: ARCHIVE_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), projectId, projectName: project.name, photos: index }
  // O envelope do snapshot preserva valores especiais (NaN/-0) exatamente como no armazenamento local.
  entries['project.json'] = strToU8(encodeSnapshot({ ...snapshot, format: ARCHIVE_FORMAT, archive: manifest } as StoredWorkspace))
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  // Fotos já são comprimidas (JPEG/HEIC); só o JSON é deflacionado.
  const zipped = zipSync(Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, [bytes, { level: name.endsWith('.json') ? 6 : 0 }]])) as Parameters<typeof zipSync>[0])
  return { fileName: `campo-${slug(project.name)}-${date}${ARCHIVE_EXTENSION}`, bytes: zipped, missingPhotos: missing, photoCount: index.length }
}

// Valida tudo antes de qualquer gravação; um arquivo inválido nunca altera os dados existentes.
export function readProjectArchive(bytes: Uint8Array): ArchiveContents {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error('O arquivo é grande demais (máximo 500 MB). Nada foi alterado.')
  let entries: Record<string, Uint8Array>
  try { entries = unzipSync(bytes) } catch { throw new Error('O arquivo não é um projeto do LAC (.levantamento/.zip ilegível). Nada foi alterado.') }
  const json = entries['project.json']
  if (!json) throw new Error('O arquivo não contém project.json. Nada foi alterado.')
  const text = strFromU8(json)
  let raw: { format?: unknown; schemaVersion?: unknown; archive?: { photos?: { fileId: string; path: string; thumbnail?: string }[] } }
  try { raw = JSON.parse(text) } catch { throw new Error('project.json ilegível. Nada foi alterado.') }
  if (raw.format !== ARCHIVE_FORMAT) throw new Error('O arquivo não é um projeto exportado pelo LAC. Nada foi alterado.')
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > SCHEMA_VERSION) throw new Error(`Este projeto foi gerado por uma versão mais nova do LAC (versão de dados ${String(raw.schemaVersion)}). Atualize o app antes de importar. Nada foi alterado.`)
  const snapshot = parseBackup(text)
  if (snapshot.data.projects.length !== 1) throw new Error('O arquivo deve conter exatamente um projeto. Nada foi alterado.')
  const project = snapshot.data.projects[0]
  const files = new Map<string, PhotoFiles>(), missingFiles: string[] = []
  const index = Array.isArray(raw.archive?.photos) ? raw.archive!.photos! : []
  for (const photo of projectPhotos(project)) {
    if (files.has(photo.fileId)) continue
    const item = index.find(entry => entry.fileId === photo.fileId)
    const original = item && entries[item.path]
    if (!original) { missingFiles.push(photo.originalFileName); continue }
    const thumbnail = item.thumbnail ? entries[item.thumbnail] : undefined
    files.set(photo.fileId, { original: new Blob([original as BlobPart], { type: photo.mimeType }), thumbnail: thumbnail ? new Blob([thumbnail as BlobPart], { type: 'image/jpeg' }) : undefined })
  }
  return { snapshot, project, files, missingFiles }
}

export { cloneWithNewIds } from './projectClone'

export type ArchiveImportMode = 'new' | 'replace'
export function applyProjectArchive(current: WorkspaceData, contents: ArchiveContents, mode: ArchiveImportMode, newId?: () => string) {
  const exists = current.projects.some(item => item.id === contents.project.id)
  let project = contents.project, fileMap = new Map<string, string>()
  if (mode === 'new' && exists) {
    const clone = cloneWithNewIds(contents.project, newId)
    project = { ...clone.project, name: `${contents.project.name} (importado)` }
    fileMap = clone.idMap
  }
  const projects = mode === 'replace' && exists ? current.projects.map(item => item.id === project.id ? project : item) : [...current.projects, project]
  const files = new Map([...contents.files].map(([fileId, value]) => [fileMap.get(fileId) ?? fileId, value]))
  const data = restoreNavigation({ projects, projectId: project.id, floorId: project.floors[0]?.id ?? '', roomId: project.floors[0]?.rooms[0]?.id ?? '' })
  return { data, project, files, replaced: mode === 'replace' && exists }
}
