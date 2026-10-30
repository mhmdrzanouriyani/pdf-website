import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { PDFDocumentProxy } from '../../lib/pdf/pdfjs'
import type { EditorElement, ElementKind } from '../../lib/pdf/annotate'

export type EditorTool = 'select' | Exclude<ElementKind, 'image'> | 'image'

export type EditorStyle = { color: string; strokeWidth: number; fontSize: number; fill: string | null; opacity: number }

export type PendingImage = { bytes: Uint8Array; kind: 'png' | 'jpg'; url: string; aspect: number; width?: number }

type PageEditorProps = {
  doc: PDFDocumentProxy
  page: number
  elements: EditorElement[]
  /** commit=false while dragging (no undo entry), true when an action finishes. */
  onChange: (elements: EditorElement[], commit: boolean) => void
  tool: EditorTool
  style: EditorStyle
  selectedId: string | null
  onSelect: (id: string | null) => void
  pendingImage?: PendingImage | null
  onPlaced?: () => void
}

let seq = 0
export const newElementId = () => `e${Date.now().toString(36)}${(++seq).toString(36)}`

const FONT = 'Helvetica, Arial, sans-serif'

export function measureText(text: string, fontSize: number) {
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.font = `${fontSize}px ${FONT}`
  const lines = (text || ' ').split('\n')
  const w = Math.max(...lines.map((line) => ctx.measureText(line).width), fontSize * 0.6) + 2
  return { w, h: lines.length * fontSize * 1.2 }
}

/** One PDF page with an editable overlay layer of new elements. */
export function PageEditor({ doc, page, elements, onChange, tool, style, selectedId, onSelect, pendingImage, onPlaced }: PageEditorProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(1)
  const [pageSize, setPageSize] = useState({ w: 612, h: 792 })
  const [containerWidth, setContainerWidth] = useState(800)
  const [editingId, setEditingId] = useState<string | null>(null)
  const action = useRef<
    | { type: 'create'; id: string; startX: number; startY: number }
    | { type: 'move'; id: string; startX: number; startY: number; orig: EditorElement }
    | { type: 'resize'; id: string; startX: number; startY: number; orig: EditorElement }
    | null
  >(null)
  const working = useRef<EditorElement[]>(elements)
  useEffect(() => {
    working.current = elements
  }, [elements])

  useLayoutEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Render the page at a scale that fits the container.
  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null
    ;(async () => {
      const p = await doc.getPage(page + 1)
      const base = p.getViewport({ scale: 1 })
      const s = Math.min(1.6, Math.max(0.3, (containerWidth - 2) / base.width))
      const dpr = window.devicePixelRatio || 1
      const viewport = p.getViewport({ scale: s * dpr })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      setScale(s)
      setPageSize({ w: base.width, h: base.height })
      const ctx = canvas.getContext('2d')!
      const render = p.render({ canvas, canvasContext: ctx, viewport })
      task = render
      await render.promise.catch(() => undefined)
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, page, containerWidth])

  const toPt = useCallback(
    (event: ReactPointerEvent) => {
      const rect = wrapRef.current!.querySelector('.editor-page')!.getBoundingClientRect()
      return {
        x: Math.min(pageSize.w, Math.max(0, (event.clientX - rect.left) / scale)),
        y: Math.min(pageSize.h, Math.max(0, (event.clientY - rect.top) / scale)),
      }
    },
    [scale, pageSize],
  )

  function update(id: string, patch: Partial<EditorElement>, commit: boolean) {
    const next = working.current.map((el) => (el.id === id ? { ...el, ...patch } : el))
    working.current = next
    onChange(next, commit)
  }

  function onPagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || editingId) return
    const { x, y } = toPt(event)
    if (tool === 'select') {
      onSelect(null)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const id = newElementId()
    const base: EditorElement = {
      id,
      page,
      kind: tool,
      x,
      y,
      w: 0,
      h: 0,
      color: tool === 'highlight' ? '#facc15' : style.color,
      strokeWidth: style.strokeWidth,
      fill: tool === 'rect' || tool === 'ellipse' ? style.fill : null,
      opacity: tool === 'highlight' ? 0.4 : style.opacity,
    }
    if (tool === 'text') {
      const size = measureText('Text', style.fontSize)
      const el = { ...base, text: 'Text', fontSize: style.fontSize, w: size.w, h: size.h, y: Math.max(0, y - size.h / 2) }
      const next = [...working.current, el]
      working.current = next
      onChange(next, true)
      onSelect(id)
      setEditingId(id)
      return
    }
    if (tool === 'image') {
      if (!pendingImage) return
      const w = Math.min(pageSize.w * 0.8, pendingImage.width ?? 180)
      const h = w / pendingImage.aspect
      const el = { ...base, x: Math.max(0, x - w / 2), y: Math.max(0, y - h / 2), w, h, opacity: 1, image: { bytes: pendingImage.bytes, kind: pendingImage.kind, url: pendingImage.url } }
      const next = [...working.current, el]
      working.current = next
      onChange(next, true)
      onSelect(id)
      onPlaced?.()
      return
    }
    const el = tool === 'draw' || tool === 'line' ? { ...base, points: [[0, 0], [0, 0]] as [number, number][] } : base
    working.current = [...working.current, el]
    onChange(working.current, false)
    action.current = { type: 'create', id, startX: x, startY: y }
  }

  function onPointerMove(event: ReactPointerEvent) {
    const a = action.current
    if (!a) return
    const { x, y } = toPt(event)
    const el = working.current.find((item) => item.id === a.id)
    if (!el) return
    if (a.type === 'create') {
      if (el.kind === 'draw') {
        const pts = el.points ?? []
        const absolute = pts.map(([px, py]) => [px + el.x, py + el.y] as [number, number])
        absolute.push([x, y])
        const minX = Math.min(...absolute.map((p) => p[0]))
        const minY = Math.min(...absolute.map((p) => p[1]))
        const maxX = Math.max(...absolute.map((p) => p[0]))
        const maxY = Math.max(...absolute.map((p) => p[1]))
        update(a.id, { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY), points: absolute.map(([px, py]) => [px - minX, py - minY]) }, false)
      } else if (el.kind === 'line') {
        const minX = Math.min(a.startX, x)
        const minY = Math.min(a.startY, y)
        update(a.id, { x: minX, y: minY, w: Math.max(1, Math.abs(x - a.startX)), h: Math.max(1, Math.abs(y - a.startY)), points: [[a.startX - minX, a.startY - minY], [x - minX, y - minY]] }, false)
      } else {
        update(a.id, { x: Math.min(a.startX, x), y: Math.min(a.startY, y), w: Math.abs(x - a.startX), h: Math.abs(y - a.startY) }, false)
      }
    } else if (a.type === 'move') {
      const dx = x - a.startX
      const dy = y - a.startY
      update(a.id, { x: Math.min(pageSize.w - 4, Math.max(-a.orig.w + 4, a.orig.x + dx)), y: Math.min(pageSize.h - 4, Math.max(-a.orig.h + 4, a.orig.y + dy)) }, false)
    } else if (a.type === 'resize') {
      const w = Math.max(6, a.orig.w + (x - a.startX))
      const h = el.kind === 'image' ? w * (a.orig.h / a.orig.w) : Math.max(6, a.orig.h + (y - a.startY))
      const patch: Partial<EditorElement> = { w, h }
      if (el.points && (el.kind === 'draw' || el.kind === 'line')) {
        const sx = w / a.orig.w
        const sy = h / a.orig.h
        patch.points = (a.orig.points ?? []).map(([px, py]) => [px * sx, py * sy])
      }
      if (el.kind === 'text') patch.fontSize = Math.max(4, Math.round(((a.orig.fontSize ?? 14) * h) / a.orig.h))
      update(a.id, patch, false)
    }
  }

  function onPointerUp() {
    const a = action.current
    action.current = null
    if (!a) return
    const el = working.current.find((item) => item.id === a.id)
    if (a.type === 'create' && el) {
      // A click without dragging creates a sensibly sized default shape.
      if (el.kind !== 'draw' && el.kind !== 'line' && el.w < 4 && el.h < 4) {
        update(a.id, el.kind === 'highlight' ? { w: 120, h: 16 } : { w: 100, h: 60 }, true)
      } else if ((el.kind === 'draw' || el.kind === 'line') && (el.points?.length ?? 0) < 2) {
        const next = working.current.filter((item) => item.id !== a.id)
        working.current = next
        onChange(next, true)
        return
      } else {
        onChange(working.current, true)
      }
      onSelect(a.id)
      return
    }
    onChange(working.current, true)
  }

  function startMove(event: ReactPointerEvent, el: EditorElement) {
    if (tool !== 'select' || editingId === el.id) return
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    onSelect(el.id)
    const { x, y } = toPt(event)
    action.current = { type: 'move', id: el.id, startX: x, startY: y, orig: el }
  }

  function startResize(event: ReactPointerEvent, el: EditorElement) {
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    const { x, y } = toPt(event)
    action.current = { type: 'resize', id: el.id, startX: x, startY: y, orig: el }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, el: EditorElement) {
    if (editingId === el.id) return
    const step = event.shiftKey ? 10 : 1
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[event.key]) {
      event.preventDefault()
      update(el.id, { x: el.x + moves[event.key][0], y: el.y + moves[event.key][1] }, true)
    } else if (event.key === 'Enter' && el.kind === 'text') {
      event.preventDefault()
      setEditingId(el.id)
    }
  }

  const pageElements = elements.filter((el) => el.page === page)
  const cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair'

  return (
    <div ref={wrapRef} className="editor-wrap">
      <div
        className="editor-page"
        style={{ width: pageSize.w * scale, height: pageSize.h * scale, cursor }}
        onPointerDown={onPagePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <canvas ref={canvasRef} style={{ width: pageSize.w * scale, height: pageSize.h * scale }} aria-hidden="true" />
        {pageElements.map((el) => {
          const selected = el.id === selectedId
          const box = { left: el.x * scale, top: el.y * scale, width: el.w * scale, height: el.h * scale }
          const label = el.kind === 'text' ? `Text: ${el.text}` : el.kind === 'image' ? 'Image' : el.kind
          return (
            <div
              key={el.id}
              className={`editor-el is-${el.kind} ${selected ? 'is-selected' : ''}`}
              style={{ ...box, opacity: el.opacity, pointerEvents: tool === 'select' ? 'auto' : 'none' }}
              role="button"
              tabIndex={tool === 'select' ? 0 : -1}
              aria-label={`${label}. Arrow keys move it${el.kind === 'text' ? ', Enter edits it' : ''}.`}
              aria-pressed={selected}
              onPointerDown={(event) => startMove(event, el)}
              onFocus={() => onSelect(el.id)}
              onKeyDown={(event) => onKeyDown(event, el)}
              onDoubleClick={() => el.kind === 'text' && setEditingId(el.id)}
            >
              {el.kind === 'rect' && <span className="editor-shape" style={{ border: `${el.strokeWidth * scale}px solid ${el.color}`, background: el.fill ?? 'transparent' }} />}
              {el.kind === 'ellipse' && <span className="editor-shape" style={{ borderRadius: '50%', border: `${el.strokeWidth * scale}px solid ${el.color}`, background: el.fill ?? 'transparent' }} />}
              {el.kind === 'highlight' && <span className="editor-shape" style={{ background: el.color, mixBlendMode: 'multiply' }} />}
              {(el.kind === 'draw' || el.kind === 'line') && (
                <svg width={Math.max(1, box.width)} height={Math.max(1, box.height)} style={{ overflow: 'visible' }} aria-hidden="true">
                  <polyline
                    points={(el.points ?? []).map(([px, py]) => `${px * scale},${py * scale}`).join(' ')}
                    fill="none"
                    stroke={el.color}
                    strokeWidth={el.strokeWidth * scale}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {el.kind === 'image' && el.image && <img src={el.image.url} alt="" draggable={false} />}
              {el.kind === 'text' &&
                (editingId === el.id ? (
                  <textarea
                    className="editor-text-input"
                    autoFocus
                    dir="auto"
                    value={el.text}
                    aria-label="Edit text"
                    style={{ fontSize: (el.fontSize ?? 14) * scale, color: el.color, fontFamily: FONT }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const size = measureText(event.target.value, el.fontSize ?? 14)
                      update(el.id, { text: event.target.value, w: size.w, h: size.h }, false)
                    }}
                    onBlur={() => {
                      setEditingId(null)
                      if (!(working.current.find((item) => item.id === el.id)?.text ?? '').trim()) {
                        const next = working.current.filter((item) => item.id !== el.id)
                        working.current = next
                        onChange(next, true)
                      } else onChange(working.current, true)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') (event.target as HTMLTextAreaElement).blur()
                    }}
                  />
                ) : (
                  <span className="editor-text" dir="auto" style={{ fontSize: (el.fontSize ?? 14) * scale, color: el.color, fontFamily: FONT }}>
                    {el.text}
                  </span>
                ))}
              {selected && tool === 'select' && editingId !== el.id && (
                <span className="editor-handle" onPointerDown={(event) => startResize(event, el)} aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
