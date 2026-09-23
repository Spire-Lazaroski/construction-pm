import React, { useState } from 'react'
import { Issues } from '../lib/api'
import { Badge, Button, Input, TextArea, Field } from './ui.jsx'
import MoneyInput from './MoneyInput.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useT } from '../lib/i18n.jsx'
import { formatDate } from '../lib/format.js'
import DateInput from './DateInput.jsx'

export default function IssueCard({ issue, onChanged }) {
  const { t } = useT()
  const { format } = useCurrency()
  const [resolving, setResolving] = useState(false)
  const [resolveForm, setResolveForm] = useState({ actual_cost_impact: Number(issue.estimated_cost_impact) || null, resolution_notes: '' })
  const [spawning, setSpawning] = useState(false)
  const [spawnForm, setSpawnForm] = useState({ estimated_start: '', estimated_end: '', estimated_cost: Number(issue.estimated_cost_impact) || null })
  const [busy, setBusy] = useState(false)

  const run = async (fn) => { setBusy(true); try { await fn(); onChanged() } finally { setBusy(false) } }

  const sevTone = issue.severity === 'critical' || issue.severity === 'high' ? 'red' : issue.severity === 'medium' ? 'amber' : 'slate'
  const statusTone = issue.status === 'resolved' ? 'green' : issue.status === 'in_progress' ? 'blue' : 'amber'

  return (
    <div className="border border-line rounded-lg p-3.5 bg-white">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div>
          <span className="font-medium text-ink-800 text-sm">{issue.title}</span>
          <div className="text-xs text-ink-400 mt-0.5">{t('issue.discovered')} {formatDate(issue.discovered_date)}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge tone={sevTone}>{t(`issue.sev.${issue.severity}`)}</Badge>
          <Badge tone={statusTone}>{t(`issue.status.${issue.status}`)}</Badge>
        </div>
      </div>
      {issue.description && <p className="text-[13px] text-ink-600 mb-2">{issue.description}</p>}
      <div className="text-xs text-ink-400 mb-2">
        {t('issue.impact')}: +{issue.estimated_delay_days} {t('gantt.daysShort')} · {format(issue.estimated_cost_impact)}
        {issue.status === 'resolved' && <span className="text-status-green"> · {t('issue.actual')}: {format(issue.actual_cost_impact)}</span>}
      </div>
      {issue.status === 'resolved' && issue.resolution_notes && <p className="text-xs text-ink-500 italic mb-2">“{issue.resolution_notes}”</p>}

      {issue.remediation_task_name ? (
        <div className="text-xs text-blueprint-700 mb-2">{t('issue.fixTask')}: <span className="font-medium">{issue.remediation_task_name}</span></div>
      ) : !spawning && issue.status !== 'resolved' && (
        <button type="button" onClick={() => setSpawning(true)} className="text-xs text-blueprint-600 hover:underline mb-2 block">+ {t('issue.createFix')}</button>
      )}

      {spawning && (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => { await Issues.spawnRemediationTask(issue.id, spawnForm); setSpawning(false) }) }}
          className="bg-ink-50/60 rounded-lg p-3 mb-2 grid grid-cols-2 gap-2">
          <Field label={t('editor.start')}><DateInput value={spawnForm.estimated_start} onChange={v => setSpawnForm({ ...spawnForm, estimated_start: v })} /></Field>
          <Field label={t('editor.end')}><DateInput value={spawnForm.estimated_end} onChange={v => setSpawnForm({ ...spawnForm, estimated_end: v })} /></Field>
          <Field label={t('issue.estCost')} className="col-span-2"><MoneyInput value={spawnForm.estimated_cost} onChange={v => setSpawnForm({ ...spawnForm, estimated_cost: v })} /></Field>
          <div className="col-span-2 flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>{t('issue.createTask')}</Button>
            <Button size="sm" variant="secondary" onClick={() => setSpawning(false)}>{t('common.cancel')}</Button>
          </div>
        </form>
      )}

      {issue.status === 'open' && <Button size="sm" onClick={() => run(() => Issues.start(issue.id))} disabled={busy}>{t('issue.start')}</Button>}
      {issue.status === 'in_progress' && !resolving && <Button size="sm" onClick={() => setResolving(true)}>{t('issue.markResolved')}</Button>}
      {resolving && (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => { await Issues.resolve(issue.id, resolveForm); setResolving(false) }) }}
          className="bg-ink-50/60 rounded-lg p-3 mt-1 space-y-2">
          <Field label={t('issue.actualCost')}><MoneyInput value={resolveForm.actual_cost_impact} onChange={v => setResolveForm({ ...resolveForm, actual_cost_impact: v ?? 0 })} /></Field>
          <TextArea rows={2} placeholder={t('issue.howResolved')} value={resolveForm.resolution_notes}
            onChange={e => setResolveForm({ ...resolveForm, resolution_notes: e.target.value })} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>{t('issue.confirmResolved')}</Button>
            <Button size="sm" variant="secondary" onClick={() => setResolving(false)}>{t('common.cancel')}</Button>
          </div>
        </form>
      )}
    </div>
  )
}
