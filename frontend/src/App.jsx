import React, { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, NavLink, useSearchParams, useLocation } from 'react-router-dom'
import { Projects } from './lib/api'
import EntryPage from './pages/EntryPage.jsx'
import GanttPage from './pages/GanttPage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import OperationalPage from './pages/OperationalPage.jsx'
import TaskReportPage from './pages/TaskReportPage.jsx'
import { CurrencyProvider, useCurrency } from './lib/currency.jsx'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import LoginPage from './pages/LoginPage.jsx'

const TABS = [
  { to: '', label: 'Setup', end: true },
  { to: 'gantt', label: 'Gantt & Calendar' },
  { to: 'financials', label: 'Financials' },
  { to: 'operational', label: 'Operational' },
]

function Shell() {
  const [projects, setProjects] = useState([])
  const [params, setParams] = useSearchParams()
  const activeProjectId = params.get('project')
  const { currency, toggle } = useCurrency()
  const { username, logout } = useAuth()
  const location = useLocation()

  useEffect(() => { Projects.list().then(setProjects).catch(() => {}) }, [])

  const setActiveProject = (id) => {
    const next = new URLSearchParams(params)
    next.set('project', id)
    setParams(next)
  }

  const tabClass = ({ isActive }) =>
    `relative px-3.5 py-2 text-[13px] font-medium transition rounded-lg ${
      isActive ? 'text-blueprint-700 bg-blueprint-50' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'
    }`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-100 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-md bg-blueprint-700 flex items-center justify-center text-white font-mono text-xs font-semibold">CP</div>
            <div>
              <div className="font-semibold text-ink-900 text-[15px] leading-none">Construction PM</div>
              <div className="font-mono text-[10px] tracking-[0.14em] text-ink-300 uppercase mt-0.5">Site &amp; Ledger</div>
            </div>
          </div>

          <nav className="flex gap-1 flex-1 justify-center">
            {TABS.map(t => (
              <NavLink key={t.to} to={`/${t.to}?project=${activeProjectId || ''}`} className={tabClass} end={t.end}>
                {t.label}
              </NavLink>
            ))}
          </nav>

          <select
            className="border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-blueprint-200"
            value={activeProjectId || ''}
            onChange={(e) => setActiveProject(e.target.value)}
          >
            <option value="">Select project…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <button
            onClick={toggle}
            className="shrink-0 flex items-center rounded-lg border border-ink-200 overflow-hidden text-xs font-mono font-semibold"
            title="Toggle display currency (fixed rate 61.5 MKD = 1 EUR)"
          >
            <span className={`px-2.5 py-2 ${currency === 'EUR' ? 'bg-blueprint-600 text-white' : 'bg-white text-ink-400'}`}>EUR</span>
            <span className={`px-2.5 py-2 ${currency === 'MKD' ? 'bg-blueprint-600 text-white' : 'bg-white text-ink-400'}`}>MKD</span>
          </button>

          <div className="flex items-center gap-2 shrink-0 pl-3 border-l border-ink-100">
            <span className="text-xs text-ink-400 font-mono hidden md:inline">{username}</span>
            <button onClick={logout} className="text-xs text-ink-400 hover:text-safety-600 transition">Sign out</button>
          </div>

          <NotificationBell projectId={activeProjectId} />
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-7">
        <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/" element={<EntryPage projectId={activeProjectId} onProjectsChanged={() => Projects.list().then(setProjects)} />} />
            <Route path="/gantt" element={<GanttPage projectId={activeProjectId} />} />
            <Route path="/financials" element={<AnalyticsPage projectId={activeProjectId} />} />
            <Route path="/operational" element={<OperationalPage projectId={activeProjectId} />} />
            <Route path="/task-report" element={<TaskReportPage projectId={activeProjectId} />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <CurrencyProvider>
      <HashRouter>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </HashRouter>
    </CurrencyProvider>
  )
}

function AuthGate() {
  const { token } = useAuth()
  if (!token) return <LoginPage />
  return <Shell />
}
