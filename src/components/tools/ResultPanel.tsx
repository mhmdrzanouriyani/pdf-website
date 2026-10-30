import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleCheck, Download, FileArchive, FolderOpen, RotateCcw } from 'lucide-react'
import type { RunResult } from '../../hooks/useToolRun'
import { downloadBlob } from '../../lib/files'
import { formatBytes } from '../../config/limits'
import { zipOutputs } from '../../lib/zip'
import { useDocuments } from '../../state/DocumentsContext'
import { useToast } from '../../state/ToastContext'

type ResultPanelProps = {
  result: RunResult
  onReset: () => void
  zipName?: string
  resetLabel?: string
}

/** Success state: only rendered once real output files exist. */
export function ResultPanel({ result, onReset, zipName = 'pdfly-files.zip', resetLabel = 'Start over' }: ResultPanelProps) {
  const navigate = useNavigate()
  const documents = useDocuments()
  const { notify } = useToast()
  const [zipping, setZipping] = useState(false)
  const outputs = result.outputs
  const firstPdf = outputs.find((output) => output.blob.type === 'application/pdf')

  async function downloadAll() {
    setZipping(true)
    try {
      downloadBlob(await zipOutputs(outputs), zipName)
    } catch {
      notify('The ZIP archive could not be created. Download the files one by one instead.', 'error')
    } finally {
      setZipping(false)
    }
  }

  async function openInWorkspace() {
    if (!firstPdf) return
    const file = new File([firstPdf.blob], firstPdf.name, { type: 'application/pdf' })
    const { added, errors } = await documents.addFiles([file])
    if (added[0]) navigate('/workspace', { state: { openId: added[0].id } })
    else notify(errors[0] ?? 'Could not open the result in the workspace.', 'error')
  }

  return (
    <section className="result-panel" aria-labelledby="result-title">
      <header>
        <CircleCheck size={20} aria-hidden="true" />
        <div>
          <h2 id="result-title">{outputs.length > 1 ? `${outputs.length} files ready` : outputs.length === 1 ? 'Your file is ready' : 'Done'}</h2>
          {result.summary && <p>{result.summary}</p>}
        </div>
      </header>
      {result.details && result.details.length > 0 && (
        <ul className="result-details">
          {result.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      {outputs.length > 0 && (
        <ul className="result-files">
          {outputs.slice(0, 200).map((output, index) => (
            <li key={`${output.name}-${index}`}>
              <span>
                <strong>{output.name}</strong>
                <em>
                  {formatBytes(output.blob.size)}
                  {output.note ? ` · ${output.note}` : ''}
                </em>
              </span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadBlob(output.blob, output.name)}>
                <Download size={14} /> Download
              </button>
            </li>
          ))}
          {outputs.length > 200 && <li className="muted">…and {outputs.length - 200} more (included in the ZIP).</li>}
        </ul>
      )}
      <div className="result-actions">
        {outputs.length === 1 && (
          <button type="button" className="btn btn-primary btn-md" onClick={() => downloadBlob(outputs[0].blob, outputs[0].name)}>
            <Download size={16} /> Download
          </button>
        )}
        {outputs.length > 1 && (
          <button type="button" className="btn btn-primary btn-md" onClick={downloadAll} disabled={zipping}>
            <FileArchive size={16} /> {zipping ? 'Creating ZIP…' : 'Download all (ZIP)'}
          </button>
        )}
        {firstPdf && outputs.length === 1 && (
          <button type="button" className="btn btn-outline btn-md" onClick={openInWorkspace}>
            <FolderOpen size={16} /> Open in workspace
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-md" onClick={onReset}>
          <RotateCcw size={15} /> {resetLabel}
        </button>
      </div>
    </section>
  )
}
