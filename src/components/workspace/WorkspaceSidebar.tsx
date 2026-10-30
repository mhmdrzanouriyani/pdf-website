import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Combine, FileUp, Lock, Pencil, Trash2, TriangleAlert, X } from 'lucide-react'
import type { StoredDocMeta } from '../../lib/docStore'
import { formatBytes } from '../../config/limits'

type WorkspaceSidebarProps = {
  docs: StoredDocMeta[]
  loading: boolean
  persistent: boolean
  activeId: string | null
  onSelect: (id: string) => void
  onUploadClick: () => void
  onRemove: (id: string) => void
  onRename: (id: string, name: string) => void
  onClear: () => void
}

function relativeTime(timestamp: number) {
  const diff = Date.now() - timestamp
  const minute = 60_000
  if (diff < minute) return 'Just now'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} min ago`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} h ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function WorkspaceSidebar({
  docs,
  loading,
  persistent,
  activeId,
  onSelect,
  onUploadClick,
  onRemove,
  onRename,
  onClear,
}: WorkspaceSidebarProps) {
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const active = docs.find((doc) => doc.id === activeId) ?? null

  function startRename(doc: StoredDocMeta) {
    setRenaming(doc.id)
    setDraftName(doc.name.replace(/\.pdf$/i, ''))
  }

  function submitRename(event: FormEvent) {
    event.preventDefault()
    if (renaming && draftName.trim()) onRename(renaming, draftName)
    setRenaming(null)
  }

  function toggleSelected(id: string) {
    setSelected((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]))
  }

  const mergeable = selected.filter((id) => docs.some((doc) => doc.id === id))

  return (
    <aside className="ws-sidebar" aria-label="Documents">
      <p className="ws-sidebar-label">Documents</p>
      <button type="button" className="btn btn-primary btn-sm ws-upload" onClick={onUploadClick}>
        <FileUp size={15} strokeWidth={1.75} />
        Upload file
      </button>

      {active && (
        <dl className="ws-current" aria-label="Current document">
          <dt className="sr-only">Name</dt>
          <dd className="ws-current-name">{active.name}</dd>
          <div>
            <dt>Size</dt>
            <dd>{formatBytes(active.size)}</dd>
          </div>
          <div>
            <dt>Pages</dt>
            <dd>{active.pageCount ?? '—'}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>PDF</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{active.status === 'locked' ? 'Password-protected' : 'Ready'}</dd>
          </div>
        </dl>
      )}

      <div className="ws-recent">
        <span>Recent documents</span>
        {loading ? (
          <p className="ws-empty">Loading…</p>
        ) : docs.length === 0 ? (
          <div className="ws-empty">
            <p>No documents yet.</p>
            <p>Upload a PDF or drop it anywhere in the workspace.</p>
          </div>
        ) : (
          <ul>
            {docs.map((doc) => (
              <li key={doc.id} className={`ws-doc ${doc.id === activeId ? 'is-active' : ''}`}>
                {renaming === doc.id ? (
                  <form className="ws-rename" onSubmit={submitRename}>
                    <label className="sr-only" htmlFor={`rename-${doc.id}`}>
                      New name
                    </label>
                    <input
                      id={`rename-${doc.id}`}
                      value={draftName}
                      autoFocus
                      maxLength={140}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(null)
                      }}
                    />
                    <button type="submit" aria-label="Save name">
                      <Check size={13} />
                    </button>
                    <button type="button" aria-label="Cancel rename" onClick={() => setRenaming(null)}>
                      <X size={13} />
                    </button>
                  </form>
                ) : (
                  <>
                    <input
                      type="checkbox"
                      className="ws-doc-check"
                      aria-label={`Select ${doc.name} for merging`}
                      checked={selected.includes(doc.id)}
                      onChange={() => toggleSelected(doc.id)}
                    />
                    <button
                      type="button"
                      className="ws-doc-open"
                      aria-current={doc.id === activeId ? 'true' : undefined}
                      onClick={() => onSelect(doc.id)}
                    >
                      <strong>
                        {doc.status === 'locked' && <Lock size={11} aria-label="Password-protected" />}
                        {doc.name.replace(/\.pdf$/i, '')}
                      </strong>
                      <em>
                        {doc.pageCount ? `${doc.pageCount} pages · ` : ''}
                        {formatBytes(doc.size)} · {relativeTime(doc.openedAt)}
                      </em>
                    </button>
                    <div className="ws-doc-actions">
                      <button type="button" aria-label={`Rename ${doc.name}`} onClick={() => startRename(doc)}>
                        <Pencil size={12} />
                      </button>
                      <button type="button" aria-label={`Remove ${doc.name} from workspace`} onClick={() => onRemove(doc.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {mergeable.length >= 2 && (
        <button
          type="button"
          className="btn btn-outline btn-sm ws-merge"
          onClick={() => navigate(`/tools/merge-pdf?docs=${mergeable.join(',')}`)}
        >
          <Combine size={14} /> Merge {mergeable.length} selected
        </button>
      )}

      <div className="ws-storage-note">
        {persistent ? (
          <p>Stored only in this browser on this device. Nothing is uploaded.</p>
        ) : (
          <p>
            <TriangleAlert size={12} aria-hidden="true" /> Browser storage is blocked, so documents will be forgotten when you close this tab.
          </p>
        )}
        {docs.length > 0 &&
          (confirmClear ? (
            <div className="ws-confirm" role="group" aria-label="Confirm clearing recent documents">
              <span>Remove all {docs.length}?</span>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setConfirmClear(false)
                  setSelected([])
                  onClear()
                }}
              >
                Remove all
              </button>
              <button type="button" className="chip" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="link-btn" onClick={() => setConfirmClear(true)}>
              Clear recent documents
            </button>
          ))}
      </div>
    </aside>
  )
}
