import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleHelp, CreditCard, FileText, FolderOpen, Search, UserRound } from 'lucide-react'
import { CATEGORIES, searchTools, TOOLS, type ToolCategory } from '../../tools/registry'
import { useDocuments } from '../../state/DocumentsContext'

export const CMDK_EVENT = 'pdfly:cmdk'

// eslint-disable-next-line react-refresh/only-export-components
export function openCommandPalette() {
  window.dispatchEvent(new Event(CMDK_EVENT))
}

type Item = {
  id: string
  label: string
  hint: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  run: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(CMDK_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(CMDK_EVENT, onOpen)
    }
  }, [])
  return open ? <Palette onClose={() => setOpen(false)} /> : null
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const documents = useDocuments()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const returnFocus = useRef<Element | null>(document.activeElement)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ToolCategory | 'all'>('all')
  const [active, setActive] = useState(0)

  useEffect(() => {
    inputRef.current?.focus()
    document.body.style.overflow = 'hidden'
    const previous = returnFocus.current
    return () => {
      document.body.style.overflow = ''
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  const items = useMemo<Item[]>(() => {
    const go = (to: string, state?: unknown) => () => navigate(to, state ? { state } : undefined)
    const tools = (query.trim() ? searchTools(query, category) : TOOLS.filter((t) => category === 'all' || t.category === category))
      .slice(0, query.trim() ? 12 : 40)
      .map<Item>((tool) => ({
        id: tool.slug,
        label: tool.title,
        hint: CATEGORIES.find((c) => c.id === tool.category)?.title ?? '',
        icon: tool.icon,
        run: go(`/tools/${tool.slug}`),
      }))
    const q = query.trim().toLowerCase()
    const pages: Item[] = [
      { id: 'workspace', label: 'Open workspace', hint: 'Go to', icon: FolderOpen, run: go('/workspace') },
      { id: 'pricing', label: 'Pricing', hint: 'Go to', icon: CreditCard, run: go('/pricing') },
      { id: 'faq', label: 'FAQ & help', hint: 'Go to', icon: CircleHelp, run: go('/faq') },
      { id: 'account', label: 'Account & preferences', hint: 'Go to', icon: UserRound, run: go('/account') },
    ].filter((item) => category === 'all' && (!q || item.label.toLowerCase().includes(q)))
    const docs: Item[] =
      category === 'all'
        ? documents.docs
            .filter((doc) => (q ? doc.name.toLowerCase().includes(q) : true))
            .slice(0, q ? 5 : 3)
            .map((doc) => ({ id: `doc-${doc.id}`, label: doc.name, hint: 'Recent document', icon: FileText, run: go('/workspace', { openId: doc.id }) }))
        : []
    return q ? [...tools, ...docs, ...pages] : [...docs, ...tools, ...pages]
  }, [query, category, navigate, documents.docs])

  // Keep the highlighted row valid as results change.
  const activeIndex = Math.min(active, Math.max(0, items.length - 1))

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function run(item: Item) {
    onClose()
    item.run()
  }

  return (
    <div className="cmdk" role="presentation">
      <button type="button" className="cmdk-backdrop" aria-label="Close search" onClick={onClose} tabIndex={-1} />
      <div
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search PDFLY tools"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive(Math.min(items.length - 1, activeIndex + 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive(Math.max(0, activeIndex - 1))
          }
          if (event.key === 'Enter' && items[activeIndex]) {
            event.preventDefault()
            run(items[activeIndex])
          }
          if (event.key === 'Tab') {
            // Keep focus inside the dialog.
            const focusables = event.currentTarget.querySelectorAll<HTMLElement>('input, button:not([tabindex="-1"])')
            const first = focusables[0]
            const last = focusables[focusables.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first.focus()
            }
          }
        }}
      >
        <div className="cmdk-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            placeholder="Search tools — e.g. “combine two PDFs”, “reduce size”…"
            aria-label="Search tools and pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-results"
            aria-activedescendant={items[activeIndex] ? `cmdk-${items[activeIndex].id}` : undefined}
            aria-autocomplete="list"
          />
          <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </div>
        <div className="cmdk-cats" role="group" aria-label="Filter by category">
          <button type="button" className="chip" aria-pressed={category === 'all'} onClick={() => { setCategory('all'); setActive(0) }}>
            All
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={category === c.id} onClick={() => { setCategory(c.id); setActive(0) }}>
              {c.title}
            </button>
          ))}
        </div>
        <ul className="cmdk-list" role="listbox" id="cmdk-results" ref={listRef} aria-label="Results">
          {items.length === 0 ? (
            <li className="cmdk-empty" role="option" aria-selected="false" aria-disabled="true">
              No matching tools. Try different words, like “smaller”, “combine” or “sign”.
            </li>
          ) : (
            items.map((item, index) => (
              <li key={item.id} id={`cmdk-${item.id}`} role="option" aria-selected={index === activeIndex} data-index={index}>
                <button type="button" tabIndex={-1} className={index === activeIndex ? 'is-active' : ''} onMouseMove={() => setActive(index)} onClick={() => run(item)}>
                  <item.icon size={16} strokeWidth={1.7} />
                  <span>{item.label}</span>
                  <em>{item.hint}</em>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
