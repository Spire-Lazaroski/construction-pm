import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Projects } from '../lib/api'
import { Badge } from './ui.jsx'

const POLL_MS = 60000

export default function NotificationBell({ projectId }) {
  const [feed, setFeed] = useState(null)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!projectId) { setFeed(null); return }
    const load = () => Projects.feed(projectId).then(setFeed).catch(() => {})
    load()
    const interval = setInterval(load, POLL_MS)
    return () => clearInterval(interval)
  }, [projectId])

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (!projectId) return null

  const items = feed ? [
    ...feed.overdue_installments.map(i => ({ tone: 'red', text: `${i.customer_name} — payment overdue`, to: 'operational' })),
    ...feed.overdue_payables.map(p => ({ tone: 'red', text: `${p.vendor_name || p.description} — bill overdue`, to: 'operational' })),
    ...feed.upcoming_installments.map(i => ({ tone: 'amber', text: `${i.customer_name} — payment due ${i.due_date}`, to: 'operational' })),
    ...feed.upcoming_payables.map(p => ({ tone: 'amber', text: `${p.vendor_name || p.description} — due ${p.due_date}`, to: 'operational' })),
    ...feed.tasks_soon.map(t => ({ tone: 'blue', text: `${t.name} — starting/ending soon`, to: 'gantt' })),
    ...feed.open_issues.map(i => ({ tone: 'amber', text: `${i.title} — open issue`, to: 'gantt' })),
    ...feed.pending_verification.map(t => ({ tone: 'amber', text: `${t.name} — awaiting sign-off`, to: 'gantt' })),
  ] : []

  const count = items.length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-ink-200 hover:bg-ink-50 transition"
        title="Needs attention"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-500">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-safety-600 text-white text-[10px] font-mono font-semibold flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-ink-100 rounded-xl2 shadow-pop z-40">
          <div className="px-4 py-3 border-b border-ink-50 font-mono text-[10px] uppercase tracking-wide text-ink-400">
            Needs attention {count > 0 && `(${count})`}
          </div>
          {count === 0 && <div className="px-4 py-6 text-center text-sm text-ink-300">Nothing urgent right now.</div>}
          <ul>
            {items.map((item, i) => (
              <li key={i}>
                <button
                  onClick={() => { navigate(`/${item.to}?project=${projectId}`); setOpen(false) }}
                  className="w-full text-left px-4 py-2.5 border-b border-ink-50 last:border-0 hover:bg-ink-50 transition flex items-center gap-2 text-sm"
                >
                  <Badge tone={item.tone}>{item.tone === 'red' ? 'overdue' : item.tone === 'blue' ? 'task' : 'watch'}</Badge>
                  <span className="text-ink-700 truncate">{item.text}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => { navigate(`/task-report?project=${projectId}`); setOpen(false) }}
            className="w-full text-left px-4 py-2.5 border-t border-ink-100 hover:bg-ink-50 transition text-xs font-medium text-blueprint-600"
          >
            Export task list (PDF) →
          </button>
        </div>
      )}
    </div>
  )
}
