import { Component, type ErrorInfo, type ReactNode } from 'react'

type State = { error: Error | null }

/** Keeps a crashing tool from blanking the whole page and offers a way to recover. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[pdfly] UI error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(this.state.error.message)
      return (
        <div className="run-status is-error" role="alert">
          <div className="run-status-row">
            <strong>{chunk ? 'This part of PDFLY could not be loaded. Check your connection.' : 'Something went wrong in this tool.'}</strong>
            <button type="button" className="chip" onClick={() => (chunk ? window.location.reload() : this.setState({ error: null }))}>
              {chunk ? 'Reload' : 'Try again'}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
