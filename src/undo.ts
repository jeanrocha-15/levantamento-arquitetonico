// Histórico para "Desfazer": guarda estados anteriores completos (imutáveis), em memória.
// Alterações em sequência rápida (digitação, arraste) viram um único passo.
export class UndoHistory<T> {
  private past: T[] = []
  private future: T[] = []
  private lastAt = -Infinity
  constructor(private readonly limit = 60, private readonly groupMs = 1200) {}
  record(previous: T, now = Date.now()) {
    this.future = []
    if (now - this.lastAt > this.groupMs || !this.past.length) {
      if (this.past.at(-1) !== previous) this.past.push(previous)
      if (this.past.length > this.limit) this.past.shift()
    }
    this.lastAt = now
  }
  undo(current?: T): T | undefined { this.lastAt = -Infinity; const previous=this.past.pop(); if(previous!==undefined && current!==undefined) this.future.push(current); return previous }
  redo(current: T): T | undefined { const next=this.future.pop(); if(next!==undefined){this.past.push(current);this.lastAt=-Infinity} return next }
  clear() { this.past = []; this.future=[]; this.lastAt = -Infinity }
  get size() { return this.past.length }
  get redoSize() { return this.future.length }
}
