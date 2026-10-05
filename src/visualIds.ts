// Reuse the smallest free visual number. Structural UUIDs are never reused.
export function firstFreeNumber(values:Iterable<number>):number {
  const used=new Set(values);let next=1;while(used.has(next))next++;return next
}
export function nextVisualSequence(labels:Iterable<string>,prefix:string):number {
  const pattern=new RegExp(`^${prefix}[- ]?(\\d+)$`)
  return firstFreeNumber([...labels].map(label=>Number(pattern.exec(label)?.[1]??0)))
}
