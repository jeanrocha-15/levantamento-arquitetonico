export interface RevitReference {
  format: 'revit-lac-exchange'; schemaVersion: number; units: 'm';
  source: {title: string; documentId: string};
  elements: Array<{elementId: string; name?: string; kind: string; areaM2?: number; boundaryLoops?: unknown[]}>;
  unplacedRooms?: unknown[];
}
export function parseRevitReference(text: string): RevitReference {
  const data = JSON.parse(text)
  if (data?.format !== 'revit-lac-exchange' || data.schemaVersion !== 1 || data.units !== 'm' || typeof data.source?.title !== 'string' || typeof data.source?.documentId !== 'string' || !Array.isArray(data.elements)) throw new Error('Selecione o JSON gerado por “Exportar Revit para LAC” (versão 1).')
  if (data.elements.some((e: RevitReference['elements'][number]) => !e || typeof e.elementId !== 'string' || typeof e.kind !== 'string')) throw new Error('O arquivo contém elementos inválidos.')
  return data
}
export async function referenceStorage(projectId: string, file?: Blob): Promise<Blob | undefined> {
  const db = await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('lac-revit-references',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('files')
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error)
  })
  try { return await new Promise<Blob | undefined>((resolve,reject)=>{
    const tx=db.transaction('files',file?'readwrite':'readonly')
    const request=file?tx.objectStore('files').put(file,projectId):tx.objectStore('files').get(projectId)
    tx.oncomplete=()=>resolve(file ?? request.result)
    tx.onerror=()=>reject(tx.error)
    tx.onabort=()=>reject(tx.error)
  }) } finally { db.close() }
}
