import React, { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Tasks, Vendors } from '../lib/api'
import { useT } from '../lib/i18n.jsx'
import { useFeedback } from './feedback.jsx'
import { Button, Drawer, Field, Input, Select, TextArea } from './ui.jsx'
import MoneyInput from './MoneyInput.jsx'
import { formatMoney, workingDays } from '../lib/format.js'
import DateInput from './DateInput.jsx'

/**
 * Create / edit a position (planning fields). Realization (actuals, documents, issues)
 * stays in <TaskDetailPanel>.
 *   mode: 'edit' | 'create'
 *   defaults: { parent, wbs_code } for create
 */
export default function TaskEditor({ open, onClose, mode, task, defaults, projectId, nodes, byId, vendors, onVendorsChanged, onSaved }) {
  const { t } = useT()
  const { toast } = useFeedback()
  const blank = { wbs_code: '', name: '', parent: '', vendor: '', estimated_start: '', estimated_end: '', estimated_cost: null, is_milestone: false, deps: [], notes: '', calendar_mode: 'project', constraint_type: '', constraint_date: '' }
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [newVendor, setNewVendor] = useState(null)
  const [depPick, setDepPick] = useState('')

  useEffect(() => {
    if (!open) return
    setErrors({}); setNewVendor(null); setDepPick('')
    if (mode === 'edit' && task) {
      setForm({
        wbs_code: task.wbs_code || '', name: task.name || '', parent: task.parent || '', vendor: task.vendor || '',
        estimated_start: task.estimated_start || '', estimated_end: task.estimated_end || '',
        estimated_cost: task.estimated_cost === null || task.estimated_cost === undefined ? null : Number(task.estimated_cost),
        is_milestone: !!task.is_milestone, notes: task.notes || '',
        deps: (task.dependencies || []).map(d => ({ predecessor: d.predecessor, type: d.type, lag_days: d.lag_days })),
        calendar_mode: task.calendar_mode || 'project', constraint_type: task.constraint_type || '', constraint_date: task.constraint_date || '',
      })
    } else {
      setForm({ ...blank, ...(defaults || {}), parent: defaults?.parent || '' })
    }
  }, [open, mode, task?.id])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))

  // Parent options: everything except this task and its own descendants.
  const forbidden = useMemo(() => {
    if (mode !== 'edit' || !task) return new Set()
    const out = new Set([task.id])
    const walk = (n) => n.children.forEach(c => { out.add(c.id); walk(c) })
    const node = byId.get(task.id)
    if (node) walk(node)
    return out
  }, [mode, task, byId])

  const label = (n) => `${'  '.repeat(n.depth)}${n.wbs_code ? n.wbs_code + ' ' : ''}${n.name}`
  const node = task ? byId.get(task.id) : null
  const hasChildren = node && node.children.length > 0
  const days = workingDays(form.estimated_start, form.estimated_end)

  const save = async () => {
    const errs = {}
    if (!form.name.trim()) errs.name = t('editor.errName')
    if (form.estimated_start && form.estimated_end && form.estimated_end < form.estimated_start) errs.estimated_end = t('editor.errEnd')
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      let vendorId = form.vendor || null
      if (newVendor && newVendor.trim()) {
        const v = await Vendors.create({ name: newVendor.trim() })
        vendorId = v.id
        onVendorsChanged?.()
      }
      const payload = {
        wbs_code: form.wbs_code.trim(), name: form.name.trim(), parent: form.parent || null, vendor: vendorId,
        estimated_start: form.estimated_start || null,
        estimated_end: form.is_milestone ? (form.estimated_start || null) : (form.estimated_end || null),
        estimated_cost: form.estimated_cost ?? 0, is_milestone: form.is_milestone,
        dependency_specs: form.deps.map(d => ({ predecessor: d.predecessor, type: d.type, lag_days: Number(d.lag_days) || 0 })),
        notes: form.notes, calendar_mode: form.calendar_mode,
        constraint_type: form.constraint_type, constraint_date: form.constraint_type ? (form.constraint_date || null) : null,
      }
      const saved = mode === 'edit'
        ? await Tasks.update(task.id, payload)
        : await Tasks.create({ ...payload, project: projectId, order: nodes.length + 1 })
      toast(mode === 'edit' ? t('editor.saved') : t('editor.created'), { tone: 'success', duration: 3000 })
      onSaved?.(saved)
      onClose()
    } catch (e) {
      const d = e?.response?.data
      if (d && typeof d === 'object') {
        const fe = {}
        for (const [k, v] of Object.entries(d)) fe[k] = Array.isArray(v) ? v.join(' ') : String(v)
        setErrors(fe)
      }
    } finally {
      setSaving(false)
    }
  }

  const predIds = form.deps.map(d => d.predecessor)
  const predOptions = nodes.filter(n => !forbidden.has(n.id) && !predIds.includes(n.id) && n.id !== task?.id)
  const setDep = (i, patch) => setForm(f => ({ ...f, deps: f.deps.map((d, j) => j === i ? { ...d, ...patch } : d) }))

  return (
    <Drawer open={open} onClose={onClose} width={500}
      subtitle={mode === 'edit' ? t('editor.editSubtitle') : (defaults?.parent && byId.get(defaults.parent) ? t('editor.newUnder', { name: `${byId.get(defaults.parent).wbs_code || ''} ${byId.get(defaults.parent).name}` }) : t('editor.newSubtitle'))}
      title={mode === 'edit' ? `${task?.wbs_code ? task.wbs_code + ' ' : ''}${task?.name || ''}` : t('editor.newTitle')}
      footer={<>
        <Button onClick={save} disabled={saving} className="flex-1" size="lg">{saving ? t('common.saving') : t('common.save')}</Button>
        <Button variant="secondary" size="lg" onClick={onClose}>{t('common.cancel')}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Field label={t('editor.code')} error={errors.wbs_code}><Input value={form.wbs_code} onChange={set('wbs_code')} placeholder="А08" /></Field>
          <Field label={t('editor.name')} required error={errors.name}><Input value={form.name} onChange={set('name')} autoFocus={mode === 'create'} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('editor.parent')} error={errors.parent}>
            <Select value={form.parent} onChange={set('parent')}>
              <option value="">{t('editor.noParent')}</option>
              {nodes.filter(n => !forbidden.has(n.id)).map(n => <option key={n.id} value={n.id}>{label(n)}</option>)}
            </Select>
          </Field>
          <Field label={t('editor.vendor')}>
            {newVendor === null ? (
              <Select value={form.vendor} onChange={(e) => e.target.value === '__new' ? setNewVendor('') : set('vendor')(e)}>
                <option value="">—</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                <option value="__new">+ {t('editor.newVendor')}</option>
              </Select>
            ) : (
              <div className="flex gap-1.5">
                <Input value={newVendor} onChange={(e) => setNewVendor(e.target.value)} placeholder={t('editor.vendorName')} autoFocus />
                <Button variant="quiet" className="!px-2" onClick={() => setNewVendor(null)} aria-label={t('common.cancel')}><X size={16} /></Button>
              </div>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('editor.start')} error={errors.estimated_start}><DateInput value={form.estimated_start} onChange={set('estimated_start')} /></Field>
          <Field label={t('editor.end')} error={errors.estimated_end}>
            <DateInput value={form.is_milestone ? form.estimated_start : form.estimated_end} onChange={set('estimated_end')} disabled={form.is_milestone} />
          </Field>
          <Field label={t('editor.workDays')}><div className="h-10 flex items-center justify-end px-3 rounded-lg bg-ink-50 text-sm text-ink-600 tabular-nums">{days ?? '—'}</div></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input type="checkbox" checked={form.is_milestone} onChange={set('is_milestone')} className="w-4 h-4 accent-blueprint-600" />
          {t('editor.milestone')}
        </label>
        <Field label={t('editor.ownBudget')} hint={hasChildren ? t('editor.ownBudgetHintParent', { total: formatMoney(node.totalCost) }) : t('editor.ownBudgetHint')} error={errors.estimated_cost}>
          <MoneyInput value={form.estimated_cost} onChange={set('estimated_cost')} size="lg" />
        </Field>
        <div>
          <div className="text-[13px] font-medium text-ink-600 mb-1.5">{t('editor.dependencies')}</div>
          <div className="border border-line rounded-lg overflow-hidden">
            {form.deps.length === 0 && <div className="px-3 py-2.5 text-[13px] text-ink-400">{t('editor.noDependencies')}</div>}
            {form.deps.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_92px_72px_28px] gap-2 px-3 pt-2 pb-1 text-[11px] font-semibold text-ink-400">
                <span>{t('editor.depPredecessor')}</span><span>{t('editor.depType')}</span><span className="text-right">{t('editor.depLag')}</span><span />
              </div>
            )}
            {form.deps.map((d, i) => {
              const p = byId.get(d.predecessor)
              return (
                <div key={d.predecessor} className="grid grid-cols-[minmax(0,1fr)_92px_72px_28px] gap-2 items-center px-3 py-1.5 border-b border-line-soft text-[13px]">
                  <span className="truncate" title={p?.name}><span className="text-ink-400 mr-1.5">{p?.wbs_code}</span>{p?.name || '—'}</span>
                  <select value={d.type} onChange={(e) => setDep(i, { type: e.target.value })} aria-label={t('editor.depType')}
                    className="h-8 border border-line rounded-md bg-white text-[13px] px-1.5" title={t(`editor.depType${d.type}`)}>
                    {['FS', 'SS', 'FF', 'SF'].map(ty => <option key={ty} value={ty}>{ty} · {t(`editor.depShort${ty}`)}</option>)}
                  </select>
                  <input type="number" value={d.lag_days} onChange={(e) => setDep(i, { lag_days: e.target.value })} aria-label={t('editor.depLag')}
                    className="h-8 border border-line rounded-md bg-white text-[13px] px-2 text-right w-full" />
                  <button type="button" aria-label={t('common.remove')} className="text-ink-300 hover:text-status-red flex justify-center"
                    onClick={() => setForm(f => ({ ...f, deps: f.deps.filter((_, j) => j !== i) }))}><X size={15} /></button>
                </div>
              )
            })}
            <div className="flex gap-2 p-2 bg-ink-50/60">
              <Select value={depPick} onChange={(e) => setDepPick(e.target.value)} className="!h-9 text-[13px]">
                <option value="">{t('editor.pickDependency')}</option>
                {predOptions.map(n => <option key={n.id} value={n.id}>{label(n)}</option>)}
              </Select>
              <Button size="sm" variant="secondary" icon={Plus} disabled={!depPick}
                onClick={() => { setForm(f => ({ ...f, deps: [...f.deps, { predecessor: depPick, type: 'FS', lag_days: 0 }] })); setDepPick('') }}>{t('common.add')}</Button>
            </div>
          </div>
          <div className="text-xs text-ink-400 mt-1.5">{t('editor.depHelp')}</div>
          {errors.dependency_specs && <div className="text-xs text-status-red mt-1.5">{errors.dependency_specs}</div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('editor.calendar')} hint={form.calendar_mode === 'seven_day' ? t('editor.calendarSevenHint') : null}>
            <Select value={form.calendar_mode} onChange={set('calendar_mode')}>
              <option value="project">{t('editor.calendarProject')}</option>
              <option value="seven_day">{t('editor.calendarSeven')}</option>
            </Select>
          </Field>
          <Field label={t('editor.constraint')} error={errors.constraint_date}>
            <Select value={form.constraint_type} onChange={set('constraint_type')}>
              <option value="">{t('editor.constraintNone')}</option>
              <option value="snet">{t('editor.constraintSnet')}</option>
              <option value="fnlt">{t('editor.constraintFnlt')}</option>
              <option value="mso">{t('editor.constraintMso')}</option>
            </Select>
          </Field>
        </div>
        {form.constraint_type && (
          <Field label={t('editor.constraintDate')}><DateInput value={form.constraint_date} onChange={set('constraint_date')} /></Field>
        )}
        <Field label={t('editor.notes')}><TextArea rows={3} value={form.notes} onChange={set('notes')} /></Field>
      </div>
    </Drawer>
  )
}
