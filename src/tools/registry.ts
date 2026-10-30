import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import {
  BookOpenCheck,
  Brain,
  ClipboardList,
  Code,
  Combine,
  Crop,
  Eraser,
  FileImage,
  FileMinus,
  FileOutput,
  FileText,
  FileType2,
  GitCompareArrows,
  GraduationCap,
  Images,
  Info,
  Languages,
  LayoutGrid,
  ListOrdered,
  ListTree,
  LockKeyhole,
  LockKeyholeOpen,
  MessageSquareText,
  PenLine,
  Presentation,
  RotateCw,
  ScanText,
  Scissors,
  Shrink,
  Signature,
  SquareStack,
  Stamp,
  Table2,
  Wrench,
  FileDiff,
  type LucideIcon,
} from 'lucide-react'
import type { FileKind } from '../lib/files'

export type ToolCategory = 'organize' | 'optimize' | 'convert' | 'edit' | 'security' | 'ai'

/**
 * Where a tool's processing happens. Shown on every tool page so privacy
 * claims stay accurate:
 *  - browser: entirely in the user's browser, nothing is uploaded.
 *  - browser-cdn: in the browser, but the engine/model is downloaded from a CDN.
 *  - server: the file is sent to the PDFLY server (LibreOffice), then deleted.
 *  - ai: extracted text is sent to the PDFLY server and the configured AI provider.
 */
export type Processing = 'browser' | 'browser-cdn' | 'server' | 'ai'

export type ToolProps = {
  tool: ToolDef
  /** Document ids from the workspace (?doc= or ?docs=). */
  docIds: string[]
}

export type ToolDef = {
  slug: string
  title: string
  /** One line for cards and search results. */
  summary: string
  /** Longer text on the tool page. */
  description: string
  category: ToolCategory
  icon: LucideIcon
  keywords: string[]
  processing: Processing
  accepts: FileKind[]
  popular?: boolean
  component: LazyExoticComponent<ComponentType<ToolProps>>
}

export const CATEGORIES: { id: ToolCategory; title: string; description: string }[] = [
  { id: 'organize', title: 'Organize PDF', description: 'Merge, split, reorder and trim pages.' },
  { id: 'optimize', title: 'Optimize PDF', description: 'Make files smaller, fix damaged ones, make scans searchable.' },
  { id: 'convert', title: 'Convert', description: 'Move between PDF, images, text and Office formats.' },
  { id: 'edit', title: 'Edit PDF', description: 'Annotate, stamp, number, sign, compare and redact.' },
  { id: 'security', title: 'PDF Security', description: 'Passwords, permissions and metadata.' },
  { id: 'ai', title: 'AI Tools', description: 'Understand documents with an AI model you configure.' },
]

const T = (load: () => Promise<{ default: ComponentType<ToolProps> }>) => lazy(load)

export const TOOLS: ToolDef[] = [
  // ---------------- Organize ----------------
  {
    slug: 'merge-pdf',
    title: 'Merge PDF',
    summary: 'Combine several PDFs into one, in the order you choose.',
    description: 'Add two or more PDFs, drag them into order and join them into a single document. Every page of every file is kept.',
    category: 'organize',
    icon: Combine,
    keywords: ['combine', 'join', 'append', 'concatenate', 'put together', 'two pdfs', 'multiple'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/MergeTool')),
  },
  {
    slug: 'split-pdf',
    title: 'Split PDF',
    summary: 'Split by ranges or into single pages.',
    description: 'Split a PDF into several files: one per page, every N pages, or custom ranges such as 1-3, 4-8.',
    category: 'organize',
    icon: Scissors,
    keywords: ['separate', 'divide', 'break', 'cut', 'ranges', 'single pages', 'burst'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/SplitTool')),
  },
  {
    slug: 'organize-pdf',
    title: 'Organize PDF',
    summary: 'Reorder, rotate, duplicate and delete pages.',
    description: 'See every page as a thumbnail. Drag to reorder, rotate, duplicate or delete pages, then save a new PDF.',
    category: 'organize',
    icon: LayoutGrid,
    keywords: ['reorder', 'rearrange', 'sort pages', 'move pages', 'page order', 'duplicate', 'delete page'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/OrganizeTool')),
  },
  {
    slug: 'extract-pages',
    title: 'Extract PDF Pages',
    summary: 'Save selected pages as a new PDF.',
    description: 'Pick pages or ranges and export them into a new PDF. The original is not changed.',
    category: 'organize',
    icon: FileOutput,
    keywords: ['select pages', 'take pages', 'save pages', 'subset', 'export pages'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/ExtractPagesTool')),
  },
  {
    slug: 'remove-pages',
    title: 'Remove PDF Pages',
    summary: 'Delete the pages you don’t need.',
    description: 'Select pages to delete and download a PDF without them.',
    category: 'organize',
    icon: FileMinus,
    keywords: ['delete pages', 'remove a page', 'drop pages', 'erase page', 'blank page'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/RemovePagesTool')),
  },
  {
    slug: 'rotate-pdf',
    title: 'Rotate PDF',
    summary: 'Rotate all pages or just some by 90°, 180° or 270°.',
    description: 'Fix sideways or upside-down pages. The rotation is saved into the PDF.',
    category: 'organize',
    icon: RotateCw,
    keywords: ['turn', 'orientation', 'landscape', 'portrait', 'upside down', 'sideways', 'flip'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/RotateTool')),
  },
  {
    slug: 'crop-pdf',
    title: 'Crop PDF',
    summary: 'Trim page margins.',
    description: 'Set the margins to trim visually, then apply them to some or all pages. The crop is written into the PDF page boxes.',
    category: 'organize',
    icon: Crop,
    keywords: ['trim', 'margins', 'cut edges', 'crop box', 'whitespace'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/CropTool')),
  },

  // ---------------- Optimize ----------------
  {
    slug: 'compress-pdf',
    title: 'Compress PDF',
    summary: 'Reduce file size and see the real saving.',
    description: 'Re-compresses images and restructures the file. You see the original size, the new size and the actual reduction.',
    category: 'optimize',
    icon: Shrink,
    keywords: ['reduce size', 'smaller', 'shrink', 'optimize', 'make lighter', 'file too big', 'email'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/CompressTool')),
  },
  {
    slug: 'repair-pdf',
    title: 'Repair PDF',
    summary: 'Try to recover a damaged PDF.',
    description: 'Rebuilds the structure of malformed PDFs that other apps refuse to open. Not every file can be recovered.',
    category: 'optimize',
    icon: Wrench,
    keywords: ['fix', 'broken', 'corrupt', 'damaged', 'recover', 'won’t open'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/RepairTool')),
  },
  {
    slug: 'ocr-pdf',
    title: 'OCR PDF',
    summary: 'Make scanned PDFs searchable.',
    description: 'Recognises text in scanned pages with the Tesseract OCR engine, adds an invisible text layer and lets you download the text.',
    category: 'optimize',
    icon: ScanText,
    keywords: ['scan', 'scanned', 'recognize text', 'searchable', 'image to text', 'tesseract', 'copy text'],
    processing: 'browser-cdn',
    accepts: ['pdf'],
    component: T(() => import('./pages/OcrTool')),
  },

  // ---------------- Convert ----------------
  {
    slug: 'pdf-to-jpg',
    title: 'PDF to JPG',
    summary: 'Turn pages into JPG images.',
    description: 'Render all pages, one page or a range as JPG images at the quality you choose.',
    category: 'convert',
    icon: FileImage,
    keywords: ['image', 'picture', 'jpeg', 'export pages', 'convert to image', 'photo'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/PdfToImageTool').then((m) => ({ default: m.PdfToJpg }))),
  },
  {
    slug: 'pdf-to-png',
    title: 'PDF to PNG',
    summary: 'Turn pages into lossless PNG images.',
    description: 'Render all pages, one page or a range as sharp PNG images.',
    category: 'convert',
    icon: FileImage,
    keywords: ['image', 'picture', 'transparent', 'lossless', 'export pages', 'screenshot'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/PdfToImageTool').then((m) => ({ default: m.PdfToPng }))),
  },
  {
    slug: 'jpg-to-pdf',
    title: 'JPG to PDF',
    summary: 'Collect JPG photos into one PDF.',
    description: 'Order your images and choose page size, orientation, margins and fit.',
    category: 'convert',
    icon: Images,
    keywords: ['images to pdf', 'photos', 'pictures', 'jpeg', 'scan to pdf', 'combine images'],
    processing: 'browser',
    accepts: ['jpg'],
    popular: true,
    component: T(() => import('./pages/ImagesToPdfTool').then((m) => ({ default: m.JpgToPdf }))),
  },
  {
    slug: 'png-to-pdf',
    title: 'PNG to PDF',
    summary: 'Collect PNG images into one PDF.',
    description: 'Order your PNG images and choose page size, orientation, margins and fit.',
    category: 'convert',
    icon: Images,
    keywords: ['images to pdf', 'screenshots', 'pictures', 'png'],
    processing: 'browser',
    accepts: ['png'],
    component: T(() => import('./pages/ImagesToPdfTool').then((m) => ({ default: m.PngToPdf }))),
  },
  {
    slug: 'pdf-to-text',
    title: 'PDF to Text',
    summary: 'Extract the text as a .txt file.',
    description: 'Extracts selectable text page by page with basic reading order and paragraphs.',
    category: 'convert',
    icon: FileText,
    keywords: ['txt', 'extract text', 'copy text', 'plain text', 'get text'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/PdfToTextTool')),
  },
  {
    slug: 'pdf-to-word',
    title: 'PDF to Word',
    summary: 'Editable DOCX with paragraphs and headings.',
    description: 'Builds a real Word document from the PDF’s text, keeping paragraphs, likely headings, bold/italic runs and page breaks. Complex layouts and images are not reproduced.',
    category: 'convert',
    icon: FileType2,
    keywords: ['docx', 'word', 'doc', 'editable', 'microsoft word', 'convert pdf to word'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/PdfToWordTool')),
  },
  {
    slug: 'pdf-to-excel',
    title: 'PDF to Excel',
    summary: 'Pull tables into an XLSX workbook.',
    description: 'Detects rows and columns from the text positions on each page and writes them to an Excel workbook (one sheet per page).',
    category: 'convert',
    icon: Table2,
    keywords: ['xlsx', 'excel', 'spreadsheet', 'table', 'csv', 'data'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/PdfToExcelTool')),
  },
  {
    slug: 'word-to-pdf',
    title: 'Word to PDF',
    summary: 'Convert DOCX documents to PDF.',
    description: 'Converts .docx files with LibreOffice on the PDFLY server. The file is deleted right after conversion.',
    category: 'convert',
    icon: FileType2,
    keywords: ['docx', 'doc', 'word', 'microsoft word', 'document to pdf'],
    processing: 'server',
    accepts: ['docx'],
    popular: true,
    component: T(() => import('./pages/OfficeToPdfTool').then((m) => ({ default: m.WordToPdf }))),
  },
  {
    slug: 'powerpoint-to-pdf',
    title: 'PowerPoint to PDF',
    summary: 'Convert PPTX slides to PDF.',
    description: 'Converts .pptx presentations with LibreOffice on the PDFLY server. The file is deleted right after conversion.',
    category: 'convert',
    icon: Presentation,
    keywords: ['pptx', 'ppt', 'slides', 'presentation', 'deck'],
    processing: 'server',
    accepts: ['pptx'],
    component: T(() => import('./pages/OfficeToPdfTool').then((m) => ({ default: m.PowerPointToPdf }))),
  },
  {
    slug: 'excel-to-pdf',
    title: 'Excel to PDF',
    summary: 'Convert XLSX spreadsheets to PDF.',
    description: 'Converts .xlsx workbooks with LibreOffice on the PDFLY server, keeping sheet layout where possible.',
    category: 'convert',
    icon: Table2,
    keywords: ['xlsx', 'xls', 'spreadsheet', 'sheet', 'workbook'],
    processing: 'server',
    accepts: ['xlsx'],
    component: T(() => import('./pages/OfficeToPdfTool').then((m) => ({ default: m.ExcelToPdf }))),
  },
  {
    slug: 'html-to-pdf',
    title: 'HTML to PDF',
    summary: 'Turn an HTML file or snippet into a PDF.',
    description: 'Upload an .html file or paste HTML. It is sanitized first: scripts and remote resources are removed, so only the content you provide is rendered.',
    category: 'convert',
    icon: Code,
    keywords: ['web page', 'html', 'website', 'markup', 'htm'],
    processing: 'server',
    accepts: ['html'],
    component: T(() => import('./pages/OfficeToPdfTool').then((m) => ({ default: m.HtmlToPdf }))),
  },

  // ---------------- Edit ----------------
  {
    slug: 'edit-pdf',
    title: 'Edit PDF',
    summary: 'Add text, shapes, drawings, highlights and images.',
    description: 'Place new content on top of your pages: text, rectangles, ellipses, lines, freehand drawing, highlights and images. Existing text in the PDF is not rewritten.',
    category: 'edit',
    icon: PenLine,
    keywords: ['annotate', 'write on pdf', 'add text', 'draw', 'highlight', 'markup', 'insert image', 'fill'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/EditTool')),
  },
  {
    slug: 'add-watermark',
    title: 'Add Watermark',
    summary: 'Stamp text or an image on pages.',
    description: 'Add a text or image watermark with your choice of size, colour, opacity, rotation and position.',
    category: 'edit',
    icon: Stamp,
    keywords: ['stamp', 'confidential', 'draft', 'logo', 'brand', 'overlay'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/WatermarkTool')),
  },
  {
    slug: 'add-page-numbers',
    title: 'Add Page Numbers',
    summary: 'Number pages with your own format.',
    description: 'Choose the start number, pages, position, size, colour and a format such as “Page {n} of {total}”.',
    category: 'edit',
    icon: ListOrdered,
    keywords: ['numbering', 'paginate', 'page count', 'footer', 'header', 'bates'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/PageNumbersTool')),
  },
  {
    slug: 'sign-pdf',
    title: 'Sign PDF',
    summary: 'Draw, type or upload a signature and place it.',
    description: 'Add a visual signature to your document. This is an image of your signature, not a certificate-based digital signature.',
    category: 'edit',
    icon: Signature,
    keywords: ['signature', 'add a signature', 'e-sign', 'initials', 'autograph', 'sign document'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/SignTool')),
  },
  {
    slug: 'compare-pdf',
    title: 'Compare PDF',
    summary: 'See text differences between two PDFs.',
    description: 'Compares the extracted text of two PDFs page by page, highlights insertions and deletions, and shows the pages side by side.',
    category: 'edit',
    icon: GitCompareArrows,
    keywords: ['diff', 'difference', 'changes', 'versions', 'redline', 'what changed'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/CompareTool')),
  },
  {
    slug: 'redact-pdf',
    title: 'Redact PDF',
    summary: 'Permanently remove sensitive content.',
    description: 'Mark areas or search for text to black out. Affected pages are flattened to images so the hidden content is truly removed — not just covered.',
    category: 'edit',
    icon: Eraser,
    keywords: ['black out', 'censor', 'hide text', 'remove sensitive', 'privacy', 'anonymize', 'gdpr'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/RedactTool')),
  },

  // ---------------- Security ----------------
  {
    slug: 'protect-pdf',
    title: 'Protect PDF',
    summary: 'Encrypt with a password (AES-256).',
    description: 'Encrypt your PDF with AES-256 so it needs a password to open, and optionally restrict printing, copying and editing.',
    category: 'security',
    icon: LockKeyhole,
    keywords: ['password', 'encrypt', 'secure', 'lock', 'restrict', 'permissions'],
    processing: 'browser',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/ProtectTool')),
  },
  {
    slug: 'unlock-pdf',
    title: 'Unlock PDF',
    summary: 'Remove a password you know.',
    description: 'Removes encryption from a PDF when you provide its password. PDFLY never tries to guess passwords.',
    category: 'security',
    icon: LockKeyholeOpen,
    keywords: ['remove password', 'decrypt', 'unprotect', 'open locked'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/UnlockTool')),
  },
  {
    slug: 'pdf-metadata',
    title: 'PDF Metadata',
    summary: 'View, edit or strip title, author and dates.',
    description: 'Edit the document’s title, author, subject, keywords and dates, or remove the metadata fields PDFLY can reach.',
    category: 'security',
    icon: Info,
    keywords: ['properties', 'author', 'title', 'exif', 'remove metadata', 'privacy', 'info'],
    processing: 'browser',
    accepts: ['pdf'],
    component: T(() => import('./pages/MetadataTool')),
  },

  // ---------------- AI ----------------
  {
    slug: 'ai-summarizer',
    title: 'AI PDF Summarizer',
    summary: 'Short, medium or detailed summaries with page citations.',
    description: 'Summarize a PDF at the length you need. Long documents are condensed part by part first.',
    category: 'ai',
    icon: FileText,
    keywords: ['summary', 'summarize', 'tl;dr', 'brief', 'overview', 'abstract'],
    processing: 'ai',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/AiTool').then((m) => ({ default: m.SummarizerTool }))),
  },
  {
    slug: 'ask-pdf',
    title: 'Ask Your PDF',
    summary: 'Chat with a document and get cited answers.',
    description: 'Opens the document in the workspace with the AI Copilot, which answers from the relevant passages and cites pages.',
    category: 'ai',
    icon: MessageSquareText,
    keywords: ['chat', 'question', 'ask', 'chat with pdf', 'q&a', 'talk to pdf'],
    processing: 'ai',
    accepts: ['pdf'],
    popular: true,
    component: T(() => import('./pages/AiTool').then((m) => ({ default: m.AskTool }))),
  },
  {
    slug: 'ai-translate',
    title: 'PDF Translation',
    summary: 'Translate a document’s text into another language.',
    description: 'Translates the extracted text page by page into the language you pick. Layout is not preserved; you get a text/Markdown file.',
    category: 'ai',
    icon: Languages,
    keywords: ['translate', 'translation', 'language', 'english', 'persian', 'farsi', 'turkish', 'german'],
    processing: 'ai',
    accepts: ['pdf'],
    component: T(() => import('./pages/AiTool').then((m) => ({ default: m.TranslateTool }))),
  },
  {
    slug: 'ai-extract',
    title: 'Key Information Extraction',
    summary: 'Pull fields, dates, people and organizations.',
    description: 'Extracts structured information — key fields, dates and deadlines, people and organizations — that you can copy or download.',
    category: 'ai',
    icon: ListTree,
    keywords: ['extract', 'fields', 'data', 'invoice', 'contract', 'dates', 'deadlines', 'names', 'entities'],
    processing: 'ai',
    accepts: ['pdf'],
    component: T(() => import('./pages/AiTool').then((m) => ({ default: m.ExtractTool }))),
  },
  {
    slug: 'ai-study-guide',
    title: 'Study Guide Generator',
    summary: 'Headings, key concepts, definitions and review questions.',
    description: 'Turns a document into a structured study guide you can download as Markdown.',
    category: 'ai',
    icon: GraduationCap,
    keywords: ['study', 'notes', 'learn', 'exam', 'revision', 'student', 'course'],
    processing: 'ai',
    accepts: ['pdf'],
    component: T(() => import('./pages/AiTool').then((m) => ({ default: m.StudyGuideTool }))),
  },
  {
    slug: 'ai-flashcards',
    title: 'Flashcard Generator',
    summary: 'Review cards you can export to Anki.',
    description: 'Creates question-and-answer flashcards from a document. Review them here or export CSV (Anki) or JSON.',
    category: 'ai',
    icon: SquareStack,
    keywords: ['flashcards', 'anki', 'cards', 'memorize', 'quiz', 'study'],
    processing: 'ai',
    accepts: ['pdf'],
    component: T(() => import('./pages/AiTool').then((m) => ({ default: m.FlashcardsTool }))),
  },
  {
    slug: 'ai-qa',
    title: 'Question & Answer Generator',
    summary: 'Practice questions with answers and page references.',
    description: 'Generates question-and-answer pairs that test understanding of the document.',
    category: 'ai',
    icon: BookOpenCheck,
    keywords: ['questions', 'quiz', 'test', 'exam', 'practice', 'faq'],
    processing: 'ai',
    accepts: ['pdf'],
    component: T(() => import('./pages/AiTool').then((m) => ({ default: m.QaTool }))),
  },
  {
    slug: 'ai-compare',
    title: 'AI Document Comparison',
    summary: 'Explain how two documents differ in substance.',
    description: 'Asks the AI to compare two documents’ content: what they share, what differs and what only appears in one.',
    category: 'ai',
    icon: FileDiff,
    keywords: ['compare', 'differences', 'versions', 'contrast', 'two documents'],
    processing: 'ai',
    accepts: ['pdf'],
    component: T(() => import('./pages/AiTool').then((m) => ({ default: m.AiCompareTool }))),
  },
  {
    slug: 'ai-report',
    title: 'Meeting Notes & Report Extraction',
    summary: 'Decisions, action items, owners and due dates.',
    description: 'Reads meeting notes or reports and extracts the summary, participants, decisions, action items and open questions.',
    category: 'ai',
    icon: ClipboardList,
    keywords: ['meeting', 'minutes', 'action items', 'decisions', 'report', 'todo', 'tasks'],
    processing: 'ai',
    accepts: ['pdf'],
    component: T(() => import('./pages/AiTool').then((m) => ({ default: m.ReportTool }))),
  },
]

export const TOOL_BY_SLUG = new Map(TOOLS.map((tool) => [tool.slug, tool]))

export function toolsIn(category: ToolCategory) {
  return TOOLS.filter((tool) => tool.category === category)
}

export const BRAIN_ICON = Brain

/** Scores a tool against a free-text query (title, summary, keywords, category). */
export function scoreTool(tool: ToolDef, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const words = q.split(/\s+/).filter((w) => w.length > 1 && !['a', 'an', 'the', 'my', 'to', 'pdf', 'pdfs', 'file', 'document', 'in', 'of', 'into', 'from'].includes(w))
  const title = tool.title.toLowerCase()
  const hay = `${title} ${tool.summary.toLowerCase()} ${tool.keywords.join(' ').toLowerCase()} ${tool.category}`
  let score = 0
  if (title.includes(q)) score += 10
  if (tool.keywords.some((k) => q.includes(k.toLowerCase()))) score += 6
  for (const word of words) {
    if (title.includes(word)) score += 4
    else if (tool.keywords.some((k) => k.toLowerCase().includes(word))) score += 3
    else if (hay.includes(word)) score += 1
    else if (word.length > 4 && hay.includes(word.slice(0, -1))) score += 1 // crude stemming: "pages" → "page"
  }
  if (words.length === 0 && /pdf|file|document/.test(q)) score = 1
  return score
}

export function searchTools(query: string, category?: ToolCategory | 'all') {
  return TOOLS.filter((tool) => !category || category === 'all' || tool.category === category)
    .map((tool) => ({ tool, score: scoreTool(tool, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(Boolean(b.tool.popular)) - Number(Boolean(a.tool.popular)))
    .map((entry) => entry.tool)
}
