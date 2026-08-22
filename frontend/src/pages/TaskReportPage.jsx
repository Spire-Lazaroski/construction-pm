import React, { useState, useEffect } from 'react'
import { Tasks, Projects } from '../lib/api'
import { Card, PageHeader, Badge, Button, Dot, EmptyState } from '../components/ui.jsx'
import { useCurrency } from '../lib/currency.jsx'

const STATUS_TONE = { completed: 'green', in_progress: 'blue', delayed: 'red', blocked: 'red', not_started: 'slate' }

export default function TaskReportPage({ projectId }) {
  const [tasks, setTasks] = useState([])
  const [projectName, setProjectName] = useState('')
  const { format } = useCurrency()

  useEffect(() => {
    if (!projectId) return
    Tasks.list(projectId).then(setTasks)
    Projects.get(projectId).then(p => setProjectName(p.name))
  }, [projectId])

  if (!projectId) {
    return <Card><EmptyState title="No project selected" subtitle="Choose a project from the top-right dropdown." /></Card>
  }

  const totalPlanned = tasks.reduce((s, t) => s + parseFloat(t.estimated_cost || 0), 0)

  return (
    <div>
      <div className="print-only mb-4">
        <div className="font-mono text-[10px] uppercase tracking-wide text-ink-400">Construction PM · Task Report</div>
        <h1 className="text-lg font-semibold text-ink-900">{projectName}</h1>
        <div className="text-xs text-ink-400">Generated {new Date().toLocaleDateString()}</div>
      </div>

      <PageHeader
        eyebrow="Report"
        title="Task Report"
        subtitle={`${projectName} — every task, status, and dates, in one printable list.`}
        action={<Button variant="secondary" size="sm" onClick={() => window.print()} className="no-print">Download PDF</Button>}
      />

      <Card padded={false}>
        <table className="w-full text-sm">
          <thead className="text-left text-ink-400 text-xs uppercase tracking-wide border-b border-ink-100">
            <tr>
              <th className="py-2.5 px-4 font-medium">#</th>
              <th className="font-medium">Task</th>
              <th className="font-medium">Status</th>
              <th className="font-medium">Planned</th>
              <th className="font-medium">Actual</th>
              <th className="font-medium">Progress</th>
              <th className="font-medium pr-4">Est. cost</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[12px]">
            {tasks.map((t, i) => (
              <tr key={t.id} className="border-b border-ink-50 last:border-0">
                <td className="py-2.5 px-4 text-ink-300">{i + 1}</td>
                <td className="font-sans font-medium text-ink-800">
                  <div className="flex items-center gap-1.5">
                    <Dot tone={t.health} />
                    {t.name}
                  </div>
                </td>
                <td><Badge tone={STATUS_TONE[t.status] || 'slate'}>{t.status.replace('_', ' ')}</Badge></td>
                <td className="text-ink-500 whitespace-nowrap">{t.estimated_start} → {t.estimated_end}</td>
                <td className="text-ink-500 whitespace-nowrap">{t.actual_start ? `${t.actual_start} → ${t.actual_end || 'ongoing'}` : '—'}</td>
                <td className="text-ink-500">{t.progress_pct}%</td>
                <td className="text-ink-500 pr-4">{format(t.estimated_cost)}</td>
              </tr>
            ))}
            {tasks.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-ink-300 font-sans">No tasks in this project yet.</td></tr>}
          </tbody>
          {tasks.length > 0 && (
            <tfoot>
              <tr className="border-t border-ink-100 font-mono text-[12px]">
                <td colSpan={6} className="py-2.5 px-4 text-right font-sans font-medium text-ink-500">Total planned cost</td>
                <td className="pr-4 font-semibold text-ink-800">{format(totalPlanned)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  )
}
