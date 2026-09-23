import React, { useState, useEffect } from 'react'
import { History, Upload, FileText, AlertTriangle } from 'lucide-react'
import { Tasks, Expenses, Documents, Issues, Activities } from '../lib/api'
import { Badge, Button, Drawer, Field, Input, Select, TextArea } from './ui.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useT } from '../lib/i18n.jsx'
import { useFeedback } from './feedback.jsx'
import { FEATURE_CRM } from '../lib/features.js'
import { formatDate } from '../lib/format.js'
import IssueCard from './IssueCard.jsx'
import TaskHistoryModal from './TaskHistoryModal.jsx'
import MoneyInput from './MoneyInput.jsx'
import DateInput from './DateInput.jsx'

/** Realization of one position: status, actual dates, progress, invoices, documents, issues, sign-off. */
export default function TaskDetailPanel({ task, projectId, onClose, onUpdated, sched, byId }) {
  const { t } = useT()
  const { format } = useCurrency()
  const { toast } = useFeedback()
  const [form, setForm] = useState(task)
  const [saving, setSaving] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [documents, setDocuments] = useState([])
  const [issues, setIssues] = useState([])
  const [todos, setTodos] = useState([])
  const [docForm, setDocForm] = useState({ title: '', doc_type: 'other', file: null })
  const [issueForm, setIssueForm] = useState({ title: '', severity: 'medium', discovered_date: '', estimated_cost_impact: null, estimated_delay_days: '' })
  const [verificationNotes, setVerificationNotes] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (!task) return
    setForm(task)
    Expenses.list(projectId, task.id).then(setExpenses)
    Documents.list(projectId, task.id).then(setDocuments)
    Issues.list(projectId, task.id).then(setIssues)
    if (FEATURE_CRM) Activities.list(projectId, task.id).then(setTodos)
  }, [task?.id])

  if (!task || !form) return null

  const save = async () => {
    setSaving(true)
    try {
      const updated = await Tasks.update(task.id, {
        status: form.status, progress_pct: Math.max(0, Math.min(100, Number(form.progress_pct) || 0)),
        actual_start: form.actual_start || null, actual_end: form.actual_end || null, notes: form.notes,
      })
      onUpdated?.(updated)
      toast(t('editor.saved'), { tone: 'success', duration: 3000 })
    } finally { setSaving(false) }
  }

  const verify = async (approve) => {
    if (!approve && !verificationNotes.trim()) { toast(t('detail.reasonRequired'), { tone: 'error' }); return }
    setVerifying(true)
    try {
      const updated = approve ? await Tasks.verify(task.id, verificationNotes) : await Tasks.reject(task.id, verificationNotes)
      setVerificationNotes('')
      onUpdated?.(updated)
    } finally { setVerifying(false) }
  }

  const toggleTodo = async (todo) => {
    await Activities.update(todo.id, { done: !todo.done })
    const [freshTodos, freshTask] = await Promise.all([Activities.list(projectId, task.id), Tasks.get(task.id)])
    setTodos(freshTodos)
    setForm(f => ({ ...f, progress_pct: freshTask.progress_pct }))
    onUpdated?.(freshTask)
  }

  const uploadDoc = async (e) => {
    e.preventDefault()
    if (!docForm.file) { toast(t('detail.chooseFile'), { tone: 'error' }); return }
    await Documents.upload({ project: projectId, task: task.id, title: docForm.title || docForm.file.name, doc_type: docForm.doc_type, file: docForm.file })
    setDocForm({ title: '', doc_type: 'other', file: null })
    e.target.reset?.()
    Documents.list(projectId, task.id).then(setDocuments)
  }

  const addIssue = async (e) => {
    e.preventDefault()
    await Issues.create({
      project: projectId, related_task: task.id, title: issueForm.title, severity: issueForm.severity,
      discovered_date: issueForm.discovered_date, estimated_cost_impact: issueForm.estimated_cost_impact || 0,
      estimated_delay_days: issueForm.estimated_delay_days || 0, status: 'open',
    })
    setIssueForm({ title: '', severity: 'medium', discovered_date: '', estimated_cost_impact: null, estimated_delay_days: '' })
    Issues.list(projectId, task.id).then(setIssues)
  }

  const invoiced = expenses.filter(e => e.entry_type === 'actual').reduce((s, e) => s + parseFloat(e.amount), 0)
  const paid = expenses.filter(e => e.entry_type === 'actual').reduce((s, e) => s + parseFloat(e.amount_paid || 0), 0)
  const budget = parseFloat(task.estimated_cost || 0)
  const H = ({ children }) => <h3 className="text-sm font-semibold text-ink-800 mb-2.5">{children}</h3>

  return (
    <Drawer open onClose={onClose} width={560}
      subtitle={`${task.wbs_code ? task.wbs_code + ' · ' : ''}${t('detail.subtitle')}`}
      title={task.name}>
      <div className="text-[13px] text-ink-500 mb-5 flex flex-wrap gap-x-4 gap-y-1">
        <span>{t('gantt.planned')}: {formatDate(task.estimated_start)} – {formatDate(task.estimated_end)}</span>
        {task.vendor_name && <span>{t('editor.vendor')}: {task.vendor_name}</span>}
        <button type="button" onClick={() => setShowHistory(true)} className="inline-flex items-center gap-1 text-blueprint-600 hover:underline"><History size={14} />{t('detail.history')}</button>
      </div>

      <section className="bg-ink-50/60 border border-line rounded-xl p-4 mb-6">
        <H>{t('detail.realization')}</H>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('detail.status')}>
            <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {['not_started', 'in_progress', 'delayed', 'blocked', 'completed'].map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('detail.progress')} hint={todos.length > 0 ? t('detail.progressFromTodos', { done: todos.filter(x => x.done).length, total: todos.length }) : null}>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="100" step="5" value={form.progress_pct || 0} onChange={e => setForm({ ...form, progress_pct: e.target.value })} className="flex-1 accent-blueprint-600" />
              <Input type="number" min="0" max="100" value={form.progress_pct} onChange={e => setForm({ ...form, progress_pct: e.target.value })} className="!w-20 text-right" />
            </div>
          </Field>
          <Field label={t('detail.actualStart')}><DateInput value={form.actual_start || ''} onChange={v => setForm({ ...form, actual_start: v })} /></Field>
          <Field label={t('detail.actualEnd')}><DateInput value={form.actual_end || ''} onChange={v => setForm({ ...form, actual_end: v })} /></Field>
        </div>
        <Field label={t('editor.notes')} className="mt-3"><TextArea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        <Button onClick={save} disabled={saving} className="mt-3">{saving ? t('common.saving') : t('detail.saveRealization')}</Button>
      </section>

      <SchedulePart task={task} sched={sched} byId={byId} />

      <section className="mb-6">
        <H>{t('detail.money')}</H>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Mini label={t('detail.budget')} value={format(budget)} />
          <Mini label={t('detail.invoiced')} value={format(invoiced)} tone={invoiced > budget && budget > 0 ? 'red' : undefined} />
          <Mini label={t('detail.paid')} value={format(paid)} />
        </div>
        {invoiced > budget && budget > 0 && (
          <div className="flex gap-2 items-start text-[13px] text-status-amber bg-status-amberBg rounded-lg px-3 py-2 mb-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />{t('detail.overBudget', { amount: format(invoiced - budget) })}
          </div>
        )}
        <ul className="text-sm divide-y divide-line-soft">
          {expenses.map(ex => (
            <li key={ex.id} className="py-2 flex justify-between gap-3">
              <span className="text-ink-700 truncate">{ex.vendor_name ? `${ex.vendor_name} · ` : ''}{ex.description} <span className="text-ink-400 text-xs">{formatDate(ex.date)}</span></span>
              <span className="text-ink-700 shrink-0">{format(ex.amount)}</span>
            </li>
          ))}
          {expenses.length === 0 && <li className="py-2 text-[13px] text-ink-400">{t('detail.noInvoices')}</li>}
        </ul>
      </section>

      {FEATURE_CRM && todos.length > 0 && (
        <section className="mb-6">
          <H>{t('detail.todos')}</H>
          <ul className="text-sm divide-y divide-line-soft">
            {todos.map(td => (
              <li key={td.id} className="py-1.5 flex items-center gap-2">
                <input type="checkbox" checked={td.done} onChange={() => toggleTodo(td)} className="accent-blueprint-600" />
                <span className={td.done ? 'line-through text-ink-300' : 'text-ink-700'}>{td.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {task.status === 'completed' && (
        <section className={`border rounded-xl p-4 mb-6 ${task.verified ? 'bg-status-greenBg/60 border-status-green/30' : 'bg-status-amberBg/60 border-status-amber/30'}`}>
          <div className="flex items-center justify-between mb-2">
            <H>{t('detail.verification')}</H>
            <Badge tone={task.verified ? 'green' : 'amber'}>{task.verified ? t('detail.verified') : t('detail.pendingVerification')}</Badge>
          </div>
          {task.verified ? (
            <div className="text-sm text-ink-600">
              {t('detail.confirmedBy')} <span className="font-medium">{task.verified_by_username || '—'}</span>
              {task.verified_at && <span className="text-xs text-ink-400"> · {new Date(task.verified_at).toLocaleString('de-DE')}</span>}
              {task.verification_notes && <p className="text-xs text-ink-500 mt-1.5 italic">“{task.verification_notes}”</p>}
            </div>
          ) : (
            <>
              <p className="text-[13px] text-ink-600 mb-2">{t('detail.verifyHint')}</p>
              <TextArea rows={2} placeholder={t('detail.verifyNotes')} value={verificationNotes} onChange={e => setVerificationNotes(e.target.value)} className="mb-2" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => verify(true)} disabled={verifying}>{t('detail.approve')}</Button>
                <Button size="sm" variant="secondary" onClick={() => verify(false)} disabled={verifying}>{t('detail.sendBack')}</Button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="mb-6">
        <H>{t('detail.documents')}</H>
        <form onSubmit={uploadDoc} className="grid grid-cols-2 gap-2 mb-3">
          <Input placeholder={t('detail.docTitle')} value={docForm.title} onChange={e => setDocForm({ ...docForm, title: e.target.value })} />
          <Select value={docForm.doc_type} onChange={e => setDocForm({ ...docForm, doc_type: e.target.value })}>
            {['invoice', 'contract', 'permit', 'insurance', 'drawing', 'other'].map(d => <option key={d} value={d}>{t(`doc.${d}`)}</option>)}
          </Select>
          <input type="file" className="col-span-2 text-[13px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-line file:bg-white file:text-ink-600"
            onChange={e => setDocForm({ ...docForm, file: e.target.files[0] })} />
          <Button type="submit" variant="secondary" icon={Upload} className="col-span-2">{t('detail.upload')}</Button>
        </form>
        <ul className="text-sm divide-y divide-line-soft">
          {documents.map(d => (
            <li key={d.id} className="py-2 flex justify-between items-center gap-2">
              {d.file_url
                ? <a href={d.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blueprint-700 hover:underline truncate"><FileText size={15} />{d.title}</a>
                : <span className="text-status-red truncate" title={t('detail.brokenFile')}>{d.title}</span>}
              <span className="text-xs text-ink-400 shrink-0">{t(`doc.${d.doc_type}`)}</span>
            </li>
          ))}
          {documents.length === 0 && <li className="py-2 text-[13px] text-ink-400">{t('detail.noDocuments')}</li>}
        </ul>
      </section>

      <section>
        <H>{t('detail.issues')}</H>
        <form onSubmit={addIssue} className="grid grid-cols-2 gap-2 mb-3">
          <Input placeholder={t('detail.issueTitle')} value={issueForm.title} onChange={e => setIssueForm({ ...issueForm, title: e.target.value })} required className="col-span-2" />
          <Select value={issueForm.severity} onChange={e => setIssueForm({ ...issueForm, severity: e.target.value })}>
            {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{t(`issue.sev.${s}`)}</option>)}
          </Select>
          <DateInput value={issueForm.discovered_date} onChange={v => setIssueForm({ ...issueForm, discovered_date: v })} required aria-label={t('issue.discovered')} />
          <MoneyInput value={issueForm.estimated_cost_impact} onChange={v => setIssueForm({ ...issueForm, estimated_cost_impact: v })} placeholder={t('issue.estCost')} />
          <Input type="number" min="0" placeholder={t('issue.estDelay')} value={issueForm.estimated_delay_days} onChange={e => setIssueForm({ ...issueForm, estimated_delay_days: e.target.value })} />
          <Button type="submit" variant="secondary" className="col-span-2">{t('detail.logIssue')}</Button>
        </form>
        <div className="space-y-2">
          {issues.map(i => <IssueCard key={i.id} issue={i} onChanged={() => Issues.list(projectId, task.id).then(setIssues)} />)}
          {issues.length === 0 && <p className="text-[13px] text-ink-400">{t('detail.noIssues')}</p>}
        </div>
      </section>
      {showHistory && <TaskHistoryModal task={task} onClose={() => setShowHistory(false)} />}
    </Drawer>
  )
}

function Mini({ label, value, tone }) {
  return (
    <div className="border border-line rounded-lg px-3 py-2.5">
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 tabular-nums ${tone === 'red' ? 'text-status-red' : 'text-ink-800'}`}>{value}</div>
    </div>
  )
}

/** Critical-path facts for one position: forecast, float, and what drives its start ("why is it late?"). */
function SchedulePart({ task, sched, byId }) {
  const { t } = useT()
  const s = sched?.tasks?.[task.id]
  if (!s || s.unscheduled || s.summary) return null
  const name = (id) => { const n = byId?.get(id); return n ? `${n.wbs_code ? n.wbs_code + ' ' : ''}${n.name}` : '—' }
  // follow the first driving link back to the start of the chain
  const chain = []
  let cur = task.id, guard = 0
  while (guard++ < 12) {
    const w = (sched.tasks[cur]?.driving || []).find(d => d.kind === 'link')
    if (!w) break
    chain.unshift(w.task)
    cur = w.task
  }
  const why = (w) => w.kind === 'link' ? `${name(w.task)} · ${w.type}${w.lag ? (w.lag > 0 ? ' +' : ' ') + w.lag + ' ' + t('gantt.wdShort') : ''}`
    : t(`detail.why.${w.kind}`)
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-sm font-semibold text-ink-800">{t('detail.schedule')}</h3>
        {s.done ? <Badge tone="green">{t('detail.done')}</Badge>
          : s.critical ? <Badge tone="red">{t('detail.critical')}</Badge>
            : s.near_critical ? <Badge tone="amber">{t('detail.nearCritical')}</Badge> : <Badge tone="blue">{t('detail.hasFloat')}</Badge>}
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <Mini label={t('detail.forecastStart')} value={formatDate(s.es)} />
        <Mini label={t('detail.forecastEnd')} value={formatDate(s.ef)} tone={s.plan_finish_variance > 0 && !s.done ? 'red' : undefined} />
        <Mini label={t('detail.latestEnd')} value={formatDate(s.lf)} />
        <Mini label={t('detail.float')} value={s.done ? '—' : `${s.total_float} / ${s.free_float} ${t('gantt.daysShort')}`} tone={!s.done && s.total_float <= 0 ? 'red' : undefined} />
      </div>
      {!s.done && s.plan_finish_variance > 0 && (
        <div className="text-[13px] text-status-red mb-2">{t('detail.slip', { n: s.plan_finish_variance })}</div>
      )}
      {!s.done && s.driving?.length > 0 && (
        <div className="text-[13px] text-ink-600">
          <span className="text-ink-400">{t('detail.drivenBy')}: </span>{s.driving.map(why).join(' · ')}
        </div>
      )}
      {chain.length > 1 && (
        <div className="text-xs text-ink-400 mt-1.5">{t('detail.chain')}: {chain.map(name).join(' → ')} → {t('detail.thisOne')}</div>
      )}
      {s.violations?.length > 0 && (
        <div className="flex gap-2 items-start text-[13px] text-status-amber bg-status-amberBg rounded-lg px-3 py-2 mt-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />{s.violations.map(v => t(`detail.violation.${v}`)).join(' ')}
        </div>
      )}
    </section>
  )
}
