import type { ReactNode } from 'react'
import type { AiTask } from '../../lib/ai/run'

type Cite = ((page: number) => void) | undefined

type Dates = { items?: { date?: string; iso?: string | null; description?: string; kind?: string; page?: number }[] }
type Entities = {
  people?: { name?: string; role?: string | null; pages?: number[] }[]
  organizations?: { name?: string; type?: string; context?: string; pages?: number[] }[]
}
type Extract = { documentType?: string; fields?: { label?: string; value?: string; page?: number }[]; notes?: string | null }
type QA = { items?: { question?: string; answer?: string; page?: number }[] }
type Cards = { cards?: { front?: string; back?: string; page?: number }[] }
type Report = {
  title?: string
  date?: string | null
  participants?: string[]
  summary?: string
  decisions?: { text?: string; page?: number }[]
  actionItems?: { task?: string; owner?: string | null; due?: string | null; page?: number }[]
  openQuestions?: { text?: string; page?: number }[]
}

function PageLink({ page, onCite }: { page?: number; onCite: Cite }) {
  if (!page || !Number.isFinite(page)) return null
  return onCite ? (
    <button type="button" className="cite" onClick={() => onCite(page)} aria-label={`Go to page ${page}`}>
      p. {page}
    </button>
  ) : (
    <span className="cite is-static">p. {page}</span>
  )
}

const arr = <T,>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : [])

/** Renders the JSON returned by structured AI tasks as readable lists and tables. */
export function StructuredResult({ task, data, onCite }: { task: AiTask; data: unknown; onCite?: Cite }) {
  const empty = (label: string) => <p className="muted">{label}</p>
  let body: ReactNode = null
  switch (task) {
    case 'dates': {
      const items = arr((data as Dates)?.items)
      body = items.length ? (
        <ul className="sr-list">
          {items.map((item, i) => (
            <li key={i}>
              <strong>{item.date}</strong>
              {item.kind && <span className="tag">{item.kind}</span>} {item.description} <PageLink page={item.page} onCite={onCite} />
            </li>
          ))}
        </ul>
      ) : (
        empty('No dates or deadlines were found.')
      )
      break
    }
    case 'entities': {
      const d = data as Entities
      const people = arr(d?.people)
      const orgs = arr(d?.organizations)
      body = (
        <>
          <h5>People</h5>
          {people.length ? (
            <ul className="sr-list">
              {people.map((p, i) => (
                <li key={i}>
                  <strong>{p.name}</strong>
                  {p.role ? ` — ${p.role}` : ''} {arr(p.pages).slice(0, 4).map((pg) => <PageLink key={pg} page={pg} onCite={onCite} />)}
                </li>
              ))}
            </ul>
          ) : (
            empty('No people found.')
          )}
          <h5>Organizations</h5>
          {orgs.length ? (
            <ul className="sr-list">
              {orgs.map((o, i) => (
                <li key={i}>
                  <strong>{o.name}</strong>
                  {o.type && <span className="tag">{o.type}</span>} {o.context} {arr(o.pages).slice(0, 4).map((pg) => <PageLink key={pg} page={pg} onCite={onCite} />)}
                </li>
              ))}
            </ul>
          ) : (
            empty('No organizations found.')
          )}
        </>
      )
      break
    }
    case 'extract': {
      const d = data as Extract
      const fields = arr(d?.fields)
      body = (
        <>
          {d?.documentType && (
            <p>
              <span className="tag">{d.documentType}</span>
            </p>
          )}
          {fields.length ? (
            <table className="sr-table">
              <tbody>
                {fields.map((f, i) => (
                  <tr key={i}>
                    <th scope="row">{f.label}</th>
                    <td>
                      {f.value} <PageLink page={f.page} onCite={onCite} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            empty('No fields were extracted.')
          )}
          {d?.notes && <p className="muted">{d.notes}</p>}
        </>
      )
      break
    }
    case 'qa': {
      const items = arr((data as QA)?.items)
      body = items.length ? (
        <ol className="sr-list">
          {items.map((item, i) => (
            <li key={i}>
              <strong>{item.question}</strong>
              <br />
              {item.answer} <PageLink page={item.page} onCite={onCite} />
            </li>
          ))}
        </ol>
      ) : (
        empty('No questions were generated.')
      )
      break
    }
    case 'flashcards': {
      const cards = arr((data as Cards)?.cards)
      body = cards.length ? (
        <ol className="sr-list">
          {cards.map((card, i) => (
            <li key={i}>
              <strong>{card.front}</strong>
              <br />
              {card.back} <PageLink page={card.page} onCite={onCite} />
            </li>
          ))}
        </ol>
      ) : (
        empty('No flashcards were generated.')
      )
      break
    }
    case 'report': {
      const r = data as Report
      body = (
        <>
          {r?.title && <h5>{r.title}</h5>}
          {r?.date && <p className="muted">{r.date}</p>}
          {r?.summary && <p>{r.summary}</p>}
          {arr(r?.participants).length > 0 && (
            <p>
              <strong>Participants:</strong> {arr(r.participants).join(', ')}
            </p>
          )}
          <h5>Decisions</h5>
          {arr(r?.decisions).length ? (
            <ul className="sr-list">
              {arr(r.decisions).map((d, i) => (
                <li key={i}>
                  {d.text} <PageLink page={d.page} onCite={onCite} />
                </li>
              ))}
            </ul>
          ) : (
            empty('None recorded.')
          )}
          <h5>Action items</h5>
          {arr(r?.actionItems).length ? (
            <ul className="sr-list">
              {arr(r.actionItems).map((a, i) => (
                <li key={i}>
                  {a.task}
                  {a.owner ? <span className="tag">{a.owner}</span> : null}
                  {a.due ? <span className="tag">due {a.due}</span> : null} <PageLink page={a.page} onCite={onCite} />
                </li>
              ))}
            </ul>
          ) : (
            empty('None recorded.')
          )}
          {arr(r?.openQuestions).length > 0 && (
            <>
              <h5>Open questions</h5>
              <ul className="sr-list">
                {arr(r.openQuestions).map((q, i) => (
                  <li key={i}>
                    {q.text} <PageLink page={q.page} onCite={onCite} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )
      break
    }
    default:
      body = <pre className="sr-raw">{JSON.stringify(data, null, 2)}</pre>
  }
  return <div className="structured">{body}</div>
}

const p = (page?: number) => (page ? ` (p. ${page})` : '')

/** Plain-text/Markdown version of a structured result, for copying and downloading. */
export function structuredToText(task: AiTask, data: unknown): string {
  switch (task) {
    case 'dates':
      return arr((data as Dates)?.items)
        .map((i) => `- ${i.date}${i.kind ? ` [${i.kind}]` : ''}: ${i.description}${p(i.page)}`)
        .join('\n')
    case 'entities': {
      const d = data as Entities
      return [
        '## People',
        ...arr(d?.people).map((x) => `- ${x.name}${x.role ? ` — ${x.role}` : ''}${x.pages?.length ? ` (p. ${x.pages.join(', ')})` : ''}`),
        '',
        '## Organizations',
        ...arr(d?.organizations).map((x) => `- ${x.name}${x.type ? ` [${x.type}]` : ''}${x.context ? ` — ${x.context}` : ''}`),
      ].join('\n')
    }
    case 'extract': {
      const d = data as Extract
      return [d?.documentType ? `Document type: ${d.documentType}` : '', ...arr(d?.fields).map((f) => `${f.label}: ${f.value}${p(f.page)}`), d?.notes ?? '']
        .filter(Boolean)
        .join('\n')
    }
    case 'qa':
      return arr((data as QA)?.items)
        .map((i, n) => `${n + 1}. Q: ${i.question}\n   A: ${i.answer}${p(i.page)}`)
        .join('\n')
    case 'flashcards':
      return arr((data as Cards)?.cards)
        .map((c, n) => `${n + 1}. ${c.front}\n   → ${c.back}${p(c.page)}`)
        .join('\n')
    case 'report': {
      const r = data as Report
      return [
        r?.title ? `# ${r.title}` : '',
        r?.date ?? '',
        r?.summary ?? '',
        arr(r?.participants).length ? `Participants: ${arr(r.participants).join(', ')}` : '',
        '## Decisions',
        ...arr(r?.decisions).map((d) => `- ${d.text}${p(d.page)}`),
        '## Action items',
        ...arr(r?.actionItems).map((a) => `- ${a.task}${a.owner ? ` — ${a.owner}` : ''}${a.due ? ` (due ${a.due})` : ''}${p(a.page)}`),
        '## Open questions',
        ...arr(r?.openQuestions).map((q) => `- ${q.text}${p(q.page)}`),
      ]
        .filter((line) => line !== '')
        .join('\n')
    }
    default:
      return JSON.stringify(data, null, 2)
  }
}

/** Anki-compatible CSV (front,back) for flashcards. */
export function flashcardsToCsv(data: unknown) {
  const esc = (value: string) => `"${value.replace(/"/g, '""')}"`
  return arr((data as Cards)?.cards)
    .map((c) => `${esc(c.front ?? '')},${esc(c.back ?? '')}`)
    .join('\n')
}
