import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Reveal } from '../ui/Reveal'
import { Sparkle } from '../ui/Sparkle'
import { ToolCard } from '../tools/ToolCard'
import { CATEGORIES, TOOLS, toolsIn } from '../../tools/registry'

const POPULAR = TOOLS.filter((tool) => tool.popular && tool.category !== 'ai').slice(0, 8)

export function FeatureCategories() {
  return (
    <section className="features" id="ai-tools">
      <Reveal>
        <div className="section-copy">
          <p className="section-kicker">Tools</p>
          <h2>Everything you need for your documents.</h2>
          <p>AI for understanding. Classic PDF tools for the work around it. {TOOLS.length} tools, one place.</p>
        </div>
      </Reveal>

      <Reveal>
        <div className="popular-tools">
          <h3>Popular tools</h3>
          <ul className="tools-grid-list">
            {POPULAR.map((tool) => (
              <li key={tool.slug}>
                <ToolCard tool={tool} />
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      <div className="feature-groups">
        {CATEGORIES.map((category, index) => (
          <Reveal key={category.id} delay={index * 60} className={`feature-group ${category.id === 'ai' ? 'is-ai' : ''}`}>
            <h3>
              {category.id === 'ai' && <Sparkle size={14} />}
              {category.title}
            </h3>
            <ul>
              {toolsIn(category.id)
                .slice(0, 5)
                .map((tool) => (
                  <li key={tool.slug}>
                    <ToolCard tool={tool} />
                  </li>
                ))}
            </ul>
            <Link className="feature-more" to={category.id === 'ai' ? '/ai' : `/tools?category=${category.id}`}>
              All {category.title.toLowerCase()} <ArrowRight size={14} />
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
