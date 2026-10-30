import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { FileText, FileUp, MessageSquare, PanelsTopLeft, PenLine, Wrench } from 'lucide-react'
import { useDocuments } from '../../state/DocumentsContext'
import { useToast } from '../../state/ToastContext'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import { AICopilot } from './AICopilot'
import { PdfViewer, type ViewerSelection } from '../viewer/PdfViewer'
import { useDocumentText, forgetDocumentText } from '../../hooks/useDocumentText'
import { readBytes } from '../../lib/files'
import type { PDFDocumentProxy } from '../../lib/pdf/pdfjs'
import { KIND_ACCEPT } from '../../lib/files'

type WorkspaceShellProps = {
  initialDocId?: string
}

type Loaded = { id: string; bytes: Uint8Array } | null

const QUICK_TOOLS = [
  { slug: 'edit-pdf', label: 'Edit' },
  { slug: 'sign-pdf', label: 'Sign' },
  { slug: 'organize-pdf', label: 'Organize' },
  { slug: 'compress-pdf', label: 'Compress' },
  { slug: 'pdf-to-word', label: 'To Word' },
]

export function WorkspaceShell({ initialDocId }: WorkspaceShellProps) {
  const documents = useDocuments()
  const { notify } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [activeId, setActiveId] = useState<string | null>(initialDocId ?? null)
  const [loaded, setLoaded] = useState<Loaded>(null)
  const [loadError, setLoadError] = useState('')
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [selection, setSelection] = useState<ViewerSelection | null>(null)
  const [locked, setLocked] = useState(false)
  const [pageRequest, setPageRequest] = useState<{ page: number; nonce: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [panel, setPanel] = useState<'docs' | 'viewer' | 'ai'>('viewer')

  const active = documents.docs.find((doc) => doc.id === activeId) ?? null

  // Default to the most recently opened document.
  useEffect(() => {
    if (documents.loading) return
    if (activeId && documents.docs.some((doc) => doc.id === activeId)) return
    setActiveId(documents.docs[0]?.id ?? null)
  }, [documents.loading, documents.docs, activeId])

  useEffect(() => {
    if (initialDocId) setActiveId(initialDocId)
  }, [initialDocId])

  // Load the active document's bytes; the id check prevents a slow load from replacing a newer selection.
  useEffect(() => {
    let cancelled = false
    setLoadError('')
    if (!activeId) {
      setLoaded(null)
      return
    }
    documents
      .getBlob(activeId)
      .then(async (blob) => {
        if (cancelled) return
        if (!blob) {
          setLoaded(null)
          setLoadError('This document is no longer stored in this browser. Upload it again to continue.')
          return
        }
        const bytes = await readBytes(blob)
        if (!cancelled) setLoaded({ id: activeId, bytes })
      })
      .catch(() => {
        if (!cancelled) setLoadError('This document could not be read from browser storage.')
      })
    return () => {
      cancelled = true
    }
    // documents.getBlob is stable for a given persistence mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const text = useDocumentText(loaded && pdfDoc ? loaded.id : null, pdfDoc)

  const select = useCallback(
    (id: string) => {
      setActiveId(id)
      setSelection(null)
      setPdfDoc(null)
      setPanel('viewer')
      void documents.touch(id)
    },
    [documents],
  )

  async function addFiles(files: File[]) {
    if (files.length === 0) return
    const { added, errors } = await documents.addFiles(files)
    errors.forEach((message) => notify(message, 'error'))
    if (added.length) {
      notify(added.length === 1 ? `Opened “${added[0].name}”.` : `Added ${added.length} documents.`, 'success')
      select(added[0].id)
    }
  }

  async function remove(id: string) {
    forgetDocumentText(id)
    if (id === activeId) {
      setPdfDoc(null)
      setLoaded(null)
    }
    await documents.remove(id)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void addFiles([...event.dataTransfer.files])
  }

  const viewerKey = loaded && loaded.id === activeId ? loaded.id : null

  return (
    <div
      className={`ws ws-page ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes('Files')) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <header className="ws-topbar">
        <div className="ws-topbar-title">
          <strong>Workspace</strong>
          <span>{active ? active.name : 'No document open'}</span>
        </div>
        <div className="ws-topbar-actions">
          {active &&
            QUICK_TOOLS.map((tool) => (
              <Link key={tool.slug} to={`/tools/${tool.slug}?doc=${active.id}`} className="ghost-link">
                {tool.slug === 'edit-pdf' ? <PenLine size={15} /> : null}
                {tool.label}
              </Link>
            ))}
          <Link to="/tools" className="ghost-link">
            <Wrench size={15} />
            All tools
          </Link>
        </div>
      </header>

      <nav className="ws-tabs" aria-label="Workspace panels">
        <button type="button" aria-pressed={panel === 'docs'} onClick={() => setPanel('docs')}>
          <PanelsTopLeft size={15} /> Documents
        </button>
        <button type="button" aria-pressed={panel === 'viewer'} onClick={() => setPanel('viewer')}>
          <FileText size={15} /> Viewer
        </button>
        <button type="button" aria-pressed={panel === 'ai'} onClick={() => setPanel('ai')}>
          <MessageSquare size={15} /> Copilot
        </button>
      </nav>

      <div className={`ws-body show-${panel}`}>
        <WorkspaceSidebar
          docs={documents.docs}
          loading={documents.loading}
          persistent={documents.persistent}
          activeId={activeId}
          onSelect={select}
          onUploadClick={() => inputRef.current?.click()}
          onRemove={(id) => void remove(id)}
          onRename={(id, name) => void documents.rename(id, name)}
          onClear={() => {
            setPdfDoc(null)
            setLoaded(null)
            void documents.clear()
          }}
        />

        {viewerKey && loaded && active ? (
          <PdfViewer
            key={viewerKey}
            docKey={viewerKey}
            bytes={loaded.bytes}
            fileName={active.name}
            onDocument={setPdfDoc}
            onSelection={setSelection}
            onLockedChange={(isLocked) => {
              setLocked(isLocked)
              if (active.status === 'locked' && !isLocked) void documents.update(active.id, { status: 'ready' })
            }}
            pageRequest={pageRequest}
          />
        ) : (
          <section className="ws-viewer ws-viewer-empty" aria-label="PDF viewer">
            {loadError ? (
              <div className="viewer-empty" role="alert">
                <strong>{loadError}</strong>
              </div>
            ) : activeId && !loaded ? (
              <div className="viewer-empty" role="status">
                Loading…
              </div>
            ) : (
              <div className="viewer-empty">
                <FileUp size={28} strokeWidth={1.4} aria-hidden="true" />
                <strong>Open a PDF to get started</strong>
                <p>Drop a file here or choose one from your computer. It stays in your browser.</p>
                <button type="button" className="btn btn-primary btn-md" onClick={() => inputRef.current?.click()}>
                  Choose PDF
                </button>
              </div>
            )}
          </section>
        )}

        <AICopilot
          docKey={viewerKey}
          docName={active?.name ?? ''}
          text={text}
          locked={locked}
          selection={selection}
          onCite={(page) => {
            setPageRequest({ page, nonce: Date.now() })
            setPanel('viewer')
          }}
        />
      </div>

      {dragging && (
        <div className="ws-dropzone" aria-hidden="true">
          <FileUp size={22} /> Drop PDF files to open them
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={KIND_ACCEPT.pdf}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void addFiles([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
    </div>
  )
}
