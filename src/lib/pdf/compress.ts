import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
  type PDFDocument,
} from '@cantoo/pdf-lib'
import { zlibSync } from 'fflate'
import { loadPdf } from './core'

export type CompressPreset = 'max-quality' | 'recommended' | 'high'

export const PRESETS: Record<CompressPreset, { label: string; description: string; maxDim: number; quality: number; images: boolean }> = {
  'max-quality': {
    label: 'Maximum quality',
    description: 'Lossless: compresses uncompressed data and packs the file structure. Images are untouched.',
    maxDim: Infinity,
    quality: 1,
    images: false,
  },
  recommended: {
    label: 'Recommended',
    description: 'Re-encodes large images (max 1600 px, good JPEG quality) plus the lossless step.',
    maxDim: 1600,
    quality: 0.75,
    images: true,
  },
  high: {
    label: 'High compression',
    description: 'Smaller images (max 1100 px, lower JPEG quality). Best for sharing; photos look softer.',
    maxDim: 1100,
    quality: 0.55,
    images: true,
  },
}

export type CompressReport = {
  bytes: Uint8Array
  originalSize: number
  newSize: number
  imagesFound: number
  imagesRecompressed: number
  imagesSkipped: number
  streamsDeflated: number
  /** True when the result was not smaller and the original is returned unchanged. */
  unchanged: boolean
}

type ImageCodec = {
  encode: (pixels: { data: Uint8ClampedArray | ImageBitmap; width: number; height: number; gray?: boolean }, maxDim: number, quality: number) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>
}

const name = (value: string) => PDFName.of(value)

function filterNames(dict: PDFDict): string[] {
  const filter = dict.lookup(name('Filter'))
  if (filter instanceof PDFName) return [filter.decodeText()]
  if (filter instanceof PDFArray) return filter.asArray().map((item) => (item instanceof PDFName ? item.decodeText() : '?'))
  return []
}

/** Number of colour components if the image uses a colour space we can safely re-encode. */
function components(doc: PDFDocument, dict: PDFDict): 1 | 3 | null {
  const cs = dict.lookup(name('ColorSpace'))
  if (cs instanceof PDFName) {
    const v = cs.decodeText()
    if (v === 'DeviceRGB') return 3
    if (v === 'DeviceGray') return 1
    return null
  }
  if (cs instanceof PDFArray && cs.size() === 2) {
    const kind = cs.lookup(0)
    const profile = cs.lookup(1)
    if (kind instanceof PDFName && kind.decodeText() === 'ICCBased' && profile instanceof PDFRawStream) {
      const n = profile.dict.lookup(name('N'))
      if (n instanceof PDFNumber) return n.asNumber() === 3 ? 3 : n.asNumber() === 1 ? 1 : null
    }
  }
  void doc
  return null
}

function num(dict: PDFDict, key: string) {
  const value = dict.lookup(name(key))
  return value instanceof PDFNumber ? value.asNumber() : NaN
}

/**
 * Genuine PDF compression:
 *  1. (lossy presets) decodes JPEG and 8-bit Flate RGB/Gray images, downsamples
 *     them and re-encodes as JPEG — only when that actually makes them smaller;
 *  2. deflates any uncompressed streams;
 *  3. saves with object streams (compact cross-reference structure).
 * If the final file is not smaller, the original bytes are returned untouched.
 */
export async function compressPdf(
  input: Uint8Array,
  preset: CompressPreset,
  codec: ImageCodec | null,
  options: { password?: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<CompressReport> {
  const settings = PRESETS[preset]
  const doc = await loadPdf(input, { password: options.password })
  const context = doc.context
  const objects = context.enumerateIndirectObjects()
  const images = objects.filter(
    ([, obj]) => obj instanceof PDFRawStream && obj.dict.lookup(name('Subtype')) === name('Image'),
  ) as [PDFRef, PDFRawStream][]

  let recompressed = 0
  let skipped = 0
  if (settings.images && codec) {
    for (const [index, [ref, stream]] of images.entries()) {
      if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      options.onProgress?.(index, images.length)
      const dict = stream.dict
      try {
        const width = num(dict, 'Width')
        const height = num(dict, 'Height')
        const bpc = num(dict, 'BitsPerComponent')
        const filters = filterNames(dict)
        const comps = components(doc, dict)
        const isMask = dict.lookup(name('ImageMask')) !== undefined || dict.lookup(name('Decode')) !== undefined
        if (!comps || isMask || bpc !== 8 || !(width > 0 && height > 0) || width * height < 64 * 64) {
          skipped += 1
          continue
        }
        let encoded: { bytes: Uint8Array; width: number; height: number } | null = null
        if (filters.length === 1 && filters[0] === 'DCTDecode') {
          const bitmap = await createImageBitmap(new Blob([new Uint8Array(stream.contents)], { type: 'image/jpeg' }))
          encoded = await codec.encode({ data: bitmap, width: bitmap.width, height: bitmap.height }, settings.maxDim, settings.quality)
          bitmap.close()
        } else if (filters.every((f) => f === 'FlateDecode') && filters.length <= 1) {
          const params = dict.lookup(name('DecodeParms'))
          if (params instanceof PDFDict && num(params, 'Predictor') > 1) {
            skipped += 1
            continue
          }
          const raw = filters.length ? decodePDFRawStream(stream).decode() : stream.contents
          if (raw.length < width * height * comps) {
            skipped += 1
            continue
          }
          const rgba = new Uint8ClampedArray(width * height * 4)
          for (let i = 0, p = 0; i < width * height; i += 1, p += comps) {
            rgba[i * 4] = raw[p]
            rgba[i * 4 + 1] = comps === 3 ? raw[p + 1] : raw[p]
            rgba[i * 4 + 2] = comps === 3 ? raw[p + 2] : raw[p]
            rgba[i * 4 + 3] = 255
          }
          encoded = await codec.encode({ data: rgba, width, height, gray: comps === 1 }, settings.maxDim, settings.quality)
        } else {
          skipped += 1
          continue
        }
        if (!encoded || encoded.bytes.length >= stream.contents.length * 0.9) {
          skipped += 1
          continue
        }
        const newDict = context.obj({}) as PDFDict
        for (const [key, value] of dict.entries()) newDict.set(key, value)
        newDict.set(name('Filter'), name('DCTDecode'))
        newDict.delete(name('DecodeParms'))
        newDict.set(name('Width'), PDFNumber.of(encoded.width))
        newDict.set(name('Height'), PDFNumber.of(encoded.height))
        newDict.set(name('ColorSpace'), name('DeviceRGB'))
        newDict.set(name('BitsPerComponent'), PDFNumber.of(8))
        newDict.set(name('Length'), PDFNumber.of(encoded.bytes.length))
        context.assign(ref, PDFRawStream.of(newDict, encoded.bytes))
        recompressed += 1
      } catch {
        skipped += 1
      }
    }
    options.onProgress?.(images.length, images.length)
  } else {
    skipped = images.length
  }

  // Lossless: deflate streams that were stored without any filter.
  let deflated = 0
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    if (obj.dict.lookup(name('Filter')) !== undefined || obj.contents.length < 256) continue
    if (obj.dict.lookup(name('Type')) === name('XRef')) continue
    const packed = zlibSync(obj.contents, { level: 9 })
    if (packed.length < obj.contents.length * 0.95) {
      const dict = context.obj({}) as PDFDict
      for (const [key, value] of obj.dict.entries()) dict.set(key, value)
      dict.set(name('Filter'), name('FlateDecode'))
      dict.set(name('Length'), PDFNumber.of(packed.length))
      context.assign(ref, PDFRawStream.of(dict, packed))
      deflated += 1
    }
  }

  const out = await doc.save({ useObjectStreams: true })
  const unchanged = out.length >= input.length
  return {
    bytes: unchanged ? input : out,
    originalSize: input.length,
    newSize: unchanged ? input.length : out.length,
    imagesFound: images.length,
    imagesRecompressed: unchanged ? 0 : recompressed,
    imagesSkipped: skipped,
    streamsDeflated: unchanged ? 0 : deflated,
    unchanged,
  }
}

/** Browser image codec: downsample with a canvas and encode as JPEG. */
export const canvasCodec: ImageCodec = {
  async encode(pixels, maxDim, quality) {
    const scale = Math.min(1, maxDim / Math.max(pixels.width, pixels.height))
    const width = Math.max(1, Math.round(pixels.width * scale))
    const height = Math.max(1, Math.round(pixels.height * scale))
    let source: CanvasImageSource
    if (pixels.data instanceof Uint8ClampedArray) {
      const full = document.createElement('canvas')
      full.width = pixels.width
      full.height = pixels.height
      full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0)
      source = full
    } else {
      source = pixels.data
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    canvas.width = 0
    if (source instanceof HTMLCanvasElement) source.width = 0
    if (!blob) return null
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
  },
}
