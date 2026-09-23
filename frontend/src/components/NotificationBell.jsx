import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Projects } from '../lib/api'
import { Badge } from './ui.jsx'
import { useT } from '../lib/i18n.jsx'
import { FEATURE_CRM } from '../lib/features.js'
import { formatDate } from '../lib/format.js'

const POLL_MS = 60000

export default function NotificationBell({ projectId }) {
  const { t } = useT()
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
    ...(FEATURE_CRM ? feed.overdue_installments.map(i => ({ tone: 'red', text: `${i.customer_name} — ${t('bell.paymentOverdue')}`, to: 'operational' })) : []),
    ...feed.overdue_payables.map(p => ({ tone: 'red', text: `${p.vendor_name || p.description} — ${t('bell.billOverdue')}`, to: 'budget' })),
    ...(FEATURE_CRM ? feed.upcoming_installments.map(i => ({ tone: 'amber', text: `${i.customer_name} — ${t('bell.due')} ${formatDate(i.due_date)}`, to: 'operational' })) : []),
    ...feed.upcoming_payables.map(p => ({ tone: 'amber', text: `${p.vendor_name || p.description} — ${t('bell.due')} ${formatDate(p.due_date)}`, to: 'budget' })),
    ...feed.tasks_soon.map(x => ({ tone: 'blue', text: `${x.wbs_code ? x.wbs_code + ' ' : ''}${x.name} — ${t('bell.soon')}`, to: 'schedule' })),
    ...feed.open_issues.map(i => ({ tone: 'amber', text: `${i.title} — ${t('bell.openIssue')}`, to: 'schedule' })),
    ...feed.pending_verification.map(x => ({ tone: 'amber', text: `${x.name} — ${t('bell.awaitingSignoff')}`, to: 'schedule' })),
  ] : []
  const count = items.length

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label={t('bell.title')}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition">
        <Bell size={19} strokeWidth={1.75} />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-safety-600 text-white text-[10px] font-semibold flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-96 max-h-[420px] overflow-y-auto bg-white border border-line rounded-xl shadow-pop z-40">
          <div className="px-4 py-3 border-b border-line text-sm font-semibold">{t('bell.title')}{count > 0 && <span className="text-ink-400 font-normal"> · {count}</span>}</div>
          {count === 0 && <div className="px-4 py-6 text-center text-[13px] text-ink-400">{t('bell.empty')}</div>}
          <ul>
            {items.map((item, i) => (
              <li key={i}>
                <button type="button" onClick={() => { navigate(`/${item.to}?project=${projectId}`); setOpen(false) }}
                  className="w-full text-left px-4 py-2.5 border-b border-line-soft last:border-0 hover:bg-ink-50 flex items-center gap-2 text-[13px]">
                  <Badge tone={item.tone}>{t(`bell.tone.${item.tone}`)}</Badge>
                  <span className="text-ink-700 truncate">{item.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
