import React, { useState, useEffect, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Projects } from './lib/api'
import PortfolioPage from './pages/OverviewPage.jsx'
import ProjectOverviewPage from './pages/ProjectOverviewPage.jsx'
import SchedulePage from './pages/GanttPage.jsx'
import BudgetPage from './pages/BudgetPage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import ProjectSettingsPage from './pages/EntryPage.jsx'
import NewProjectPage from './pages/NewProjectPage.jsx'
import ImportPage from './pages/ImportPage.jsx'
import OperationalPage from './pages/OperationalPage.jsx'
import TaskReportPage from './pages/TaskReportPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { CurrencyProvider } from './lib/currency.jsx'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { I18nProvider, useT } from './lib/i18n.jsx'
import { FEATURE_CRM } from './lib/features.js'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { FeedbackProvider } from './components/feedback.jsx'
import { Sidebar, Topbar, useActiveProject } from './components/Layout.jsx'

const WIDE_ROUTES = ['/schedule']

function Shell() {
  const { t } = useT()
  const [projects, setProjects] = useState(null)
  const activeProjectId = useActiveProject(projects)
  const location = useLocation()
  const [params] = useSearchParams()

  const reloadProjects = useCallback(() => Projects.list().then(setProjects).catch(() => {}), [])
  useEffect(() => { reloadProjects() }, [reloadProjects])

  const projectList = projects || []
  const active = projectList.find(p => p.id === activeProjectId)
  const pageNames = {
    '/': t('nav.portfolio'), '/overview': t('nav.overview'), '/schedule': t('nav.schedule'),
    '/budget': t('nav.budget'), '/analytics': t('nav.analytics'), '/settings': t('nav.settings'),
    '/new': t('nav.newProject'), '/import': t('nav.import'), '/operational': t('nav.operations'),
    '/task-report': t('nav.taskReport'),
  }
  const crumbs = location.pathname === '/'
    ? [t('nav.portfolio')]
    : [t('nav.portfolio'), ['/new', '/import'].includes(location.pathname) ? null : active?.name, pageNames[location.pathname]]
  const wide = WIDE_ROUTES.includes(location.pathname)
  const pid = activeProjectId

  // Old links (#/gantt, #/financials, #/setup) keep working.
  const legacy = (to) => <Navigate to={`${to}${params.get('project') ? `?project=${params.get('project')}` : ''}`} replace />

  return (
    <div className="min-h-screen flex">
      <Sidebar projects={projectList} activeProjectId={pid} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar crumbs={crumbs} activeProjectId={pid} />
        <main className={`flex-1 w-full mx-auto px-6 py-6 ${wide ? '' : 'max-w-[1400px]'}`}>
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<PortfolioPage onProjectsChanged={reloadProjects} />} />
              <Route path="/new" element={<NewProjectPage projects={projectList} onProjectsChanged={reloadProjects} />} />
              <Route path="/import" element={<ImportPage projects={projectList} projectId={pid} onProjectsChanged={reloadProjects} />} />
              <Route path="/overview" element={<ProjectOverviewPage projectId={pid} />} />
              <Route path="/schedule" element={<SchedulePage projectId={pid} />} />
              <Route path="/budget" element={<BudgetPage projectId={pid} />} />
              <Route path="/analytics" element={<AnalyticsPage projectId={pid} />} />
              <Route path="/settings" element={<ProjectSettingsPage projectId={pid} onProjectsChanged={reloadProjects} />} />
              {FEATURE_CRM && <Route path="/operational" element={<OperationalPage projectId={pid} />} />}
              <Route path="/task-report" element={<TaskReportPage projectId={pid} />} />
              <Route path="/gantt" element={legacy('/schedule')} />
              <Route path="/financials" element={legacy('/analytics')} />
              <Route path="/setup" element={legacy('/settings')} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <CurrencyProvider>
        <HashRouter>
          <AuthProvider>
            <FeedbackProvider>
              <AuthGate />
            </FeedbackProvider>
          </AuthProvider>
        </HashRouter>
      </CurrencyProvider>
    </I18nProvider>
  )
}

function AuthGate() {
  const { token } = useAuth()
  if (!token) return <LoginPage />
  return <Shell />
}
