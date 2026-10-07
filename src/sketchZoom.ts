import { useCallback, useRef, useState } from 'react'
import type { RefObject, TouchEvent, PointerEvent, MouseEvent } from 'react'
import { SKETCH_BOUNDS } from './sketchDrag'

// Zoom/pan do croqui só na visualização: altera o viewBox do SVG, nunca as medidas nem a geometria.
export interface View { x: number; y: number; w: number; h: number }
export const FULL_VIEW: View = { x: 0, y: 0, w: SKETCH_BOUNDS.width, h: SKETCH_BOUNDS.height }
export const MAX_ZOOM = 3
export const zoomOf = (view: View) => FULL_VIEW.w / view.w
export function clampView(view: View): View {
  const w = Math.min(FULL_VIEW.w / .25, Math.max(FULL_VIEW.w / MAX_ZOOM, view.w)), h = w * FULL_VIEW.h / FULL_VIEW.w
  return { w, h, x:view.x,y:view.y }
}
// Aproxima/afasta mantendo fixo o ponto (fx, fy) — frações 0..1 da área visível.
export function zoomAt(view: View, factor: number, fx = .5, fy = .5): View {
  const { w, h } = clampView({ ...view, w: view.w / factor })
  return clampView({ w, h, x: view.x + (view.w - w) * fx, y: view.y + (view.h - h) * fy })
}
export const panBy = (view: View, dx: number, dy: number): View => clampView({ ...view, x: view.x - dx, y: view.y - dy })

type Gesture = { kind: 'pinch'; distance: number; view: View; mid: { x: number; y: number } } | { kind: 'pan'; x: number; y: number; view: View }
export function useSketchZoom(svgRef: RefObject<SVGSVGElement | null>, { panEnabled, moveMode = false,enabled=true }: { panEnabled: boolean; moveMode?: boolean;enabled?:boolean }) {
  const [view, setView] = useState<View>(FULL_VIEW)
  const gesture = useRef<Gesture>(undefined)
  const mouse = useRef<{ id: number; x: number; y: number; view: View; scale: number; moved: boolean }>(undefined)
  const suppressClick = useRef(false)
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false
    if (event.pointerType !== 'mouse' || event.button !== 0 || !panEnabled || (!moveMode && Math.abs(zoomOf(view)-1)<.01)) return
    const target = event.target as Element
    if (!svgRef.current?.contains(target) || (!moveMode && target.closest('[role="button"],.movable-label'))) return
    const scale = svgRef.current.getScreenCTM()?.a
    if (!scale) return
    mouse.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view, scale, moved: false }
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMoveCapture = (event: PointerEvent<HTMLDivElement>) => {
    const start = mouse.current
    if (!start || start.id !== event.pointerId) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (Math.hypot(dx,dy) < 3 && !start.moved) return
    start.moved = true; event.preventDefault(); event.stopPropagation()
    setView(panBy(start.view, dx / start.scale, dy / start.scale))
  }
  const onPointerUpCapture = (event: PointerEvent<HTMLDivElement>) => {
    const start = mouse.current
    if (!start || start.id !== event.pointerId) return
    mouse.current = undefined; suppressClick.current = start.moved
    setTimeout(() => { suppressClick.current = false }, 0)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    event.stopPropagation()
  }
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current || moveMode && svgRef.current?.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation() }
    suppressClick.current = false
  }
  const rect = () => svgRef.current?.getBoundingClientRect()
  // Bind to the actual SVG lifecycle, including replacement after loading a project.
  const bindSvg = useCallback((node: SVGSVGElement | null) => {
    svgRef.current = node
    if (!node || !enabled) return
    const wheel = (event: WheelEvent) => {
      const box = node.getBoundingClientRect()
      if (!box.width || !box.height) return
      event.preventDefault()
      event.stopPropagation()
      if (!event.deltaY) return
      setView(current => zoomAt(current, event.deltaY > 0 ? 1 / 1.1 : 1.1,
        (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height))
    }
    node.addEventListener('wheel', wheel, { passive: false, capture: true })
    return () => {
      node.removeEventListener('wheel', wheel, { capture: true })
      if (svgRef.current === node) svgRef.current = null
    }
  }, [svgRef, enabled])
  const onTouchStart = useCallback((event: TouchEvent) => {
    suppressClick.current = false
    const box = rect(); if (!box?.width) return
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]]
      const fx = ((a.clientX + b.clientX) / 2 - box.left) / box.width, fy = ((a.clientY + b.clientY) / 2 - box.top) / box.height
      gesture.current = { kind: 'pinch', distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, view, mid: { x: view.x + fx * view.w, y: view.y + fy * view.h } }
    } else if (event.touches.length === 1 && panEnabled && (moveMode || Math.abs(zoomOf(view)-1)>.01)) gesture.current = { kind: 'pan', x: event.touches[0].clientX, y: event.touches[0].clientY, view }
  }, [view, panEnabled,moveMode])
  const onTouchMove = useCallback((event: TouchEvent) => {
    const g = gesture.current, box = rect(); if (!g || !box?.width) return
    suppressClick.current = true
    if (g.kind === 'pinch' && event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]]
      const scale = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / g.distance
      const { w, h } = clampView({ ...g.view, w: g.view.w / scale })
      const fx = ((a.clientX + b.clientX) / 2 - box.left) / box.width, fy = ((a.clientY + b.clientY) / 2 - box.top) / box.height
      setView(clampView({ w, h, x: g.mid.x - fx * w, y: g.mid.y - fy * h }))
    } else if (g.kind === 'pan' && event.touches.length === 1) {
      const ratio = 1 / (svgRef.current?.getScreenCTM()?.a || box.width / g.view.w)
      setView(panBy(g.view, (event.touches[0].clientX - g.x) * ratio, (event.touches[0].clientY - g.y) * ratio))
    }
  }, [])
  const onTouchEnd = useCallback((event: TouchEvent) => { if (event.touches.length === 0) gesture.current = undefined; else onTouchStart(event) }, [onTouchStart])
  const zoomed = Math.abs(zoomOf(view)-1) > .01
  return {
    bindSvg, view, zoomed, zoom: zoomOf(view), viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, onPointerDownCapture, onPointerMoveCapture, onPointerUpCapture, onPointerCancelCapture: onPointerUpCapture, onClickCapture },
    setPercent:(percent:number)=>{if(Number.isFinite(percent))setView(current=>zoomAt(current,Math.max(25,Math.min(300,percent))/(zoomOf(current)*100)))},zoomIn: () => setView(current => zoomAt(current, 1.5)), zoomOut: () => setView(current => zoomAt(current, 1 / 1.5)), reset: () => setView(FULL_VIEW),
  }
}
