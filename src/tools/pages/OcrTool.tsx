import { useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton, Segmented, checkRange } from '../../components/tools/controls'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { OCR_LANGUAGES, ocrPdf } from '../../lib/pdf/ocr'
import { toBlob, withSuffix } from '../../lib/files'
import { LIMITS } from '../../config/limits'

export default function OcrTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [languages, setLanguages] = useState<string[]>(['eng'])
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('1')
  const [skipText, setSkipText] = useState(true)
  const [preview, setPreview] = useState('')
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const parsed = scope === 'range' && pageCount ? checkRange(range, pageCount) : null
  const pages = scope === 'all' ? Array.from({ length: pageCount }, (_, i) => i) : (parsed?.indices ?? [])
  const tooMany = pages.length > LIMITS.maxOcrPages

  function toggleLanguage(code: string) {
    setLanguages((list) => (list.includes(code) ? list.filter((c) => c !== code) : list.length >= 3 ? list : [...list, code]))
  }

  function ocr() {
    if (source.status !== 'ready') return
    void run.start(async ({ progress, signal }) => {
      const result = await ocrPdf(source.bytes, source.doc, {
        languages,
        pages,
        skipTextPages: skipText,
        password: source.password,
        signal,
        onProgress: (p) =>
          progress({ done: Math.round((p.page + p.fraction) * 100), total: p.pages * 100, label: `${p.stage} — page ${Math.min(p.page + 1, p.pages)} of ${p.pages}` }),
      })
      if (result.processedPages === 0) {
        throw new Error('Every selected page already contains text, so there was nothing to OCR. Turn off “Skip pages that already have text” to force it.')
      }
      setPreview(result.text.slice(0, 5000))
      return {
        outputs: [
          { name: withSuffix(source.file.name, '-ocr', 'pdf'), blob: toBlob(result.pdf, 'application/pdf'), note: 'searchable' },
          { name: withSuffix(source.file.name, '-ocr', 'txt'), blob: new Blob([result.text], { type: 'text/plain;charset=utf-8' }), note: 'recognised text' },
        ],
        summary: `Recognised text on ${result.processedPages} page${result.processedPages === 1 ? '' : 's'}${result.meanConfidence !== null ? ` (average confidence ${result.meanConfidence}%)` : ''}.`,
        details: [
          result.skippedPages ? `${result.skippedPages} page${result.skippedPages === 1 ? '' : 's'} already had text and were left unchanged.` : '',
          'OCR can misread words, especially in low-quality scans, handwriting or unusual fonts. Check important text.',
        ].filter(Boolean),
      }
    })
  }

  if (run.phase === 'success' && run.result) {
    return (
      <div className="tool-stack">
        <ResultPanel result={run.result} onReset={run.reset} resetLabel="Run OCR again" />
        {preview && (
          <section className="text-preview" aria-label="Recognised text preview">
            <h2>Recognised text (preview)</h2>
            <pre dir="auto">{preview}</pre>
          </section>
        )}
      </div>
    )
  }
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <fieldset className="checks lang-grid">
            <legend>Document language(s) — up to 3</legend>
            {OCR_LANGUAGES.map((lang) => (
              <label key={lang.code} className="check">
                <input type="checkbox" checked={languages.includes(lang.code)} onChange={() => toggleLanguage(lang.code)} disabled={!languages.includes(lang.code) && languages.length >= 3} />
                {lang.label}
              </label>
            ))}
          </fieldset>
          <div className="tool-options">
            <Segmented label="Pages" value={scope} onChange={setScope} options={[{ value: 'all', label: `All ${pageCount}` }, { value: 'range', label: 'Some pages' }]} />
            {scope === 'range' && (
              <Field label="Pages" error={parsed?.error}>
                <input value={range} onChange={(e) => setRange(e.target.value)} />
              </Field>
            )}
            <label className="check">
              <input type="checkbox" checked={skipText} onChange={(e) => setSkipText(e.target.checked)} /> Skip pages that already have text
            </label>
          </div>
          {tooMany && (
            <p className="field-error" role="alert">
              OCR is limited to {LIMITS.maxOcrPages} pages per run in the browser. Choose a smaller range.
            </p>
          )}
          <p className="muted">The first run for each language downloads its OCR data (several MB). It runs on your device and can take a while for long documents.</p>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={ocr} />
          <RunButton disabled={languages.length === 0 || pages.length === 0 || tooMany || Boolean(parsed?.error) || run.busy} onClick={ocr}>
            Recognise text
          </RunButton>
        </>
      )}
    </div>
  )
}
