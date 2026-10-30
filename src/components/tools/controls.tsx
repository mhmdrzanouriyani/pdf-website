import { useId, type ReactNode } from 'react'
import { PageRangeError, parsePageSelection } from '../../lib/pageRanges'

type SegmentedProps<T extends string> = {
  label: string
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  disabled?: boolean
}

/** Accessible radio group styled as a segmented control. */
export function Segmented<T extends string>({ label, value, options, onChange, disabled }: SegmentedProps<T>) {
  const name = useId()
  return (
    <fieldset className="segmented" disabled={disabled}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label key={option.value} className={value === option.value ? 'is-on' : ''}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <div className="field">
      <label>
        <span className="field-label">{label}</span>
        {children}
      </label>
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

/** Validates a page range expression; returns indices or an error message. */
export function checkRange(input: string, pageCount: number): { indices: number[]; error: null } | { indices: null; error: string } {
  try {
    return { indices: parsePageSelection(input, pageCount), error: null }
  } catch (error) {
    return { indices: null, error: error instanceof PageRangeError ? error.message : 'Invalid page range.' }
  }
}

export function RunButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-primary btn-lg tool-run" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
