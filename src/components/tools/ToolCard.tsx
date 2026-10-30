import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import type { ToolDef } from '../../tools/registry'

export function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon
  return (
    <Link to={`/tools/${tool.slug}`} className={`feature-card tool-link ${tool.category === 'ai' ? 'is-ai' : ''}`}>
      <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
      <span>
        <strong>{tool.title}</strong>
        <em>{tool.summary}</em>
      </span>
      <ArrowUpRight className="feature-arrow" size={15} aria-hidden="true" />
    </Link>
  )
}
