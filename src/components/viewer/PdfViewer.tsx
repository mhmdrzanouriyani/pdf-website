import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  LoaderCircle,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  RotateCw,
  Search,
  X,
} from 'lucide-react'
import 'pdfjs-dist/legacy/web/pdf_viewer.css'
import { closePdf, openWithPdfjs, pdfjs, type PDFDocumentProxy } from '../../lib/pdf/pdfjs'
import { PdfPasswordError } from '../../lib/pdf/core'
import { downloadBlob, toBlob } from '../../lib/files'

type ViewerModule = typeof import('pdfjs-dist/legacy/web/pdf_viewer.mjs')

let viewerModule: Promise<ViewerModule> | null = null
function loadViewerModule() {
  if (!viewerModule) {
    // pdf_viewer.mjs reads the core library from this global.
    ;(globalThis as unknown as { pdfjsLib: typeof pdfjs }).pdfjsLib = pdfjs
    viewerModule = import('pdfjs-dist/legacy/web/pdf_viewer.mjs')
  }
  return viewerModule
}

const ZOOM_PRESETS = [
  { value: 'auto', label: 'Automatic' },
  { value: 'page-width', label: 'Fit to width' },
  { value: 'page-fit', label: 'Fit to page' },
  { value: '0.5', label: '50%' },
  { value: '0.75', label: '75%' },
  { value: '1', label: '100%' },
  { value: '1.25', label: '125%' },
  { value: '1.5', label: '150%' },
  { value: '2', label: '200%' },
  { value: '3', label: '300%' },
  { value: '4', label: '400%' },
]

export type ViewerSelection = { text: string; page: number }

type PdfViewerProps = {
  /** Changing `docKey` fully resets the viewer (prevents stale content when switching documents). */
  docKey: string
  bytes: Uint8Array
  fileName: string
  onDocument?: (doc: PDFDocumentProxy | null) => void
  onSelection?: (selection: ViewerSelection | null) => void
  onLockedChange?: (locked: boolean) => void
  /** Allows the Copilot to jump to a cited page. */
  pageRequest?: { page: number; nonce: number } | null
}

type FindState = { query: string; total: number; current: number; status: 'idle' | 'searching' | 'found' | 'none' }

type Instance = {
  viewer: InstanceType<ViewerModule['PDFViewer']>
  eventBus: InstanceType<ViewerModule['EventBus']>
  linkService: InstanceType<ViewerModule['PDFLinkService']>
  findController: InstanceType<ViewerModule['PDFFindController']>
}

export function PdfViewer({ docKey, bytes, fileName, onDocument, onSelection, onLockedChange, pageRequest }: PdfViewerProps) {
  const shellRef = useRef<HTMLElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerDivRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<Instance | null>(null)
  const findInputRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<'loading' | 'ready' | 'password' | 'error'>('loading')
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [passwordAttempt, setPasswordAttempt] = useState<string | undefined>(undefined)
  const [passwordWrong, setPasswordWrong] = useState(false)
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [scaleValue, setScaleValue] = useState('page-width')
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [find, setFind] = useState<FindState>({ query: '', total: 0, current: 0, status: 'idle' })
  const [fullscreen, setFullscreen] = useState(false)

  // Keep latest callbacks without re-running the load effect.
  const callbacks = useRef({ onDocument, onSelection, onLockedChange })
  useEffect(() => {
    callbacks.current = { onDocument, onSelection, onLockedChange }
  })

  // Reset password state when switching documents.
  useEffect(() => {
    setPasswordAttempt(undefined)
    setPassword('')
    setPasswordWrong(false)
    setFind({ query: '', total: 0, current: 0, status: 'idle' })
    setFindOpen(false)
    setRotation(0)
  }, [docKey])

  // Create the pdf.js viewer once per document and tear it down on change.
  useEffect(() => {
    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    setStatus('loading')
    setError('')

    async function run() {
      const mod = await loadViewerModule()
      if (cancelled || !containerRef.current || !viewerDivRef.current) return
      const eventBus = new mod.EventBus()
      const linkService = new mod.PDFLinkService({
        eventBus,
        externalLinkTarget: mod.LinkTarget.BLANK,
        externalLinkRel: 'noopener noreferrer nofollow',
      })
      const findController = new mod.PDFFindController({ eventBus, linkService })
      const viewer = new mod.PDFViewer({
        container: containerRef.current,
        viewer: viewerDivRef.current,
        eventBus,
        linkService,
        findController,
        textLayerMode: 1,
        annotationMode: pdfjs.AnnotationMode.ENABLE,
        removePageBorders: false,
        maxCanvasPixels: 16_777_216,
      })
      linkService.setViewer(viewer)
      instanceRef.current = { viewer, eventBus, linkService, findController }

      eventBus.on('pagesinit', () => {
        viewer.currentScaleValue = 'page-width'
      })
      eventBus.on('pagechanging', (event: { pageNumber: number }) => {
        setPage(event.pageNumber)
        setPageInput(String(event.pageNumber))
      })
      eventBus.on('scalechanging', (event: { scale: number; presetValue?: string }) => {
        setScale(event.scale)
        setScaleValue(event.presetValue ?? String(event.scale))
      })
      eventBus.on('updatefindmatchescount', (event: { matchesCount: { current: number; total: number } }) => {
        setFind((state) => ({ ...state, total: event.matchesCount.total, current: event.matchesCount.current }))
      })
      eventBus.on(
        'updatefindcontrolstate',
        (event: { state: number; matchesCount: { current: number; total: number } }) => {
          const notFound = event.state === mod.FindState.NOT_FOUND
          const pending = event.state === mod.FindState.PENDING
          setFind((state) => ({
            ...state,
            total: event.matchesCount?.total ?? state.total,
            current: event.matchesCount?.current ?? state.current,
            status: pending ? 'searching' : notFound ? 'none' : 'found',
          }))
        },
      )

      try {
        doc = await openWithPdfjs(bytes, passwordAttempt)
      } catch (err) {
        if (cancelled) return
        if (err instanceof PdfPasswordError) {
          setStatus('password')
          setPasswordWrong(err.incorrect)
          callbacks.current.onLockedChange?.(true)
          return
        }
        setStatus('error')
        setError(err instanceof Error ? err.message : 'This PDF could not be opened.')
        return
      }
      if (cancelled) {
        await closePdf(doc)
        return
      }
      viewer.setDocument(doc)
      linkService.setDocument(doc, null)
      setNumPages(doc.numPages)
      setPage(1)
      setPageInput('1')
      setStatus('ready')
      callbacks.current.onLockedChange?.(false)
      callbacks.current.onDocument?.(doc)
    }

    run().catch((err) => {
      if (cancelled) return
      setStatus('error')
      setError(err instanceof Error ? err.message : 'The viewer failed to start.')
    })

    return () => {
      cancelled = true
      const instance = instanceRef.current
      instanceRef.current = null
      callbacks.current.onDocument?.(null)
      callbacks.current.onSelection?.(null)
      if (instance) {
        instance.viewer.setDocument(null as never)
        instance.linkService.setDocument(null, null)
      }
      if (doc) void closePdf(doc)
    }
  }, [docKey, bytes, passwordAttempt])

  // Jump to a page requested by the Copilot (citations).
  useEffect(() => {
    if (!pageRequest || status !== 'ready') return
    const instance = instanceRef.current
    if (instance && pageRequest.page >= 1 && pageRequest.page <= numPages) {
      instance.viewer.currentPageNumber = pageRequest.page
    }
  }, [pageRequest, status, numPages])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const goTo = useCallback(
    (target: number) => {
      const instance = instanceRef.current
      if (!instance || !numPages) return
      const clamped = Math.min(numPages, Math.max(1, Math.round(target)))
      instance.viewer.currentPageNumber = clamped
      setPageInput(String(clamped))
    },
    [numPages],
  )

  function setZoom(value: string) {
    const instance = instanceRef.current
    if (!instance) return
    instance.viewer.currentScaleValue = value
  }

  function stepZoom(direction: 1 | -1) {
    const instance = instanceRef.current
    if (!instance) return
    const next = Math.min(5, Math.max(0.25, Math.round((scale + direction * 0.1) * 100) / 100))
    instance.viewer.currentScale = next
  }

  function rotate(delta: number) {
    const instance = instanceRef.current
    if (!instance) return
    const next = (((rotation + delta) % 360) + 360) % 360
    instance.viewer.pagesRotation = next
    setRotation(next)
  }

  function runFind(type: '' | 'again', findPrevious = false, query = find.query) {
    const instance = instanceRef.current
    if (!instance) return
    if (!query.trim()) {
      setFind({ query, total: 0, current: 0, status: 'idle' })
      instance.eventBus.dispatch('findbarclose', { source: null })
      return
    }
    instance.eventBus.dispatch('find', {
      source: null,
      type,
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    })
  }

  function closeFind() {
    setFindOpen(false)
    setFind({ query: '', total: 0, current: 0, status: 'idle' })
    instanceRef.current?.eventBus.dispatch('findbarclose', { source: null })
  }

  function openFind() {
    setFindOpen(true)
    window.setTimeout(() => findInputRef.current?.focus(), 0)
  }

  async function toggleFullscreen() {
    const shell = shellRef.current
    if (!shell) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await shell.requestFullscreen()
    } catch {
      // Fullscreen can be blocked by the browser; the button simply does nothing then.
    }
  }

  function print() {
    const url = URL.createObjectURL(toBlob(bytes, 'application/pdf'))
    const frame = document.createElement('iframe')
    frame.className = 'sr-only'
    frame.title = 'Print preview'
    frame.src = url
    frame.onload = () => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch {
        window.open(url, '_blank', 'noopener')
      }
      window.setTimeout(() => {
        frame.remove()
        URL.revokeObjectURL(url)
      }, 60_000)
    }
    document.body.appendChild(frame)
  }

  function onSubmitPage(event: FormEvent) {
    event.preventDefault()
    const value = Number(pageInput)
    if (Number.isFinite(value)) goTo(value)
    else setPageInput(String(page))
  }

  function onSubmitPassword(event: FormEvent) {
    event.preventDefault()
    if (!password) return
    setPasswordAttempt(password)
  }

  function onShellKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement
    const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && status === 'ready') {
      event.preventDefault()
      openFind()
      return
    }
    if (typing) return
    if (event.key === 'PageDown' || (event.key === 'ArrowRight' && !event.shiftKey)) {
      event.preventDefault()
      goTo(page + 1)
    } else if (event.key === 'PageUp' || (event.key === 'ArrowLeft' && !event.shiftKey)) {
      event.preventDefault()
      goTo(page - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      goTo(1)
    } else if (event.key === 'End') {
      event.preventDefault()
      goTo(numPages)
    } else if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
      event.preventDefault()
      stepZoom(1)
    } else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
      event.preventDefault()
      stepZoom(-1)
    }
  }

  function readSelection() {
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (!text || !selection || !containerRef.current?.contains(selection.anchorNode)) {
      callbacks.current.onSelection?.(null)
      return
    }
    const pageEl = (selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement)?.closest(
      '[data-page-number]',
    )
    callbacks.current.onSelection?.({ text: text.slice(0, 4000), page: Number(pageEl?.getAttribute('data-page-number') ?? page) })
  }

  const ready = status === 'ready'
  const zoomLabel = ZOOM_PRESETS.some((preset) => preset.value === scaleValue) ? scaleValue : 'custom'

  return (
    <section
      ref={shellRef}
      className={`ws-viewer viewer ${fullscreen ? 'is-fullscreen' : ''}`}
      aria-label={`PDF viewer — ${fileName}`}
      onKeyDown={onShellKeyDown}
    >
      <div className="ws-toolbar" role="toolbar" aria-label="Viewer controls">
        <div className="ws-toolbar-group">
          <button type="button" aria-label="Previous page" disabled={!ready || page <= 1} onClick={() => goTo(page - 1)}>
            <ChevronLeft size={16} />
          </button>
          <form onSubmit={onSubmitPage} className="page-jump">
            <label className="sr-only" htmlFor={`page-${docKey}`}>
              Page number
            </label>
            <input
              id={`page-${docKey}`}
              inputMode="numeric"
              value={pageInput}
              disabled={!ready}
              onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => setPageInput(String(page))}
              aria-describedby={`pages-${docKey}`}
            />
            <span id={`pages-${docKey}`}>/ {numPages || '—'}</span>
          </form>
          <button
            type="button"
            aria-label="Next page"
            disabled={!ready || page >= numPages}
            onClick={() => goTo(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="ws-toolbar-group">
          <button type="button" aria-label="Zoom out" disabled={!ready || scale <= 0.25} onClick={() => stepZoom(-1)}>
            <Minus size={14} />
          </button>
          <label className="sr-only" htmlFor={`zoom-${docKey}`}>
            Zoom
          </label>
          <select
            id={`zoom-${docKey}`}
            className="zoom-select"
            value={zoomLabel}
            disabled={!ready}
            onChange={(event) => setZoom(event.target.value)}
          >
            {zoomLabel === 'custom' && <option value="custom">{Math.round(scale * 100)}%</option>}
            {ZOOM_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          <button type="button" aria-label="Zoom in" disabled={!ready || scale >= 5} onClick={() => stepZoom(1)}>
            <Plus size={14} />
          </button>
        </div>

        <div className="ws-toolbar-group">
          <button type="button" aria-label="Rotate view counter-clockwise" title="Rotate view (not saved)" disabled={!ready} onClick={() => rotate(-90)}>
            <RotateCcw size={14} />
          </button>
          <button type="button" aria-label="Rotate view clockwise" title="Rotate view (not saved)" disabled={!ready} onClick={() => rotate(90)}>
            <RotateCw size={14} />
          </button>
          <button
            type="button"
            aria-label="Search in document"
            aria-pressed={findOpen}
            disabled={!ready}
            onClick={() => (findOpen ? closeFind() : openFind())}
          >
            <Search size={14} />
          </button>
          <button type="button" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} disabled={!ready} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
          <button type="button" aria-label="Print" disabled={status === 'loading'} onClick={print}>
            <Printer size={14} />
          </button>
          <button
            type="button"
            aria-label="Download original PDF"
            onClick={() => downloadBlob(toBlob(bytes, 'application/pdf'), fileName)}
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      {findOpen && (
        <form
          className="ws-inline-search find-bar"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            runFind(find.status === 'idle' ? '' : 'again')
          }}
        >
          <Search size={14} aria-hidden="true" />
          <label className="sr-only" htmlFor={`find-${docKey}`}>
            Search this document
          </label>
          <input
            id={`find-${docKey}`}
            ref={findInputRef}
            value={find.query}
            placeholder="Search this document"
            onChange={(event) => {
              const query = event.target.value
              setFind((state) => ({ ...state, query, status: query ? 'searching' : 'idle' }))
              runFind('', false, query)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeFind()
              if (event.key === 'Enter') {
                event.preventDefault()
                runFind('again', event.shiftKey)
              }
            }}
          />
          <span className="find-count" aria-live="polite">
            {find.status === 'searching' && find.total === 0
              ? 'Searching…'
              : find.status === 'none'
                ? 'No matches'
                : find.total > 0
                  ? `${find.current} of ${find.total}`
                  : ''}
          </span>
          <button type="button" aria-label="Previous match" disabled={find.total === 0} onClick={() => runFind('again', true)}>
            <ChevronUp size={14} />
          </button>
          <button type="button" aria-label="Next match" disabled={find.total === 0} onClick={() => runFind('again', false)}>
            <ChevronDown size={14} />
          </button>
          <button type="button" aria-label="Close search" onClick={closeFind}>
            <X size={14} />
          </button>
        </form>
      )}

      {rotation !== 0 && ready && (
        <p className="ws-demo-banner">Rotated view only. Use the Rotate PDF tool to save rotated pages.</p>
      )}

      <div className="viewer-stage">
        <div
          ref={containerRef}
          className="viewer-container"
          tabIndex={0}
          aria-label="Document pages"
          onMouseUp={readSelection}
          onKeyUp={(event) => {
            if (event.shiftKey) readSelection()
          }}
        >
          <div ref={viewerDivRef} className="pdfViewer" />
        </div>

        {status === 'loading' && (
          <div className="viewer-overlay" role="status">
            <LoaderCircle size={18} className="spin" />
            Opening document…
          </div>
        )}
        {status === 'error' && (
          <div className="viewer-overlay is-error" role="alert">
            <strong>This document could not be displayed.</strong>
            <p>{error}</p>
          </div>
        )}
        {status === 'password' && (
          <form className="viewer-overlay viewer-password" onSubmit={onSubmitPassword}>
            <strong>This PDF is password-protected</strong>
            <p>Enter the document’s password to open it. It is only used in your browser and never stored.</p>
            <label className="sr-only" htmlFor={`pw-${docKey}`}>
              Password
            </label>
            <input
              id={`pw-${docKey}`}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
            {passwordWrong && <p className="field-error" role="alert">That password is incorrect.</p>}
            <button type="submit" className="btn btn-primary btn-sm" disabled={!password}>
              Open
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
