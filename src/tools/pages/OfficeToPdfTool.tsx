import { useState } from 'react'
import { FileText, TriangleAlert, X } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton, Segmented } from '../../components/tools/controls'
import { useToolRun, type RunContext } from '../../hooks/useToolRun'
import { officeUnavailableReason, useServerStatus } from '../../hooks/useServerStatus'
import { ApiError } from '../../lib/api'
import { withSuffix, type FileKind } from '../../lib/files'
import { formatBytes, LIMITS } from '../../config/limits'

type Kind = Extract<FileKind, 'docx' | 'pptx' | 'xlsx' | 'html'>

/** Uploads with XMLHttpRequest so the progress bar reflects real bytes sent. */
function uploadForPdf(body: Blob, name: string, kind: Kind, ctx: RunContext) {
  return new Promise<Blob>((resolve, reject) => {
    const form = new FormData()
    form.append('kind', kind)
    form.append('file', body, name)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/convert/to-pdf')
    xhr.responseType = 'blob'
    xhr.timeout = 180_000
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) ctx.progress({ done: event.loaded, total: event.total, label: 'Uploading…' })
    }
    xhr.upload.onload = () => ctx.progress({ label: 'Converting with LibreOffice…' })
    xhr.onload = async () => {
      if (xhr.status === 200 && xhr.response instanceof Blob && xhr.response.type.includes('pdf')) {
        resolve(xhr.response)
        return
      }
      let message = `Conversion failed (${xhr.status}).`
      let code = 'error'
      try {
        const parsed = JSON.parse(await (xhr.response as Blob).text()) as { error?: { message?: string; code?: string } }
        message = parsed.error?.message ?? message
        code = parsed.error?.code ?? code
      } catch {
        if (xhr.status >= 500) message = 'The PDFLY server is not reachable. Start it with “npm run dev”.'
      }
      reject(new ApiError(xhr.status, code, message))
    }
    xhr.onerror = () => reject(new ApiError(0, 'unreachable', 'The PDFLY server is not reachable. Start it with “npm run dev”.'))
    xhr.ontimeout = () => reject(new ApiError(504, 'timeout', 'The conversion took too long.'))
    ctx.signal.addEventListener('abort', () => {
      xhr.abort()
      reject(new DOMException('Cancelled', 'AbortError'))
    })
    xhr.send(form)
  })
}

function OfficeToPdf({ kind }: ToolProps & { kind: Kind }) {
  const server = useServerStatus()
  const unavailable = officeUnavailableReason(server)
  const run = useToolRun()
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [html, setHtml] = useState('<h1>Hello</h1>\n<p>Paste or write your HTML here.</p>')

  function convert(source: Blob, name: string) {
    void run.start(async (ctx) => {
      ctx.processing('Uploading…')
      const pdf = await uploadForPdf(source, name, kind, ctx)
      return {
        outputs: [{ name: withSuffix(name, '', 'pdf'), blob: pdf }],
        summary: 'Converted with LibreOffice. The uploaded file was deleted from the server.',
        details:
          kind === 'html'
            ? ['Scripts, styles with remote URLs and external images were removed before rendering. Only inline (data:) images are kept.']
            : ['Fonts that are not installed on the server are substituted, which can change layout slightly.'],
      }
    })
  }

  if (run.phase === 'success' && run.result) {
    return <ResultPanel result={run.result} onReset={() => { run.reset(); setFile(null) }} resetLabel="Convert another file" />
  }

  const notice = unavailable && (
    <div className="tool-notice" role="status">
      <TriangleAlert size={16} aria-hidden="true" />
      <p>{unavailable}</p>
      <button type="button" className="chip" onClick={server.refresh}>
        Check again
      </button>
    </div>
  )

  if (kind === 'html') {
    return (
      <div className="tool-stack">
        {notice}
        <Segmented label="Source" value={mode} onChange={setMode} options={[{ value: 'file', label: 'Upload .html file' }, { value: 'paste', label: 'Paste HTML' }]} />
        {mode === 'paste' ? (
          <>
            <Field label="HTML" hint="Remote URLs (http://…) are not fetched; embed images as data: URIs.">
              <textarea className="code-input" rows={12} value={html} maxLength={2_000_000} onChange={(e) => setHtml(e.target.value)} />
            </Field>
            <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} />
            <RunButton disabled={Boolean(unavailable) || server.loading || !html.trim() || run.busy} onClick={() => convert(new Blob([html], { type: 'text/html' }), 'document.html')}>
              Convert to PDF
            </RunButton>
          </>
        ) : file ? (
          <>
            <FileBar file={file} onClear={() => { setFile(null); run.reset() }} />
            <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={() => convert(file, file.name)} />
            <RunButton disabled={Boolean(unavailable) || server.loading || run.busy} onClick={() => convert(file, file.name)}>
              Convert to PDF
            </RunButton>
          </>
        ) : (
          <FileDrop accepts={['html']} maxBytes={LIMITS.maxServerFileBytes} onFiles={([f]) => setFile(f.file)} disabled={Boolean(unavailable)} />
        )}
      </div>
    )
  }

  return (
    <div className="tool-stack">
      {notice}
      {file ? (
        <>
          <FileBar file={file} onClear={() => { setFile(null); run.reset() }} />
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={() => convert(file, file.name)} />
          <RunButton disabled={Boolean(unavailable) || server.loading || run.busy} onClick={() => convert(file, file.name)}>
            Convert to PDF
          </RunButton>
        </>
      ) : (
        <FileDrop accepts={[kind]} maxBytes={LIMITS.maxServerFileBytes} onFiles={([f]) => setFile(f.file)} disabled={Boolean(unavailable)} />
      )}
    </div>
  )
}

function FileBar({ file, onClear }: { file: File; onClear: () => void }) {
  return (
    <div className="file-bar">
      <FileText size={20} strokeWidth={1.6} aria-hidden="true" />
      <span className="file-bar-meta">
        <strong>{file.name}</strong>
        <em>{formatBytes(file.size)}</em>
      </span>
      <button type="button" className="icon-ghost" aria-label="Choose another file" onClick={onClear}>
        <X size={16} />
      </button>
    </div>
  )
}

export const WordToPdf = (props: ToolProps) => <OfficeToPdf {...props} kind="docx" />
export const PowerPointToPdf = (props: ToolProps) => <OfficeToPdf {...props} kind="pptx" />
export const ExcelToPdf = (props: ToolProps) => <OfficeToPdf {...props} kind="xlsx" />
export const HtmlToPdf = (props: ToolProps) => <OfficeToPdf {...props} kind="html" />
