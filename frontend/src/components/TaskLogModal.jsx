import React, { useState, useEffect } from 'react'
import { Tasks, Activities } from '../lib/api'
import { Badge, Dot, EmptyState } from './ui.jsx'

const STATUS_TONE = { completed: 'green', in_progress: 'blue', delayed: 'red', blocked: 'red', not_started: 'slate' }
const STATUS_DOT = { completed: 'green', in_progress: 'amber', delayed: 'red', blocked: 'red', not_started: 'slate' }

export default function TaskLogModal({ projectId, onClose }) {
  const [tasks, setTasks] = useState([])
  const [activities, setActivities] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!projectId) return
    Tasks.list(projectId).then(setTasks)
    Activities.list(projectId).then(setActivities)
  }, [projectId])

  const followUpsFor = (taskId) => activities.filter(a => a.related_task === taskId)

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true
    if (filter === 'done') return t.status === 'completed'
    if (filter === 'pending') return t.status !== 'completed'
    if (filter === 'unverified') return t.status === 'completed' && !t.verified
    return true
  })

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-white rounded-xl2 shadow-pop overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-blueprint-600 font-semibold">Complete record</div>
            <h2 className="text-sm font-semibold text-ink-900 mt-0.5">Task log — done, pending, and follow-ups</h2>
          </div>
          <button onClick={onClose} className="text-ink-300 hover:text-ink-700 text-lg leading-none">✕</button>
        </div>

        <div className="px-5 py-3 border-b border-ink-50 flex gap-1.5">
          {[
            { key: 'all', label: 'All' },
            { key: 'done', label: 'Done' },
            { key: 'pending', label: 'Not done' },
            { key: 'unverified', label: 'Unverified' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${filter === f.key ? 'bg-blueprint-600 text-white' : 'bg-ink-50 text-ink-500 hover:bg-ink-100'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 && <EmptyState title="No tasks match this filter" />}
          <table className="w-full text-sm">
            <thead className="text-left text-ink-400 text-xs uppercase tracking-wide border-b border-ink-100 sticky top-0 bg-white">
              <tr>
                <th className="py-2 px-5 font-medium">Task</th>
                <th className="font-medium">Status</th>
                <th className="font-medium">Planned</th>
                <th className="font-medium">Actual</th>
                <th className="font-medium pr-5">Follow-ups</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[12px]">
              {filtered.map(t => {
                const followUps = followUpsFor(t.id)
                return (
                  <tr key={t.id} className="border-b border-ink-50 last:border-0 align-top">
                    <td className="py-2.5 px-5 font-sans">
                      <div className="flex items-center gap-1.5">
                        <Dot tone={STATUS_DOT[t.status] || 'slate'} />
                        <span className="font-medium text-ink-800">{t.name}</span>
                      </div>
                      {t.status === 'completed' && (
                        <div className="pl-3.5 mt-0.5">
                          <Badge tone={t.verified ? 'green' : 'amber'}>{t.verified ? 'verified' : 'unverified'}</Badge>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-ink-500">
                      <Badge tone={STATUS_TONE[t.status] || 'slate'}>{t.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="py-2.5 text-ink-500 whitespace-nowrap">{t.estimated_start} → {t.estimated_end}</td>
                    <td className="py-2.5 text-ink-500 whitespace-nowrap">
                      {t.actual_start ? `${t.actual_start} → ${t.actual_end || 'ongoing'}` : '—'}
                    </td>
                    <td className="py-2.5 pr-5 font-sans text-ink-500">
                      {followUps.length === 0 && <span className="text-ink-300">—</span>}
                      {followUps.map(a => (
                        <div key={a.id} className="flex items-center gap-1.5 mb-0.5 last:mb-0">
                          <input type="checkbox" checked={a.done} readOnly className="pointer-events-none" />
                          <span className={a.done ? 'line-through text-ink-300' : ''}>{a.title}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
