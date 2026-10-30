import type { EditorElement } from '../../lib/pdf/annotate'
import { isWinAnsiText } from '../../lib/pdf/core'
import { renderTextImage } from '../../lib/textImage'

/** Renders non-Latin text elements to images (the standard PDF fonts can't encode them). */
export async function prepareForExport(elements: EditorElement[]) {
  return Promise.all(
    elements.map(async (el) => {
      if (el.kind !== 'text' || !el.text || isWinAnsiText(el.text)) return el
      const rendered = await renderTextImage(el.text, { fontSize: el.fontSize ?? 14, color: el.color, bold: false, font: 'Helvetica, Arial, Tahoma, "Noto Sans", sans-serif' })
      return { ...el, textImage: { bytes: rendered.bytes }, w: rendered.widthPt, h: rendered.heightPt }
    }),
  )
}
