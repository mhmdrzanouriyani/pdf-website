import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Reveal } from '../ui/Reveal'
import { BILLING_ENABLED, PLANS } from '../../config/plans'

export function Pricing({ standalone = false }: { standalone?: boolean }) {
  const Heading = standalone ? 'h1' : 'h2'
  return (
    <section className="pricing" id="pricing">
      <Reveal>
        <div className="section-copy">
          <p className="section-kicker">Pricing</p>
          <Heading>Start free. Grow when the work does.</Heading>
          <p>
            {BILLING_ENABLED
              ? 'Simple plans for individuals and teams.'
              : 'Everything available today is free. Pro and Team are planned — billing isn’t set up yet, so no payment is taken.'}
          </p>
        </div>
      </Reveal>
      <div className="pricing-grid">
        {PLANS.map((plan, index) => (
          <Reveal key={plan.id} delay={index * 70}>
            <article className={`price-card ${plan.featured ? 'is-featured' : ''} ${plan.available ? '' : 'is-unavailable'}`}>
              {plan.featured && <span className="price-badge">{plan.available ? 'Most popular' : 'Planned'}</span>}
              {!plan.featured && !plan.available && <span className="price-badge">Planned</span>}
              <h3>{plan.name}</h3>
              <p className="price-blurb">{plan.blurb}</p>
              <p className="price-amount">
                <strong>{plan.price}</strong>
                <span>{plan.cadence}</span>
              </p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={15} strokeWidth={2} />
                    {feature}
                  </li>
                ))}
              </ul>
              {plan.id === 'free' ? (
                <Link to="/workspace" className={`btn ${plan.featured ? 'btn-primary' : 'btn-outline'} btn-md`}>
                  Start using PDFLY
                </Link>
              ) : plan.available ? (
                <Link to="/signup" className={`btn ${plan.featured ? 'btn-primary' : 'btn-outline'} btn-md`}>
                  Choose {plan.name}
                </Link>
              ) : (
                <>
                  <button type="button" className="btn btn-outline btn-md" disabled aria-describedby={`unavail-${plan.id}`}>
                    Not available yet
                  </button>
                  <p id={`unavail-${plan.id}`} className="price-note">
                    Billing is not configured. Nothing can be purchased.
                  </p>
                </>
              )}
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
