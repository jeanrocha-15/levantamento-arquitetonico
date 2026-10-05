import { describe, expect, it } from 'vitest'
import { roomFrom, opening, project as makeProject } from '../etapa11/helpers'
import { drawRoomSheet, roomExtent, roomSheetPdf } from '../../src/pdf/roomSheet'
import { fitMessage, fittingOptions, fits, mmOnPaper, paperSize } from '../../src/pdf/sheetLayout'
import { PT_PER_MM } from '../../src/pdf/pdfWriter'
import type { Project } from '../../src/models'

const sala = () => { const room = roomFrom('Sala', [5, 4, 5, 4]); room.displayId = 'AMB-001'; opening(room, { label: 'J01', type: 'window', widthM: 1.2, heightM: 1, sillHeightM: 1.1 }, 1); room.walls[0].thickness = .15; return room }
const proj = (room = sala()) => ({ room, project: makeProject([room]) as Project })

describe('Etapa 17 — PDF em escala física real', () => {
  it('parede de 5,00 m a 1:50 mede 100 mm no PDF (X e Y uniformes)', () => {
    const { room, project } = proj()
    const { toPaper } = drawRoomSheet({ project, room, option: { sheet: 'A3', orientation: 'portrait', scale: 50 } })
    const a = toPaper({ x: 0, y: 0 }), b = toPaper({ x: 5, y: 0 }), c = toPaper({ x: 0, y: 5 })
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(100, 9)
    expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeCloseTo(100, 9)
    expect(mmOnPaper(5, 50)).toBe(100)
    // No arquivo: existe um traço da parede A com 100 mm = 283,46 pt.
    const pdf = new TextDecoder('latin1').decode(roomSheetPdf({ project, room, option: { sheet: 'A3', orientation: 'portrait', scale: 50 } }).bytes)
    const lines = [...pdf.matchAll(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g)].map(m => Math.hypot(+m[3] - +m[1], +m[4] - +m[2]))
    expect(lines.some(length => Math.abs(length - 100 * PT_PER_MM) < 0.01)).toBe(true)
  })
  it('espessura de parede em escala: 150 mm a 1:50 = 3 mm', () => {
    const { room, project } = proj()
    expect(mmOnPaper(0.15, 50)).toBeCloseTo(3, 12)
    const { page } = drawRoomSheet({ project, room, option: { sheet: 'A3', orientation: 'portrait', scale: 50 } })
    const faces=[...page.ops.join(' ').matchAll(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g)]
    // A espessura é a separação entre faces vazias, não a largura de um traço cheio.
    expect(Math.abs(+faces[0][2]- +faces[1][2])).toBeCloseTo(3*PT_PER_MM,2)
    expect(Math.abs(+faces[0][4]- +faces[1][4])).toBeCloseTo(3*PT_PER_MM,2)
  })
  it('folhas A3/A2 em retrato e paisagem, com as medidas reais', () => {
    expect(paperSize({ sheet: 'A3', orientation: 'portrait' })).toEqual({ width: 297, height: 420 })
    expect(paperSize({ sheet: 'A2', orientation: 'landscape' })).toEqual({ width: 594, height: 420 })
    const pdf = new TextDecoder('latin1').decode(roomSheetPdf({ ...proj(), option: { sheet: 'A2', orientation: 'landscape', scale: 50 } }).bytes)
    expect(pdf).toContain(`/MediaBox [0 0 ${Math.round(594 * PT_PER_MM * 1000) / 1000} ${Math.round(420 * PT_PER_MM * 1000) / 1000}]`)
    expect(pdf.startsWith('%PDF-1.4')).toBe(true); expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
  })
  it('nunca ajusta à página: avisa e sugere combinações que cabem', () => {
    const big = roomFrom('Galpão', [14, 9, 14, 9]); const { project } = proj(big)
    const extent = roomExtent(big)
    expect(fits(extent, { sheet: 'A3', orientation: 'portrait', scale: 20 })).toBe(false)
    expect(fitMessage(extent, { sheet: 'A3', orientation: 'portrait', scale: 20 })).toBe('O ambiente não cabe em A3 na escala 1:20.')
    expect(() => drawRoomSheet({ project, room: big, option: { sheet: 'A3', orientation: 'portrait', scale: 20 } })).toThrow('não cabe')
    const options = fittingOptions(extent)
    expect(options.length).toBeGreaterThan(0)
    expect(options.every(option => fits(extent, option))).toBe(true)
    expect(options[0].scale).toBe(20) // A1/A0 agora permitem mais detalhe; a sugestão nunca muda a escala sozinha.
  })
  it('prancha traz identificação, escala gráfica e avisos de impressão', () => {
    const room = roomFrom('Quarto', [4, 3.2, 4.4456, 3], [82, null, null, null]); room.displayId = 'AMB-002'
    room.corners = room.corners.map((corner, index) => index ? { ...corner, angleSource: 'calculated', angleDegrees: null } : corner)
    const { project } = proj(room)
    const text = new TextDecoder('latin1').decode(roomSheetPdf({ project, room, option: { sheet: 'A3', orientation: 'landscape', scale: 25 }, date: new Date(2026, 9, 3) }).bytes)
    for (const expected of ['AMB-002', 'Quarto', 'Escala 1:25', 'Projeto: Casa teste', 'Pavimento', 'Imprimir em 100% / Tamanho real para preservar a escala.', 'Geometria aproximada baseada no levantamento de campo.', '(0) Tj', '(1,5 m) Tj', '03/10/2026']) expect(text).toContain(expected)
  })
})
