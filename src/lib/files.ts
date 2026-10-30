import { LIMITS, formatBytes } from '../config/limits'

export type FileKind = 'pdf' | 'jpg' | 'png' | 'docx' | 'pptx' | 'xlsx' | 'html'

export const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  jpg: 'JPG',
  png: 'PNG',
  docx: 'Word (.docx)',
  pptx: 'PowerPoint (.pptx)',
  xlsx: 'Excel (.xlsx)',
  html: 'HTML',
}

export const KIND_ACCEPT: Record<FileKind, string> = {
  pdf: 'application/pdf,.pdf',
  jpg: 'image/jpeg,.jpg,.jpeg',
  png: 'image/png,.png',
  docx: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  html: '.html,.htm,text/html',
}

const EXTENSIONS: Record<FileKind, string[]> = {
  pdf: ['pdf'],
  jpg: ['jpg', 'jpeg'],
  png: ['png'],
  docx: ['docx'],
  pptx: ['pptx'],
  xlsx: ['xlsx'],
  html: ['html', 'htm'],
}

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileValidationError'
  }
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value)
}

/** Detects a file's real type from its leading bytes. Never trusts name or MIME type alone. */
export function sniffKind(head: Uint8Array): 'pdf' | 'jpg' | 'png' | 'zip' | 'text' | null {
  // %PDF- may legally appear within the first 1024 bytes.
  const pdfSig = [0x25, 0x50, 0x44, 0x46, 0x2d]
  for (let i = 0; i <= Math.min(head.length - pdfSig.length, 1024); i += 1) {
    if (startsWith(head, pdfSig, i)) return 'pdf'
  }
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpg'
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return 'zip'
  // Treat as text if the sample has no NUL bytes.
  if (head.length > 0 && !head.subarray(0, 512).includes(0)) return 'text'
  return null
}

export function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : ''
}

/**
 * Validates a user file against the accepted kinds.
 * Checks emptiness, size limit, extension and the real content signature.
 */
export async function validateFile(
  file: File,
  accepted: FileKind[],
  maxBytes: number = LIMITS.maxFileBytes,
): Promise<FileKind> {
  const label = accepted.map((kind) => KIND_LABEL[kind]).join(', ')
  if (file.size === 0) throw new FileValidationError(`“${file.name}” is empty.`)
  if (file.size > maxBytes) {
    throw new FileValidationError(
      `“${file.name}” is ${formatBytes(file.size)}. The limit for this tool is ${formatBytes(maxBytes)}.`,
    )
  }
  const ext = extensionOf(file.name)
  const byExt = accepted.find((kind) => EXTENSIONS[kind].includes(ext))
  const head = new Uint8Array(await file.slice(0, 2048).arrayBuffer())
  const sniffed = sniffKind(head)

  const matches = (kind: FileKind) => {
    switch (kind) {
      case 'pdf':
        return sniffed === 'pdf'
      case 'jpg':
        return sniffed === 'jpg'
      case 'png':
        return sniffed === 'png'
      case 'docx':
      case 'pptx':
      case 'xlsx':
        return sniffed === 'zip' && EXTENSIONS[kind].includes(ext)
      case 'html':
        return sniffed === 'text' && EXTENSIONS.html.includes(ext)
    }
  }

  if (byExt && matches(byExt)) return byExt
  const bySignature = accepted.find((kind) => matches(kind))
  if (bySignature) return bySignature

  if (byExt) {
    throw new FileValidationError(
      `“${file.name}” has a .${ext} name but its contents are not a valid ${KIND_LABEL[byExt]} file. It may be damaged or renamed.`,
    )
  }
  throw new FileValidationError(`“${file.name}” is not supported here. Accepted: ${label}.`)
}

/** Removes path separators, control characters and reserved characters from a file name. */
export function safeFileName(name: string, fallback = 'document') {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, '')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
  return cleaned || fallback
}

export function baseName(name: string) {
  return safeFileName(name).replace(/\.[a-z0-9]{1,5}$/i, '')
}

export function withSuffix(name: string, suffix: string, ext: string) {
  return `${baseName(name)}${suffix}.${ext}`
}

export async function readBytes(file: Blob) {
  return new Uint8Array(await file.arrayBuffer())
}

/** Copies into a fresh ArrayBuffer so the result is a valid BlobPart (not a SharedArrayBuffer view). */
export function toBlob(bytes: Uint8Array, type: string) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type })
}

/** Triggers a browser download and revokes the temporary object URL afterwards. */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safeFileName(name)
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
