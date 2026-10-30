import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Navbar } from '../components/layout/Navbar'
import { Footer } from '../components/layout/Footer'
import { ToolCard } from '../components/tools/ToolCard'
import { CATEGORIES, searchTools, toolsIn, type ToolCategory } from '../tools/registry'
import { Sparkle } from '../components/ui/Sparkle'

type Props = { mode: 'pdf' | 'ai' }

export function ToolsIndexPage({ mode }: Props) {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const category = (params.get('category') ?? 'all') as ToolCategory | 'all'
  const categories = CATEGORIES.filter((c) => (mode === 'ai' ? c.id === 'ai' : c.id !== 'ai'))

  useEffect(() => {
    document.title = mode === 'ai' ? 'AI Tools — PDFLY' : 'All PDF Tools — PDFLY'
  }, [mode])

  const results = useMemo(() => {
    const pool = query.trim() ? searchTools(query, category) : null
    return pool?.filter((tool) => (mode === 'ai' ? tool.category === 'ai' : tool.category !== 'ai')) ?? null
  }, [query, category, mode])

  function setCategory(id: ToolCategory | 'all') {
    const next = new URLSearchParams(params)
    if (id === 'all') next.delete('category')
    else next.set('category', id)
    setParams(next, { replace: true })
  }

  return (
    <>
      <Navbar />
      <main className="tools-index" id="main">
        <header className="section-copy">
          <p className="section-kicker">
            {mode === 'ai' && <Sparkle size={13} />}
            {mode === 'ai' ? 'AI Tools' : 'All PDF Tools'}
          </p>
          <h1>{mode === 'ai' ? 'Understand documents, not just files.' : 'Every tool you need for PDFs.'}</h1>
          <p>
            {mode === 'ai'
              ? 'Summaries, answers, translations and study material generated from your document’s own text, with page references.'
              : 'Most tools run entirely in your browser. Office conversions use the PDFLY server.'}
          </p>
        </header>

        <div className="tools-filter">
          <label className="tools-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search tools</span>
            <input
              type="search"
              value={query}
              placeholder={mode === 'ai' ? 'Try “summarize”, “flashcards”…' : 'Try “combine two PDFs”, “reduce size”…'}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {mode === 'pdf' && (
            <div className="tools-cats" role="group" aria-label="Filter by category">
              <button type="button" className="chip" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
                All
              </button>
              {categories.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                  {c.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {results ? (
          <section aria-label="Search results" className="tools-results">
            {results.length === 0 ? (
              <p className="muted">No tools match “{query}”.</p>
            ) : (
              <ul className="tools-grid-list">
                {results.map((tool) => (
                  <li key={tool.slug}>
                    <ToolCard tool={tool} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          categories
            .filter((c) => category === 'all' || c.id === category)
            .map((c) => (
              <section key={c.id} className={`tools-category feature-group ${c.id === 'ai' ? 'is-ai' : ''}`} aria-labelledby={`cat-${c.id}`}>
                <h2 id={`cat-${c.id}`}>
                  {c.id === 'ai' && <Sparkle size={14} />}
                  {c.title}
                </h2>
                <p className="muted">{c.description}</p>
                <ul className="tools-grid-list">
                  {toolsIn(c.id).map((tool) => (
                    <li key={tool.slug}>
                      <ToolCard tool={tool} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
        )}
      </main>
      <Footer />
    </>
  )
}
