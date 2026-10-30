import JSZip from 'jszip'
import { safeFileName } from './files'

/** Bundles outputs into a ZIP with safe, unique entry names (no paths, no traversal). */
export async function zipOutputs(files: { name: string; blob: Blob }[]) {
  const zip = new JSZip()
  const used = new Set<string>()
  for (const file of files) {
    let name = safeFileName(file.name).replace(/[/\\]/g, '-')
    if (used.has(name.toLowerCase())) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let n = 2
      while (used.has(`${stem}-${n}${ext}`.toLowerCase())) n += 1
      name = `${stem}-${n}${ext}`
    }
    used.add(name.toLowerCase())
    zip.file(name, file.blob)
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}
