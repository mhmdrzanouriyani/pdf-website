import { Suspense, useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { Navbar } from '../components/layout/Navbar'
import { Footer } from '../components/layout/Footer'
import { ToolLayout } from '../components/tools/ToolLayout'
import { TOOL_BY_SLUG } from '../tools/registry'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'

export function ToolPage() {
  const { slug = '' } = useParams()
  const location = useLocation()
  const tool = TOOL_BY_SLUG.get(slug)
  const params = new URLSearchParams(location.search)
  const docIds = (params.get('docs') ?? params.get('doc') ?? '').split(',').filter(Boolean)

  useEffect(() => {
    document.title = tool ? `${tool.title} — PDFLY` : 'Tool not found — PDFLY'
    window.scrollTo(0, 0)
  }, [tool])

  if (!tool) {
    return (
      <>
        <Navbar />
        <main className="tool-page">
          <div className="tool-page-inner not-found">
            <h1>That tool doesn’t exist.</h1>
            <p>
              Browse <Link to="/tools">all PDF tools</Link> or press Ctrl K to search.
            </p>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  const Tool = tool.component
  return (
    <>
      <Navbar />
      <ToolLayout tool={tool}>
        <ErrorBoundary key={slug}>
          <Suspense
            fallback={
              <p className="tool-loading" role="status">
                <LoaderCircle size={16} className="spin" /> Loading tool…
              </p>
            }
          >
            <Tool key={`${slug}-${docIds.join(',')}`} tool={tool} docIds={docIds} />
          </Suspense>
        </ErrorBoundary>
      </ToolLayout>
      <Footer />
    </>
  )
}
