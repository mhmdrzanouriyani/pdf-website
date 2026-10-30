import { documentPages } from '../../data/mock'

type DocumentCanvasProps = {
  pageIndex: number
  zoom: number
}

export function DocumentCanvas({ pageIndex, zoom }: DocumentCanvasProps) {
  const page = documentPages[pageIndex] ?? documentPages[0]

  return (
    <article
      className="doc-page"
      style={{ transform: `scale(${zoom})` }}
      aria-label={`${page.title}, page ${pageIndex + 1}`}
    >
      <header className="doc-page-head">
        <span>{page.kicker}</span>
        <em>
          {pageIndex + 1} / {documentPages.length}
        </em>
      </header>
      <h2>{page.title}</h2>
      {page.byline && <p className="doc-byline">{page.byline}</p>}
      <p className="doc-lede">{page.subtitle}</p>
      {page.paragraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 24)}>{paragraph}</p>
      ))}
      {page.callout && <blockquote>{page.callout}</blockquote>}
      {page.figure && (
        <figure>
          <div className="doc-diagram" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <figcaption>{page.figure}</figcaption>
        </figure>
      )}
      <footer className="doc-page-foot">
        <span>Observatory Review</span>
        <span>{pageIndex + 1}</span>
      </footer>
    </article>
  )
}
