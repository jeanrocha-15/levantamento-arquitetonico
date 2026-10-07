import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Sketch from '../../src/Sketch'
import { UnitContext } from '../../src/Measurement'
import { buildRoomGeometry } from '../../src/roomGeometry'
import { clampOffset, sanitizeOffsets, setOffset } from '../../src/sketchDrag'
import { doorDescription, doorDrawing } from '../../src/openings'
import { createSnapshot, decodeSnapshot, encodeSnapshot, readSnapshot } from '../../src/storage'
import { projectRows } from '../../src/exporting'
import type { Opening, Project } from '../../src/models'
import { opening, roomFrom } from '../etapa11/helpers'

const svg = (room: ReturnType<typeof roomFrom>, onChange?: () => void) => renderToStaticMarkup(<UnitContext value="m"><Sketch room={room} survey={buildRoomGeometry(room)} onLabelOffsetsChange={onChange}/></UnitContext>)
function sala() {
  const room = roomFrom('Sala', [5.2, 3.85, 5.2, 3.85])
  room.openings = [opening(room, { label: 'J01', type: 'window', widthM: 2, heightM: 1.2, sillHeightM: 1, offsetM: 1.2 }, 2), opening(room, { label: 'P01', type: 'door', widthM: .9, heightM: 2.1, offsetM: .3, doorKind: 'hinged', swing: 'inward', hinge: 'left' }, 3)]
  return room
}

describe('Croqui — rótulos realocáveis', () => {
  it('reduz letras e medidas, preserva deslocamentos e salva a preferência sem alterar medidas', () => {
    const room = sala(), original = structuredClone(room)
    const normal = svg(room)
    const smaller = {...room, sketchLabelScale: 0.5, labelOffsets:{[`wall:${room.walls[0].id}`]:{dx:12,dy:6}}}
    const html = svg(smaller,()=>{})
    expect(normal).not.toContain('scale(0.5)')
    expect(html).toContain('scale(0.5)')
    expect(html).toContain('translate(12 6)')
    expect(room).toEqual(original)
    const project: Project = {id:'p',name:'Casa',floors:[{id:room.floorId,name:'Térreo',rooms:[smaller]}],relationships:[]}
    const restored=decodeSnapshot(encodeSnapshot(createSnapshot({projects:[project],projectId:'p',floorId:room.floorId,roomId:room.id})))
    expect(restored.data.projects[0].floors[0].rooms[0].sketchLabelScale).toBe(0.5)
    expect(restored.data.projects[0].floors[0].rooms[0].walls).toEqual(room.walls)
  })
  it('aplica o deslocamento salvo ao rótulo e à linha de chamada', () => {
    const room = sala(), j01 = room.openings[0]
    const before = svg(room)
    room.labelOffsets = { [`opening:${j01.id}`]: { dx: 30, dy: -20 } }
    const after = svg(room, () => {})
    expect(after).toMatch(new RegExp(`data-label-key="opening:${j01.id}" transform="translate\\(30 -20\\) rotate\\([^"()]+\\)"`))
    expect(after).not.toEqual(before)
    // Sem deslocamento, nenhum translate é aplicado.
    expect(before).not.toContain('translate(30 -20)')
  })
  it('rótulos são arrastáveis só na tela de edição (não no relatório)', () => {
    const room = sala()
    expect(svg(room, () => {})).toContain('class="movable-label is-movable"')
    const report = renderToStaticMarkup(<UnitContext value="m"><Sketch room={room} survey={buildRoomGeometry(room)} variant="report"/></UnitContext>)
    expect(report).not.toContain('is-movable')
    expect(report).not.toContain('Ajustar rótulos')
  })
  it('valida, limita ao desenho e remove deslocamentos nulos', () => {
    expect(sanitizeOffsets({ a: { dx: 1, dy: 2 }, b: { dx: NaN, dy: 0 }, c: 'x', d: { dx: 1 } })).toEqual({ a: { dx: 1, dy: 2 } })
    expect(sanitizeOffsets(null)).toEqual({})
    expect(clampOffset({ dx: 1000, dy: -1000 }, { x: 100, y: 100, width: 40, height: 20 })).toEqual({ dx: 296, dy: -96 })
    expect(setOffset({ a: { dx: 3, dy: 3 } }, 'a', { dx: 0.1, dy: 0 })).toEqual({})
    expect(setOffset({}, 'a', { dx: 5, dy: 0 })).toEqual({ a: { dx: 5, dy: 0 } })
    expect(setOffset({ a: { dx: 5, dy: 0 }, b: { dx: 1, dy: 1 } }, 'a', null)).toEqual({ b: { dx: 1, dy: 1 } })
  })
  it('pé-direito aparece como "2,80 m" e as medidas originais não mudam', () => {
    const room = sala(); room.labelOffsets = { ceiling: { dx: -10, dy: 5 } }
    const snapshot = JSON.stringify({ walls: room.walls, openings: room.openings, ceiling: room.ceilingHeightM })
    const markup = svg(room, () => {})
    expect(markup).toContain('Pé-direito 2,80 m')
    expect(markup).not.toContain('>2.8<')
    expect(JSON.stringify({ walls: room.walls, openings: room.openings, ceiling: room.ceilingHeightM })).toBe(snapshot)
  })
  it('posições e funcionamento das portas persistem no armazenamento local e na sincronização', () => {
    const room = sala(); room.labelOffsets = { [`wall:${room.walls[2].id}`]: { dx: 0, dy: 24 } }
    room.openings.push(opening(room, { label: 'P02', type: 'door', doorKind: 'sliding', slideDirection: 'right', swing: 'outward' }, 1))
    const project: Project = { id: 'p', name: 'P', floors: [{ id: 'F1', name: 'Térreo', rooms: [room] }], relationships: [] }
    const snap = createSnapshot({ projects: [project], projectId: 'p', floorId: 'F1', roomId: room.id })
    const back = decodeSnapshot(encodeSnapshot(readSnapshot(snap)))
    const restored = back.data.projects[0].floors[0].rooms[0]
    expect(restored.labelOffsets).toEqual(room.labelOffsets)
    expect(restored.openings.map(o => [o.doorKind, o.swing, o.hinge, o.slideDirection])).toEqual(room.openings.map(o => [o.doorKind, o.swing, o.hinge, o.slideDirection]))
  })
})

describe('Portas — giro e porta de correr', () => {
  const door = (data: Partial<Opening>): Opening => ({ id: 'd', label: 'P01', wallId: 'w', type: 'door', referenceCornerId: 'c', offsetM: 0, widthM: .8, heightM: 2.1, sillHeightM: null, ...data })
  // Parede horizontal da esquerda para a direita: o interior do ambiente fica em +y.
  const start = { x: 100, y: 50 }, end = { x: 140, y: 50 }, dir = { x: 1, y: 0 }
  it('arco proporcional à largura, no lado certo e com a dobradiça escolhida', () => {
    const inLeft = doorDrawing(door({ swing: 'inward', hinge: 'left' }), start, end, dir)!
    expect(inLeft.leaf[0]).toEqual(start)
    expect(inLeft.leaf[1].x).toBeCloseTo(100); expect(inLeft.leaf[1].y).toBeCloseTo(90)
    expect(inLeft.arc).toMatch(/^M140 50A40 40 0 0 1 /)
    const outRight = doorDrawing(door({ swing: 'outward', hinge: 'right' }), start, end, dir)!
    expect(outRight.leaf[0]).toEqual(end)
    expect(outRight.leaf[1].x).toBeCloseTo(140); expect(outRight.leaf[1].y).toBeCloseTo(10)
    expect(outRight.arc).toMatch(/^M100 50A40 40 0 0 1 /)
    expect(inLeft.specified).toBe(true)
    expect(doorDrawing(door({}), start, end, dir)!.specified).toBe(false)
    expect(doorDrawing(door({ type: 'window' }), start, end, dir)).toBeNull()
  })
  it('porta de correr: sem arco, folha paralela e trilho para o lado de deslize', () => {
    const left = doorDrawing(door({ doorKind: 'sliding', slideDirection: 'left' }), start, end, dir)!
    expect(left.kind).toBe('sliding'); expect(left.arc).toBeUndefined()
    expect(left.leaf[0].y).toBeCloseTo(53.5); expect(left.leaf[1].y).toBeCloseTo(53.5)
    expect(left.track![0].x).toBeCloseTo(100); expect(left.track![1].x).toBeCloseTo(60)
    const right = doorDrawing(door({ doorKind: 'sliding', slideDirection: 'right', swing: 'outward' }), start, end, dir)!
    expect(right.track![0].x).toBeCloseTo(140); expect(right.track![1].x).toBeCloseTo(180); expect(right.leaf[0].y).toBeCloseTo(46.5)
  })
  it('descrição no relatório/CSV e croqui desenhado', () => {
    expect(doorDescription(door({ swing: 'inward', hinge: 'left' }))).toBe('Porta de abrir, abre para dentro do ambiente, dobradiça à esquerda')
    expect(doorDescription(door({ doorKind: 'sliding', slideDirection: 'right' }))).toBe('Porta de correr, corre para a direita')
    expect(doorDescription(door({}))).toBe('Porta de abrir, sentido não informado, dobradiça não informada')
    const room = sala()
    const markup = svg(room)
    expect(markup).toContain('class="door-arc"')
    const project: Project = { id: 'p', name: 'P', floors: [{ id: 'F1', name: 'Térreo', rooms: [room] }], relationships: [] }
    const row = projectRows(project).find(r => r[4] === 'P01')!
    expect(row.at(-1)).toContain('Porta de abrir, abre para dentro do ambiente, dobradiça à esquerda')
  })
})
