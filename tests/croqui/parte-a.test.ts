import { describe, expect, it } from 'vitest'
import { UndoHistory } from '../../src/undo'
import { clampView, FULL_VIEW, panBy, zoomAt, zoomOf } from '../../src/sketchZoom'
import { dimensionLine, insideNormal } from '../../src/dimensions'
import { doorOperationKnown } from '../../src/checklist'

describe('Desfazer', () => {
  it('agrupa alterações rápidas e volta ao estado anterior intacto', () => {
    const h = new UndoHistory<{ v: number }>(10, 1000)
    const a = { v: 1 }, b = { v: 2 }, c = { v: 3 }
    h.record(a, 0); h.record(b, 300); h.record(c, 5000)
    expect(h.size).toBe(2)
    expect(h.undo()).toBe(c); expect(h.undo()).toBe(a); expect(h.undo()).toBeUndefined()
  })
  it('respeita o limite', () => { const h = new UndoHistory<number>(3, 0); for (let i = 0; i < 10; i++) h.record(i, i * 10); expect(h.size).toBe(3); expect(h.undo()).toBe(9) })
})
describe('Zoom do croqui', () => {
  it('aproxima mantendo o centro e limita a área', () => {
    const v = zoomAt(FULL_VIEW, 2)
    expect(zoomOf(v)).toBeCloseTo(2); expect(v.x + v.w / 2).toBeCloseTo(220); expect(v.y + v.h / 2).toBeCloseTo(170)
    expect(zoomOf(zoomAt(FULL_VIEW, 100))).toBeCloseTo(3)
    expect(clampView({ x: -50, y: 900, w: 2000, h: 1 })).toEqual({ x: -50, y: 900, w: 1760, h: 1360 })
    const p = panBy(v, 1000, 0); expect(p.x).toBe(v.x - 1000)
  })
})
describe('Limites do zoom', () => {
  it('não desloca o desenho ao continuar aumentando ou diminuindo no limite', () => {
    for (const factor of [100, .001]) {
      const limit = zoomAt(FULL_VIEW, factor, .2, .8)
      expect(zoomAt(limit, factor, .2, .8)).toEqual(limit)
      expect(limit.x + limit.w * .2).toBeCloseTo(FULL_VIEW.w * .2)
      expect(limit.y + limit.h * .8).toBeCloseTo(FULL_VIEW.h * .8)
    }
  })
})

describe('Cotas', () => {
  it('linha paralela deslocada para dentro, com texto legível', () => {
    const n = insideNormal({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 60 })
    expect(n).toEqual({ x: -0, y: 1 })
    const line = dimensionLine({ x: 0, y: 0 }, { x: 100, y: 0 }, n, 10)!
    expect(line.from).toEqual({ x: 0, y: 10 }); expect(line.to).toEqual({ x: 100, y: 10 }); expect(line.angle).toBe(0)
    expect(dimensionLine({ x: 100, y: 0 }, { x: 0, y: 0 }, n)!.angle).toBe(0)
    expect(dimensionLine({ x: 1, y: 1 }, { x: 1, y: 1 }, n)).toBeNull()
  })
})
describe('Sentido de abertura', () => {
  it('detecta porta sem informação', () => {
    expect(doorOperationKnown({})).toBe(false)
    expect(doorOperationKnown({ doorKind: 'hinged', swing: 'inward' })).toBe(false)
    expect(doorOperationKnown({ doorKind: 'hinged', swing: 'inward', hinge: 'left' })).toBe(true)
    expect(doorOperationKnown({ doorKind: 'sliding', slideDirection: 'right' })).toBe(true)
  })
})
