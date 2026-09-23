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
        <div className="max-w-2xl mx-auto mt-16 p-6 bg-white border border-line rounded-xl2">
          <h1 className="text-lg font-semibold text-ink-800 mb-2">Екранот наиде на грешка · This screen hit an error</h1>
          <p className="text-sm text-ink-500 mb-3">
            Остатокот од апликацијата работи. Обидете се повторно или освежете ја страницата. · The rest of the app is fine; try again or reload.
          </p>
          <pre className="text-xs bg-ink-50 border border-ink-100 rounded-lg p-3 overflow-x-auto text-ink-600 mb-4">{String(this.state.error?.message || this.state.error)}</pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="bg-blueprint-600 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            Обиди се повторно · Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
