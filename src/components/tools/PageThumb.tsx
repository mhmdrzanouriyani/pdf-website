import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from '../../lib/pdf/pdfjs'

// Render at most a few thumbnails at a time so large documents stay responsive.
let active = 0
const waiting: (() => void)[] = []
async function slot<T>(job: () => Promise<T>) {
  if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve))
  active += 1
  try {
    return await job()
  } finally {
    active -= 1
    waiting.shift()?.()
  }
}

type PageThumbProps = {
  doc: PDFDocumentProxy
  pageNumber: number
  /** Extra rotation applied on top of the page's own rotation. */
  rotation?: number
  width?: number
  className?: string
}

/** Lazily rendered page preview (only when scrolled into view). */
export function PageThumb({ doc, pageNumber, rotation = 0, width = 132, className = '' }: PageThumbProps) {
  const holder = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [aspect, setAspect] = useState(1.3)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const node = holder.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    slot(async () => {
      if (cancelled) return
      const page = await doc.getPage(pageNumber)
      const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 })
      const scale = (width * Math.min(2, window.devicePixelRatio || 1)) / base.width
      const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 })
      setAspect(viewport.height / viewport.width)
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) return
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const render = page.render({ canvas, canvasContext: context, viewport })
      task = render
      await render.promise
    }).catch((error) => {
      if (!cancelled && (error as Error)?.name !== 'RenderingCancelledException') setFailed(true)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, doc, pageNumber, rotation, width])

  return (
    <div ref={holder} className={`page-thumb ${className}`} style={{ width, aspectRatio: `1 / ${aspect}` }}>
      {failed ? <span className="page-thumb-fail">Preview unavailable</span> : <canvas ref={canvasRef} aria-hidden="true" />}
    </div>
  )
}
