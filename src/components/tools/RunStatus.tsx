import { LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react'
import type { Progress, RunPhase } from '../../hooks/useToolRun'

type RunStatusProps = {
  phase: RunPhase
  progress: Progress | null
  error: string | null
  onCancel?: () => void
  onRetry?: () => void
}

/** Progress / error area for a tool run. Progress bars only show real measured work. */
export function RunStatus({ phase, progress, error, onCancel, onRetry }: RunStatusProps) {
  if (phase === 'validating' || phase === 'processing') {
    const measured = progress && typeof progress.done === 'number' && typeof progress.total === 'number' && progress.total > 0
    const pct = measured ? Math.round((progress.done! / progress.total!) * 100) : null
    return (
      <div className="run-status" role="status" aria-live="polite">
        <div className="run-status-row">
          <LoaderCircle size={16} className="spin" aria-hidden="true" />
          <strong>{progress?.label ?? 'Processing…'}</strong>
          {measured && (
            <em>
              {progress.done} / {progress.total}
            </em>
          )}
          {onCancel && (
            <button type="button" className="chip" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
        {pct !== null ? (
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
        ) : (
          <div className="progress-track is-indeterminate" aria-hidden="true">
            <span />
          </div>
        )}
      </div>
    )
  }
  if (phase === 'error' && error) {
    return (
      <div className="run-status is-error" role="alert">
        <div className="run-status-row">
          <TriangleAlert size={16} aria-hidden="true" />
          <strong>{error}</strong>
          {onRetry && error !== 'Cancelled.' && (
            <button type="button" className="chip" onClick={onRetry}>
              <RotateCcw size={12} /> Try again
            </button>
          )}
        </div>
      </div>
    )
  }
  return null
}
