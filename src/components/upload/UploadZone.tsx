import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CloudUpload, LoaderCircle } from 'lucide-react'
import { useDocuments } from '../../state/DocumentsContext'
import { extensionOf, KIND_ACCEPT } from '../../lib/files'
import { LIMITS, formatBytes } from '../../config/limits'

type UploadStatus = 'idle' | 'dragging' | 'opening'

const SUGGEST: Record<string, { slug: string; label: string }> = {
  jpg: { slug: 'jpg-to-pdf', label: 'JPG to PDF' },
  jpeg: { slug: 'jpg-to-pdf', label: 'JPG to PDF' },
  png: { slug: 'png-to-pdf', label: 'PNG to PDF' },
  docx: { slug: 'word-to-pdf', label: 'Word to PDF' },
  pptx: { slug: 'powerpoint-to-pdf', label: 'PowerPoint to PDF' },
  xlsx: { slug: 'excel-to-pdf', label: 'Excel to PDF' },
  html: { slug: 'html-to-pdf', label: 'HTML to PDF' },
  htm: { slug: 'html-to-pdf', label: 'HTML to PDF' },
}

export function UploadZone() {
  const inputId = useId()
  const messageId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const documents = useDocuments()
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [errors, setErrors] = useState<string[]>([])
  const [suggestion, setSuggestion] = useState<{ slug: string; label: string } | null>(null)

  async function onFiles(files: File[]) {
    if (files.length === 0) return
    setErrors([])
    setSuggestion(null)
    const pdfs = files.filter((file) => !SUGGEST[extensionOf(file.name)])
    const others = files.filter((file) => SUGGEST[extensionOf(file.name)])
    if (pdfs.length === 0) {
      const hint = SUGGEST[extensionOf(others[0].name)]
      setErrors([`“${others[0].name}” is not a PDF. The workspace opens PDF files.`])
      setSuggestion(hint)
      setStatus('idle')
      return
    }
    setStatus('opening')
    const { added, errors: problems } = await documents.addFiles(pdfs)
    const messages = [...problems, ...others.map((file) => `“${file.name}” was skipped — it is not a PDF.`)]
    if (added.length > 0) {
      navigate('/workspace', { state: { openId: added[0].id } })
      return
    }
    setErrors(messages)
    setStatus('idle')
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    void onFiles([...(event.target.files ?? [])])
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (status === 'opening') return
    setStatus('idle')
    void onFiles([...event.dataTransfer.files])
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (status === 'opening') return
    setStatus('dragging')
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    if (status === 'dragging') setStatus('idle')
  }

  return (
    <div
      className={`upload-zone is-${status}`}
      role="group"
      aria-label="Upload a PDF"
      aria-describedby={messageId}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        multiple
        accept={KIND_ACCEPT.pdf}
        className="sr-only"
        tabIndex={-1}
        onChange={onChange}
      />

      {status === 'opening' ? (
        <div className="upload-progress" role="status" aria-live="polite">
          <div className="upload-progress-copy">
            <strong>
              <LoaderCircle size={15} className="spin" /> Opening document…
            </strong>
            <span>Checking the file and counting pages in your browser.</span>
          </div>
        </div>
      ) : (
        <>
          <button className="btn btn-primary btn-lg upload-cta" type="button" onClick={() => inputRef.current?.click()}>
            <CloudUpload size={18} strokeWidth={1.75} />
            Upload PDF
          </button>
          <p className="upload-hint">{status === 'dragging' ? 'Drop to open in the workspace' : 'or drop your file here'}</p>
        </>
      )}

      <div id={messageId} className="upload-messages" aria-live="polite">
        {errors.map((error) => (
          <p key={error} className="upload-error" role="alert">
            {error}
          </p>
        ))}
        {suggestion && (
          <p className="upload-note">
            Try <Link to={`/tools/${suggestion.slug}`}>{suggestion.label}</Link> instead.
          </p>
        )}
        {errors.length === 0 && status !== 'opening' && (
          <p className="upload-note">
            PDF up to {formatBytes(LIMITS.maxFileBytes)}. Files are opened in your browser and kept only on this device.
          </p>
        )}
      </div>
    </div>
  )
}
