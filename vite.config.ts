import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Runtime assets served from node_modules in dev and copied into the build, so
 * the app doesn't depend on a CDN for them:
 *  - pdf.js CMaps (CJK text), standard font data and WASM decoders;
 *  - the Tesseract OCR worker and its LSTM WebAssembly cores.
 */
type AssetGroup = { url: string; root: string; files: string[] }

function listFiles(root: string, dirs: string[]) {
  return dirs.flatMap((dir) => {
    const abs = path.join(root, dir)
    if (!fs.existsSync(abs)) return []
    return fs.readdirSync(abs).filter((name) => fs.statSync(path.join(abs, name)).isFile()).map((name) => `${dir}/${name}`)
  })
}

function staticAssets(): Plugin {
  const pdfjsRoot = path.resolve('node_modules/pdfjs-dist')
  const groups: AssetGroup[] = [
    { url: 'pdfjs', root: pdfjsRoot, files: listFiles(pdfjsRoot, ['cmaps', 'standard_fonts', 'wasm', 'iccs']) },
    { url: 'tesseract', root: path.resolve('node_modules/tesseract.js/dist'), files: ['worker.min.js'] },
    {
      url: 'tesseract',
      root: path.resolve('node_modules/tesseract.js-core'),
      files: ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
    },
  ]
  return {
    name: 'pdfly-static-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '')
        for (const group of groups) {
          if (!url.startsWith(`${group.url}/`)) continue
          const rel = url.slice(group.url.length + 1)
          // Only exact, allow-listed files are served (no directory traversal).
          if (!group.files.includes(rel)) continue
          const file = path.join(group.root, rel)
          res.setHeader('Cache-Control', 'public, max-age=86400')
          if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm')
          if (file.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript')
          fs.createReadStream(file).pipe(res)
          return
        }
        next()
      })
    },
    generateBundle() {
      for (const group of groups) {
        for (const rel of group.files) {
          const file = path.join(group.root, rel)
          if (fs.existsSync(file)) this.emitFile({ type: 'asset', fileName: `${group.url}/${rel}`, source: fs.readFileSync(file) })
        }
      }
    },
  }
}

const apiPort = Number(process.env.PDFLY_API_PORT ?? 8787)

// https://vite.dev/config/
export default defineConfig({
  base: '/pdf-website/',
  plugins: [react(), staticAssets()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
