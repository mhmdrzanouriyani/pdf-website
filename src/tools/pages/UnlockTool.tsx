import { useEffect, useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton } from '../../components/tools/controls'
import { useToolRun } from '../../hooks/useToolRun'
import { isEncrypted, unlockPdf } from '../../lib/pdf/security'
import { readBytes, toBlob, withSuffix } from '../../lib/files'
import { formatBytes } from '../../config/limits'
import { FileText, X } from 'lucide-react'

export default function UnlockTool(_props: ToolProps) {
  const run = useToolRun()
  const [file, setFile] = useState<File | null>(null)
  const [encrypted, setEncrypted] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')

  useEffect(() => {
    setEncrypted(null)
    if (!file) return
    let cancelled = false
    readBytes(file)
      .then(isEncrypted)
      .then((value) => !cancelled && setEncrypted(value))
      .catch(() => !cancelled && setEncrypted(null))
    return () => {
      cancelled = true
    }
  }, [file])

  function unlock() {
    if (!file) return
    const pw = password
    void run.start(async ({ processing }) => {
      processing('Decrypting…')
      const bytes = await unlockPdf(await readBytes(file), pw)
      return {
        outputs: [{ name: withSuffix(file.name, '-unlocked', 'pdf'), blob: toBlob(bytes, 'application/pdf') }],
        summary: 'Password removed. The new file opens without a password.',
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={() => { run.reset(); setFile(null); setPassword('') }} resetLabel="Unlock another file" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <div className="file-bar">
        <FileText size={20} strokeWidth={1.6} aria-hidden="true" />
        <span className="file-bar-meta">
          <strong>{file.name}</strong>
          <em>
            {formatBytes(file.size)}
            {encrypted === true && ' · encrypted'}
            {encrypted === false && ' · not encrypted'}
          </em>
        </span>
        <button type="button" className="icon-ghost" aria-label="Choose another file" onClick={() => { setFile(null); run.reset() }}>
          <X size={16} />
        </button>
      </div>
      {encrypted === false ? (
        <p className="muted">This PDF is not password-protected, so there is nothing to unlock.</p>
      ) : (
        <>
          <form
            className="tool-options"
            onSubmit={(event) => {
              event.preventDefault()
              if (password) unlock()
            }}
          >
            <Field label="Document password" hint="You must know the password. PDFLY does not try to guess or bypass it.">
              <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </form>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} />
          <RunButton disabled={!password || run.busy} onClick={unlock}>
            Unlock PDF
          </RunButton>
        </>
      )}
    </div>
  )
}
