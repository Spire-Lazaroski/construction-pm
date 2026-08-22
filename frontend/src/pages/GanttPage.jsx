import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { Tasks, Issues, Projects } from '../lib/api'
import TaskDetailPanel from '../components/TaskDetailPanel.jsx'
import { Card, SectionCard, PageHeader, Badge, Button, Dot, EmptyState } from '../components/ui.jsx'

const ZOOM_DAY_WIDTH = { day: 40, week: 14, month: 6, quarter: 2.4, year: 1.1 }
const HEALTH_COLOR = { green: '#1E8E5A', amber: '#C2760F', red: '#C2410F' }
const HEALTH_TONE = { green: 'green', amber: 'amber', red: 'red' }

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24))
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }

function fmt(d) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function computeScheduleSignals(t) {
  const today = new Date()
  const plannedDays = Math.max(1, daysBetween(t.estimated_start, t.estimated_end))
  const elapsedPlanned = clamp(daysBetween(t.estimated_start, today), 0, plannedDays)
  const expectedProgressPct = t.status === 'completed' ? 100 : Math.round((elapsedPlanned / plannedDays) * 100)
  const reportedProgressPct = t.progress_pct || 0
  const progressGap = reportedProgressPct - expectedProgressPct

  let startDeltaDays = null
  let adherencePct = null
  if (t.actual_start) {
    startDeltaDays = daysBetween(t.estimated_start, t.actual_start)
    const actualEndForCalc = t.actual_end || today
    const overlapStart = new Date(Math.max(new Date(t.estimated_start), new Date(t.actual_start)))
    const overlapEnd = new Date(Math.min(new Date(t.estimated_end), new Date(actualEndForCalc)))
    const overlapDays = Math.max(0, daysBetween(overlapStart, overlapEnd))
    adherencePct = clamp(Math.round((overlapDays / plannedDays) * 100), 0, 100)
  }

  return { expectedProgressPct, reportedProgressPct, progressGap, startDeltaDays, adherencePct }
}

function elbowPath(x1, y1, x2, y2) {
  const midX = x1 + 14
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
}

export default function GanttPage({ projectId }) {
  const [tasks, setTasks] = useState([])
  const [issues, setIssues] = useState([])
  const [zoom, setZoom] = useState('month')
  const [showActual, setShowActual] = useState(true)
  const [showDeps, setShowDeps] = useState(true)
  const [selectedTask, setSelectedTask] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [arrows, setArrows] = useState([])

  const containerRef = useRef(null)
  const barRefs = useRef({})

  useEffect(() => {
    if (!projectId) { setTasks([]); setIssues([]); return }
    Tasks.list(projectId).then(setTasks)
    Issues.list(projectId).then(setIssues)
    Projects.get(projectId).then(p => setProjectName(p.name))
  }, [projectId])

  const { minDate, dayWidth, totalDays } = useMemo(() => {
    if (tasks.length === 0) return { minDate: new Date(), dayWidth: ZOOM_DAY_WIDTH[zoom], totalDays: 30 }
    const dates = tasks.flatMap(t => [t.estimated_start, t.estimated_end, t.actual_start, t.actual_end].filter(Boolean))
    const min = new Date(Math.min(...dates.map(d => new Date(d))))
    const max = new Date(Math.max(...dates.map(d => new Date(d))))
    min.setDate(min.getDate() - 3)
    max.setDate(max.getDate() + 5)
    return { minDate: min, dayWidth: ZOOM_DAY_WIDTH[zoom], totalDays: Math.max(30, daysBetween(min, max)) }
  }, [tasks, zoom])

  const chartWidth = totalDays * dayWidth
  const todayLeft = daysBetween(minDate, new Date()) * dayWidth
  const todayVisible = todayLeft >= 0 && todayLeft <= chartWidth

  const monthMarkers = useMemo(() => {
    const markers = []
    const cursor = new Date(minDate)
    cursor.setDate(1)
    while (daysBetween(minDate, cursor) < totalDays) {
      markers.push({ label: cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), left: Math.max(0, daysBetween(minDate, cursor)) * dayWidth })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return markers
  }, [minDate, totalDays, dayWidth])

  useLayoutEffect(() => {
    if (!containerRef.current || !showDeps) { setArrows([]); return }
    const containerRect = containerRef.current.getBoundingClientRect()
    const next = []
    tasks.forEach(t => {
      (t.predecessors || []).forEach(predId => {
        const predEl = barRefs.current[predId]
        const curEl = barRefs.current[t.id]
        if (!predEl || !curEl) return
        const predRect = predEl.getBoundingClientRect()
        const curRect = curEl.getBoundingClientRect()
        const x1 = predRect.right - containerRect.left
        const y1 = predRect.top - containerRect.top + predRect.height / 2
        const x2 = curRect.left - containerRect.left
        const y2 = curRect.top - containerRect.top + curRect.height / 2
        next.push({ id: `${predId}-${t.id}`, x1, y1, x2, y2 })
      })
    })
    setArrows(next)
  }, [tasks, zoom, dayWidth, minDate, showDeps])

  if (!projectId) {
    return <Card><EmptyState title="No project selected" subtitle="Choose a project from the top-right dropdown." /></Card>
  }

  return (
    <div>
      <div className="print-only mb-4">
        <div className="font-mono text-[10px] uppercase tracking-wide text-ink-400">Construction PM · Gantt &amp; Calendar</div>
        <h1 className="text-lg font-semibold text-ink-900">{projectName}</h1>
        <div className="text-xs text-ink-400">Generated {new Date().toLocaleDateString()}</div>
      </div>

      <PageHeader
        eyebrow="Execute"
        title="Gantt & Calendar"
        subtitle="Planned vs. realized, on separate rows — click any task to log actuals, upload documents, and track issues."
        action={
          <div className="flex items-center gap-3 gap-y-2 no-print flex-wrap justify-end">
            <label className="text-xs flex items-center gap-1.5 text-ink-500 shrink-0">
              <input type="checkbox" checked={showActual} onChange={e => setShowActual(e.target.checked)} />
              Realization row
            </label>
            <label className="text-xs flex items-center gap-1.5 text-ink-500 shrink-0">
              <input type="checkbox" checked={showDeps} onChange={e => setShowDeps(e.target.checked)} />
              Dependencies
            </label>
            <div className="flex rounded-lg border border-ink-200 overflow-hidden text-xs shrink-0">
              {['day', 'week', 'month', 'quarter', 'year'].map(z => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={`px-3 py-1.5 capitalize font-medium transition ${zoom === z ? 'bg-blueprint-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}
                >{z}</button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.print()} className="shrink-0">Export PDF</Button>
          </div>
        }
      />

      <Card padded={false} className="overflow-x-auto mb-4 gantt-print-scroll">
        <div ref={containerRef} style={{ width: Math.max(chartWidth, 600) + 260, position: 'relative' }}>
          <div className="flex border-b border-ink-100 bg-ink-50/60 sticky top-0 z-10">
            <div className="w-[260px] shrink-0 px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-ink-400">Task</div>
            <div className="relative flex-1 h-8" style={{ minWidth: chartWidth }}>
              {monthMarkers.map((m, i) => (
                <div key={i} className="absolute top-0 h-full border-l border-ink-200 text-[10px] font-mono text-ink-400 pl-1.5 pt-2" style={{ left: m.left }}>
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {todayVisible && (
            <div className="absolute top-8 bottom-0 border-l-2 border-safety-500 z-10 pointer-events-none no-print" style={{ left: 260 + todayLeft }}>
              <div className="bg-safety-500 text-white text-[9px] font-mono font-semibold px-1 py-0.5 rounded-sm -translate-x-1/2 -translate-y-full">TODAY</div>
            </div>
          )}

          {showDeps && arrows.length > 0 && (
            <svg className="absolute top-0 left-0 pointer-events-none" width="100%" height="100%" style={{ overflow: 'visible' }}>
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#7FA5E4" />
                </marker>
              </defs>
              {arrows.map(a => (
                <path key={a.id} d={elbowPath(a.x1, a.y1, a.x2, a.y2)} stroke="#7FA5E4" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead)" opacity="0.8" />
              ))}
            </svg>
          )}

          {tasks.map(t => {
            const isMilestone = t.estimated_start === t.estimated_end
            const estLeft = daysBetween(minDate, t.estimated_start) * dayWidth
            const estWidth = Math.max(daysBetween(t.estimated_start, t.estimated_end) * dayWidth, 4)
            const hasActual = !!t.actual_start
            const actEnd = t.actual_end || new Date().toISOString().slice(0, 10)
            const actLeft = hasActual ? daysBetween(minDate, t.actual_start) * dayWidth : null
            const actWidth = hasActual ? Math.max(daysBetween(t.actual_start, actEnd) * dayWidth, 4) : null
            const color = HEALTH_COLOR[t.health] || HEALTH_COLOR.green

            const { expectedProgressPct, reportedProgressPct, progressGap, startDeltaDays, adherencePct } = computeScheduleSignals(t)
            const laggingBehind = hasActual && t.status !== 'completed' && progressGap <= -15

            return (
              <div key={t.id} className="border-b border-ink-50 last:border-0 hover:bg-blueprint-50/40 cursor-pointer transition" onClick={() => setSelectedTask(t)}>
                <div className="flex items-stretch">
                  <div className="w-[260px] shrink-0 px-3 py-2.5 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Dot tone={HEALTH_TONE[t.health] || 'slate'} />
                      <span className="font-medium text-ink-800 truncate">{t.name}</span>
                      {isMilestone && <Badge tone="blue">milestone</Badge>}
                    </div>
                    <div className="text-[10px] font-mono text-ink-400 mt-0.5 pl-3.5 flex items-center gap-1.5 flex-wrap">
                      {hasActual ? (
                        <>
                          {startDeltaDays === 0 && <span className="text-status-green">on-time start</span>}
                          {startDeltaDays > 0 && <span className="text-status-red">+{startDeltaDays}d late start</span>}
                          {startDeltaDays < 0 && <span className="text-status-green">{Math.abs(startDeltaDays)}d early start</span>}
                          {adherencePct !== null && <span>· {adherencePct}% schedule overlap</span>}
                        </>
                      ) : (
                        <span className="text-ink-300">not started</span>
                      )}
                    </div>
                    {laggingBehind && (
                      <div className="text-[10px] font-mono text-status-red mt-0.5 pl-3.5">
                        expected {expectedProgressPct}% · reported {reportedProgressPct}%
                      </div>
                    )}
                  </div>

                  <div className="relative flex-1 py-2" style={{ minWidth: chartWidth }}>
                    <div className="relative h-3 mb-1">
                      {isMilestone ? (
                        <div
                          ref={el => barRefs.current[t.id] = el}
                          className="absolute w-3 h-3 rotate-45 border"
                          style={{ left: estLeft - 6, borderColor: color, backgroundColor: color }}
                          title={`Milestone: ${t.estimated_start}`}
                        />
                      ) : (
                        <div
                          ref={el => barRefs.current[t.id] = el}
                          className="absolute h-3 rounded-full border"
                          style={{ left: estLeft, width: estWidth, borderColor: color, backgroundColor: `${color}1A` }}
                          title={`Planned: ${t.estimated_start} → ${t.estimated_end} (${expectedProgressPct}% of planned time elapsed)`}
                        >
                          <div className="h-full rounded-full opacity-40" style={{ width: `${expectedProgressPct}%`, backgroundColor: color }} />
                        </div>
                      )}
                    </div>
                    {showActual && !isMilestone && (
                      <div className="relative h-3.5">
                        {hasActual ? (
                          <div
                            className="absolute h-3.5 rounded-full shadow-sm overflow-hidden"
                            style={{ left: actLeft, width: actWidth, backgroundColor: `${color}33` }}
                            title={`Realized: ${t.actual_start} → ${t.actual_end || 'ongoing'} — ${reportedProgressPct}% reported`}
                          >
                            <div className="h-full flex items-center px-2" style={{ width: `${reportedProgressPct}%`, backgroundColor: color }}>
                              <span className="text-[9px] text-white font-mono font-semibold whitespace-nowrap">{reportedProgressPct}%</span>
                            </div>
                          </div>
                        ) : (
                          <div className="absolute h-3.5 flex items-center text-[10px] font-mono text-ink-300" style={{ left: estLeft }}>
                            no realization logged yet
                          </div>
                        )}
                      </div>
                    )}
                    {showActual && isMilestone && hasActual && (
                      <div className="relative h-3.5">
                        <div
                          className="absolute w-3 h-3 rotate-45 shadow-sm"
                          style={{ left: actLeft - 6, backgroundColor: color }}
                          title={`Achieved: ${t.actual_start}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {tasks.length === 0 && <EmptyState title="No tasks defined yet" subtitle="Add your process on the Setup page." />}
        </div>
      </Card>

      <div className="flex flex-wrap gap-4 mb-6 text-xs text-ink-400 no-print">
        <span className="flex items-center gap-1.5"><Dot tone="green" /> On track</span>
        <span className="flex items-center gap-1.5"><Dot tone="amber" /> Over budget / watch / pending verification</span>
        <span className="flex items-center gap-1.5"><Dot tone="red" /> Delayed / blocked</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-safety-500 inline-block" /> Today</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-blueprint-400 inline-block rotate-45" /> Milestone</span>
        <span>· top row = planned · bottom row = realized · arrows = dependencies</span>
      </div>

      <SectionCard eyebrow="Watchlist" title="Unforeseen issues linked to this timeline" className="no-print">
        {issues.length === 0 && <EmptyState title="No issues logged" />}
        <ul className="divide-y divide-ink-50">
          {issues.map(i => (
            <li key={i.id} className="py-2.5 flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-ink-800">{i.title}</span>
                <span className="text-ink-400 ml-2 text-xs font-mono">discovered {i.discovered_date}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={i.severity === 'critical' || i.severity === 'high' ? 'red' : i.severity === 'medium' ? 'amber' : 'slate'}>{i.severity}</Badge>
                <span className="text-ink-400 text-xs">{i.status}</span>
                <span className="text-ink-400 text-xs font-mono">+{i.estimated_delay_days}d / {i.estimated_cost_impact}</span>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <TaskDetailPanel
        key={selectedTask?.id || 'none'}
        task={selectedTask}
        projectId={projectId}
        onClose={() => setSelectedTask(null)}
        onUpdated={(updated) => {
          setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
          setSelectedTask(updated)
        }}
      />
    </div>
  )
}
