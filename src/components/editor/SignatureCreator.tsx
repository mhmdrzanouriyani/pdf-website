import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Segmented } from '../tools/controls'
import { renderTextImage } from '../../lib/textImage'
import { readBytes, validateFile } from '../../lib/files'
import type { PendingImage } from './PageEditor'

/** Crops a canvas to its non-transparent pixels and returns a PNG. */
async function trimToPng(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const pad = 8
  const out = document.createElement('canvas')
  out.width = maxX - minX + pad * 2
  out.height = maxY - minY + pad * 2
  out.getContext('2d')!.drawImage(canvas, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height)
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
  if (!blob) return null
  return { bytes: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), aspect: out.width / out.height }
}

const SCRIPT_FONTS = ['"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive', '"Lucida Handwriting", "Apple Chancery", cursive', 'Georgia, "Times New Roman", serif']

export function SignatureCreator({ onCreate }: { onCreate: (signature: PendingImage) => void }) {
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw')
  const [name, setName] = useState('')
  const [font, setFont] = useState(0)
  const [color, setColor] = useState('#1d2a6b')
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    setHasInk(false)
  }, [mode])

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  async function applyDrawn() {
    const result = canvasRef.current ? await trimToPng(canvasRef.current) : null
    if (!result) return setError('Draw your signature first.')
    onCreate({ ...result, kind: 'png', width: 160 })
  }

  async function applyTyped() {
    if (!name.trim()) return setError('Type your name first.')
    const rendered = await renderTextImage(name.trim(), { fontSize: 36, color, bold: false, font: SCRIPT_FONTS[font] })
    const url = URL.createObjectURL(new Blob([new Uint8Array(rendered.bytes)], { type: 'image/png' }))
    onCreate({ bytes: rendered.bytes, kind: 'png', url, aspect: rendered.widthPt / rendered.heightPt, width: 160 })
  }

  async function applyUpload(file: File | undefined) {
    if (!file) return
    try {
      const kind = (await validateFile(file, ['png', 'jpg'], 5 * 1024 * 1024)) as 'png' | 'jpg'
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.src = url
      await img.decode()
      onCreate({ bytes: await readBytes(file), kind, url, aspect: img.naturalWidth / img.naturalHeight, width: 160 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be used.')
    }
  }

  return (
    <div className="signature-creator">
      <Segmented label="Create your signature" value={mode} onChange={(m) => { setMode(m); setError(null) }} options={[{ value: 'draw', label: 'Draw' }, { value: 'type', label: 'Type' }, { value: 'upload', label: 'Upload image' }]} />
      <label className="sig-color">
        Ink color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      {mode === 'draw' && (
        <>
          <canvas
            ref={canvasRef}
            className="sig-pad"
            aria-label="Signature drawing area. Draw with mouse, finger or pen."
            onPointerDown={(event) => {
              drawing.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
              const ctx = event.currentTarget.getContext('2d')!
              const p = point(event)
              ctx.strokeStyle = color
              ctx.lineWidth = 2.6
              ctx.beginPath()
              ctx.moveTo(p.x, p.y)
            }}
            onPointerMove={(event) => {
              if (!drawing.current) return
              const ctx = event.currentTarget.getContext('2d')!
              const p = point(event)
              ctx.lineTo(p.x, p.y)
              ctx.stroke()
              setHasInk(true)
            }}
            onPointerUp={() => (drawing.current = false)}
          />
          <div className="tool-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { const c = canvasRef.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setHasInk(false) }}>
              Clear
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!hasInk} onClick={applyDrawn}>
              Use this signature
            </button>
          </div>
        </>
      )}
      {mode === 'type' && (
        <>
          <input className="sig-name" value={name} maxLength={60} placeholder="Your name" aria-label="Your name" onChange={(e) => setName(e.target.value)} />
          <div className="sig-fonts" role="radiogroup" aria-label="Signature style">
            {SCRIPT_FONTS.map((f, i) => (
              <button key={f} type="button" role="radio" aria-checked={font === i} className={font === i ? 'is-on' : ''} style={{ fontFamily: f, color }} onClick={() => setFont(i)}>
                {name || 'Your Name'}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={applyTyped}>
            Use this signature
          </button>
        </>
      )}
      {mode === 'upload' && <input type="file" accept="image/png,image/jpeg" aria-label="Signature image" onChange={(e) => void applyUpload(e.target.files?.[0])} />}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}
