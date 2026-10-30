import { Link } from 'react-router-dom'
import { Wordmark } from '../ui/Logo'

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Workspace', to: '/workspace' },
      { label: 'AI Copilot', to: '/#ai' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    title: 'Tools',
    links: [
      { label: 'All PDF tools', to: '/tools' },
      { label: 'AI tools', to: '/ai' },
      { label: 'Merge PDF', to: '/tools/merge-pdf' },
      { label: 'Compress PDF', to: '/tools/compress-pdf' },
      { label: 'PDF to Word', to: '/tools/pdf-to-word' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'FAQ', to: '/faq' },
      { label: 'Privacy & security', to: '/#security' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Wordmark />
          <p>Your documents. One intelligent workspace.</p>
        </div>
        <div className="site-footer-cols">
          {columns.map((column) => (
            <div key={column.title}>
              <h2>{column.title}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="site-footer-bottom">
        <p>© {new Date().getFullYear()} PDFLY</p>
        <p>Most tools run in your browser. Each tool shows where your file is processed.</p>
      </div>
    </footer>
  )
}
