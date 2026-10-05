import { readableRotation } from './labelRotation'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode, RefObject } from 'react'
import type { LabelOffsets } from './models'
import type { LabelBox } from './openings'

// Rótulos realocáveis do croqui. A posição automática continua sendo calculada; o usuário guarda
// apenas um deslocamento (dx, dy) por rótulo, em unidades do desenho (viewBox 440×340).
export const SKETCH_BOUNDS = { width: 440, height: 340 }
export interface Offset { dx: number; dy: number; rotation?:number }
const ZERO: Offset = { dx: 0, dy: 0 }
export function sanitizeOffsets(value: unknown): LabelOffsets {
  if (!value || typeof value !== 'object') return {}
  const result: LabelOffsets = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const { dx, dy,rotation } = (item ?? {}) as { dx?: unknown; dy?: unknown; rotation?:unknown }
    if (typeof dx === 'number' && typeof dy === 'number' && Number.isFinite(dx) && Number.isFinite(dy)) result[key] = { dx, dy,...typeof rotation==='number'&&Number.isFinite(rotation)?{rotation}:{} }
  }
  return result
}
// Mantém o rótulo dentro do desenho, considerando a caixa original.
export function clampOffset(offset: Offset, box: LabelBox): Offset {
  const margin = 4
  const dx = Math.max(margin - box.x, Math.min(SKETCH_BOUNDS.width - margin - box.x - box.width, offset.dx))
  const dy = Math.max(margin - box.y, Math.min(SKETCH_BOUNDS.height - margin - box.y - box.height, offset.dy))
  return { ...offset,dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10 }
}
export function setOffset(offsets: LabelOffsets, key: string, offset: Offset | null): LabelOffsets {
  const next = { ...offsets }
  if (!offset || (Math.abs(offset.dx) < 0.5 && Math.abs(offset.dy) < 0.5 && offset.rotation===undefined)) delete next[key]
  else next[key] = offset
  return next
}

interface DragApi {
  offset: (key: string) => Offset
  enabled: boolean; arrange: boolean; active?: string
  start: (key: string, box: LabelBox, event: PointerEvent<SVGGElement>) => void
  keyboard: (key: string, box: LabelBox, event: KeyboardEvent<SVGGElement>) => void
  select: (key: string) => void
  suppressClick: RefObject<boolean>
}
const DragContext = createContext<DragApi | null>(null)
const LabelScaleContext = createContext(1)
export const useSketchLabelScale = () => useContext(LabelScaleContext)
export const useLabelOffset = (key: string) => useContext(DragContext)?.offset(key) ?? ZERO

export function useLabelDrag({ offsets: saved, onChange, enabled, arrange, svgRef }: { offsets?: LabelOffsets; onChange?: (offsets: LabelOffsets) => void; enabled: boolean; arrange: boolean; svgRef: RefObject<SVGSVGElement | null> }) {
  const offsets = useMemo(() => sanitizeOffsets(saved), [saved])
  const [live, setLive] = useState<{ key: string; offset: Offset }>()
  const [active, setActive] = useState<string>()
  const suppressClick = useRef(false)
  const session = useRef<{ key: string; box: LabelBox; pointerId: number; x: number; y: number; base: Offset; ratio: number; moved: boolean; current: Offset }>(undefined)
  const offset = useCallback((key: string) => live?.key === key ? live.offset : offsets[key] ?? ZERO, [live, offsets])
  const commit = useCallback((key: string, next: Offset | null) => { onChange?.(setOffset(offsets, key, next)) }, [offsets, onChange])
  const start = useCallback((key: string, box: LabelBox, event: PointerEvent<SVGGElement>) => {
    if (!enabled || !onChange) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // No toque, só arrasta com "Ajustar rótulos" ligado, para não atrapalhar a rolagem da página.
    if (event.pointerType !== 'mouse' && !arrange) return
    const ctm = svgRef.current?.getScreenCTM()
    const ratio = ctm && ctm.a ? 1 / ctm.a : 1
    event.stopPropagation(); event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* captura indisponível */ }
    const base = offsets[key] ?? ZERO
    session.current = { key, box, pointerId: event.pointerId, x: event.clientX, y: event.clientY, base, ratio, moved: false, current: base }
  }, [enabled, onChange, arrange, svgRef, offsets])
  const move = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const s = session.current
    if (!s || s.pointerId !== event.pointerId) return
    const ddx = event.clientX - s.x, ddy = event.clientY - s.y
    if (!s.moved && Math.hypot(ddx, ddy) < 3) return
    s.moved = true
    s.current = clampOffset({ ...s.base,dx: s.base.dx + ddx * s.ratio, dy: s.base.dy + ddy * s.ratio }, s.box)
    setLive({ key: s.key, offset: s.current })
  }, [])
  const end = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const s = session.current
    if (!s || s.pointerId !== event.pointerId) return
    session.current = undefined
    setActive(s.key)
    if (s.moved) { suppressClick.current = true; commit(s.key, s.current); setTimeout(() => { suppressClick.current = false }, 0) }
    setLive(undefined)
  }, [commit])
  const cancel = useCallback(() => { session.current = undefined; setLive(undefined) }, [])
  const keyboard = useCallback((key: string, box: LabelBox, event: KeyboardEvent<SVGGElement>) => {
    const step = event.shiftKey ? 10 : 2
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const current = offsets[key] ?? ZERO
    if (moves[event.key]) { event.preventDefault(); event.stopPropagation(); setActive(key); commit(key, clampOffset({ ...current,dx: current.dx + moves[event.key][0], dy: current.dy + moves[event.key][1] }, box)) }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); commit(key, null) }
  }, [offsets, commit])
  const api: DragApi = { offset, enabled: enabled && !!onChange, arrange, active, start, keyboard, select: setActive, suppressClick }
  return { api, offsets, active, setActive, svgHandlers: { onPointerMove: move, onPointerUp: end, onPointerCancel: cancel }, rotate:(key:string,rotation:number|undefined)=>commit(key,{...offset(key),rotation}),reset: (key?: string) => onChange?.(key ? setOffset(offsets, key, null) : {}), dragging: !!live }
}

export function DragProvider({ api, children, labelScale = 1 }: { api: DragApi; children: ReactNode; labelScale?: number }) {
  return <LabelScaleContext value={labelScale}><DragContext value={api}>{children}</DragContext></LabelScaleContext>
}

// Envolve um rótulo: aplica o deslocamento e trata arrastar (mouse/toque) e setas do teclado.
export function Movable({ id, box, title, children,angle=0 }: { id: string; box: LabelBox; title?: string; children: ReactNode;angle?:number }) {
  const api = useContext(DragContext)
  const scale = useSketchLabelScale()
  const offset = api?.offset(id) ?? ZERO
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const sizing = scale === 1 ? '' : `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`
  const rotation=readableRotation(offset.rotation??angle),rotationTransform=`rotate(${rotation} ${cx} ${cy})`
  if (!api) return <g transform={`${rotationTransform} ${sizing}`}>{children}</g>
  const moved = offset.dx !== 0 || offset.dy !== 0
  const className = `movable-label${api.enabled ? ' is-movable' : ''}${api.arrange ? ' is-arranging' : ''}${api.active === id ? ' is-active' : ''}${moved ? ' is-moved' : ''}`
  return <g className={className} data-label-key={id} transform={`${moved ? `translate(${offset.dx} ${offset.dy})` : ''} ${rotationTransform} ${sizing}`.trim() || undefined}
    pointerEvents={api.enabled ? 'auto' : 'none'} tabIndex={api.enabled && api.arrange ? 0 : undefined} role={api.enabled && api.arrange ? 'button' : undefined}
    aria-label={api.enabled && api.arrange ? `Rótulo ${title ?? id}: use as setas para mover, Delete para restaurar` : undefined}
    onPointerDown={event => api.start(id, box, event)}
    onClick={event => { if (api.suppressClick.current) { event.stopPropagation(); event.preventDefault() } else if (api.arrange) { event.stopPropagation(); api.select(id) } }}
    onKeyDown={event => api.keyboard(id, box, event)}>
    {api.enabled && <rect className="label-hit" x={box.x - 2} y={box.y - 2} width={box.width + 4} height={box.height + 4} rx="4"/>}
    {children}
  </g>
}
export function useOffsetLookup() {
  const api = useContext(DragContext)
  return (key: string) => api?.offset(key) ?? ZERO
}
