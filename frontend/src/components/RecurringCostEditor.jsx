import React, { useEffect, useState } from 'react'
import { RecurringCosts } from '../lib/api'
import { Button, Drawer, Field, Input, Select, TextArea } from './ui.jsx'
import MoneyInput from './MoneyInput.jsx'
import { useT } from '../lib/i18n.jsx'
import { toISODate, todayLocal } from '../lib/format.js'

export const COST_CATEGORIES = [
  'staff', 'office', 'vehicles', 'accounting', 'insurance', 'equipment',
  'site_services', 'utilities', 'subcontracting', 'financing', 'other',
]

const toMonth = (iso) => (iso ? iso.slice(0, 7) : '')

/** Create/edit a fixed monthly cost. `projects` given -> the scope (company or a project) can be chosen;
 *  otherwise the cost belongs to `projectId`. */
export default function RecurringCostEditor({ open, onClose, cost, projectId, projects, onSaved }) {
  const { t } = useT()
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setF(cost ? {
      name: cost.name, category: cost.category, amount: cost.amount, notes: cost.notes || '',
      start: toMonth(cost.start_month), end: toMonth(cost.end_month), project: cost.project || '',
    } : {
      name: '', category: projectId ? 'equipment' : 'accounting', amount: null, notes: '',
      start: toISODate(todayLocal()).slice(0, 7), end: '', project: projectId || '',
    })
  }, [open, cost?.id])

  const set = (k) => (e) => setF(p => ({ ...p, [k]: e?.target ? e.target.value : e }))
  const valid = f.name?.trim() && f.amount !== null && f.amount !== undefined && f.start

  const save = async () => {
    setSaving(true)
    const data = {
      name: f.name.trim(), category: f.category, amount: Number(f.amount).toFixed(2), notes: f.notes,
      start_month: `${f.start}-01`, end_month: f.end ? `${f.end}-01` : null, project: f.project || null,
    }
    try {
      if (cost) await RecurringCosts.update(cost.id, data)
      else await RecurringCosts.create(data)
      onSaved?.()
      onClose()
    } catch { /* toast */ } finally { setSaving(false) }
  }

  return (
    <Drawer open={open} onClose={onClose} title={cost ? t('fixed.edit') : t('fixed.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} disabled={!valid || saving}>{t('common.save')}</Button></>}>
      <div className="space-y-4">
        {projects && (
          <Field label={t('fixed.scope')}>
            <Select value={f.project || ''} onChange={set('project')}>
              <option value="">{t('fixed.company')}</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('fixed.name')} required><Input value={f.name || ''} onChange={set('name')} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fixed.category')}>
            <Select value={f.category || 'other'} onChange={set('category')}>
              {COST_CATEGORIES.map(c => <option key={c} value={c}>{t(`fixed.cat.${c}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('fixed.amount')} required><MoneyInput value={f.amount} onChange={set('amount')} /></Field>
          <Field label={t('fixed.start')} required><Input type="month" value={f.start || ''} onChange={set('start')} /></Field>
          <Field label={t('fixed.end')} hint={t('fixed.endHint')}><Input type="month" value={f.end || ''} onChange={set('end')} /></Field>
        </div>
        <Field label={t('econ.notes')}><TextArea rows={2} value={f.notes || ''} onChange={set('notes')} /></Field>
      </div>
    </Drawer>
  )
}
