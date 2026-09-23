import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  LayoutDashboard, GanttChartSquare, Wallet, LineChart, Settings2, Briefcase, ChevronDown, Plus,
  FileSpreadsheet, LogOut, Check, PanelLeftClose, PanelLeftOpen, Users,
} from 'lucide-react'
import { useT } from '../lib/i18n.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useAuth } from '../lib/auth.jsx'
import { FEATURE_CRM } from '../lib/features.js'
import NotificationBell from './NotificationBell.jsx'
import { Segmented } from './ui.jsx'

function ProjectSwitcher({ projects, activeId, collapsed }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const active = projects.find(p => p.id === activeId)
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const pick = (id) => {
    setOpen(false)
    const path = ['/', '/new', '/import'].includes(location.pathname) ? '/overview' : location.pathname
    navigate(`${path}?project=${id}`)
  }
  if (collapsed) return null
  return (
    <div className="relative mb-4" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-white/[0.08] border border-white/15 hover:bg-white/[0.12] text-left min-h-[48px]">
        <span className="min-w-0">
          <span className="block text-[11px] text-[#A9B7C9]">{t('nav.project')}</span>
          <span className="block text-sm font-semibold text-white truncate">{active?.name || t('nav.selectProject')}</span>
        </span>
        <ChevronDown size={16} className="text-[#A9B7C9] shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white rounded-xl shadow-pop p-1.5 max-h-80 overflow-y-auto">
          {projects.length === 0 && <div className="px-3 py-2 text-[13px] text-ink-400">{t('nav.noProjects')}</div>}
          {projects.map(p => (
            <button key={p.id} type="button" onClick={() => pick(p.id)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] text-ink-700 hover:bg-ink-50 text-left">
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === activeId && <Check size={15} className="text-blueprint-600" />}
            </button>
          ))}
          <div className="h-px bg-line my-1" />
          <button type="button" onClick={() => { setOpen(false); navigate('/new') }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] text-blueprint-700 hover:bg-blueprint-50">
            <Plus size={15} /> {t('nav.newProject')}
          </button>
        </div>
      )}
    </div>
  )
}

export function Sidebar({ projects, activeProjectId }) {
  const { t } = useT()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('pm_sidebar') === 'collapsed' } catch { return false }
  })
  const toggle = () => {
    setCollapsed(c => {
      try { localStorage.setItem('pm_sidebar', c ? 'open' : 'collapsed') } catch {}
      return !c
    })
  }
  const q = activeProjectId ? `?project=${activeProjectId}` : ''
  const projectNav = [
    { to: '/overview', label: t('nav.overview'), icon: LayoutDashboard },
    { to: '/schedule', label: t('nav.schedule'), icon: GanttChartSquare },
    { to: '/budget', label: t('nav.budget'), icon: Wallet },
    { to: '/analytics', label: t('nav.analytics'), icon: LineChart },
    { to: '/settings', label: t('nav.settings'), icon: Settings2 },
    FEATURE_CRM && { to: '/operational', label: t('nav.operations'), icon: Users },
  ].filter(Boolean)
  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg h-10 text-sm transition ${collapsed ? 'justify-center px-0' : 'px-3'} ${
      isActive ? 'bg-white/[0.14] text-white font-semibold' : 'text-[#C3CEDB] hover:bg-white/[0.07] hover:text-white font-medium'}`

  return (
    <aside className={`app-sidebar no-print shrink-0 bg-navy text-white flex flex-col sticky top-0 h-screen py-4 ${collapsed ? 'w-16 px-2' : 'w-[260px] px-3.5'}`}>
      <div className={`flex items-center ${collapsed ? 'justify-center mb-6' : 'justify-between px-2 mb-5'}`}>
        <NavLink to="/" aria-label="United Build Group">
          {collapsed
            ? <img src="/mark-white.png" alt="United Build Group" className="w-8 h-8" />
            : <img src="/logo-white.png" alt="United Build Group" className="h-11 w-auto" />}
        </NavLink>
      </div>

      <ProjectSwitcher projects={projects} activeId={activeProjectId} collapsed={collapsed} />

      <nav className="flex flex-col gap-0.5" aria-label={t('nav.main')}>
        <NavLink to="/" end className={linkCls} title={t('nav.portfolio')}>
          <Briefcase size={18} strokeWidth={1.75} />{!collapsed && <span>{t('nav.portfolio')}</span>}
        </NavLink>
        {activeProjectId && (
          <>
            {!collapsed && <div className="text-[11px] text-[#8FA0B5] px-3 mt-4 mb-1">{t('nav.thisProject')}</div>}
            {collapsed && <div className="h-px bg-white/10 my-2" />}
            {projectNav.map(n => (
              <NavLink key={n.to} to={`${n.to}${q}`} className={linkCls} title={n.label}>
                <n.icon size={18} strokeWidth={1.75} />{!collapsed && <span>{n.label}</span>}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="flex-1" />
      <nav className="flex flex-col gap-0.5 mb-2" aria-label={t('nav.tools')}>
        <NavLink to="/new" className={linkCls} title={t('nav.newProject')}>
          <Plus size={18} strokeWidth={1.75} />{!collapsed && <span>{t('nav.newProject')}</span>}
        </NavLink>
        <NavLink to={`/import${q}`} className={linkCls} title={t('nav.import')}>
          <FileSpreadsheet size={18} strokeWidth={1.75} />{!collapsed && <span>{t('nav.import')}</span>}
        </NavLink>
      </nav>
      <button type="button" onClick={toggle} title={collapsed ? t('nav.expand') : t('nav.collapse')}
        className={`flex items-center gap-3 rounded-lg h-10 text-sm text-[#8FA0B5] hover:text-white hover:bg-white/[0.07] ${collapsed ? 'justify-center' : 'px-3'}`}>
        {collapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /><span>{t('nav.collapse')}</span></>}
      </button>
    </aside>
  )
}

export function Topbar({ crumbs, activeProjectId }) {
  const { t, lang, setLang } = useT()
  const { currency, setCurrency } = useCurrency()
  const { username, logout } = useAuth()
  const [menu, setMenu] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const initials = (username || '?').slice(0, 2).toUpperCase()
  return (
    <header className="app-topbar no-print h-[60px] shrink-0 bg-white border-b border-line flex items-center gap-3 px-6 sticky top-0 z-20">
      <nav aria-label="breadcrumb" className="flex-1 min-w-0 text-sm flex items-center gap-2 truncate">
        {crumbs.filter(Boolean).map((c, i, arr) => (
          <React.Fragment key={i}>
            <span className={i === arr.length - 1 ? 'text-ink-800 font-semibold truncate' : 'text-ink-400 truncate'}>{c}</span>
            {i < arr.length - 1 && <span className="text-ink-300">/</span>}
          </React.Fragment>
        ))}
      </nav>
      <Segmented label={t('top.currency')} size="sm" value={currency} onChange={setCurrency}
        options={[{ value: 'EUR', label: 'EUR' }, { value: 'MKD', label: 'MKD' }]} />
      <Segmented label={t('top.language')} size="sm" value={lang} onChange={setLang}
        options={[{ value: 'mk', label: 'МК' }, { value: 'en', label: 'EN' }]} />
      <NotificationBell projectId={activeProjectId} />
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setMenu(m => !m)} aria-label={t('top.account')}
          className="w-9 h-9 rounded-full bg-blueprint-50 text-blueprint-700 text-[13px] font-semibold flex items-center justify-center hover:ring-2 hover:ring-blueprint-100">
          {initials}
        </button>
        {menu && (
          <div className="absolute right-0 mt-2 w-56 bg-white border border-line rounded-xl shadow-pop p-1.5 z-40">
            <div className="px-2.5 py-2 text-[13px] text-ink-400 border-b border-line mb-1">{username}</div>
            <button type="button" onClick={logout} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] text-ink-700 hover:bg-ink-50">
              <LogOut size={15} /> {t('top.signOut')}
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

/** The project in the URL (?project=), else the last one opened. */
export function useActiveProject(projects) {
  const [params] = useSearchParams()
  const fromUrl = params.get('project')
  useEffect(() => {
    if (fromUrl) try { localStorage.setItem('pm_last_project', fromUrl) } catch {}
  }, [fromUrl])
  if (fromUrl) return fromUrl
  let last = null
  try { last = localStorage.getItem('pm_last_project') } catch {}
  return last && (!projects || projects.some(p => p.id === last)) ? last : null
}
