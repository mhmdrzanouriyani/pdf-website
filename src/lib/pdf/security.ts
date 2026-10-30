import { PDFDocument, PDFName, type PDFDict } from '@cantoo/pdf-lib'
import { loadPdf, PdfProcessingError, savePdf } from './core'

export type ProtectOptions = {
  userPassword: string
  /** Owner password unlocks full permissions. Defaults to a different random value so permissions are enforced. */
  ownerPassword?: string
  allowPrinting?: boolean
  allowCopying?: boolean
  allowModifying?: boolean
  /** Password of the input document, if it is already encrypted. */
  password?: string
}

export function validateNewPassword(password: string) {
  if (password.length < 4) return 'Use at least 4 characters.'
  if (password.length > 127) return 'Use at most 127 characters.'
  return null
}

function randomSecret() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Encrypts the document with AES-256 (PDF 2.0, revision 6). Passwords are never logged or stored. */
export async function protectPdf(bytes: Uint8Array, options: ProtectOptions) {
  const problem = validateNewPassword(options.userPassword)
  if (problem) throw new PdfProcessingError(problem)
  const doc = await loadPdf(bytes, { password: options.password })
  doc.encrypt({
    userPassword: options.userPassword,
    ownerPassword: options.ownerPassword || randomSecret(),
    algorithm: 'AES-256',
    permissions: {
      printing: options.allowPrinting === false ? false : 'highResolution',
      copying: options.allowCopying !== false,
      modifying: options.allowModifying !== false,
      annotating: options.allowModifying !== false,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: options.allowModifying !== false,
    },
  })
  return doc.save({ useObjectStreams: false })
}

/** Removes encryption using the password supplied by the user. No password guessing is attempted. */
export async function unlockPdf(bytes: Uint8Array, password: string) {
  const probe = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }).catch(() => null)
  if (!probe) throw new PdfProcessingError('This file could not be read as a PDF.')
  if (!probe.isEncrypted) throw new PdfProcessingError('This PDF is not encrypted — there is nothing to unlock.')
  const doc = await loadPdf(bytes, { password })
  return savePdf(doc)
}

export async function isEncrypted(bytes: Uint8Array) {
  const probe = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  return probe.isEncrypted
}

export type PdfMetadata = {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
  creationDate: string // ISO or ''
  modificationDate: string
  hasXmp: boolean
}

export async function readMetadata(bytes: Uint8Array, password?: string): Promise<PdfMetadata> {
  const doc = await loadPdf(bytes, { password })
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    creationDate: doc.getCreationDate()?.toISOString() ?? '',
    modificationDate: doc.getModificationDate()?.toISOString() ?? '',
    hasXmp: doc.catalog.has(PDFName.of('Metadata')),
  }
}

export type MetadataUpdate = Partial<Omit<PdfMetadata, 'hasXmp'>> & {
  /** Remove every Info dictionary entry and the XMP metadata stream. */
  stripAll?: boolean
  password?: string
}

/** The document Info dictionary (pdf-lib keeps the accessor private). */
function infoDict(doc: PDFDocument): PDFDict {
  return (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict()
}

const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped']

export async function writeMetadata(bytes: Uint8Array, update: MetadataUpdate) {
  const doc = await loadPdf(bytes, { password: update.password })
  if (update.stripAll) {
    const info = infoDict(doc)
    for (const key of INFO_KEYS) info.delete(PDFName.of(key))
    // Remove any custom keys too.
    for (const key of info.keys()) info.delete(key)
    // Document-level XMP packet.
    doc.catalog.delete(PDFName.of('Metadata'))
    return doc.save({ useObjectStreams: true, updateFieldAppearances: false })
  }
  const set = (value: string | undefined, apply: (v: string) => void, key: string) => {
    if (value === undefined) return
    if (value.trim()) apply(value.trim())
    else infoDict(doc).delete(PDFName.of(key))
  }
  set(update.title, (v) => doc.setTitle(v), 'Title')
  set(update.author, (v) => doc.setAuthor(v), 'Author')
  set(update.subject, (v) => doc.setSubject(v), 'Subject')
  set(update.keywords, (v) => doc.setKeywords(v.split(/\s*,\s*/).filter(Boolean)), 'Keywords')
  set(update.creator, (v) => doc.setCreator(v), 'Creator')
  set(update.producer, (v) => doc.setProducer(v), 'Producer')
  const date = (value: string | undefined, apply: (d: Date) => void, key: string) => {
    if (value === undefined) return
    if (!value) {
      infoDict(doc).delete(PDFName.of(key))
      return
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) throw new PdfProcessingError(`“${value}” is not a valid date.`)
    apply(parsed)
  }
  date(update.creationDate, (d) => doc.setCreationDate(d), 'CreationDate')
  date(update.modificationDate, (d) => doc.setModificationDate(d), 'ModDate')
  return savePdf(doc)
}
