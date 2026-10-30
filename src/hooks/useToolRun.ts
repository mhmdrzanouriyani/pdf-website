import { useCallback, useEffect, useRef, useState } from 'react'
import { FileValidationError } from '../lib/files'
import { PdfPasswordError, PdfProcessingError } from '../lib/pdf/core'
import { PageRangeError } from '../lib/pageRanges'
import { ApiError } from '../lib/api'

export type ToolOutput = {
  name: string
  blob: Blob
  /** Optional per-file note (e.g. "pages 1–3"). */
  note?: string
}

export type Progress = { done: number; total: number; label?: string } | { label: string; done?: undefined; total?: undefined }

export type RunPhase = 'idle' | 'validating' | 'processing' | 'success' | 'error'

export type RunContext = {
  signal: AbortSignal
  /** Report real progress; never call with fabricated values. */
  progress: (progress: Progress) => void
  /** Switch from validating to processing. */
  processing: (label?: string) => void
}

export type RunResult = { outputs: ToolOutput[]; summary?: string; details?: string[] }

type State = {
  phase: RunPhase
  progress: Progress | null
  error: string | null
  result: RunResult | null
}

const IDLE: State = { phase: 'idle', progress: null, error: null, result: null }

/** Turns any thrown value into a specific, user-readable message. */
export function describeError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Cancelled.'
  if (
    error instanceof PdfPasswordError ||
    error instanceof PdfProcessingError ||
    error instanceof FileValidationError ||
    error instanceof PageRangeError ||
    error instanceof ApiError
  ) {
    return error.message
  }
  if (error instanceof RangeError || (error instanceof Error && /memory|allocation|Array buffer/i.test(error.message))) {
    return 'Your browser ran out of memory. Try a smaller file, fewer pages, or a lower quality setting.'
  }
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Please try again.'
}

/**
 * Lifecycle for a tool run: idle → validating → processing → success | error.
 * Success is only reported after the output blobs exist. Runs can be cancelled,
 * and a run started for a previous input never overwrites a newer one.
 */
export function useToolRun() {
  const [state, setState] = useState<State>(IDLE)
  const controllerRef = useRef<AbortController | null>(null)
  const runId = useRef(0)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const start = useCallback(async (job: (context: RunContext) => Promise<RunResult>) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const id = ++runId.current
    const alive = () => runId.current === id && !controller.signal.aborted
    setState({ phase: 'validating', progress: { label: 'Checking your files…' }, error: null, result: null })
    try {
      const result = await job({
        signal: controller.signal,
        progress: (progress) => {
          if (alive()) setState((s) => ({ ...s, phase: 'processing', progress }))
        },
        processing: (label) => {
          if (alive()) setState((s) => ({ ...s, phase: 'processing', progress: { label: label ?? 'Processing…' } }))
        },
      })
      if (!alive()) return
      if (result.outputs.length === 0 && !result.summary) throw new PdfProcessingError('Nothing was produced.')
      setState({ phase: 'success', progress: null, error: null, result })
    } catch (error) {
      if (runId.current !== id) return
      setState({ phase: 'error', progress: null, error: describeError(error), result: null })
    }
  }, [])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    runId.current += 1
    setState({ phase: 'error', progress: null, error: 'Cancelled.', result: null })
  }, [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    runId.current += 1
    setState(IDLE)
  }, [])

  return { ...state, busy: state.phase === 'validating' || state.phase === 'processing', start, cancel, reset }
}

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
}

/** Yields to the browser so progress renders and the page stays responsive. */
export function nextFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}
