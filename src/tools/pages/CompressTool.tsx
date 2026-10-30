import { useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { RunButton } from '../../components/tools/controls'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { canvasCodec, compressPdf, PRESETS, type CompressPreset } from '../../lib/pdf/compress'
import { toBlob, withSuffix } from '../../lib/files'
import { formatBytes } from '../../config/limits'

export default function CompressTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [preset, setPreset] = useState<CompressPreset>('recommended')

  function compress() {
    if (source.status !== 'ready') return
    void run.start(async ({ progress, processing, signal }) => {
      processing('Analysing images…')
      const report = await compressPdf(source.bytes, preset, canvasCodec, {
        password: source.password,
        signal,
        onProgress: (done, total) => progress({ done, total, label: 'Re-encoding images…' }),
      })
      if (report.unchanged) {
        return {
          outputs: [],
          summary: `This file could not be made smaller with “${PRESETS[preset].label}” (${formatBytes(report.originalSize)}). It is already well optimized${
            preset !== 'high' ? ' — try High compression' : ''
          }.`,
          details: [
            `${report.imagesFound} image${report.imagesFound === 1 ? '' : 's'} found. No file was created because the result was not smaller than the original.`,
          ],
        }
      }
      const saved = report.originalSize - report.newSize
      const pct = Math.round((saved / report.originalSize) * 1000) / 10
      return {
        outputs: [{ name: withSuffix(source.file.name, '-compressed', 'pdf'), blob: toBlob(report.bytes, 'application/pdf'), note: `−${pct}%` }],
        summary: `${formatBytes(report.originalSize)} → ${formatBytes(report.newSize)}: ${pct}% smaller (saved ${formatBytes(saved)}).`,
        details: [
          `Images re-encoded: ${report.imagesRecompressed} of ${report.imagesFound}${
            report.imagesSkipped ? ` (${report.imagesSkipped} kept as they were — already small, or a format that can’t be re-encoded safely)` : ''
          }.`,
          report.streamsDeflated ? `Uncompressed data streams compressed: ${report.streamsDeflated}.` : 'File structure packed into compressed object streams.',
          password(source.password),
        ].filter(Boolean) as string[],
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Try another level" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <fieldset className="preset-list">
            <legend>Compression level</legend>
            {(Object.keys(PRESETS) as CompressPreset[]).map((id) => (
              <label key={id} className={preset === id ? 'is-on' : ''}>
                <input type="radio" name="preset" checked={preset === id} onChange={() => setPreset(id)} />
                <span>
                  <strong>{PRESETS[id].label}</strong>
                  <em>{PRESETS[id].description}</em>
                </span>
              </label>
            ))}
          </fieldset>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={compress} />
          <RunButton disabled={run.busy} onClick={compress}>
            Compress PDF
          </RunButton>
        </>
      )}
    </div>
  )
}

function password(pw: string | undefined) {
  return pw !== undefined ? 'The original was password-protected; the compressed copy is not. Use Protect PDF to add a password again.' : null
}
