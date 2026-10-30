import { Brain, PenLine, Sparkles } from 'lucide-react'
import { Reveal } from '../ui/Reveal'

const pillars = [
  {
    id: 'understand',
    title: 'Understand',
    text: 'AI-powered document understanding.',
    icon: Brain,
    accent: true,
  },
  {
    id: 'transform',
    title: 'Transform',
    text: 'Convert, edit and organize documents.',
    icon: PenLine,
    accent: false,
  },
  {
    id: 'create',
    title: 'Create',
    text: 'Turn information into useful output.',
    icon: Sparkles,
    accent: true,
  },
]

export function Pillars() {
  return (
    <section className="pillars">
      <Reveal>
        <div className="section-copy">
          <p className="section-kicker">Position</p>
          <h2>More than PDF tools.</h2>
          <p>Utilities get a file from A to B. PDFLY is the place you stay to read, decide and finish the work.</p>
        </div>
      </Reveal>
      <div className="pillars-grid">
        {pillars.map((pillar, index) => (
          <Reveal key={pillar.id} delay={index * 80}>
            <article className={`pillar-card ${pillar.accent ? 'is-ai' : ''}`}>
              <pillar.icon size={20} strokeWidth={1.6} />
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
