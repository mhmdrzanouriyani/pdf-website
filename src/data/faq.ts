import { LIMITS, formatBytes } from '../config/limits'

/** Answers describe what this build actually does — keep them in sync with the implementation. */
export const FAQS = [
  {
    q: 'Is PDFLY free?',
    a: 'Yes. All PDF tools are free to use and need no account. Paid plans are shown on the pricing page as planned options; billing is not set up yet, so nothing can be purchased.',
  },
  {
    q: 'Are my files uploaded?',
    a: 'Most tools (merge, split, organize, compress, convert to images/Word/Excel, edit, sign, redact, protect…) run entirely in your browser and never upload your file. Word/PowerPoint/Excel/HTML → PDF send the file to the PDFLY server, where LibreOffice converts it in a temporary folder that is deleted right after. Each tool page says where it runs.',
  },
  {
    q: 'How does the AI Copilot use my document?',
    a: 'Text is extracted from the PDF in your browser. When you ask something, the relevant text (not the PDF file) is sent to the PDFLY server and on to the AI provider configured by whoever runs the server. Answers cite page numbers so you can check them. If no AI provider is configured, AI features say so instead of inventing answers.',
  },
  {
    q: 'Where are my recent documents stored?',
    a: 'In your browser’s storage (IndexedDB) on this device only. They survive page reloads but are not synced to other devices or to your account. You can remove them one by one or clear them all in the workspace.',
  },
  {
    q: 'Can I chat with a scanned PDF?',
    a: 'Scanned pages are images with no text, so run OCR PDF first. OCR runs in your browser with the open-source Tesseract engine; the language data is downloaded the first time you use a language.',
  },
  {
    q: 'What file formats are supported?',
    a: 'PDF in and out, plus JPG/PNG → PDF, PDF → JPG/PNG/TXT/DOCX/XLSX, and DOCX/PPTX/XLSX/HTML → PDF (server with LibreOffice required).',
  },
  {
    q: 'Is there a file size limit?',
    a: `Browser tools accept files up to ${formatBytes(LIMITS.maxFileBytes)}; server conversions up to ${formatBytes(LIMITS.maxServerFileBytes)}. Very large documents can still be limited by your device’s memory.`,
  },
  {
    q: 'Is a drawn signature legally binding?',
    a: 'Sign PDF adds a visual signature (an image). It is not a certificate-based digital signature. Whether a visual signature is acceptable depends on your jurisdiction and the other party.',
  },
  {
    q: 'Can I use PDFLY on mobile?',
    a: 'Yes. The workspace switches to a tabbed layout (Documents, Viewer, Copilot) on small screens, and tools work with touch. Very large files are better handled on a desktop.',
  },
]
