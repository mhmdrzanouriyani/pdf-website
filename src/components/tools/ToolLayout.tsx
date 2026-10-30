import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Cloud, Cpu, Monitor, Sparkles } from 'lucide-react'
import type { Processing, ToolDef } from '../../tools/registry'

const PROCESSING: Record<Processing, { label: string; text: string; icon: typeof Monitor }> = {
  browser: {
    label: 'Runs in your browser',
    text: 'Your files are processed on this device and are not uploaded anywhere.',
    icon: Monitor,
  },
  'browser-cdn': {
    label: 'Runs in your browser',
    text: 'Your pages are processed on this device. The OCR engine is served by PDFLY; the language data is downloaded once from cdn.jsdelivr.net (no document data is sent).',
    icon: Monitor,
  },
  server: {
    label: 'Processed on the PDFLY server',
    text: 'The file is uploaded to the PDFLY server you are using, converted with LibreOffice in a temporary folder, and deleted immediately after the PDF is returned.',
    icon: Cpu,
  },
  ai: {
    label: 'Uses AI',
    text: 'Text is extracted in your browser. The extracted text (not the PDF file) is sent to the PDFLY server and the AI provider it is configured with. Nothing is stored by PDFLY.',
    icon: Sparkles,
  },
}

export function ProcessingBadge({ processing }: { processing: Processing }) {
  const info = PROCESSING[processing]
  const Icon = info.icon
  return (
    <span className={`processing-badge is-${processing}`}>
      <Icon size={13} aria-hidden="true" /> {info.label}
    </span>
  )
}

export function ToolLayout({ tool, children }: { tool: ToolDef; children: ReactNode }) {
  const info = PROCESSING[tool.processing]
  const Icon = tool.icon
  const back = tool.category === 'ai' ? { to: '/ai', label: 'AI tools' } : { to: '/tools', label: 'All PDF tools' }
  return (
    <main className="tool-page" id="main">
      <div className="tool-page-inner">
        <Link to={back.to} className="ghost-link tool-back">
          <ArrowLeft size={15} /> {back.label}
        </Link>
        <header className="tool-head">
          <span className={`tool-icon ${tool.category === 'ai' ? 'is-ai' : ''}`}>
            <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <div>
            <h1>{tool.title}</h1>
            <p>{tool.description}</p>
            <ProcessingBadge processing={tool.processing} />
          </div>
        </header>
        <div className="tool-body">{children}</div>
        <aside className="tool-privacy">
          {tool.processing === 'server' ? <Cloud size={15} aria-hidden="true" /> : <info.icon size={15} aria-hidden="true" />}
          <p>{info.text}</p>
        </aside>
      </div>
    </main>
  )
}
