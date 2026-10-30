import { useMemo, useState } from 'react'
import { diffWords, type ChangeObject } from 'diff'
import { Download } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { RunButton, Segmented } from '../../components/tools/controls'
import { PageThumb } from '../../components/tools/PageThumb'
import { usePdfSource } from '../../hooks/usePdfSource'
import { useToolRun } from '../../hooks/useToolRun'
import { extractText, type PageText } from '../../lib/pdf/pdfjs'
import { downloadBlob } from '../../lib/files'

type PageDiff = { pageA: number | null; pageB: number | null; parts: ChangeObject<string>[]; added: number; removed: number }

function countWords(parts: ChangeObject<string>[], key: 'added' | 'removed') {
  return parts.filter((p) => p[key]).reduce((sum, p) => sum + (p.value.match(/\S+/g)?.length ?? 0), 0)
}

function comparePages(a: PageText[], b: PageText[]): PageDiff[] {
  const count = Math.max(a.length, b.length)
  const out: PageDiff[] = []
  for (let i = 0; i < count; i += 1) {
    const ta = a[i]?.text ?? ''
    const tb = b[i]?.text ?? ''
    const parts = diffWords(ta, tb)
    out.push({ pageA: a[i] ? i + 1 : null, pageB: b[i] ? i + 1 : null, parts, added: countWords(parts, 'added'), removed: countWords(parts, 'removed') })
  }
  return out
}

function report(diffs: PageDiff[], nameA: string, nameB: string) {
  const lines = [`PDFLY comparison`, `A: ${nameA}`, `B: ${nameB}`, '']
  for (const d of diffs) {
    if (!d.added && !d.removed) continue
    lines.push(`=== Page ${d.pageA ?? '—'} (A) vs page ${d.pageB ?? '—'} (B): +${d.added} / −${d.removed} words ===`)
    for (const part of d.parts) {
      if (part.added) lines.push(`+ ${part.value.trim()}`)
      else if (part.removed) lines.push(`- ${part.value.trim()}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export default function CompareTool(_props: ToolProps) {
  const [fileA, setFileA] = useState<File | null>(null)
  const [fileB, setFileB] = useState<File | null>(null)
  const a = usePdfSource(fileA)
  const b = usePdfSource(fileB)
  const run = useToolRun()
  const [mode, setMode] = useState<'pages' | 'continuous'>('pages')
  const [diffs, setDiffs] = useState<PageDiff[] | null>(null)
  const [onlyChanged, setOnlyChanged] = useState(true)

  function compare() {
    if (a.source.status !== 'ready' || b.source.status !== 'ready') return
    const docA = a.source.doc
    const docB = b.source.doc
    setDiffs(null)
    void run.start(async ({ progress, signal }) => {
      const total = docA.numPages + docB.numPages
      const textA = await extractText(docA, (done) => progress({ done, total, label: 'Reading document A…' }), signal)
      const textB = await extractText(docB, (done) => progress({ done: docA.numPages + done, total, label: 'Reading document B…' }), signal)
      if (textA.every((p) => !p.text.trim()) || textB.every((p) => !p.text.trim())) {
        throw new Error('One of the documents has no selectable text (it may be scanned). Run OCR PDF on it first.')
      }
      progress({ label: 'Comparing…' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      let result: PageDiff[]
      if (mode === 'pages') result = comparePages(textA, textB)
      else {
        const parts = diffWords(textA.map((p) => p.text).join('\n\n'), textB.map((p) => p.text).join('\n\n'))
        result = [{ pageA: null, pageB: null, parts, added: countWords(parts, 'added'), removed: countWords(parts, 'removed') }]
      }
      setDiffs(result)
      const changed = result.filter((d) => d.added || d.removed).length
      return { outputs: [], summary: changed ? `${changed} ${mode === 'pages' ? 'page' : 'section'}${changed === 1 ? '' : 's'} differ.` : 'No text differences found.' }
    })
  }

  const totals = useMemo(() => (diffs ? diffs.reduce((acc, d) => ({ added: acc.added + d.added, removed: acc.removed + d.removed }), { added: 0, removed: 0 }) : null), [diffs])
  const visible = diffs?.filter((d) => !onlyChanged || d.added || d.removed) ?? []

  return (
    <div className="tool-stack">
      <div className="compare-inputs">
        <div>
          <h2 className="compare-label">Document A (original)</h2>
          {fileA ? (
            <PdfFileBar source={a.source} onClear={() => { setFileA(null); setDiffs(null); run.reset() }} onPassword={a.submitPassword} />
          ) : (
            <FileDrop accepts={['pdf']} compact onFiles={([f]) => setFileA(f.file)} label="Choose PDF A" />
          )}
        </div>
        <div>
          <h2 className="compare-label">Document B (changed)</h2>
          {fileB ? (
            <PdfFileBar source={b.source} onClear={() => { setFileB(null); setDiffs(null); run.reset() }} onPassword={b.submitPassword} />
          ) : (
            <FileDrop accepts={['pdf']} compact onFiles={([f]) => setFileB(f.file)} label="Choose PDF B" />
          )}
        </div>
      </div>

      {a.source.status === 'ready' && b.source.status === 'ready' && (
        <>
          <Segmented
            label="Compare"
            value={mode}
            onChange={(m) => { setMode(m); setDiffs(null) }}
            options={[
              { value: 'pages', label: 'Page by page' },
              { value: 'continuous', label: 'As continuous text (text reflowed between pages)' },
            ]}
          />
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={compare} />
          <RunButton disabled={run.busy} onClick={compare}>
            Compare documents
          </RunButton>
        </>
      )}

      {diffs && totals && a.source.status === 'ready' && b.source.status === 'ready' && (
        <section className="compare-results" aria-label="Comparison results">
          <header>
            <h2>{run.result?.summary}</h2>
            <p>
              <span className="diff-add">+{totals.added} words added</span> · <span className="diff-del">−{totals.removed} words removed</span>
            </p>
            <div className="tool-actions">
              {mode === 'pages' && (
                <label className="check">
                  <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Only pages with changes
                </label>
              )}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => downloadBlob(new Blob([report(diffs, a.source.status === 'ready' ? a.source.file.name : 'A', b.source.status === 'ready' ? b.source.file.name : 'B')], { type: 'text/plain;charset=utf-8' }), 'comparison-report.txt')}
              >
                <Download size={14} /> Download report
              </button>
            </div>
          </header>
          {visible.length === 0 && <p className="muted">No differences in the extracted text. Visual-only changes (images, colours, layout) are not detected by text comparison.</p>}
          {visible.map((d, i) => (
            <article key={i} className="compare-page">
              {mode === 'pages' && (
                <h3>
                  Page {d.pageA ?? d.pageB}
                  {d.pageA === null && ' (only in B)'}
                  {d.pageB === null && ' (only in A)'} · <span className="diff-add">+{d.added}</span> <span className="diff-del">−{d.removed}</span>
                </h3>
              )}
              <div className={mode === 'pages' ? 'compare-grid' : ''}>
                {mode === 'pages' && (
                  <div className="compare-thumbs">
                    {d.pageA && a.source.status === 'ready' ? <PageThumb doc={a.source.doc} pageNumber={d.pageA} width={150} /> : <span className="page-thumb" style={{ width: 150 }} />}
                    {d.pageB && b.source.status === 'ready' ? <PageThumb doc={b.source.doc} pageNumber={d.pageB} width={150} /> : <span className="page-thumb" style={{ width: 150 }} />}
                  </div>
                )}
                <p className="diff-text" dir="auto">
                  {d.parts.map((part, j) =>
                    part.added ? (
                      <ins key={j}>{part.value}</ins>
                    ) : part.removed ? (
                      <del key={j}>{part.value}</del>
                    ) : (
                      <span key={j}>{part.value.length > 600 && onlyChanged ? `${part.value.slice(0, 200)} … ${part.value.slice(-200)}` : part.value}</span>
                    ),
                  )}
                </p>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
