import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown, MoreHorizontal, Plus, Pencil, ClipboardList, CopyPlus, Trash2, FolderPlus, Search, Printer, Diamond,
  Route, Save, CalendarClock, AlertTriangle,
} from 'lucide-react'
import { Tasks, Issues, Projects, Vendors } from '../lib/api'
import { useT } from '../lib/i18n.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useFeedback } from '../components/feedback.jsx'
import TaskDetailPanel from '../components/TaskDetailPanel.jsx'
import TaskEditor from '../components/TaskEditor.jsx'
import IssueCard from '../components/IssueCard.jsx'
import { Card, SectionCard, PageHeader, Badge, Button, EmptyState, Menu, Segmented, Loading, Modal, Select } from '../components/ui.jsx'
import { addDays, daysBetween, formatDate, parseISODate, todayLocal, toISODate, workingDays } from '../lib/format.js'
import { buildTree, flatten, isLate, suggestCode } from '../lib/wbs.js'

const DAY_PX = { day: 30, week: 7, month: 2.6 }
const ROW_H = { comfortable: 40, compact: 28 }
const LEFT_W = 680
const COLS = 'minmax(0,1fr) 140px 56px 64px 104px 40px'
const MONTHS = {
  mk: ['Јан', 'Фев', 'Мар', 'Апр', 'Мај', 'Јун', 'Јул', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}
const COLORS = {
  blue: { line: '#1F4F8A', fill: '#C9D8EC' },
  green: { line: '#1E7148', fill: '#CBE5D5' },
  amber: { line: '#9A5B00', fill: '#F1DDB8' },
  red: { line: '#B42318', fill: '#F4C9C4' },
}

function loadPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v) } catch { return fallback }
}
function savePref(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }

// Colour = what matters most for this bar: finished (green), on the critical path (red),
// needs attention (amber: awaiting sign-off, over budget), otherwise on track (blue).
function toneFor(n, today, s) {
  if (n.rollProgress >= 100) return n.children.length === 0 && n.status === 'completed' && !n.verified ? 'amber' : 'green'
  if (s?.critical) return 'red'
  if (!s && (n.health === 'red' || isLate(n, today))) return 'red'
  if (n.health === 'amber' || n.health === 'red') return 'amber'
  return 'blue'
}

export default function SchedulePage({ projectId }) {
  const { t, lang } = useT()
  const { format } = useCurrency()
  const { toast, confirm } = useFeedback()
  const [tasks, setTasks] = useState(null)
  const [issues, setIssues] = useState([])
  const [project, setProject] = useState(null)
  const [vendors, setVendors] = useState([])
  const [detailTask, setDetailTask] = useState(null)
  const [editor, setEditor] = useState(null) // { mode, task, defaults }
  const [expandedIssuesId, setExpandedIssuesId] = useState(null)

  const prefKey = (k) => `pm_gantt_${k}_${projectId}`
  const [collapsed, setCollapsed] = useState({})
  const [maxDepth, setMaxDepth] = useState(99)
  const [zoom, setZoom] = useState(() => loadPref('pm_gantt_zoom', 'week'))
  const [density, setDensity] = useState(() => loadPref('pm_gantt_density', 'comfortable'))
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [showDeps, setShowDeps] = useState(true)
  const [showBaseline, setShowBaseline] = useState(true)
  const [sched, setSched] = useState(null)
  const [schedErr, setSchedErr] = useState(null)
  const [baselines, setBaselines] = useState([])
  const [baselineId, setBaselineId] = useState('')
  const [resched, setResched] = useState(null) // preview result

  useEffect(() => {
    setCollapsed(loadPref(prefKey('collapsed'), {}))
    setMaxDepth(loadPref(prefKey('depth'), 99))
  }, [projectId])
  useEffect(() => { savePref(prefKey('collapsed'), collapsed) }, [collapsed])
  useEffect(() => { savePref(prefKey('depth'), maxDepth) }, [maxDepth])
  useEffect(() => { savePref('pm_gantt_zoom', zoom) }, [zoom])
  useEffect(() => { savePref('pm_gantt_density', density) }, [density])

  const scrollRef = useRef(null)
  const didScroll = useRef(false)
  useEffect(() => { didScroll.current = false }, [projectId])

  const loadSchedule = useCallback((bl) => {
    if (!projectId) return
    Projects.schedule(projectId, bl ? { baseline: bl } : undefined)
      .then(r => { setSched(r); setSchedErr(null) })
      .catch(e => { setSched(null); setSchedErr(e?.response?.data || { detail: 'Schedule error' }) })
  }, [projectId])

  const reload = useCallback(() => {
    if (!projectId) return
    Tasks.list(projectId).then(setTasks)
    Issues.list(projectId).then(setIssues)
    loadSchedule(baselineId)
  }, [projectId, loadSchedule, baselineId])

  useEffect(() => {
    if (!projectId) { setTasks([]); return }
    setTasks(null)
    reload()
    Projects.get(projectId).then(setProject)
    Vendors.list().then(setVendors)
    Projects.baselines(projectId).then(setBaselines)
  }, [projectId, reload])

  const today = todayLocal()
  const { roots, byId } = useMemo(() => buildTree(tasks || []), [tasks])
  const allNodes = useMemo(() => flatten(roots), [roots])

  // ---------- visible rows
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let keep = null
    if (q || filter !== 'all') {
      keep = new Set()
      for (const n of allNodes) {
        const matchQ = !q || `${n.wbs_code || ''} ${n.name} ${n.vendor_name || ''}`.toLowerCase().includes(q)
        const matchF = filter === 'all'
          || (filter === 'late' && n.children.length === 0 && isLate(n, today))
          || (filter === 'active' && n.children.length === 0 && n.rollProgress > 0 && n.rollProgress < 100)
          || (filter === 'undated' && n.children.length === 0 && !n.estimated_start)
          || (filter === 'crit' && n.children.length === 0 && sched?.tasks?.[n.id]?.critical)
        if (matchQ && matchF) n.path.forEach(id => keep.add(id))
      }
    }
    return allNodes.filter(n => {
      if (keep) return keep.has(n.id)
      if (n.depth >= maxDepth) return false
      return !n.path.slice(0, -1).some(id => collapsed[id])
    })
  }, [allNodes, collapsed, maxDepth, filter, query, sched])

  // ---------- timeline range
  const dayPx = DAY_PX[zoom]
  const rowH = ROW_H[density]
  const { start, days } = useMemo(() => {
    const dates = []
    for (const n of allNodes) for (const d of [n.estimated_start, n.estimated_end, n.actual_start, n.actual_end]) if (d) dates.push(parseISODate(d))
    if (project?.start_date) dates.push(parseISODate(project.start_date))
    if (sched?.forecast_finish) dates.push(parseISODate(sched.forecast_finish))
    let min = dates.length ? new Date(Math.min(...dates)) : addDays(today, -14)
    let max = dates.length ? new Date(Math.max(...dates, today)) : addDays(today, 120)
    min = addDays(min, -7)
    min = addDays(min, -((min.getDay() + 6) % 7)) // back to Monday
    max = addDays(max, 28)
    return { start: min, days: Math.max(daysBetween(min, max), 60) }
  }, [allNodes, project, sched])
  const chartW = Math.round(days * dayPx)
  const x = (d) => daysBetween(start, d) * dayPx
  const weekOne = useMemo(() => {
    const ps = parseISODate(project?.start_date) || start
    return addDays(ps, -((ps.getDay() + 6) % 7))
  }, [project, start])

  // ---------- header
  const header = useMemo(() => {
    const months = []
    const m = new Date(start.getFullYear(), start.getMonth(), 1)
    const end = addDays(start, days)
    while (m < end) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1)
      const l = Math.max(0, x(m)), r = Math.min(chartW, x(next))
      if (r > l) months.push({ key: toISODate(m), label: `${MONTHS[lang][m.getMonth()]} ${m.getFullYear()}`, left: l, width: r - l })
      m.setMonth(m.getMonth() + 1)
    }
    const ticks = []
    if (zoom === 'week') {
      for (let d = new Date(start); d < end; d = addDays(d, 7)) {
        const wk = Math.floor(daysBetween(weekOne, d) / 7) + 1
        ticks.push({ key: toISODate(d), left: x(d), width: 7 * dayPx, label: wk >= 1 ? `${lang === 'mk' ? 'Н' : 'W'}${wk}` : '' })
      }
    } else if (zoom === 'day') {
      for (let d = new Date(start); d < end; d = addDays(d, 1)) {
        ticks.push({ key: toISODate(d), left: x(d), width: dayPx, label: String(d.getDate()), sunday: d.getDay() === 0 })
      }
    }
    return { months, ticks }
  }, [start, days, zoom, lang, dayPx, weekOne])

  const gridBg = zoom === 'month'
    ? {}
    : {
      backgroundImage: `repeating-linear-gradient(to right, #EEF0F3 0 1px, transparent 1px ${7 * dayPx}px), repeating-linear-gradient(to right, transparent 0 ${6 * dayPx}px, rgba(21,32,48,0.035) ${6 * dayPx}px ${7 * dayPx}px)`,
    }

  // ---------- bar geometry per visible row
  // Main bar: actual dates once work has started, otherwise the calculated (forecast) dates;
  // thin grey line: the saved baseline, or the original plan when there is no baseline.
  const geo = useMemo(() => {
    const g = {}
    const S = sched?.tasks || {}
    const bar = (a, b, min = 3) => ({ left: x(a), width: Math.max((daysBetween(a, b) + 1) * dayPx, min) })
    visible.forEach((n, i) => {
      const isParent = n.children.length > 0
      const s = S[n.id]
      const pStart = isParent ? n.rollStart : n.estimated_start
      const pEnd = isParent ? n.rollEnd : n.estimated_end
      let main = null
      if (s && s.es && s.ef) {
        const aStart = isParent ? n.rollActualStart : n.actual_start
        main = [aStart && aStart < s.es ? aStart : s.es, s.ef]
      } else {
        const aStart = isParent ? n.rollActualStart : n.actual_start
        let aEnd = isParent ? n.rollActualEnd : n.actual_end
        if (aStart && !aEnd) aEnd = toISODate(new Date(Math.max(today, parseISODate(pEnd) || today)))
        main = aStart ? [aStart, aEnd] : (pStart && pEnd ? [pStart, pEnd] : null)
      }
      let base = null
      if (s?.baseline_start && s?.baseline_end) base = [s.baseline_start, s.baseline_end]
      else if (pStart && pEnd && main && (pStart !== main[0] || pEnd !== main[1])) base = [pStart, pEnd]
      const barH = density === 'compact' ? 12 : 16
      const top = Math.round((rowH - barH) / 2) - (showBaseline && base ? 2 : 0)
      g[n.id] = {
        index: i, isParent, s,
        base: base ? bar(base[0], base[1], 2) : null, baseDates: base,
        main: main ? bar(main[0], main[1]) : null, mainDates: main,
        milestone: n.is_milestone && (s?.es || pStart) ? x(s?.es || pStart) + dayPx / 2 : null,
        barH, top, y: i * rowH + top + barH / 2,
      }
    })
    return g
  }, [visible, rowH, dayPx, start, showBaseline, density, sched])

  const arrows = useMemo(() => {
    if (!showDeps) return []
    const out = []
    const S = sched?.tasks || {}
    for (const n of visible) {
      for (const dep of n.dependencies || []) {
        const a = geo[dep.predecessor], b = geo[n.id]
        if (!a?.main || !b?.main) continue
        const fromEnd = dep.type === 'FS' || dep.type === 'FF'
        const toEnd = dep.type === 'FF' || dep.type === 'SF'
        const x1 = fromEnd ? a.main.left + a.main.width : a.main.left
        const x2 = toEnd ? b.main.left + b.main.width : b.main.left
        const out1 = fromEnd ? x1 + 8 : x1 - 8
        const bend = toEnd ? Math.max(out1, x2 + 10) : (fromEnd ? out1 : Math.min(out1, x2 - 10))
        const end = toEnd ? x2 + 2 : x2 - 2
        const d = `M ${x1} ${a.y} L ${bend} ${a.y} L ${bend} ${b.y} L ${end} ${b.y}`
        const driving = (S[n.id]?.driving || []).some(w => w.dependency === dep.id)
        const crit = driving && S[n.id]?.critical && S[dep.predecessor]?.critical !== false
        out.push({ key: dep.id, d, crit, label: `${dep.type}${dep.lag_days ? (dep.lag_days > 0 ? '+' : '') + dep.lag_days : ''}`, lx: bend, ly: (a.y + b.y) / 2, showLabel: dep.type !== 'FS' || dep.lag_days })
      }
    }
    return out
  }, [visible, geo, showDeps, sched])

  // ---------- actions
  const toggle = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }))
  const setLevel = (lvl) => { setMaxDepth(lvl); setCollapsed({}) }
  const openCreate = (parentNode) => {
    const siblings = parentNode ? parentNode.children : roots
    setEditor({ mode: 'create', defaults: { parent: parentNode?.id || '', wbs_code: suggestCode(parentNode, siblings) } })
    if (parentNode) setCollapsed(c => ({ ...c, [parentNode.id]: false }))
  }
  const remove = async (n) => {
    const count = n.children.length ? flatten(n.children).length : 0
    const ok = await confirm({
      title: t('gantt.deleteTitle', { name: `${n.wbs_code ? n.wbs_code + ' ' : ''}${n.name}` }),
      message: count ? t('gantt.deleteWithChildren', { n: count }) : t('gantt.deleteNoChildren'),
      note: t('gantt.deleteNote'), confirmLabel: t('common.delete'), danger: true,
    })
    if (!ok) return
    await Tasks.remove(n.id)
    reload()
    toast(t('gantt.deleted', { name: n.wbs_code || n.name }), {
      duration: 10000,
      action: { label: t('common.undo'), onClick: async () => { await Tasks.restore(n.id); reload(); toast(t('gantt.restored'), { tone: 'success', duration: 3000 }) } },
    })
  }
  const duplicate = async (n) => {
    await Tasks.duplicate(n.id)
    reload()
    toast(t('gantt.duplicated'), { tone: 'success', duration: 3000 })
  }

  // ---------- KPIs
  const kpi = useMemo(() => {
    const total = roots.reduce((s, r) => s + r.totalCost, 0)
    const weighted = roots.reduce((s, r) => s + r.totalCost * r.rollProgress, 0)
    const leaves = allNodes.filter(n => n.children.length === 0)
    return {
      progress: total > 0 ? weighted / total : 0,
      positions: leaves.length,
      late: leaves.filter(n => isLate(n, today)).length,
      undated: leaves.filter(n => !n.estimated_start).length,
      end: roots.reduce((m, r) => (r.rollEnd && (!m || r.rollEnd > m) ? r.rollEnd : m), null),
      critical: sched ? leaves.filter(n => sched.tasks?.[n.id]?.critical).length : 0,
    }
  }, [roots, allNodes, sched])

  const saveBaseline = async () => {
    const bl = await Projects.createBaseline(projectId, `${t('gantt.baselineName')} ${formatDate(toISODate(today))}`)
    const list = await Projects.baselines(projectId)
    setBaselines(list); setBaselineId(bl.id); loadSchedule(bl.id)
    toast(t('gantt.baselineSaved'), { tone: 'success', duration: 3000 })
  }
  const openReschedule = async () => setResched(await Projects.reschedule(projectId, false))
  const applyReschedule = async () => {
    await Projects.reschedule(projectId, true)
    setResched(null); reload()
    toast(t('gantt.rescheduled'), { tone: 'success', duration: 4000 })
  }

  // First load: scroll the timeline so the project start (or two weeks before today) is in view.
  useEffect(() => {
    if (!tasks || didScroll.current || !scrollRef.current) return
    didScroll.current = true
    const ps = parseISODate(project?.start_date) || parseISODate(allNodes.map(n => n.estimated_start).filter(Boolean).sort()[0])
    const anchor = ps && ps > addDays(today, -90) ? ps : addDays(today, -14)
    scrollRef.current.scrollLeft = Math.max(0, x(addDays(anchor, -7)))
  })

  if (!projectId) return <Card><EmptyState title={t('common.noProject')} subtitle={t('common.noProjectHint')} /></Card>
  if (tasks === null) return <Loading rows={8} />

  const todayX = x(today)
  const bodyH = visible.length * rowH
  const levelValue = maxDepth >= 99 ? 'all' : String(maxDepth)

  return (
    <div>
      <div className="print-only mb-3">
        <div className="text-xs text-ink-400">United Build Group · {t('nav.schedule')}</div>
        <h1 className="text-lg font-semibold">{project?.name}</h1>
        <div className="text-xs text-ink-400">{t('gantt.statusDate')}: {formatDate(toISODate(today))}</div>
      </div>

      <PageHeader
        title={t('nav.schedule')}
        subtitle={`${t('gantt.positionsCount', { n: kpi.positions })} · ${t('gantt.calendarNote')} · ${t('gantt.statusDate')} ${formatDate(toISODate(today))}`}
        action={
          <div className="flex items-center gap-6 no-print">
            <Kpi label={t('gantt.plannedEnd')} value={formatDate(sched?.planned_finish || project?.estimated_end_date || kpi.end)} sub={project?.estimated_end_date && sched?.planned_finish && project.estimated_end_date !== sched.planned_finish ? `${t('gantt.deadline')} ${formatDate(project.estimated_end_date)}` : undefined} />
            {sched?.forecast_finish && (
              <Kpi label={t('gantt.forecastEnd')} value={formatDate(sched.forecast_finish)}
                sub={sched.finish_variance ? `${sched.finish_variance > 0 ? '+' : ''}${sched.finish_variance} ${t('gantt.wdShort')}` : t('gantt.onPlan')}
                tone={sched.finish_variance > 0 ? 'red' : 'green'} />
            )}
            <Kpi label={t('gantt.criticalCount')} value={kpi.critical} tone={kpi.critical ? 'red' : undefined} />
            <Kpi label={t('gantt.progress')} value={`${Math.round(kpi.progress)} %`} />
            <Kpi label={t('gantt.undated')} value={kpi.undated} tone={kpi.undated ? 'amber' : undefined} />
          </div>
        }
      />

      <div className="flex items-center gap-2.5 flex-wrap mb-3 no-print">
        <label className="flex items-center gap-2 h-9 px-3 border border-line rounded-lg bg-white w-[240px]">
          <Search size={15} className="text-ink-300" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('gantt.search')}
            className="flex-1 min-w-0 text-[13px] outline-none bg-transparent" />
        </label>
        <Segmented label={t('gantt.level')} value={levelValue} onChange={(v) => setLevel(v === 'all' ? 99 : Number(v))}
          options={[{ value: '1', label: t('gantt.level1') }, { value: '2', label: t('gantt.level2') }, { value: 'all', label: t('gantt.level3') }]} />
        <Segmented label={t('gantt.zoom')} value={zoom} onChange={setZoom}
          options={[{ value: 'day', label: t('gantt.day') }, { value: 'week', label: t('gantt.week') }, { value: 'month', label: t('gantt.month') }]} />
        <Segmented label={t('gantt.density')} value={density} onChange={setDensity}
          options={[{ value: 'comfortable', label: t('gantt.comfortable') }, { value: 'compact', label: t('gantt.compact') }]} />
        <Segmented label={t('gantt.filter')} value={filter} onChange={setFilter}
          options={[{ value: 'all', label: t('gantt.all') }, { value: 'crit', label: t('gantt.criticalF') }, { value: 'active', label: t('gantt.active') }, { value: 'late', label: t('gantt.lateF') }, { value: 'undated', label: t('gantt.undatedF') }]} />
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[13px] text-ink-600"><input type="checkbox" className="accent-blueprint-600" checked={showBaseline} onChange={e => setShowBaseline(e.target.checked)} />{t('gantt.baseline')}</label>
        <select aria-label={t('gantt.baselinePick')} value={baselineId || sched?.baseline?.id || ''}
          onChange={(e) => { setBaselineId(e.target.value); loadSchedule(e.target.value) }}
          className="h-9 border border-line rounded-lg bg-white text-[13px] px-2 max-w-[190px]">
          <option value="">{baselines.length ? t('gantt.baselineLatest') : t('gantt.baselinePlan')}</option>
          {baselines.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <Button variant="secondary" size="sm" icon={Save} onClick={saveBaseline} title={t('gantt.saveBaselineHint')}>{t('gantt.saveBaseline')}</Button>
        <Button variant="secondary" size="sm" icon={CalendarClock} onClick={openReschedule}>{t('gantt.reschedule')}</Button>
        <label className="flex items-center gap-1.5 text-[13px] text-ink-600"><input type="checkbox" className="accent-blueprint-600" checked={showDeps} onChange={e => setShowDeps(e.target.checked)} />{t('gantt.dependencies')}</label>
        <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>{t('gantt.print')}</Button>
        <Button size="sm" icon={Plus} onClick={() => openCreate(null)}>{t('gantt.newPosition')}</Button>
      </div>

      {schedErr && (
        <div className="mb-3 flex gap-2 items-start text-[13px] text-status-red bg-status-redBg rounded-lg px-3 py-2.5 no-print">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{schedErr.loop ? t('gantt.loopError', { path: schedErr.loop.join(' → ') }) : String(schedErr.detail || '')}</span>
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <div ref={scrollRef} className="gantt-scroll overflow-auto" style={{ maxHeight: 'calc(100vh - 290px)', minHeight: 360 }}>
          <div style={{ width: LEFT_W + chartW }} className="relative">
            {/* header */}
            <div className="flex sticky top-0 z-20 bg-[#FAFBFC] border-b border-line" style={{ height: zoom === 'month' ? 30 : 52 }}>
              <div className="sticky left-0 z-10 bg-[#FAFBFC] border-r border-line grid items-end pb-2 text-xs font-semibold text-ink-400 shrink-0"
                style={{ width: LEFT_W, gridTemplateColumns: COLS }}>
                <span className="pl-11">{t('gantt.colPosition')}</span>
                <span className="pl-2">{t('gantt.colVendor')}</span>
                <span className="text-right pr-2">{t('gantt.colDuration')}</span>
                <span className="text-right pr-2" title={t('gantt.floatHint')}>{t('gantt.colFloat')}</span>
                <span className="text-right pr-3">{t('gantt.colBudget')}</span>
                <span />
              </div>
              <div className="relative shrink-0" style={{ width: chartW }}>
                {header.months.map(m => (
                  <div key={m.key} className="absolute top-0 h-[26px] border-l border-line pl-2 text-xs font-semibold text-ink-600 leading-[26px] whitespace-nowrap overflow-hidden"
                    style={{ left: m.left, width: m.width }}>{m.label}</div>
                ))}
                {header.ticks.map(tk => (
                  <div key={tk.key} className={`absolute top-[26px] h-[26px] border-l border-line-soft text-[11px] text-center leading-[26px] ${tk.sunday ? 'text-ink-300 bg-ink-50' : 'text-ink-400'}`}
                    style={{ left: tk.left, width: tk.width }}>{tk.label}</div>
                ))}
                {todayX >= 0 && todayX <= chartW && (
                  <div className="absolute bottom-[3px] h-5 px-1.5 rounded bg-blueprint-600 text-white text-[11px] font-semibold leading-5 -translate-x-1/2 whitespace-nowrap"
                    style={{ left: todayX + dayPx / 2 }}>{formatDate(toISODate(today)).slice(0, 5)}</div>
                )}
              </div>
            </div>

            {/* rows */}
            <div className="relative">
              {visible.map(n => {
                const g = geo[n.id]
                const s = sched?.tasks?.[n.id]
                const tone = toneFor(n, today, s)
                const c = COLORS[tone]
                const isParent = n.children.length > 0
                const dur = workingDays(isParent ? n.rollStart : n.estimated_start, isParent ? n.rollEnd : n.estimated_end)
                const slip = !isParent && s && !s.done && s.plan_finish_variance > 0 ? s.plan_finish_variance : 0
                const late = !isParent && (slip > 0 || (!s && isLate(n, today)))
                const tf = s && !s.done && s.total_float !== undefined ? s.total_float : null
                const openIssues = issues.filter(i => i.related_task === n.id && i.status !== 'resolved').length
                const pct = Math.round(n.rollProgress)
                return (
                  <React.Fragment key={n.id}>
                    <div className={`flex border-b border-line-soft group ${isParent ? 'bg-[#FAFBFC]' : 'bg-white'} hover:bg-blueprint-50/40`} style={{ height: rowH }}>
                      <div className={`sticky left-0 z-10 focus-within:z-30 shrink-0 grid items-center border-r border-line ${isParent ? 'bg-[#FAFBFC]' : 'bg-white'} group-hover:bg-[#F3F6FB]`}
                        style={{ width: LEFT_W, gridTemplateColumns: COLS }}>
                        <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: 8 + n.depth * 20 }}>
                          {isParent ? (
                            <button type="button" onClick={() => toggle(n.id)} aria-label={collapsed[n.id] ? t('gantt.expand') : t('gantt.collapse')} aria-expanded={!collapsed[n.id]}
                              className="w-6 h-6 flex items-center justify-center rounded text-ink-400 hover:bg-ink-100 shrink-0">
                              <ChevronDown size={15} className="transition-transform" style={{ transform: collapsed[n.id] ? 'rotate(-90deg)' : 'none' }} />
                            </button>
                          ) : <span className="w-6 shrink-0" />}
                          <span className="text-xs text-ink-400 shrink-0" style={{ minWidth: isParent && n.depth === 0 ? 16 : 40 }}>{n.wbs_code}</span>
                          <button type="button" onClick={() => setDetailTask(n)}
                            className={`truncate text-left hover:text-blueprint-700 ${density === 'compact' ? 'text-xs' : 'text-[13px]'} ${isParent ? 'font-semibold text-ink-800' : 'text-ink-700'}`}
                            title={n.name}>{n.name}</button>
                          {isParent && collapsed[n.id] && <span className="text-xs text-ink-300 shrink-0">({n.leafCount})</span>}
                          {late && <Badge tone="red">{slip ? `+${slip} ${t('gantt.wdShort')}` : t('gantt.lateBadge')}</Badge>}
                          {!isParent && s?.violations?.length > 0 && <Badge tone="amber">{t('gantt.constraintBadge')}</Badge>}
                          {n.is_milestone && <Diamond size={12} className="text-blueprint-600 shrink-0" />}
                          {openIssues > 0 && (
                            <button type="button" onClick={() => setExpandedIssuesId(expandedIssuesId === n.id ? null : n.id)}
                              className="text-[11px] font-semibold text-status-red bg-status-redBg rounded-full px-1.5 shrink-0">! {openIssues}</button>
                          )}
                        </div>
                        <div className="pl-2 text-[13px] text-ink-600 truncate" title={n.vendor_name || ''}>{n.vendor_name || ''}</div>
                        <div className="text-[13px] text-right pr-2 text-ink-600">{(!isParent && s?.duration !== undefined ? s.duration : dur) ? `${!isParent && s?.duration !== undefined ? s.duration : dur} ${t('gantt.daysShort')}` : ''}</div>
                        <div className={`text-[13px] text-right pr-2 ${tf === null ? 'text-ink-300' : tf <= 0 ? 'text-status-red font-semibold' : s?.near_critical ? 'text-status-amber font-medium' : 'text-ink-600'}`}
                          title={tf !== null ? t('gantt.floatTitle', { tf, ff: s.free_float }) : ''}>{tf === null ? (s?.done ? '✓' : '') : `${tf} ${t('gantt.daysShort')}`}</div>
                        <div className={`text-[13px] text-right pr-3 ${isParent ? 'font-semibold text-ink-800' : 'text-ink-600'}`}>{n.totalCost ? format(n.totalCost, { decimals: 0 }) : ''}</div>
                        <div className="flex justify-center no-print">
                          <Menu
                            trigger={({ toggle: tg, open }) => (
                              <button type="button" onClick={tg} aria-label={t('gantt.actions')}
                                className={`w-7 h-7 flex items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 ${open ? 'bg-blueprint-50 text-blueprint-700' : 'opacity-60 group-hover:opacity-100'}`}>
                                <MoreHorizontal size={17} />
                              </button>
                            )}
                            items={[
                              { label: t('gantt.edit'), icon: Pencil, onClick: () => setEditor({ mode: 'edit', task: n }) },
                              { label: t('gantt.realization'), icon: ClipboardList, onClick: () => setDetailTask(n) },
                              { divider: true },
                              { label: t('gantt.addSub'), icon: FolderPlus, onClick: () => openCreate(n) },
                              { label: t('gantt.addSibling'), icon: Plus, onClick: () => openCreate(n.parent ? byId.get(n.parent) : null) },
                              { label: t('gantt.duplicate'), icon: CopyPlus, onClick: () => duplicate(n) },
                              { divider: true },
                              { label: t('gantt.delete'), icon: Trash2, danger: true, onClick: () => remove(n) },
                            ]}
                          />
                        </div>
                      </div>
                      <div className="relative shrink-0" style={{ width: chartW, ...gridBg }}>
                        {g.milestone !== null ? (
                          <div className="absolute w-3 h-3 rotate-45" title={formatDate(s?.es || n.estimated_start)}
                            style={{ left: g.milestone - 6, top: rowH / 2 - 6, background: c.line }} />
                        ) : isParent ? (
                          g.main && (
                            <>
                              <div className="absolute" style={{ left: g.main.left, width: g.main.width, top: rowH / 2 - 4, height: 7, background: '#3D4A5C', borderRadius: 1 }} />
                              <div className="absolute" style={{ left: g.main.left, top: rowH / 2 + 3, borderLeft: '6px solid #3D4A5C', borderBottom: '6px solid transparent' }} />
                              <div className="absolute" style={{ left: g.main.left + g.main.width - 6, top: rowH / 2 + 3, borderRight: '6px solid #3D4A5C', borderBottom: '6px solid transparent' }} />
                              <div className="absolute text-xs text-ink-600 whitespace-nowrap" style={{ left: g.main.left + g.main.width + 8, top: rowH / 2 - 8, lineHeight: '16px' }}>{pct} %</div>
                            </>
                          )
                        ) : g.main ? (
                          <>
                            {showBaseline && g.base && (
                              <div className="absolute rounded-sm" title={`${sched?.baseline ? sched.baseline.name : t('gantt.baselinePlan')}: ${formatDate(g.baseDates[0])} – ${formatDate(g.baseDates[1])}`}
                                style={{ left: g.base.left, width: g.base.width, bottom: density === 'compact' ? 2 : 4, height: 3, background: '#C6CCD5' }} />
                            )}
                            <div className="absolute rounded-[3px] overflow-hidden cursor-pointer"
                              onClick={() => setDetailTask(n)}
                              title={`${n.wbs_code || ''} ${n.name}\n${t('gantt.planned')}: ${formatDate(n.estimated_start)} – ${formatDate(n.estimated_end)}${s?.es ? `\n${t('gantt.forecast')}: ${formatDate(s.es)} – ${formatDate(s.ef)}` : ''}${n.actual_start ? `\n${t('gantt.actual')}: ${formatDate(n.actual_start)} – ${n.actual_end ? formatDate(n.actual_end) : t('gantt.ongoing')}` : ''}${tf !== null ? `\n${t('gantt.colFloat')}: ${tf} ${t('gantt.daysShort')}` : ''}\n${pct} %`}
                              style={{ left: g.main.left, width: g.main.width, top: g.top, height: g.barH, background: c.fill, boxShadow: `inset 0 0 0 1px ${c.line}` }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: c.line }} />
                            </div>
                            <div className="absolute text-xs text-ink-600 whitespace-nowrap pointer-events-none" style={{ left: g.main.left + g.main.width + 8, top: g.top + g.barH / 2 - 8, lineHeight: '16px' }}>
                              {n.vendor_name ? `${n.vendor_name} · ` : ''}{pct} %
                            </div>
                          </>
                        ) : (
                          <div className="absolute left-3 text-xs text-ink-300 whitespace-nowrap" style={{ top: rowH / 2 - 8, lineHeight: '16px' }}>
                            {t('gantt.noDates')} · <button type="button" className="text-blueprint-600 hover:underline no-print" onClick={() => setEditor({ mode: 'edit', task: n })}>{t('gantt.setDates')}</button>
                          </div>
                        )}
                      </div>
                    </div>
                    {expandedIssuesId === n.id && (
                      <div className="border-b border-line-soft bg-ink-50/50 p-3 space-y-2" style={{ paddingLeft: 48 }}>
                        {issues.filter(i => i.related_task === n.id).map(issue => <IssueCard key={issue.id} issue={issue} onChanged={reload} />)}
                      </div>
                    )}
                  </React.Fragment>
                )
              })}

              {/* overlay: today line + dependency arrows (chart area only) */}
              {expandedIssuesId === null && (
                <div className="absolute top-0 pointer-events-none" style={{ left: LEFT_W, width: chartW, height: bodyH }}>
                  {todayX >= 0 && todayX <= chartW && <div className="absolute top-0 bottom-0 w-[2px] bg-blueprint-600/80" style={{ left: todayX + dayPx / 2 }} />}
                  <svg width={chartW} height={bodyH} className="absolute inset-0 overflow-visible" aria-hidden="true">
                    <defs>
                      <marker id="ah-n" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#7F8FA6" /></marker>
                      <marker id="ah-r" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#B42318" /></marker>
                    </defs>
                    {arrows.map(a => (
                      <path key={a.key} d={a.d} fill="none" stroke={a.crit ? '#B42318' : '#7F8FA6'} strokeWidth={a.crit ? 1.8 : 1.3} markerEnd={`url(#${a.crit ? 'ah-r' : 'ah-n'})`} />
                    ))}
                    {arrows.filter(a => a.showLabel).map(a => (
                      <text key={`${a.key}-l`} x={a.lx + 3} y={a.ly + 3} fontSize="10" fill={a.crit ? '#B42318' : '#5E6A7B'} fontFamily="IBM Plex Sans, sans-serif">{a.label}</text>
                    ))}
                  </svg>
                </div>
              )}
            </div>

            {visible.length === 0 && (
              <div className="sticky left-0" style={{ width: LEFT_W + Math.min(chartW, 600) }}>
                <EmptyState title={allNodes.length ? t('gantt.nothingMatches') : t('gantt.empty')}
                  subtitle={allNodes.length ? '' : t('gantt.emptyHint')}
                  action={!allNodes.length && <Button icon={Plus} onClick={() => openCreate(null)}>{t('gantt.newPosition')}</Button>} />
              </div>
            )}
            <div className="flex border-t border-line-soft no-print">
              <div className="sticky left-0 bg-white border-r border-line px-3 py-2 shrink-0" style={{ width: LEFT_W }}>
                <Button variant="ghost" size="sm" icon={Plus} onClick={() => openCreate(null)}>{t('gantt.addTopLevel')}</Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-5 mt-3 mb-6 text-xs text-ink-400 no-print">
        {[['red', t('gantt.legendCritical')], ['blue', t('gantt.legendOnTrack')], ['green', t('gantt.legendDone')], ['amber', t('gantt.legendWatch')]].map(([k, label]) => (
          <span key={k} className="flex items-center gap-2"><span className="inline-block w-6 h-2.5 rounded-sm" style={{ background: COLORS[k].line }} />{label}</span>
        ))}
        <span className="flex items-center gap-2"><span className="inline-block w-6 h-[3px] bg-[#C6CCD5]" />{t('gantt.legendBaseline')}</span>
        <span className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 bg-[rgba(21,32,48,0.12)]" />{t('gantt.legendSunday')}</span>
        <span>{t('gantt.legendFill')}</span>
      </div>

      {issues.length > 0 && (
        <SectionCard title={t('gantt.issuesTitle')} className="no-print">
          <div className="space-y-2">{issues.map(i => <IssueCard key={i.id} issue={i} onChanged={reload} />)}</div>
        </SectionCard>
      )}

      <TaskEditor
        open={!!editor} onClose={() => setEditor(null)} mode={editor?.mode} task={editor?.task} defaults={editor?.defaults}
        projectId={projectId} nodes={allNodes} byId={byId} vendors={vendors}
        onVendorsChanged={() => Vendors.list().then(setVendors)} onSaved={reload}
      />
      <TaskDetailPanel
        key={detailTask?.id || 'none'}
        task={detailTask ? tasks.find(x => x.id === detailTask.id) : null}
        projectId={projectId}
        onClose={() => setDetailTask(null)}
        onUpdated={(updated) => { setTasks(prev => prev.map(x => x.id === updated.id ? updated : x)); loadSchedule(baselineId) }}
        sched={sched} byId={byId}
      />
      <Modal open={!!resched} onClose={() => setResched(null)} title={t('gantt.rescheduleTitle')} width={720}
        footer={<>
          <Button variant="secondary" onClick={() => setResched(null)}>{t('common.cancel')}</Button>
          <Button onClick={applyReschedule} disabled={!resched?.changes?.length}>{t('gantt.rescheduleApply', { n: resched?.changes?.length || 0 })}</Button>
        </>}>
        <p className="text-[13px] text-ink-500 mb-3">{t('gantt.rescheduleHint')}</p>
        {resched?.changes?.length ? (
          <div className="max-h-[50vh] overflow-y-auto border border-line rounded-lg">
            <table className="w-full text-[13px]">
              <thead className="bg-[#FAFBFC] text-xs text-ink-400 text-left sticky top-0"><tr><th className="px-3 py-2 font-semibold">{t('gantt.colPosition')}</th><th className="font-semibold">{t('gantt.planned')}</th><th className="font-semibold pr-3">{t('gantt.newDates')}</th></tr></thead>
              <tbody>
                {resched.changes.map(c => (
                  <tr key={c.task} className="border-t border-line-soft">
                    <td className="px-3 py-2"><span className="text-ink-400 mr-1.5">{c.code}</span>{c.name}</td>
                    <td className="text-ink-400 line-through whitespace-nowrap">{formatDate(c.old_start)} – {formatDate(c.old_end)}</td>
                    <td className="pr-3 font-medium whitespace-nowrap">{formatDate(c.new_start)} – {formatDate(c.new_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-status-green">{t('gantt.rescheduleNone')}</p>}
      </Modal>
    </div>
  )
}

function Kpi({ label, value, tone, sub }) {
  const c = tone === 'red' ? 'text-status-red' : tone === 'amber' ? 'text-status-amber' : tone === 'green' ? 'text-status-green' : 'text-ink-800'
  return (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${sub ? 'text-ink-800' : c}`}>
        {value}{sub && <span className={`ml-1.5 text-xs font-semibold ${c}`}>{sub}</span>}
      </div>
    </div>
  )
}
