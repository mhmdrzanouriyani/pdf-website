import { useState } from 'react'
import { FileText, X } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton } from '../../components/tools/controls'
import { useToolRun } from '../../hooks/useToolRun'
import { repairPdf } from '../../lib/pdf/repair'
import { PdfPasswordError } from '../../lib/pdf/core'
import { readBytes, toBlob, withSuffix } from '../../lib/files'
import { formatBytes } from '../../config/limits'

export default function RepairTool(_props: ToolProps) {
  const run = useToolRun()
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)

  function repair() {
    if (!file) return
    void run.start(async ({ processing }) => {
      processing('Analysing and rebuilding the file…')
      try {
        const result = await repairPdf(await readBytes(file), password || undefined)
        return {
          outputs: [{ name: withSuffix(file.name, '-repaired', 'pdf'), blob: toBlob(result.bytes, 'application/pdf'), note: `${result.pages} pages` }],
          summary: `Recovered a ${result.pages}-page document.`,
          details: [...result.notes, 'Check the result carefully: recovered files can be missing content that was damaged.'],
        }
      } catch (error) {
        if (error instanceof PdfPasswordError) setNeedsPassword(true)
        throw error
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={() => { run.reset(); setFile(null) }} resetLabel="Repair another file" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <div className="file-bar">
        <FileText size={20} strokeWidth={1.6} aria-hidden="true" />
        <span className="file-bar-meta">
          <strong>{file.name}</strong>
          <em>{formatBytes(file.size)}</em>
        </span>
        <button type="button" className="icon-ghost" aria-label="Choose another file" onClick={() => { setFile(null); run.reset() }}>
          <X size={16} />
        </button>
      </div>
      {needsPassword && (
        <div className="tool-options">
          <Field label="Document password">
            <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      )}
      <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={repair} />
      <RunButton disabled={run.busy} onClick={repair}>
        Repair PDF
      </RunButton>
    </div>
  )
}
