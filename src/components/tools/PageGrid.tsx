import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { PDFDocumentProxy } from '../../lib/pdf/pdfjs'
import { PageThumb } from './PageThumb'

export type GridItem = {
  /** Stable React key (duplicates need distinct keys). */
  key: string
  /** 0-based page index in the source document. */
  source: number
  /** Extra rotation in degrees. */
  rotation: number
}

type PageGridProps = {
  doc: PDFDocumentProxy
  items: GridItem[]
  selected?: Set<string>
  onSelectionChange?: (next: Set<string>) => void
  /** Enables drag-and-drop and keyboard (Alt+←/→) reordering. */
  onReorder?: (items: GridItem[]) => void
  renderActions?: (item: GridItem, index: number) => ReactNode
  /** Visual style for selected tiles. */
  selectionTone?: 'select' | 'remove'
  label: string
}

export function PageGrid({
  doc,
  items,
  selected,
  onSelectionChange,
  onReorder,
  renderActions,
  selectionTone = 'select',
  label,
}: PageGridProps) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const anchor = useRef<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  function toggle(index: number, shift: boolean) {
    if (!selected || !onSelectionChange) return
    const next = new Set(selected)
    if (shift && anchor.current !== null) {
      const [a, b] = [Math.min(anchor.current, index), Math.max(anchor.current, index)]
      for (let i = a; i <= b; i += 1) next.add(items[i].key)
    } else {
      const key = items[index].key
      if (next.has(key)) next.delete(key)
      else next.add(key)
      anchor.current = index
    }
    onSelectionChange(next)
  }

  function move(from: number, to: number) {
    if (!onReorder || to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onReorder(next)
    setAnnouncement(`Moved page ${item.source + 1} to position ${to + 1}.`)
  }

  function onDrop(event: DragEvent, targetKey: string) {
    event.preventDefault()
    const from = items.findIndex((item) => item.key === dragKey)
    const to = items.findIndex((item) => item.key === targetKey)
    setDragKey(null)
    setOverKey(null)
    if (from >= 0 && to >= 0) move(from, to)
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (!onReorder || !event.altKey) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(index, index - 1)
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(index, index + 1)
    }
  }

  return (
    <div className="page-grid-wrap">
      <ul className="page-grid" aria-label={label}>
        {items.map((item, index) => {
          const isSelected = selected?.has(item.key) ?? false
          return (
            <li
              key={item.key}
              className={`page-tile ${isSelected ? `is-${selectionTone}` : ''} ${dragKey === item.key ? 'is-dragging' : ''} ${overKey === item.key ? 'is-over' : ''}`}
              draggable={Boolean(onReorder)}
              onDragStart={(event) => {
                setDragKey(item.key)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', item.key)
              }}
              onDragOver={(event) => {
                if (!dragKey) return
                event.preventDefault()
                setOverKey(item.key)
              }}
              onDragLeave={() => setOverKey((key) => (key === item.key ? null : key))}
              onDrop={(event) => onDrop(event, item.key)}
              onDragEnd={() => {
                setDragKey(null)
                setOverKey(null)
              }}
            >
              <button
                type="button"
                className="page-tile-main"
                aria-pressed={onSelectionChange ? isSelected : undefined}
                aria-label={`Page ${item.source + 1}${item.rotation ? `, rotated ${item.rotation}°` : ''}${onReorder ? `, position ${index + 1} of ${items.length}. Alt+arrow keys move it.` : ''}`}
                onClick={(event) => toggle(index, event.shiftKey)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <PageThumb doc={doc} pageNumber={item.source + 1} rotation={item.rotation} />
                {isSelected && (
                  <span className="page-tile-check" aria-hidden="true">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </button>
              <div className="page-tile-foot">
                <span>{item.source + 1}</span>
                {renderActions && <div className="page-tile-actions">{renderActions(item, index)}</div>}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}

export function makeItems(pageCount: number): GridItem[] {
  return Array.from({ length: pageCount }, (_, i) => ({ key: `p${i}`, source: i, rotation: 0 }))
}
