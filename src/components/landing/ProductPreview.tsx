import { ChevronLeft, ChevronRight, FileUp, Minus, Plus, Search } from 'lucide-react'
import { Wordmark } from '../ui/Logo'
import { Sparkle } from '../ui/Sparkle'
import { DocumentCanvas } from '../workspace/DocumentCanvas'
import { documents, documentPages, overviewText } from '../../data/mock'

/**
 * Static illustration of the workspace for the landing page.
 * It uses a fictional sample document and is not interactive — the real
 * workspace lives at /workspace and works with the user's own files.
 */
export function ProductPreview() {
  return (
    <figure className="product-preview">
      <div className="ws ws-hero" aria-hidden="true" inert>
        <header className="ws-chrome">
          <Wordmark compact />
          <span>Workspace</span>
        </header>
        <div className="ws-body">
          <aside className="ws-sidebar">
            <p className="ws-sidebar-label">Documents</p>
            <span className="btn btn-primary btn-sm ws-upload">
              <FileUp size={15} strokeWidth={1.75} />
              Upload file
            </span>
            <div className="ws-recent">
              <span>Recent documents</span>
              <ul>
                {documents.map((doc, index) => (
                  <li key={doc.id}>
                    <span className={`ws-preview-doc ${index === 0 ? 'is-active' : ''}`}>
                      <strong>{doc.name.replace('.pdf', '')}</strong>
                      <em>
                        {doc.pages} pages · {doc.updated}
                      </em>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
          <section className="ws-viewer">
            <div className="ws-toolbar">
              <div className="ws-toolbar-group">
                <span className="ws-fake-btn">
                  <ChevronLeft size={16} />
                </span>
                <span>1 / {documentPages.length}</span>
                <span className="ws-fake-btn">
                  <ChevronRight size={16} />
                </span>
              </div>
              <div className="ws-toolbar-group">
                <span className="ws-fake-btn">
                  <Minus size={14} />
                </span>
                <span>100%</span>
                <span className="ws-fake-btn">
                  <Plus size={14} />
                </span>
              </div>
              <div className="ws-toolbar-group">
                <span className="ws-fake-btn">
                  <Search size={14} />
                </span>
              </div>
            </div>
            <div className="ws-stage">
              <DocumentCanvas pageIndex={0} zoom={1} />
            </div>
          </section>
          <aside className="copilot is-compact">
            <header className="copilot-head">
              <h3>
                <Sparkle size={14} />
                AI Copilot
              </h3>
              <p>Ask anything about your document.</p>
            </header>
            <div className="copilot-overview">
              <span>Overview</span>
              <p>{overviewText}</p>
            </div>
            <div className="copilot-actions">
              {['Summarize', 'Explain this document', 'Key points', 'Dates & deadlines'].map((label) => (
                <span key={label} className="chip">
                  {label}
                </span>
              ))}
            </div>
            <div className="copilot-thread" />
            <div className="copilot-form">
              <span className="copilot-fake-input">Ask anything about this PDF...</span>
            </div>
          </aside>
        </div>
      </div>
      <figcaption>Illustration with a sample document. Open the workspace to use your own files.</figcaption>
    </figure>
  )
}
