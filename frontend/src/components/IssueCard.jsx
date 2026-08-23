import React, { useState } from 'react'
import { Issues } from '../lib/api'
import { Badge, Button, Input, TextArea } from './ui.jsx'
import { useCurrency } from '../lib/currency.jsx'

export default function IssueCard({ issue, onChanged }) {
  const [resolving, setResolving] = useState(false)
  const [resolveForm, setResolveForm] = useState({ actual_cost_impact: issue.estimated_cost_impact, resolution_notes: '' })
  const [spawning, setSpawning] = useState(false)
  const [spawnForm, setSpawnForm] = useState({ estimated_start: '', estimated_end: '', estimated_cost: issue.estimated_cost_impact })
  const [busy, setBusy] = useState(false)
  const { format } = useCurrency()

  const start = async () => {
    setBusy(true)
    try { await Issues.start(issue.id); onChanged() } finally { setBusy(false) }
  }

  const submitResolve = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await Issues.resolve(issue.id, resolveForm)
      setResolving(false)
      onChanged()
    } finally { setBusy(false) }
  }

  const submitSpawn = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await Issues.spawnRemediationTask(issue.id, spawnForm)
      setSpawning(false)
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="border border-ink-100 rounded-lg p-3.5 bg-white">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div>
          <span className="font-medium text-ink-800">{issue.title}</span>
          <div className="text-xs text-ink-400 font-mono mt-0.5">discovered {issue.discovered_date}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge tone={issue.severity === 'critical' || issue.severity === 'high' ? 'red' : issue.severity === 'medium' ? 'amber' : 'slate'}>{issue.severity}</Badge>
          <Badge tone={issue.status === 'resolved' ? 'green' : issue.status === 'in_progress' ? 'blue' : 'amber'}>{issue.status.replace('_', ' ')}</Badge>
        </div>
      </div>

      {issue.description && <p className="text-xs text-ink-500 mb-2">{issue.description}</p>}

      <div className="text-xs font-mono text-ink-400 mb-2">
        Est. impact: +{issue.estimated_delay_days}d / {format(issue.estimated_cost_impact)}
        {issue.status === 'resolved' && <span className="text-status-green"> · Actual: {format(issue.actual_cost_impact)}</span>}
      </div>

      {issue.status === 'resolved' && issue.resolution_notes && (
        <p className="text-xs text-ink-500 italic mb-2">"{issue.resolution_notes}"</p>
      )}

      {/* Remediation task link/spawn */}
      {issue.remediation_task_name ? (
        <div className="text-xs text-blueprint-600 mb-2">
          Fix task: <span className="font-medium">{issue.remediation_task_name}</span>
          <span className="text-ink-400"> ({issue.remediation_task_status?.replace('_', ' ')})</span>
        </div>
      ) : (
        !spawning && (
          <button onClick={() => setSpawning(true)} className="text-xs text-blueprint-600 hover:underline mb-2 block">
            + Create a fix task on the Gantt
          </button>
        )
      )}

      {spawning && (
        <form onSubmit={submitSpawn} className="bg-ink-50/60 rounded-lg p-2.5 mb-2 grid grid-cols-2 gap-2">
          <Input type="date" placeholder="Start" value={spawnForm.estimated_start} onChange={e => setSpawnForm({ ...spawnForm, estimated_start: e.target.value })} required />
          <Input type="date" placeholder="End" value={spawnForm.estimated_end} onChange={e => setSpawnForm({ ...spawnForm, estimated_end: e.target.value })} required />
          <Input type="number" placeholder="Est. cost" value={spawnForm.estimated_cost} onChange={e => setSpawnForm({ ...spawnForm, estimated_cost: e.target.value })} className="col-span-2" />
          <div className="col-span-2 flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>Create task</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setSpawning(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {/* Status actions */}
      {issue.status === 'open' && (
        <Button size="sm" onClick={start} disabled={busy}>Start resolving</Button>
      )}

      {issue.status === 'in_progress' && !resolving && (
        <Button size="sm" onClick={() => setResolving(true)}>Mark resolved</Button>
      )}

      {resolving && (
        <form onSubmit={submitResolve} className="bg-ink-50/60 rounded-lg p-2.5 mt-1">
          <Input
            type="number" placeholder="Actual cost impact"
            value={resolveForm.actual_cost_impact}
            onChange={e => setResolveForm({ ...resolveForm, actual_cost_impact: e.target.value })}
            className="mb-2"
          />
          <TextArea
            rows={2} placeholder="How was this actually resolved?"
            value={resolveForm.resolution_notes}
            onChange={e => setResolveForm({ ...resolveForm, resolution_notes: e.target.value })}
            className="mb-2"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>Confirm resolved</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setResolving(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  )
}
