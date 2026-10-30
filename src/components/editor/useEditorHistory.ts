import { useCallback, useRef, useState } from 'react'
import type { EditorElement } from '../../lib/pdf/annotate'

/** Element list with undo/redo. Drag updates don't create history entries until they finish. */
export function useEditorHistory() {
  const [elements, setElements] = useState<EditorElement[]>([])
  const past = useRef<EditorElement[][]>([])
  const future = useRef<EditorElement[][]>([])
  const committed = useRef<EditorElement[]>([])
  const [depth, setDepth] = useState({ past: 0, future: 0 })
  const bump = () => setDepth({ past: past.current.length, future: future.current.length })

  const change = useCallback((next: EditorElement[], commit: boolean) => {
    setElements(next)
    if (commit) {
      if (next !== committed.current) {
        past.current.push(committed.current)
        if (past.current.length > 100) past.current.shift()
        future.current = []
        committed.current = next
        bump()
      }
    }
  }, [])

  const undo = useCallback(() => {
    const previous = past.current.pop()
    if (!previous) return
    future.current.push(committed.current)
    committed.current = previous
    setElements(previous)
    bump()
  }, [])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(committed.current)
    committed.current = next
    setElements(next)
    bump()
  }, [])

  const reset = useCallback(() => {
    past.current = []
    future.current = []
    committed.current = []
    setElements([])
    bump()
  }, [])

  return { elements, change, undo, redo, reset, canUndo: depth.past > 0, canRedo: depth.future > 0 }
}
