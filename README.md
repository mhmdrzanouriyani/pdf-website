# PDFLY — AI-native PDF workspace

React 19 + TypeScript + Vite frontend with a small Express API.
Most PDF tools run **entirely in the browser**; the server is only needed for
AI features, Office/HTML → PDF conversion (LibreOffice) and accounts.

## Quick start

```bash
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY or an OpenAI-compatible endpoint
npm run dev                 # API on :8787 + Vite on http://127.0.0.1:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | API server (watch) + Vite dev server |
| `npm run dev:web` / `npm run dev:server` | Run one side only |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `npm start` | Production: serves `dist/` + API from one Node process (`--production`) |
| `npm test` | Vitest: PDF operations, validation, retrieval, AI route, auth, security |
| `npm run typecheck` | Frontend + server type checks |
| `npm run lint` | oxlint |

Requirements: Node ≥ 20.19. Optional: [LibreOffice](https://www.libreoffice.org/) for Word/PowerPoint/Excel/HTML → PDF
(auto-detected; set `LIBREOFFICE_PATH` otherwise).

## Where things run

| Feature | Runs | Notes |
| --- | --- | --- |
| Viewer, merge, split, organize, extract, remove, rotate, crop | Browser | pdf.js + pdf-lib (`@cantoo/pdf-lib` fork) |
| Compress | Browser | Re-encodes images, deflates streams, object streams. Returns the original if nothing is gained |
| Repair | Browser | pdf.js tolerant parser rebuild, pdf-lib lenient fallback |
| OCR | Browser | Tesseract (self-hosted engine); language data from jsDelivr or `VITE_OCR_LANG_PATH` |
| PDF → JPG/PNG/TXT/DOCX/XLSX, JPG/PNG → PDF | Browser | DOCX via `docx`; XLSX via a minimal built-in writer |
| Edit, watermark, page numbers, sign, compare, redact | Browser | Redaction flattens affected pages to images (true removal) |
| Protect / unlock / metadata | Browser | AES-256 encryption; unlock requires the password |
| Word/PowerPoint/Excel/HTML → PDF | Server | LibreOffice in an isolated temp dir, deleted afterwards; HTML sanitized, no remote fetches |
| AI Copilot + AI tools | Server → AI provider | Only extracted text is sent; retrieval + page citations |
| Accounts | Server | scrypt hashes, hashed session tokens, httpOnly cookies, JSON file store |

## Architecture

```
src/
  config/        limits, plans
  lib/pdf/       core (load, geometry), pages, stamp, security, images, compress,
                 repair, ocr, redact, annotate, layout, pdfjs (rendering, text)
  lib/convert/   PDF → DOCX, PDF → tables
  lib/ai/        chunking + BM25 retrieval, task runner (full / retrieval / condensed / batched)
  tools/         registry.ts (single source of truth for nav, search and cards) + pages/*
  components/    viewer (pdf.js PDFViewer), workspace, tools (shared UI), editor, ai, landing
  state/         documents (IndexedDB), auth, toasts
server/
  ai/            provider abstraction (Anthropic, OpenAI-compatible) + prompts
  convert/       LibreOffice adapter
  auth/          store (swap for a database in production)
  routes/        /api/ai, /api/convert, /api/auth
tests/           Vitest suites
```

## Known limitations

- PDF → Word keeps text, headings, bold/italic and page breaks — not images, columns or exact layout.
- PDF → Excel detects tables from text positions; merged cells and scans need manual cleanup or OCR first.
- Edit PDF adds content on top of pages; it does not rewrite existing PDF text.
- Sign PDF creates a visual signature, not a certificate-based digital signature.
- Redaction converts affected pages to images (text on those pages becomes unselectable).
- The account store is a JSON file for a single server instance; use a real database for multi-instance deployments.
  Password reset links are printed to the server console in development (no email service is integrated).
- No billing integration: paid plans are shown as "planned".
- Recent documents live in this browser only (IndexedDB) and do not sync.
