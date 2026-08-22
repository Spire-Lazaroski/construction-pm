import React, { useState, useEffect } from 'react'
import { Tasks, Expenses, Documents, Issues } from '../lib/api'
import { Badge, Button, Field, Input, Select, TextArea, EmptyState } from './ui.jsx'
import { useCurrency } from '../lib/currency.jsx'

export default function TaskDetailPanel({ task, projectId, onClose, onUpdated }) {
  const [form, setForm] = useState(task)
  const [saving, setSaving] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [documents, setDocuments] = useState([])
  const [issues, setIssues] = useState([])
  const [docForm, setDocForm] = useState({ title: '', doc_type: 'other', file: null })
  const [issueForm, setIssueForm] = useState({ title: '', severity: 'medium', discovered_date: '', estimated_cost_impact: '', estimated_delay_days: '' })
  const [verificationNotes, setVerificationNotes] = useState('')
  const [verifying, setVerifying] = useState(false)
  const { format } = useCurrency()

  useEffect(() => {
    if (!task) return
    Expenses.list(projectId, task.id).then(setExpenses)
    Documents.list(projectId, task.id).then(setDocuments)
    Issues.list(projectId, task.id).then(setIssues)
  }, [task?.id])

  if (!task || !form) return null

  const save = async () => {
    setSaving(true)
    try {
      const updated = await Tasks.update(task.id, {
        status: form.status,
        progress_pct: form.progress_pct,
        actual_start: form.actual_start || null,
        actual_end: form.actual_end || null,
        actual_cost: form.actual_cost || 0,
        notes: form.notes,
      })
      onUpdated?.(updated)
    } finally {
      setSaving(false)
    }
  }

  const approve = async () => {
    setVerifying(true)
    try {
      const updated = await Tasks.verify(task.id, verificationNotes)
      setVerificationNotes('')
      onUpdated?.(updated)
    } finally {
      setVerifying(false)
    }
  }

  const reject = async () => {
    if (!verificationNotes.trim()) {
      alert('Add a reason before sending this back — the person who did the work needs to know what to fix.')
      return
    }
    setVerifying(true)
    try {
      const updated = await Tasks.reject(task.id, verificationNotes)
      setVerificationNotes('')
      onUpdated?.(updated)
    } finally {
      setVerifying(false)
    }
  }

  const uploadDoc = async (e) => {
    e.preventDefault()
    if (!docForm.file) { alert('Choose a file before uploading.'); return }
    await Documents.upload({ project: projectId, task: task.id, title: docForm.title || docForm.file.name, doc_type: docForm.doc_type, file: docForm.file })
    setDocForm({ title: '', doc_type: 'other', file: null })
    Documents.list(projectId, task.id).then(setDocuments)
  }

  const addIssue = async (e) => {
    e.preventDefault()
    await Issues.create({
      project: projectId, related_task: task.id, title: issueForm.title, severity: issueForm.severity,
      discovered_date: issueForm.discovered_date, estimated_cost_impact: issueForm.estimated_cost_impact || 0,
      estimated_delay_days: issueForm.estimated_delay_days || 0, status: 'open',
    })
    setIssueForm({ title: '', severity: 'medium', discovered_date: '', estimated_cost_impact: '', estimated_delay_days: '' })
    Issues.list(projectId, task.id).then(setIssues)
  }

  const totalActualFromExpenses = expenses.filter(e => e.entry_type === 'actual').reduce((s, e) => s + parseFloat(e.amount), 0)

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-ink-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-pop p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-lg text-ink-900">{task.name}</h2>
          <button onClick={onClose} className="text-ink-300 hover:text-ink-700 text-lg leading-none">✕</button>
        </div>

        <div className="text-xs font-mono text-ink-400 mb-5">
          Planned: {task.estimated_start} → {task.estimated_end} · Est. cost {format(task.estimated_cost)}
        </div>

        <div className="bg-ink-50/60 border border-ink-100 rounded-xl2 p-4 mb-5">
          <h3 className="text-xs font-mono uppercase tracking-wide text-blueprint-600 font-semibold mb-3">Realization (actuals)</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="delayed">Delayed</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
              </Select>
            </Field>
            <Field label="Progress %">
              <Input type="number" min="0" max="100" value={form.progress_pct} onChange={e => setForm({ ...form, progress_pct: e.target.value })} />
            </Field>
            <Field label="Actual start">
              <Input type="date" value={form.actual_start || ''} onChange={e => setForm({ ...form, actual_start: e.target.value })} />
            </Field>
            <Field label="Actual end">
              <Input type="date" value={form.actual_end || ''} onChange={e => setForm({ ...form, actual_end: e.target.value })} />
            </Field>
            <Field label="Actual cost (EUR, manual override)">
              <Input type="number" value={form.actual_cost} onChange={e => setForm({ ...form, actual_cost: e.target.value })} />
            </Field>
            <div className="text-xs text-ink-400 self-end pb-2 font-mono">
              Sum of "actual" expenses on this task: <span className="font-semibold text-ink-700">{format(totalActualFromExpenses)}</span>
            </div>
          </div>
          <Field label="Notes" className="mt-3">
            <TextArea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <Button onClick={save} disabled={saving} className="mt-3">
            {saving ? 'Saving…' : 'Save realization'}
          </Button>
        </div>

        {task.status === 'completed' && (
          <div className={`border rounded-xl2 p-4 mb-5 ${task.verified ? 'bg-emerald-50/60 border-emerald-200' : 'bg-orange-50/60 border-orange-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-mono uppercase tracking-wide font-semibold text-ink-600">Verification</h3>
              <Badge tone={task.verified ? 'green' : 'amber'}>{task.verified ? 'Verified' : 'Pending verification'}</Badge>
            </div>

            {task.verified ? (
              <div className="text-sm text-ink-600">
                Confirmed by <span className="font-medium">{task.verified_by_username || 'someone'}</span>
                {task.verified_at && <span className="font-mono text-xs text-ink-400"> · {new Date(task.verified_at).toLocaleString()}</span>}
                {task.verification_notes && <p className="text-xs text-ink-500 mt-1.5 italic">"{task.verification_notes}"</p>}
              </div>
            ) : (
              <>
                <p className="text-xs text-ink-500 mb-2">
                  Marked completed, but nobody's confirmed it yet — the Gantt shows this as amber until it's checked.
                </p>
                <TextArea
                  rows={2}
                  placeholder="Notes (optional to approve, required if sending back)"
                  value={verificationNotes}
                  onChange={e => setVerificationNotes(e.target.value)}
                  className="mb-2"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={approve} disabled={verifying}>
                    {verifying ? 'Working…' : 'Approve & verify'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={reject} disabled={verifying}>
                    Send back
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="mb-5">
          <h3 className="text-xs font-mono uppercase tracking-wide text-ink-400 font-semibold mb-2">Expenses on this task</h3>
          {expenses.length === 0 && <p className="text-xs text-ink-300">None logged yet — add via the Operational tab, linked to this task.</p>}
          <ul className="text-sm divide-y divide-ink-50">
            {expenses.map(ex => (
              <li key={ex.id} className="py-1.5 flex justify-between">
                <span className="text-ink-700">{ex.description} <span className="text-ink-400 text-xs">({ex.entry_type})</span></span>
                <span className="font-mono text-ink-600">{format(ex.amount)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-5">
          <h3 className="text-xs font-mono uppercase tracking-wide text-ink-400 font-semibold mb-2">Documents</h3>
          <form onSubmit={uploadDoc} className="grid grid-cols-2 gap-2 mb-3">
            <Input placeholder="Title" value={docForm.title} onChange={e => setDocForm({ ...docForm, title: e.target.value })} />
            <Select value={docForm.doc_type} onChange={e => setDocForm({ ...docForm, doc_type: e.target.value })}>
              <option value="contract">Contract</option>
              <option value="permit">Permit</option>
              <option value="insurance">Insurance</option>
              <option value="invoice">Invoice</option>
              <option value="drawing">Drawing/Plan</option>
              <option value="other">Other</option>
            </Select>
            <input type="file" className="col-span-2 text-sm" onChange={e => setDocForm({ ...docForm, file: e.target.files[0] })} />
            <Button type="submit" className="col-span-2">Upload</Button>
          </form>
          <ul className="text-sm divide-y divide-ink-50">
            {documents.map(d => (
              <li key={d.id} className="py-1.5 flex justify-between items-center">
                {d.file_url ? (
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="text-blueprint-600 hover:underline truncate">{d.title}</a>
                ) : (
                  <span className="text-safety-600 truncate" title="This file has no working link — try re-uploading it">{d.title} ⚠</span>
                )}
                <span className="text-xs text-ink-400">{d.doc_type}</span>
              </li>
            ))}
            {documents.length === 0 && <li className="py-2 text-xs text-ink-300">No documents yet.</li>}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-mono uppercase tracking-wide text-ink-400 font-semibold mb-2">Issues on this task</h3>
          <form onSubmit={addIssue} className="grid grid-cols-2 gap-2 mb-3">
            <Input placeholder="Issue title" value={issueForm.title} onChange={e => setIssueForm({ ...issueForm, title: e.target.value })} required />
            <Select value={issueForm.severity} onChange={e => setIssueForm({ ...issueForm, severity: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
            <Input type="date" value={issueForm.discovered_date} onChange={e => setIssueForm({ ...issueForm, discovered_date: e.target.value })} required />
            <Input type="number" placeholder="Est. cost impact (EUR)" value={issueForm.estimated_cost_impact} onChange={e => setIssueForm({ ...issueForm, estimated_cost_impact: e.target.value })} />
            <Input type="number" placeholder="Est. delay (days)" value={issueForm.estimated_delay_days} onChange={e => setIssueForm({ ...issueForm, estimated_delay_days: e.target.value })} />
            <Button type="submit">Log issue</Button>
          </form>
          <ul className="text-sm divide-y divide-ink-50">
            {issues.map(i => (
              <li key={i.id} className="py-1.5 flex justify-between items-center">
                <span className="text-ink-700">{i.title}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={i.severity === 'critical' || i.severity === 'high' ? 'red' : i.severity === 'medium' ? 'amber' : 'slate'}>{i.severity}</Badge>
                  <span className="text-xs text-ink-400">{i.status}</span>
                </span>
              </li>
            ))}
            {issues.length === 0 && <li className="py-2 text-xs text-ink-300">No issues logged.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
