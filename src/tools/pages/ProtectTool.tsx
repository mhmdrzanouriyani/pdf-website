import { useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton } from '../../components/tools/controls'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { protectPdf, validateNewPassword } from '../../lib/pdf/security'
import { toBlob, withSuffix } from '../../lib/files'

export default function ProtectTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [allowPrinting, setAllowPrinting] = useState(true)
  const [allowCopying, setAllowCopying] = useState(true)
  const [allowModifying, setAllowModifying] = useState(true)
  const [show, setShow] = useState(false)
  const problem = password ? validateNewPassword(password) : null
  const mismatch = confirm.length > 0 && confirm !== password

  function protect() {
    if (source.status !== 'ready') return
    // Passwords live only in component state and are passed straight to the encryption call — never logged or stored.
    const userPassword = password
    void run.start(async ({ processing }) => {
      processing('Encrypting with AES-256…')
      const bytes = await protectPdf(source.bytes, { userPassword, allowPrinting, allowCopying, allowModifying, password: source.password })
      return {
        outputs: [{ name: withSuffix(source.file.name, '-protected', 'pdf'), blob: toBlob(bytes, 'application/pdf') }],
        summary: 'Encrypted with AES-256. The password is required to open the file.',
        details: [
          'PDFLY does not keep your password — if you lose it, the file cannot be recovered.',
          !allowPrinting || !allowCopying || !allowModifying
            ? 'Permission restrictions are honoured by compliant PDF readers; they are not a substitute for the open password.'
            : 'All permissions are allowed once the file is opened.',
        ],
      }
    })
    setPassword('')
    setConfirm('')
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Protect another file" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="tool-options">
            <Field label="Password" error={problem}>
              <input type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Repeat password" error={mismatch ? 'The passwords do not match.' : null}>
              <input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
            </label>
            <fieldset className="checks">
              <legend>When opened with this password, allow:</legend>
              <label className="check">
                <input type="checkbox" checked={allowPrinting} onChange={(e) => setAllowPrinting(e.target.checked)} /> Printing
              </label>
              <label className="check">
                <input type="checkbox" checked={allowCopying} onChange={(e) => setAllowCopying(e.target.checked)} /> Copying text and images
              </label>
              <label className="check">
                <input type="checkbox" checked={allowModifying} onChange={(e) => setAllowModifying(e.target.checked)} /> Editing and annotating
              </label>
            </fieldset>
          </div>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} />
          <RunButton disabled={!password || Boolean(problem) || confirm !== password || run.busy} onClick={protect}>
            Protect PDF
          </RunButton>
        </>
      )}
    </div>
  )
}
