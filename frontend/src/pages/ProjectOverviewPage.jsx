import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, Marker } from 'react-leaflet'
import { AlertTriangle, GanttChartSquare, Plus, FileSpreadsheet } from 'lucide-react'
import { Projects, Tasks, Expenses } from '../lib/api'
import { Card, PageHeader, Button, EmptyState, Loading, Segmented, StatCard, Badge } from '../components/ui.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useT } from '../lib/i18n.jsx'
import { daysBetween, formatDate, parseISODate, todayLocal, toNumber } from '../lib/format.js'
import { buildTree, flatten, isLate } from '../lib/wbs.js'
import { BaseTiles, useMapStyle } from './OverviewPage.jsx'

export default function ProjectOverviewPage({ projectId }) {
  const { t } = useT()
  const { format } = useCurrency()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [mapStyle, setMapStyle] = useMapStyle()

  useEffect(() => {
    if (!projectId) return
    setProject(null); setTasks(null)
    Projects.get(projectId).then(setProject)
    Tasks.list(projectId).then(setTasks)
    Expenses.list(projectId).then(setExpenses)
  }, [projectId])

  const today = todayLocal()
  const data = useMemo(() => {
    if (!tasks) return null
    const { roots } = buildTree(tasks)
    const all = flatten(roots)
    const leaves = all.filter(n => n.children.length === 0)
    const budget = roots.reduce((s, r) => s + r.totalCost, 0)
    const progress = budget > 0 ? roots.reduce((s, r) => s + r.totalCost * r.rollProgress, 0) / budget : 0
    const actual = expenses.filter(e => e.entry_type === 'actual')
    const invoiced = actual.reduce((s, e) => s + toNumber(e.amount), 0)
    const paid = actual.reduce((s, e) => s + toNumber(e.amount_paid), 0)
    const invoicedByTask = {}
    actual.forEach(e => { if (e.task) invoicedByTask[e.task] = (invoicedByTask[e.task] || 0) + toNumber(e.amount) })
    const groupInvoiced = (n) => (invoicedByTask[n.id] || 0) + n.children.reduce((s, c) => s + groupInvoiced(c), 0)
    const groups = roots.map(r => ({ id: r.id, code: r.wbs_code, name: r.name, budget: r.totalCost, invoiced: groupInvoiced(r), progress: r.rollProgress }))
    const late = leaves.filter(n => isLate(n, today))
    const overBudget = leaves.filter(n => (invoicedByTask[n.id] || 0) > toNumber(n.estimated_cost) && toNumber(n.estimated_cost) > 0)
    const aheadOfWork = leaves.filter(n => (invoicedByTask[n.id] || 0) > 0 && n.rollProgress === 0)
    const undated = leaves.filter(n => !n.estimated_start)
    const pending = actual.filter(e => e.approval_status === 'received')
    return { budget, progress, invoiced, paid, groups, late, overBudget, aheadOfWork, undated, pending, leaves, invoicedByTask }
  }, [tasks, expenses])

  if (!projectId) return <Card><EmptyState title={t('common.noProject')} subtitle={t('common.noProjectHint')} /></Card>
  if (!project || !data) return <Loading rows={6} />

  const start = parseISODate(project.start_date), end = parseISODate(project.estimated_end_date)
  const timePct = start && end && end > start ? Math.max(0, Math.min(100, (daysBetween(start, today) / daysBetween(start, end)) * 100)) : null
  const invoicedPct = data.budget ? (data.invoiced / data.budget) * 100 : 0
  const hasCoords = project.latitude && project.longitude

  const attention = [
    ...data.late.slice(0, 4).map(n => ({ tone: 'red', title: t('overview.lateItem', { code: n.wbs_code || '', name: n.name }), sub: t('overview.lateSub', { end: formatDate(n.estimated_end), pct: Math.round(n.rollProgress) }) })),
    ...data.overBudget.slice(0, 3).map(n => ({ tone: 'amber', title: t('overview.overItem', { code: n.wbs_code || '', name: n.name }), sub: `${format(data.invoicedByTask[n.id])} / ${format(n.estimated_cost)}` })),
    data.aheadOfWork.length > 0 && { tone: 'amber', title: t('overview.aheadItem', { n: data.aheadOfWork.length }), sub: data.aheadOfWork.map(n => n.wbs_code).filter(Boolean).slice(0, 8).join(', ') },
    data.pending.length > 0 && { tone: 'blue', title: t('overview.pendingItem', { n: data.pending.length }), sub: t('overview.pendingSub') },
    data.undated.length > 0 && { tone: 'slate', title: t('overview.undatedItem', { n: data.undated.length }), sub: t('overview.undatedSub') },
  ].filter(Boolean)

  const Bar = ({ label, pct, color }) => (
    <div className="grid grid-cols-[170px_1fr_64px] items-center gap-4">
      <span className="text-sm text-ink-600">{label}</span>
      <div className="h-2.5 bg-ink-50 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} /></div>
      <span className="text-sm font-semibold text-right tabular-nums">{pct.toFixed(1).replace('.', ',')} %</span>
    </div>
  )

  return (
    <div>
      <PageHeader title={project.name}
        subtitle={[project.building_type, hasCoords ? `${Number(project.latitude).toFixed(6)}, ${Number(project.longitude).toFixed(6)}` : null, `${formatDate(project.start_date)} – ${formatDate(project.estimated_end_date)}`].filter(Boolean).join(' · ')}
        action={<>
          <Button variant="secondary" icon={GanttChartSquare} onClick={() => navigate(`/schedule?project=${projectId}`)}>{t('nav.schedule')}</Button>
          <Button icon={Plus} onClick={() => navigate(`/budget?project=${projectId}&new=invoice`)}>{t('budget.newInvoice')}</Button>
        </>} />

      {data.leaves.length === 0 && (
        <Card className="mb-5">
          <EmptyState title={t('overview.emptyTitle')} subtitle={t('overview.emptyHint')}
            action={<div className="flex gap-2 justify-center">
              <Button icon={Plus} onClick={() => navigate(`/schedule?project=${projectId}`)}>{t('gantt.newPosition')}</Button>
              <Button variant="secondary" icon={FileSpreadsheet} onClick={() => navigate(`/import?project=${projectId}`)}>{t('nav.import')}</Button>
            </div>} />
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        <StatCard label={t('overview.budget')} value={format(data.budget)} hint={t('overview.positions', { n: data.leaves.length })} />
        <StatCard label={t('overview.invoiced')} value={format(data.invoiced)} hint={t('overview.ofBudget', { pct: invoicedPct.toFixed(1).replace('.', ',') })} />
        <StatCard label={t('overview.paid')} value={format(data.paid)} hint={t('overview.outstanding', { amount: format(data.invoiced - data.paid) })} />
        <StatCard label={t('overview.progress')} value={`${Math.round(data.progress)} %`} hint={t('overview.progressHint')} />
        <StatCard label={t('overview.late')} value={data.late.length} tone={data.late.length ? 'red' : 'green'} hint={t('overview.lateHint')} />
      </div>

      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold">{t('overview.barsTitle')}</h2>
          <span className="text-[13px] text-ink-400">{t('overview.barsHint')}</span>
        </div>
        <div className="space-y-3">
          {timePct !== null && <Bar label={t('overview.timeElapsed')} pct={timePct} color="#8A94A3" />}
          <Bar label={t('overview.workDone')} pct={data.progress} color="#1E7148" />
          <Bar label={t('overview.invoicedBar')} pct={invoicedPct} color={invoicedPct > data.progress + 10 ? '#9A5B00' : '#1F4F8A'} />
        </div>
        {invoicedPct > data.progress + 10 && (
          <div className="mt-4 flex gap-2 items-center text-[13px] text-status-amber bg-status-amberBg rounded-lg px-3 py-2.5">
            <AlertTriangle size={16} className="shrink-0" />{t('overview.overbillWarn')}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-5">
        <div className="space-y-5 min-w-0">
          <Card>
            <h2 className="text-[15px] font-semibold mb-2">{t('overview.byGroup')}</h2>
            {data.groups.map(g => (
              <div key={g.id} className="grid grid-cols-[34px_1fr_140px_140px] gap-3 items-center py-3 border-t border-line-soft">
                <span className="w-7 h-7 rounded-md bg-blueprint-50 text-blueprint-700 font-semibold text-[13px] flex items-center justify-center">{g.code || '•'}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{g.name}</div>
                  <div className="h-1.5 bg-ink-50 rounded mt-2 overflow-hidden"><div className="h-full bg-blueprint-600" style={{ width: `${g.budget ? Math.min(100, g.invoiced / g.budget * 100) : 0}%` }} /></div>
                </div>
                <div className="text-right"><div className="text-xs text-ink-400">{t('overview.budget')}</div><div className="text-sm font-medium">{format(g.budget)}</div></div>
                <div className="text-right"><div className="text-xs text-ink-400">{t('overview.invoiced')}</div><div className="text-sm font-medium">{format(g.invoiced)}</div></div>
              </div>
            ))}
            {data.groups.length === 0 && <p className="text-[13px] text-ink-400">{t('overview.noGroups')}</p>}
          </Card>
          <Card>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[15px] font-semibold">{t('overview.attention')}</h2>
              <span className="text-[13px] text-ink-400">{attention.length}</span>
            </div>
            <ul>
              {attention.map((a, i) => (
                <li key={i} className="flex gap-3 py-3 border-t border-line-soft">
                  <Badge tone={a.tone}>{t(`overview.tone.${a.tone}`)}</Badge>
                  <div className="min-w-0"><div className="text-sm font-medium">{a.title}</div><div className="text-[13px] text-ink-400 mt-0.5 truncate">{a.sub}</div></div>
                </li>
              ))}
              {attention.length === 0 && <li className="py-3 text-[13px] text-ink-400 border-t border-line-soft">{t('overview.allGood')}</li>}
            </ul>
          </Card>
        </div>
        <Card padded={false} className="overflow-hidden flex flex-col min-h-[420px] relative z-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h2 className="text-[15px] font-semibold">{t('overview.location')}</h2>
            <Segmented size="sm" label={t('portfolio.mapStyle')} value={mapStyle} onChange={setMapStyle}
              options={[{ value: 'street', label: t('portfolio.street') }, { value: 'satellite', label: t('portfolio.satellite') }]} />
          </div>
          {hasCoords ? (
            <MapContainer center={[parseFloat(project.latitude), parseFloat(project.longitude)]} zoom={17} style={{ flex: 1, minHeight: 360 }}>
              <BaseTiles style={mapStyle} />
              <Marker position={[parseFloat(project.latitude), parseFloat(project.longitude)]} />
            </MapContainer>
          ) : (
            <EmptyState title={t('overview.noLocation')} subtitle={t('overview.noLocationHint')}
              action={<Button variant="secondary" onClick={() => navigate(`/settings?project=${projectId}`)}>{t('nav.settings')}</Button>} />
          )}
        </Card>
      </div>
    </div>
  )
}
