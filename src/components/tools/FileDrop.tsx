import { useId, useRef, useState, type DragEvent } from 'react'
import { CloudUpload, FolderOpen } from 'lucide-react'
import { FileValidationError, KIND_ACCEPT, KIND_LABEL, validateFile, type FileKind } from '../../lib/files'
import { LIMITS, formatBytes } from '../../config/limits'
import { useDocuments } from '../../state/DocumentsContext'

export type AcceptedFile = { file: File; kind: FileKind }

type FileDropProps = {
  accepts: FileKind[]
  multiple?: boolean
  maxFiles?: number
  maxBytes?: number
  onFiles: (files: AcceptedFile[]) => void
  /** Smaller variant used for "add more files". */
  compact?: boolean
  label?: string
  disabled?: boolean
}

/**
 * Accessible file picker + drop zone with real validation (size, emptiness,
 * content signature). PDF tools can also pick documents stored in the workspace.
 */
export function FileDrop({
  accepts,
  multiple = false,
  maxFiles = LIMITS.maxFiles,
  maxBytes = LIMITS.maxFileBytes,
  onFiles,
  compact = false,
  label,
  disabled = false,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const statusId = useId()
  const documents = useDocuments()
  const [dragging, setDragging] = useState(false)
  const [checking, setChecking] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const kinds = accepts.map((kind) => KIND_LABEL[kind]).join(', ')
  const canUseWorkspace = accepts.includes('pdf') && documents.docs.length > 0

  async function handle(files: File[]) {
    if (disabled || files.length === 0) return
    const list = multiple ? files.slice(0, maxFiles) : files.slice(0, 1)
    const problems: string[] = []
    if (multiple && files.length > maxFiles) problems.push(`Only the first ${maxFiles} files were added (limit ${maxFiles}).`)
    if (!multiple && files.length > 1) problems.push('This tool works on one file at a time — the first file was used.')
    setChecking(true)
    const accepted: AcceptedFile[] = []
    for (const file of list) {
      try {
        accepted.push({ file, kind: await validateFile(file, accepts, maxBytes) })
      } catch (error) {
        problems.push(error instanceof FileValidationError ? error.message : `“${file.name}” could not be read.`)
      }
    }
    setChecking(false)
    setErrors(problems)
    if (accepted.length) onFiles(accepted)
  }

  async function pickStored(id: string) {
    const meta = documents.docs.find((doc) => doc.id === id)
    const blob = await documents.getBlob(id)
    setPickerOpen(false)
    if (!meta || !blob) {
      setErrors(['That document is no longer stored in this browser.'])
      return
    }
    void handle([new File([blob], meta.name, { type: 'application/pdf' })])
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void handle([...event.dataTransfer.files])
  }

  return (
    <div className={`file-drop ${compact ? 'is-compact' : ''}`}>
      <div
        className={`upload-zone tool-drop ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={onDrop}
        aria-describedby={statusId}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          multiple={multiple}
          accept={accepts.map((kind) => KIND_ACCEPT[kind]).join(',')}
          onChange={(event) => {
            void handle([...(event.target.files ?? [])])
            event.target.value = ''
          }}
        />
        <button
          type="button"
          className={`btn ${compact ? 'btn-outline btn-md' : 'btn-primary btn-lg'} upload-cta`}
          onClick={() => inputRef.current?.click()}
          disabled={disabled || checking}
        >
          <CloudUpload size={18} strokeWidth={1.75} />
          {label ?? (multiple ? `Select ${kinds} files` : `Select ${kinds} file`)}
        </button>
        {!compact && <p className="upload-hint">{dragging ? 'Drop to add' : 'or drop files here'}</p>}
        {canUseWorkspace && !compact && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickerOpen((open) => !open)} aria-expanded={pickerOpen}>
            <FolderOpen size={15} /> From workspace
          </button>
        )}
        <p id={statusId} className="upload-note" aria-live="polite">
          {checking ? 'Checking files…' : `${kinds} · up to ${formatBytes(maxBytes)} each${multiple ? ` · max ${maxFiles} files` : ''}`}
        </p>
      </div>
      {pickerOpen && (
        <ul className="workspace-picker" aria-label="Documents in your workspace">
          {documents.docs.map((doc) => (
            <li key={doc.id}>
              <button type="button" onClick={() => void pickStored(doc.id)}>
                <strong>{doc.name}</strong>
                <em>
                  {doc.pageCount ? `${doc.pageCount} pages · ` : ''}
                  {formatBytes(doc.size)}
                </em>
              </button>
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <div className="tool-errors" role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </div>
  )
}
