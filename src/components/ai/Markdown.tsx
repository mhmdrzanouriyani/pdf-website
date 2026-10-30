import { Fragment, type ReactNode } from 'react'

type Props = {
  text: string
  /** Called when the user clicks a page citation such as [p. 4]. */
  onCite?: (page: number) => void
}

const CITE_RE = /\[(?:([AB])\s+)?p(?:p|age)?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?\]/gi

/** Renders inline markdown (bold, italic, code, citations) as React nodes — never as raw HTML. */
function inline(text: string, onCite: Props['onCite'], keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[(?:[AB]\s+)?p(?:p|age)?\.?\s*\d+(?:\s*[-–]\s*\d+)?\])/gi
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyBase}-${i++}`
    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('[')) {
      CITE_RE.lastIndex = 0
      const cite = CITE_RE.exec(token)
      const page = cite ? Number(cite[2]) : NaN
      const label = token.slice(1, -1)
      nodes.push(
        onCite && cite && !cite[1] ? (
          <button key={key} type="button" className="cite" onClick={() => onCite(page)} aria-label={`Go to page ${page}`}>
            {label}
          </button>
        ) : (
          <span key={key} className="cite is-static">
            {label}
          </span>
        ),
      )
    } else nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ text, onCite }: Props) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      const key = `p-${blocks.length}`
      blocks.push(<p key={key}>{inline(paragraph.join(' '), onCite, key)}</p>)
      paragraph = []
    }
  }
  const flushList = () => {
    if (list) {
      const key = `l-${blocks.length}`
      const items = list.items.map((item, i) => <li key={i}>{inline(item, onCite, `${key}-${i}`)}</li>)
      blocks.push(list.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>)
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    if (/^-{3,}$/.test(line.trim()) || /^-{3}\s.*\s-{3}$/.test(line.trim())) {
      flushParagraph()
      flushList()
      const label = line.replace(/-{3}/g, '').trim()
      blocks.push(label ? <p key={`hr-${blocks.length}`} className="md-divider">{label}</p> : <hr key={`hr-${blocks.length}`} />)
      continue
    }
    if (heading) {
      flushParagraph()
      flushList()
      const level = heading[1].length
      const key = `h-${blocks.length}`
      const content = inline(heading[2], onCite, key)
      blocks.push(level <= 2 ? <h4 key={key}>{content}</h4> : <h5 key={key}>{content}</h5>)
      continue
    }
    if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      const listState = list as { ordered: boolean; items: string[] } | null
      if (!listState || listState.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list!.items.push((bullet ?? numbered)![1])
      continue
    }
    flushList()
    paragraph.push(line.trim())
  }
  flushParagraph()
  flushList()
  return <div className="md">{blocks.map((block, i) => <Fragment key={i}>{block}</Fragment>)}</div>
}
