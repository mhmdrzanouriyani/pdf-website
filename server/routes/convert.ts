import { Router } from 'express'
import multer from 'multer'
import JSZip from 'jszip'
import sanitizeHtml from 'sanitize-html'
import { config } from '../config.ts'
import { convertToPdf, detectLibreOffice, type OfficeInput } from '../convert/libreoffice.ts'
import { asyncHandler, HttpError, rateLimit } from '../lib/http.ts'

export const convertRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.office.maxFileBytes, files: 1, fields: 4 },
})

const REQUIRED_PART: Record<Exclude<OfficeInput, 'html'>, string> = {
  docx: 'word/document.xml',
  pptx: 'ppt/presentation.xml',
  xlsx: 'xl/workbook.xml',
}

convertRouter.get('/status', (_req, res) => {
  const office = detectLibreOffice()
  res.json({ available: office.available, version: office.version, maxFileBytes: config.office.maxFileBytes })
})

/**
 * Checks that an OOXML upload really is the claimed format (never trusting
 * name or MIME type) and is not an obvious zip bomb.
 */
async function validateOoxml(buffer: Buffer, kind: Exclude<OfficeInput, 'html'>) {
  if (buffer.subarray(0, 4).toString('latin1') !== 'PK\u0003\u0004') {
    throw new HttpError(415, 'bad_type', `This is not a valid .${kind} file.`)
  }
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: false })
  } catch {
    throw new HttpError(415, 'bad_type', `This .${kind} file is damaged and could not be opened.`)
  }
  const entries = Object.values(zip.files)
  if (entries.length > 10_000) throw new HttpError(415, 'bad_type', 'This file contains too many parts.')
  let uncompressed = 0
  for (const entry of entries) {
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
    uncompressed += size
  }
  if (uncompressed > 400 * 1024 * 1024) throw new HttpError(415, 'bad_type', 'This file expands to an unsafe size.')
  if (!zip.file('[Content_Types].xml') || !zip.file(REQUIRED_PART[kind])) {
    throw new HttpError(415, 'bad_type', `This file is not a valid .${kind} document.`)
  }
  if (zip.file('EncryptedPackage')) throw new HttpError(422, 'encrypted', 'Password-protected Office files cannot be converted.')
}

/**
 * Untrusted HTML is reduced to a safe subset: no scripts, frames, forms, styles
 * with url(), or remote resources. Only inline data: images are kept, so the
 * converter never fetches anything (no SSRF, no local file access).
 */
export function sanitizeUserHtml(html: string) {
  const clean = sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags.filter((tag) => tag !== 'a'),
      'a',
      'img',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'figure',
      'figcaption',
      'caption',
      'colgroup',
      'col',
      'u',
      's',
      'sub',
      'sup',
      'hr',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan', 'align'],
      th: ['colspan', 'rowspan', 'align', 'scope'],
      col: ['span', 'width'],
      '*': ['lang', 'dir'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['data'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    exclusiveFilter: (frame) => frame.tag === 'img' && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(frame.attribs.src ?? ''),
  })
  const titleMatch = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(html)
  const title = sanitizeHtml(titleMatch?.[1] ?? 'Document', { allowedTags: [], allowedAttributes: {} })
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
body{font-family:'DejaVu Sans','Liberation Sans',Arial,sans-serif;font-size:11pt;line-height:1.5;color:#111;margin:0}
h1,h2,h3{line-height:1.2}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 6px}img{max-width:100%}
</style></head><body>${clean}</body></html>`
}

convertRouter.post(
  '/to-pdf',
  rateLimit('convert', config.office.rateLimit),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const kind = String(req.body?.kind ?? '') as OfficeInput
    if (!['docx', 'pptx', 'xlsx', 'html'].includes(kind)) throw new HttpError(400, 'invalid', 'Unsupported conversion.')
    const file = req.file
    if (!file || file.size === 0) throw new HttpError(400, 'invalid', 'No file was uploaded, or the file is empty.')

    let input: Buffer
    if (kind === 'html') {
      const text = file.buffer.toString('utf8')
      if (text.includes('\u0000')) throw new HttpError(415, 'bad_type', 'This is not a text HTML file.')
      input = Buffer.from(sanitizeUserHtml(text), 'utf8')
    } else {
      await validateOoxml(file.buffer, kind)
      input = file.buffer
    }

    const pdf = await convertToPdf(input, kind)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', String(pdf.length))
    res.setHeader('Cache-Control', 'no-store')
    res.end(pdf)
    // Buffers are dropped here; nothing is written to disk outside the job's temp dir.
  }),
)
