import { useEffect, useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton } from '../../components/tools/controls'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { readMetadata, writeMetadata, type PdfMetadata } from '../../lib/pdf/security'
import { toBlob, withSuffix } from '../../lib/files'

const toLocal = (iso: string) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '')
const fromLocal = (value: string) => (value ? new Date(value).toISOString() : '')

export default function MetadataTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [meta, setMeta] = useState<PdfMetadata | null>(null)
  const [draft, setDraft] = useState<PdfMetadata | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    setMeta(null)
    setDraft(null)
    setLoadError(null)
    if (source.status !== 'ready') return
    readMetadata(source.bytes, source.password)
      .then((m) => {
        setMeta(m)
        setDraft(m)
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Could not read metadata.'))
  }, [source])

  const set = (key: keyof PdfMetadata) => (value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d))
  const changed = meta && draft && (Object.keys(meta) as (keyof PdfMetadata)[]).some((k) => meta[k] !== draft[k])

  function save(stripAll: boolean) {
    if (source.status !== 'ready' || !draft) return
    void run.start(async ({ processing }) => {
      processing(stripAll ? 'Removing metadata…' : 'Saving metadata…')
      const bytes = await writeMetadata(source.bytes, stripAll ? { stripAll: true, password: source.password } : { ...draft, password: source.password })
      const after = await readMetadata(bytes)
      return {
        outputs: [{ name: withSuffix(source.file.name, stripAll ? '-clean' : '-metadata', 'pdf'), blob: toBlob(bytes, 'application/pdf') }],
        summary: stripAll ? 'Removed the document information fields and the XMP metadata stream.' : 'Metadata updated.',
        details: stripAll
          ? [
              `Verified: title “${after.title || '—'}”, author “${after.author || '—'}”, XMP ${after.hasXmp ? 'still present' : 'removed'}.`,
              'Information can still exist elsewhere in a PDF — inside images (EXIF), embedded files, form fields, annotations or page content. Those are not changed.',
            ]
          : undefined,
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Edit again" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {loadError && <p className="tool-errors">{loadError}</p>}
      {draft && (
        <>
          <div className="tool-options is-two">
            <Field label="Title">
              <input value={draft.title} onChange={(e) => set('title')(e.target.value)} />
            </Field>
            <Field label="Author">
              <input value={draft.author} onChange={(e) => set('author')(e.target.value)} />
            </Field>
            <Field label="Subject">
              <input value={draft.subject} onChange={(e) => set('subject')(e.target.value)} />
            </Field>
            <Field label="Keywords" hint="Comma separated">
              <input value={draft.keywords} onChange={(e) => set('keywords')(e.target.value)} />
            </Field>
            <Field label="Creator (app)">
              <input value={draft.creator} onChange={(e) => set('creator')(e.target.value)} />
            </Field>
            <Field label="Producer">
              <input value={draft.producer} onChange={(e) => set('producer')(e.target.value)} />
            </Field>
            <Field label="Created">
              <input type="datetime-local" value={toLocal(draft.creationDate)} onChange={(e) => set('creationDate')(fromLocal(e.target.value))} />
            </Field>
            <Field label="Modified">
              <input type="datetime-local" value={toLocal(draft.modificationDate)} onChange={(e) => set('modificationDate')(fromLocal(e.target.value))} />
            </Field>
          </div>
          <p className="muted">XMP metadata stream: {draft.hasXmp ? 'present' : 'none'}. Empty fields are removed when you save.</p>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} />
          <div className="tool-actions">
            <RunButton disabled={!changed || run.busy} onClick={() => save(false)}>
              Save metadata
            </RunButton>
            <button type="button" className="btn btn-outline btn-lg" disabled={run.busy} onClick={() => save(true)}>
              Remove all metadata
            </button>
          </div>
        </>
      )}
    </div>
  )
}
