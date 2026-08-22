import React, { useState, useEffect } from 'react'
import { Tasks } from '../lib/api'
import { EmptyState } from './ui.jsx'

const FIELD_LABELS = {
  name: 'Name', estimated_start: 'Est. start', estimated_end: 'Est. end', estimated_cost: 'Est. cost',
  status: 'Status', progress_pct: 'Progress %', actual_start: 'Actual start', actual_end: 'Actual end',
  actual_cost: 'Actual cost', notes: 'Notes',
}

const ACTION_TONE = { created: 'text-status-green', updated: 'text-blueprint-600', deleted: 'text-status-red' }

export default function TaskHistoryModal({ task, onClose }) {
  const [logs, setLogs] = useState(null)

  useEffect(() => { Tasks.audit(task.id).then(setLogs) }, [task.id])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] bg-white rounded-xl2 shadow-pop overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-blueprint-600 font-semibold">Audit trail</div>
            <h2 className="text-sm font-semibold text-ink-900 mt-0.5">{task.name}</h2>
          </div>
          <button onClick={onClose} className="text-ink-300 hover:text-ink-700 text-lg leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {logs === null && <div className="text-sm text-ink-400 py-6 text-center">Loading…</div>}
          {logs && logs.length === 0 && <EmptyState title="No changes recorded yet" />}
          {logs && logs.length > 0 && (
            <ul className="divide-y divide-ink-50">
              {logs.map(l => (
                <li key={l.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium capitalize ${ACTION_TONE[l.action] || 'text-ink-800'}`}>{l.action}</span>
                    <span className="text-xs font-mono text-ink-400">{new Date(l.changed_at).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-ink-400 mb-1.5">by {l.changed_by_username || 'unknown'}</div>
                  {l.changes && Object.keys(l.changes).length > 0 && (
                    <ul className="text-xs space-y-0.5">
                      {Object.entries(l.changes).map(([field, pair]) => (
                        <li key={field} className="text-ink-600">
                          <span className="font-medium">{FIELD_LABELS[field] || field}:</span>{' '}
                          <span className="line-through text-ink-300">{pair[0] || '—'}</span>{' → '}
                          <span className="text-status-green">{pair[1] || '—'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
