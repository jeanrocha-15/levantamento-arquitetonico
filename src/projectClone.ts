import type { Project } from './models'
import { generateId } from './domain'

// "Importar como novo": todos os IDs internos ganham novos valores, de forma consistente
// (inclusive referências compostas como cantos "parede/parede" e vínculos de fotos e relações).
// displayId (AMB-001, MOV-001...), nomes e medidas ficam iguais.
// keepFileIds: mantém os IDs dos arquivos de foto (cópia no mesmo aparelho, que compartilha os mesmos arquivos).
export function cloneWithNewIds(project: Project, newId: () => string = generateId, { keepFileIds = false }: { keepFileIds?: boolean } = {}): { project: Project; idMap: Map<string, string> } {
  const idMap = new Map<string, string>()
  const collect = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if ((key === 'id' || (key === 'fileId' && !keepFileIds)) && typeof item === 'string' && !item.includes('/') && !idMap.has(item)) idMap.set(item, newId())
      collect(item)
    }
  }
  collect(project)
  // Troca só os trechos que são exatamente IDs conhecidos (também dentro de "a/b" e "tipo:id").
  const remap = (text: string) => text.replace(/[^:/|]+/g, part => idMap.get(part) ?? part)
  const freeText = new Set([...(keepFileIds ? ['fileId'] : []), 'displayId', 'name', 'label', 'description', 'note', 'notes', 'value', 'technicalItemKey', 'originalFileName', 'tags', 'customWallType','customProfile','customMaterial','highSide','lowSide', 'mimeType', 'createdAt'])
  const walk = (value: unknown, key?: string): unknown => {
    if (key && freeText.has(key)) return value
    if (typeof value === 'string') return remap(value)
    if (Array.isArray(value)) return value.map(item => walk(item))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) =>
      (name === 'labelOffsets'||name==='planLabelOffsets'||name==='planPreferences'||name==='sheetLayouts'||name==='labelOverrides') && item && typeof item === 'object' ? [name, Object.fromEntries(Object.entries(item).map(([offsetKey, offset]) => [remap(offsetKey), walk(offset)]))] : [name, walk(item, name)]))
    return value
  }
  return { project: walk(project) as Project, idMap }
}

