import React, { useState, useEffect } from 'react'
import { Tasks } from '../lib/api'
import { EmptyState, Modal, Button, Loading } from './ui.jsx'
import { useT } from '../lib/i18n.jsx'

const ACTION_TONE = { created: 'text-status-green', updated: 'text-blueprint-700', deleted: 'text-status-red' }

export default function TaskHistoryModal({ task, onClose }) {
  const { t } = useT()
  const [logs, setLogs] = useState(null)
  useEffect(() => { Tasks.audit(task.id).then(setLogs) }, [task.id])
  const label = (f) => { const k = `field.${f}`; const s = t(k); return s === k ? f : s }
  return (
    <Modal open onClose={onClose} title={`${t('history.title')} · ${task.name}`} width={560}
      footer={<Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>}>
      <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
        {logs === null && <Loading rows={3} />}
        {logs && logs.length === 0 && <EmptyState title={t('history.empty')} />}
        {logs && logs.length > 0 && (
          <ul className="divide-y divide-line-soft">
            {logs.map(l => (
              <li key={l.id} className="py-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-medium ${ACTION_TONE[l.action] || 'text-ink-800'}`}>{t(`history.${l.action}`)}</span>
                  <span className="text-xs text-ink-400">{new Date(l.changed_at).toLocaleString('de-DE')}</span>
                </div>
                <div className="text-xs text-ink-400 mb-1.5">{l.changed_by_username || '—'}</div>
                {l.changes && Object.keys(l.changes).length > 0 && (
                  <ul className="text-xs space-y-0.5">
                    {Object.entries(l.changes).map(([field, pair]) => (
                      <li key={field} className="text-ink-600">
                        <span className="font-medium">{label(field)}:</span>{' '}
                        <span className="line-through text-ink-300">{pair[0] || '—'}</span>{' → '}
                        <span className="text-ink-800">{pair[1] || '—'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
