import { useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton, Segmented, checkRange } from '../../components/tools/controls'
import { AnchorPicker } from '../../components/tools/AnchorPicker'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { addWatermark, type Anchor } from '../../lib/pdf/stamp'
import { isWinAnsiText } from '../../lib/pdf/core'
import { renderTextImage } from '../../lib/textImage'
import { readBytes, toBlob, validateFile, withSuffix } from '../../lib/files'

export default function WatermarkTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [type, setType] = useState<'text' | 'image'>('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [image, setImage] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState(48)
  const [imageScale, setImageScale] = useState(40)
  const [color, setColor] = useState('#7c3aed')
  const [opacity, setOpacity] = useState(25)
  const [rotation, setRotation] = useState(45)
  const [anchor, setAnchor] = useState<Anchor>('center')
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('1')
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const parsed = scope === 'range' && pageCount ? checkRange(range, pageCount) : null
  const ready = type === 'text' ? text.trim().length > 0 : Boolean(image)

  function apply() {
    if (source.status !== 'ready') return
    void run.start(async ({ processing }) => {
      processing('Adding watermark…')
      const pages = scope === 'all' ? null : (parsed?.indices ?? [])
      let options: Parameters<typeof addWatermark>[1]
      if (type === 'image' && image) {
        const kind = await validateFile(image, ['png', 'jpg'])
        options = { image: { bytes: await readBytes(image), kind: kind as 'png' | 'jpg' }, imageScale: imageScale / 100 }
      } else if (isWinAnsiText(text)) {
        options = { text, fontSize, color }
      } else {
        // Non-Latin scripts (e.g. Persian): render with the browser's fonts as a crisp image.
        const rendered = await renderTextImage(text, { fontSize, color })
        options = { image: { bytes: rendered.bytes, kind: 'png' }, imageWidth: rendered.widthPt }
      }
      const bytes = await addWatermark(source.bytes, {
        ...options,
        opacity: opacity / 100,
        rotation,
        anchor,
        pages,
        password: source.password,
      })
      const count = pages ? pages.length : pageCount
      return {
        outputs: [{ name: withSuffix(source.file.name, '-watermarked', 'pdf'), blob: toBlob(bytes, 'application/pdf') }],
        summary: `Watermark added to ${count} page${count === 1 ? '' : 's'}.`,
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Change watermark" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="tool-options">
            <Segmented label="Watermark type" value={type} onChange={setType} options={[{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image' }]} />
            {type === 'text' ? (
              <>
                <Field label="Text" hint="Any language works, including Persian and Arabic.">
                  <input value={text} maxLength={120} onChange={(e) => setText(e.target.value)} />
                </Field>
                <Field label={`Font size: ${fontSize} pt`}>
                  <input type="range" min={10} max={160} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
                </Field>
                <Field label="Color">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Image (PNG or JPG)" error={imageError}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={async (e) => {
                      const picked = e.target.files?.[0] ?? null
                      setImageError(null)
                      if (!picked) return setImage(null)
                      try {
                        await validateFile(picked, ['png', 'jpg'], 10 * 1024 * 1024)
                        setImage(picked)
                      } catch (error) {
                        setImage(null)
                        setImageError(error instanceof Error ? error.message : 'Invalid image.')
                      }
                    }}
                  />
                </Field>
                <Field label={`Width: ${imageScale}% of page`}>
                  <input type="range" min={5} max={100} value={imageScale} onChange={(e) => setImageScale(Number(e.target.value))} />
                </Field>
              </>
            )}
            <Field label={`Opacity: ${opacity}%`}>
              <input type="range" min={5} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
            </Field>
            <Field label={`Rotation: ${rotation}°`}>
              <input type="range" min={-90} max={90} step={5} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
            </Field>
            <AnchorPicker value={anchor} onChange={setAnchor} />
            <Segmented label="Pages" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All pages' }, { value: 'range', label: 'Some pages' }]} />
            {scope === 'range' && (
              <Field label="Pages" hint="e.g. 1-3, 5" error={parsed?.error}>
                <input value={range} onChange={(e) => setRange(e.target.value)} />
              </Field>
            )}
          </div>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={apply} />
          <RunButton disabled={!ready || Boolean(parsed?.error) || run.busy} onClick={apply}>
            Add watermark
          </RunButton>
        </>
      )}
    </div>
  )
}
