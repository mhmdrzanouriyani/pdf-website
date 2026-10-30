import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')

/** A PDF whose page N contains the text "Page N" (and optional extra text). */
export async function makePdf(pages: number, options: { size?: [number, number]; rotate?: number[]; extra?: string } = {}) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage(options.size ?? [595, 842])
    page.drawText(`Page ${i + 1}`, { x: 72, y: 700, size: 24, font })
    if (options.extra) page.drawText(options.extra, { x: 72, y: 650, size: 12, font })
    if (options.rotate?.[i]) page.setRotation(degrees(options.rotate[i]))
  }
  return doc.save()
}

/** Text per page, read back with pdf.js (what a user would actually see). */
export async function textOf(bytes: Uint8Array, password?: string) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), password, isEvalSupported: false }).promise
  const out: string[] = []
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    out.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim())
  }
  await doc.loadingTask.destroy()
  return out
}

export async function info(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return {
    pages: doc.getPageCount(),
    rotations: doc.getPages().map((p) => p.getRotation().angle),
    sizes: doc.getPages().map((p) => {
      const box = p.getCropBox()
      return [Math.round(box.width), Math.round(box.height)]
    }),
    doc,
  }
}

export function fixture(name: string) {
  return new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', name)))
}
