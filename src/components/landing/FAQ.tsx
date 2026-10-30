import { useState } from 'react'
import { Reveal } from '../ui/Reveal'
import { FAQS } from '../../data/faq'

export function FAQ({ standalone = false }: { standalone?: boolean }) {
  const [open, setOpen] = useState(0)
  const Heading = standalone ? 'h1' : 'h2'

  return (
    <section className="faq" id="faq">
      <Reveal>
        <div className="section-copy">
          <p className="section-kicker">FAQ</p>
          <Heading>Questions, answered plainly.</Heading>
        </div>
      </Reveal>
      <div className="faq-list">
        {FAQS.map((item, index) => {
          const expanded = open === index
          return (
            <Reveal key={item.q} delay={index * 30}>
              <div className={`faq-item ${expanded ? 'is-open' : ''}`}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`faq-panel-${index}`}
                    id={`faq-btn-${index}`}
                    onClick={() => setOpen(expanded ? -1 : index)}
                  >
                    {item.q}
                    <span aria-hidden="true">{expanded ? '–' : '+'}</span>
                  </button>
                </h3>
                <div className="faq-panel" id={`faq-panel-${index}`} role="region" aria-labelledby={`faq-btn-${index}`} aria-hidden={!expanded}>
                  <p>{item.a}</p>
                </div>
              </div>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}
