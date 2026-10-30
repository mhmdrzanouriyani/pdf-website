import { useState, type FormEvent } from 'react'
import { FileText, LoaderCircle, Lock, X } from 'lucide-react'
import type { PdfSource } from '../../hooks/usePdfSource'
import { formatBytes } from '../../config/limits'

type PdfFileBarProps = {
  source: PdfSource
  onClear: () => void
  onPassword: (password: string) => void
  disabled?: boolean
}

/** Shows the chosen PDF (name, size, pages) and asks for a password when needed. */
export function PdfFileBar({ source, onClear, onPassword, disabled }: PdfFileBarProps) {
  const [password, setPassword] = useState('')
  if (source.status === 'empty') return null
  const file = source.file

  function submit(event: FormEvent) {
    event.preventDefault()
    if (password) onPassword(password)
  }

  return (
    <div className="file-bar-wrap">
      <div className="file-bar">
        <FileText size={20} strokeWidth={1.6} aria-hidden="true" />
        <span className="file-bar-meta">
          <strong>{file.name}</strong>
          <em>
            {formatBytes(file.size)}
            {source.status === 'ready' && ` · ${source.pageCount} page${source.pageCount === 1 ? '' : 's'}`}
            {source.status === 'ready' && source.password !== undefined && ' · unlocked — results will not be password-protected'}
          </em>
        </span>
        {source.status === 'loading' && <LoaderCircle size={16} className="spin" aria-label="Opening" />}
        <button type="button" className="icon-ghost" onClick={onClear} disabled={disabled} aria-label="Remove file and choose another">
          <X size={16} />
        </button>
      </div>
      {source.status === 'error' && (
        <p className="tool-errors" role="alert">
          {source.error}
        </p>
      )}
      {source.status === 'password' && (
        <form className="password-row" onSubmit={submit}>
          <Lock size={15} aria-hidden="true" />
          <label htmlFor="tool-pdf-password">This PDF is password-protected. Password:</label>
          <input
            id="tool-pdf-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!password}>
            Unlock
          </button>
          {source.wrong && (
            <span className="field-error" role="alert">
              Incorrect password.
            </span>
          )}
        </form>
      )}
    </div>
  )
}
