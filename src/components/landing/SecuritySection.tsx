import { Cpu, HardDrive, Monitor, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Reveal } from '../ui/Reveal'

const points = [
  {
    icon: Monitor,
    title: 'Most tools run on your device',
    text: 'Merging, splitting, compressing, editing, signing, redacting and converting to images, Word or Excel happen in your browser. The file is not uploaded.',
  },
  {
    icon: Cpu,
    title: 'Server only when needed',
    text: 'Office and HTML → PDF use LibreOffice on the PDFLY server. Files go to a temporary folder and are deleted right after conversion.',
  },
  {
    icon: Sparkles,
    title: 'AI sees text, not files',
    text: 'For AI features, extracted text is sent to the AI provider configured on the server. Answers cite pages so you can verify them.',
  },
  {
    icon: HardDrive,
    title: 'Recent files stay local',
    text: 'Recent documents are kept in your browser’s storage on this device. Remove them any time.',
  },
]

export function SecuritySection() {
  return (
    <section className="pillars" id="security">
      <Reveal>
        <div className="section-copy">
          <p className="section-kicker">Privacy & security</p>
          <h2>You can see where your files go.</h2>
          <p>
            Every tool shows whether it runs in your browser or on the server. <Link to="/privacy">Read the details</Link>.
          </p>
        </div>
      </Reveal>
      <div className="pillars-grid is-four">
        {points.map((point, index) => (
          <Reveal key={point.title} delay={index * 60}>
            <article className="pillar-card">
              <point.icon size={20} strokeWidth={1.6} />
              <h3>{point.title}</h3>
              <p>{point.text}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
