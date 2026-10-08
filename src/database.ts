import { storagePrefix } from './releaseChannel'
// Com o servidor opcional (login), cada usuário tem um armazenamento local próprio no navegador.
// A página servida informa o usuário em <meta name="campo-user">; sem ela, o comportamento é o original.
export function storageScope(): string {
  try { const value = globalThis.document?.querySelector('meta[name="campo-user"]')?.getAttribute('content'); return value && /^[\w-]{1,64}$/.test(value) ? `-u${value}` : '' } catch { return '' }
}
export const scope = storageScope()
export const BASE_DATABASE = `${storagePrefix}campo-levantamentos`
export const DATABASE_NAME = `${BASE_DATABASE}${scope}`
const databases = new Map<string, Promise<IDBDatabase>>()
export function openDatabase(name = DATABASE_NAME): Promise<IDBDatabase> {
  let database = databases.get(name)
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 2)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace'); if (!request.result.objectStoreNames.contains('photoFiles')) request.result.createObjectStore('photoFiles') }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento local.'))
    request.onblocked = () => reject(new Error('Feche outras abas antigas da aplicação e tente novamente.'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); databases.delete(name) }
      resolve(db)
    }
  }).catch(error => { databases.delete(name); throw error })
  databases.set(name, database)
  return database
}
