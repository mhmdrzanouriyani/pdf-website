import { useEffect, useState } from 'react'
import { Sparkle } from '../ui/Sparkle'
import { Reveal } from '../ui/Reveal'
import { useInView } from '../../hooks/useInView'
import { useTypewriter } from '../../hooks/useTypewriter'
import { findingsIntro, keyFindings } from '../../data/mock'
import { DocumentCanvas } from '../workspace/DocumentCanvas'

const question = 'What are the three most important findings in this document?'

export function AIShowcase() {
  const { ref, visible } = useInView<HTMLDivElement>(0.28)
  const [started, setStarted] = useState(false)
  const { output, done } = useTypewriter(findingsIntro, started, 16)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (visible) setStarted(true)
  }, [visible])

  useEffect(() => {
    if (!done) return
    if (shown >= keyFindings.length) return
    const id = window.setTimeout(() => setShown((value) => value + 1), 220)
    return () => window.clearTimeout(id)
  }, [done, shown])

  return (
    <section className="ai-section" id="ai">
      <Reveal>
        <div className="section-copy">
          <p className="section-kicker">
            <Sparkle size={13} />
            Copilot
          </p>
          <h2>Your documents can finally talk back.</h2>
          <p>Ask questions, extract insights and understand complex documents in seconds.</p>
          <p className="showcase-note">Illustrative example with a sample paper. In the workspace, answers come from your own document and cite its pages.</p>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <div className="ai-frame" ref={ref}>
          <div className="ai-frame-doc">
            <span>Open document</span>
            <DocumentCanvas pageIndex={0} zoom={0.9} />
          </div>
          <div className="ai-frame-chat" aria-label="AI conversation preview">
            <header>
              <Sparkle size={14} />
              AI Copilot · example
            </header>
            <div className="bubble is-user">{question}</div>
            <div className="bubble is-assistant">
              {output}
              {!done && <span className="caret" aria-hidden="true" />}
              {done && (
                <ol className="finding-list">
                  {keyFindings.slice(0, shown).map((finding) => (
                    <li key={finding.n}>
                      <strong>{finding.n}</strong>
                      <span>
                        <b>{finding.title}</b>
                        {finding.text}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
