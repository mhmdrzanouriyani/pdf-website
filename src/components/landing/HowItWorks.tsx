import { Reveal } from '../ui/Reveal'

const steps = [
  {
    n: '01',
    title: 'Upload',
    text: 'Drop your document into PDFLY.',
  },
  {
    n: '02',
    title: 'Work',
    text: 'Edit, convert or ask AI.',
  },
  {
    n: '03',
    title: 'Done',
    text: 'Download or continue working.',
  },
]

export function HowItWorks() {
  return (
    <section className="how" id="how">
      <Reveal>
        <div className="section-copy">
          <p className="section-kicker">How it works</p>
          <h2>Upload. Understand. Done.</h2>
          <p>A short path from a file on your desk to an answer you can use.</p>
        </div>
      </Reveal>
      <div className="how-grid">
        {steps.map((step, index) => (
          <Reveal key={step.n} delay={index * 70} className="how-step">
            <span>{step.n}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
