import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Render error caught by ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-2xl mx-auto mt-16 p-6 bg-white border border-orange-200 rounded-xl2 shadow-panel">
          <div className="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-safety-600 mb-1">Something broke</div>
          <h1 className="text-lg font-semibold text-ink-900 mb-2">This screen hit an error</h1>
          <p className="text-sm text-ink-500 mb-3">
            The rest of the app is still fine — this only affects the current view. Check the browser console (F12) for details, or try reloading.
          </p>
          <pre className="text-xs bg-ink-50 border border-ink-100 rounded-lg p-3 overflow-x-auto text-ink-600 mb-4">{String(this.state.error?.message || this.state.error)}</pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="bg-blueprint-600 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
