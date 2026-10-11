import React, { useEffect, useState } from 'react'
import { Plus, MoreHorizontal, Pencil, Trash2, Clock, Landmark } from 'lucide-react'
import { Projects, Units, RecurringCosts } from '../lib/api'
import { Card, PageHeader, Button, EmptyState, Loading, Badge, Drawer, Field, Input, Select, TextArea, Menu, Modal } from '../components/ui.jsx'
import MoneyInput from '../components/MoneyInput.jsx'
import RecurringCostEditor from '../components/RecurringCostEditor.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useT } from '../lib/i18n.jsx'
import { useFeedback } from '../components/feedback.jsx'
import { compareCodes, formatDate, formatNumber, toNumber } from '../lib/format.js'

const UNIT_TYPES = ['apartment', 'commercial', 'garage', 'parking', 'storage', 'other']
const ALLOCATIONS = ['sale', 'landowner', 'own']
const ALLOC_TONE = { sale: 'blue', landowner: 'amber', own: 'gray' }
const sqm = (n) => `${formatNumber(n, 2)} m²`

export default function EconomicsPage({ projectId }) {
  const { t } = useT()
  const { format } = useCurrency()
  const { confirm } = useFeedback()
  const [econ, setEcon] = useState(null)
  const [units, setUnits] = useState([])
  const [costs, setCosts] = useState([])
  const [project, setProject] = useState(null)
  const [unitEditor, setUnitEditor] = useState(null)   // {} new | { unit }
  const [costEditor, setCostEditor] = useState(null)   // {} new | { cost }
  const [landOpen, setLandOpen] = useState(false)

  const reload = () => {
    Projects.economics(projectId).then(setEcon)
    Units.list(projectId).then(u => setUnits([...u].sort((a, b) => compareCodes(a.identifier, b.identifier))))
    RecurringCosts.list({ project: projectId }).then(setCosts)
    Projects.get(projectId).then(setProject)
  }
  useEffect(() => { if (projectId) reload() }, [projectId])

  if (!projectId) return <Card><EmptyState title={t('common.noProject')} subtitle={t('common.noProjectHint')} /></Card>
  if (!econ || !project) return <Loading rows={8} />

  const { costs: c, result: r, revenue, land, units: u, delay } = econ
  const margin = toNumber(r.margin)

  const removeUnit = async (unit) => {
    if (!await confirm({ title: t('econ.deleteUnit'), message: unit.identifier, danger: true, confirmLabel: t('common.delete') })) return
    await Units.remove(unit.id); reload()
  }
  const removeCost = async (cost) => {
    if (!await confirm({ title: t('fixed.delete'), message: cost.name, danger: true, confirmLabel: t('common.delete') })) return
    await RecurringCosts.remove(cost.id); reload()
  }

  return (
    <div>
      <PageHeader title={t('nav.economics')} subtitle={t('econ.subtitle')} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Kpi label={t('econ.revenue')} value={format(revenue.planned)}
          hint={u.measured ? t('econ.revenueFinal', { v: format(revenue.final) }) : null} />
        <Kpi label={t('econ.totalCost')} value={format(c.total)} hint={t('econ.totalCostHint')} />
        <Kpi label={t('econ.margin')} value={format(r.margin)} tone={margin < 0 ? 'red' : margin > 0 ? 'green' : null}
          hint={r.margin_pct !== null ? `${formatNumber(r.margin_pct, 1)} %` : null} />
        <Kpi label={t('econ.costSqm')} value={r.cost_per_sqm_sellable !== null ? `${format(r.cost_per_sqm_sellable)}` : '—'}
          hint={r.cost_per_sqm_built !== null ? t('econ.costSqmHint', { v: format(r.cost_per_sqm_built) }) : null} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 mb-5">
        <Card>
          <h2 className="text-[15px] font-semibold mb-3">{t('econ.costs')}</h2>
          <dl className="text-[13px] divide-y divide-line-soft">
            <CostRow label={t('econ.construction')} value={format(c.construction_budget)}
              hint={t('econ.invoicedPaid', { i: format(c.invoiced), p: format(c.paid) })} />
            <CostRow label={t('econ.landCash')} value={format(c.land_cash)}
              action={<button type="button" onClick={() => setLandOpen(true)} className="text-blueprint-600 text-xs hover:underline">{t('econ.edit')}</button>} />
            {land.units_count > 0 && (
              <CostRow muted label={t('econ.landUnits', { n: land.units_count, a: sqm(land.units_area) })} value=""
                hint={t('econ.landUnitsHint', { v: format(land.units_value) })} />
            )}
            <CostRow label={t('econ.site')} value={format(c.site_planned)} hint={t('econ.toDate', { v: format(c.site_to_date) })} />
            <CostRow label={t('econ.overhead')} value={format(c.overhead_planned)}
              hint={[t('econ.toDate', { v: format(c.overhead_to_date) }), c.overhead_pct_of_budget !== null && t('econ.pctBudget', { p: formatNumber(c.overhead_pct_of_budget, 1) })].filter(Boolean).join(' · ')} />
            <CostRow strong label={t('econ.total')} value={format(c.total)} />
          </dl>
          {!econ.has_dates && <p className="text-xs text-status-amber mt-3">{t('econ.noDates')}</p>}
          {econ.has_dates && (
            <div className="mt-3 text-xs text-ink-500 space-y-1">
              <div className="flex items-center gap-1.5"><Clock size={13} />{t('econ.perMonth', { v: format(c.fixed_per_month) })}</div>
              {delay.days !== null && (delay.days > 0
                ? <div className="text-status-red">{t('econ.delay', { f: formatDate(delay.forecast_finish), p: formatDate(delay.planned_finish), d: delay.days, c: format(delay.cost) })}</div>
                : <div>{t('econ.onTime', { f: formatDate(delay.forecast_finish) })}</div>)}
            </div>
          )}
        </Card>

        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <h2 className="text-[15px] font-semibold">{t('econ.siteCosts')}</h2>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setCostEditor({})}>{t('fixed.new')}</Button>
          </div>
          {costs.length === 0
            ? <p className="text-[13px] text-ink-400 px-5 pb-5">{t('econ.noSiteCosts')}</p>
            : <CostList costs={costs} onEdit={(cost) => setCostEditor({ cost })} onDelete={removeCost} />}
        </Card>
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 gap-3 flex-wrap">
          <div>
            <h2 className="text-[15px] font-semibold">{t('econ.units')}</h2>
            {u.count > 0 && <p className="text-xs text-ink-400 mt-0.5">{sqm(u.area_planned)} · {t('econ.measured', { m: u.measured, n: u.count })}</p>}
          </div>
          <Button size="sm" icon={Plus} onClick={() => setUnitEditor({})}>{t('econ.addUnit')}</Button>
        </div>
        {units.length === 0 ? (
          <EmptyState title={t('econ.noUnits')} action={<Button icon={Plus} onClick={() => setUnitEditor({})}>{t('econ.addUnit')}</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[900px]">
              <thead className="bg-[#FAFBFC] border-y border-line text-xs text-ink-400 text-left">
                <tr>
                  <th className="font-semibold px-5 h-10">{t('econ.identifier')}</th>
                  <th className="font-semibold">{t('econ.type')}</th>
                  <th className="font-semibold">{t('econ.floor')}</th>
                  <th className="font-semibold">{t('econ.allocation')}</th>
                  <th className="font-semibold text-right">{t('econ.areaPlanned')}</th>
                  <th className="font-semibold text-right">{t('econ.areaActual')}</th>
                  <th className="font-semibold text-right">{t('econ.diff')}</th>
                  <th className="font-semibold text-right">{t('econ.priceSqm')}</th>
                  <th className="font-semibold text-right">{t('econ.value')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {units.map(unit => {
                  const diff = unit.area_actual !== null ? toNumber(unit.area_actual) - toNumber(unit.sqm) : null
                  return (
                    <tr key={unit.id} className="border-b border-line-soft hover:bg-blueprint-50/30">
                      <td className="px-5 h-11 font-medium">{unit.identifier}</td>
                      <td>{t(`econ.type.${unit.unit_type}`)}</td>
                      <td className="text-ink-500">{unit.floor || '—'}</td>
                      <td><Badge tone={ALLOC_TONE[unit.allocation]}>{t(`econ.alloc.${unit.allocation}`)}</Badge></td>
                      <td className="text-right tabular-nums">{formatNumber(unit.sqm, 2)}</td>
                      <td className="text-right tabular-nums">{unit.area_actual !== null ? formatNumber(unit.area_actual, 2) : <span className="text-ink-300">—</span>}</td>
                      <td className={`text-right tabular-nums ${diff === null ? 'text-ink-300' : diff < 0 ? 'text-status-red' : diff > 0 ? 'text-status-green' : ''}`}>
                        {diff === null ? '—' : `${diff > 0 ? '+' : ''}${formatNumber(diff, 2)}`}
                      </td>
                      <td className="text-right tabular-nums">{unit.price_sqm ? format(unit.price_sqm) : <span className="text-ink-300">—</span>}</td>
                      <td className={`text-right tabular-nums ${unit.allocation !== 'sale' ? 'text-ink-400' : ''}`}>{format(unit.value_final)}</td>
                      <td className="pr-3 text-right">
                        <Menu trigger={({ toggle }) => (
                          <button type="button" onClick={toggle} aria-label={t('gantt.actions')} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-ink-400 hover:bg-ink-100"><MoreHorizontal size={17} /></button>
                        )} items={[
                          { label: t('gantt.edit'), icon: Pencil, onClick: () => setUnitEditor({ unit }) },
                          { divider: true },
                          { label: t('common.delete'), icon: Trash2, danger: true, onClick: () => removeUnit(unit) },
                        ]} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-[#FAFBFC] text-[13px] font-semibold">
                <tr>
                  <td className="px-5 h-10" colSpan={4}>{t('econ.total')} · {u.count}</td>
                  <td className="text-right tabular-nums">{formatNumber(u.area_planned, 2)}</td>
                  <td className="text-right tabular-nums">{u.measured ? formatNumber(u.area_final, 2) : '—'}</td>
                  <td className={`text-right tabular-nums ${toNumber(u.area_difference) < 0 ? 'text-status-red' : toNumber(u.area_difference) > 0 ? 'text-status-green' : ''}`}>
                    {u.measured ? formatNumber(u.area_difference, 2) : '—'}
                  </td>
                  <td />
                  <td className="text-right tabular-nums">{format(revenue.final)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <UnitEditor open={!!unitEditor} unit={unitEditor?.unit} projectId={projectId} onClose={() => setUnitEditor(null)} onSaved={reload} />
      <RecurringCostEditor open={!!costEditor} cost={costEditor?.cost} projectId={projectId} onClose={() => setCostEditor(null)} onSaved={reload} />
      <LandCashModal open={landOpen} project={project} onClose={() => setLandOpen(false)} onSaved={() => { setLandOpen(false); reload() }} />
    </div>
  )
}

export function CostList({ costs, onEdit, onDelete, showProject }) {
  const { t } = useT()
  const { format } = useCurrency()
  const month = (iso) => (iso ? `${iso.slice(5, 7)}.${iso.slice(0, 4)}` : t('fixed.ongoing'))
  return (
    <ul className="divide-y divide-line-soft border-t border-line">
      {costs.map(cost => (
        <li key={cost.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{cost.name}</div>
            <div className="text-xs text-ink-400 truncate">
              {t(`fixed.cat.${cost.category}`)}{showProject ? ` · ${cost.project_name || t('fixed.company')}` : ''} · {month(cost.start_month)} – {month(cost.end_month)}
            </div>
          </div>
          <div className="tabular-nums whitespace-nowrap">{format(cost.amount)}</div>
          <Menu trigger={({ toggle }) => (
            <button type="button" onClick={toggle} aria-label={t('gantt.actions')} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-ink-400 hover:bg-ink-100"><MoreHorizontal size={17} /></button>
          )} items={[
            { label: t('gantt.edit'), icon: Pencil, onClick: () => onEdit(cost) },
            { divider: true },
            { label: t('common.delete'), icon: Trash2, danger: true, onClick: () => onDelete(cost) },
          ]} />
        </li>
      ))}
    </ul>
  )
}

function Kpi({ label, value, hint, tone }) {
  const color = tone === 'red' ? 'text-status-red' : tone === 'green' ? 'text-status-green' : ''
  return (
    <Card className="!p-4">
      <div className="text-[13px] text-ink-400">{label}</div>
      <div className={`text-[20px] font-semibold mt-1.5 tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-xs text-ink-400 mt-1">{hint}</div>}
    </Card>
  )
}

function CostRow({ label, value, hint, action, strong, muted }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <dt className={`${strong ? 'font-semibold' : ''} ${muted ? 'text-ink-500' : ''}`}>{label} {action}</dt>
        {hint && <dd className="text-xs text-ink-400 mt-0.5">{hint}</dd>}
      </div>
      <dd className={`tabular-nums whitespace-nowrap ${strong ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  )
}

function UnitEditor({ open, unit, projectId, onClose, onSaved }) {
  const { t } = useT()
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setF(unit ? {
      identifier: unit.identifier, unit_type: unit.unit_type, floor: unit.floor, allocation: unit.allocation,
      sqm: toNumber(unit.sqm), area_actual: unit.area_actual === null ? null : toNumber(unit.area_actual),
      price_sqm: unit.price_sqm === null ? null : toNumber(unit.price_sqm), list_price: toNumber(unit.list_price) || null,
      notes: unit.notes || '',
    } : { identifier: '', unit_type: 'apartment', floor: '', allocation: 'sale', sqm: null, area_actual: null, price_sqm: null, list_price: null, notes: '' })
  }, [open, unit?.id])
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e?.target ? e.target.value : e }))
  const dec = (v) => (v === null || v === undefined || v === '' ? null : Number(v).toFixed(2))
  const valid = f.identifier?.trim() && f.sqm

  const save = async () => {
    setSaving(true)
    const data = {
      project: projectId, identifier: f.identifier.trim(), unit_type: f.unit_type, floor: f.floor, allocation: f.allocation,
      sqm: dec(f.sqm), area_actual: dec(f.area_actual), price_sqm: dec(f.price_sqm), list_price: dec(f.list_price) || '0.00', notes: f.notes,
    }
    try {
      if (unit) await Units.update(unit.id, data)
      else await Units.create(data)
      onSaved(); onClose()
    } catch { /* toast */ } finally { setSaving(false) }
  }

  return (
    <Drawer open={open} onClose={onClose} title={unit ? t('econ.editUnit') : t('econ.addUnit')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} disabled={!valid || saving}>{t('common.save')}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('econ.identifier')} required><Input value={f.identifier || ''} onChange={set('identifier')} placeholder="A1" autoFocus /></Field>
          <Field label={t('econ.floor')}><Input value={f.floor || ''} onChange={set('floor')} /></Field>
          <Field label={t('econ.type')}>
            <Select value={f.unit_type || 'apartment'} onChange={set('unit_type')}>
              {UNIT_TYPES.map(x => <option key={x} value={x}>{t(`econ.type.${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('econ.allocation')}>
            <Select value={f.allocation || 'sale'} onChange={set('allocation')}>
              {ALLOCATIONS.map(x => <option key={x} value={x}>{t(`econ.alloc.${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('econ.areaPlanned')} required><MoneyInput unit="m²" value={f.sqm} onChange={set('sqm')} /></Field>
          <Field label={t('econ.areaActual')}><MoneyInput unit="m²" value={f.area_actual} onChange={set('area_actual')} /></Field>
        </div>
        <p className="text-xs text-ink-400 -mt-2">{t('econ.areaActualHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('econ.priceSqm')}><MoneyInput value={f.price_sqm} onChange={set('price_sqm')} /></Field>
          <Field label={t('econ.fixedPrice')}><MoneyInput value={f.list_price} onChange={set('list_price')} /></Field>
        </div>
        <Field label={t('econ.notes')}><TextArea rows={2} value={f.notes || ''} onChange={set('notes')} /></Field>
      </div>
    </Drawer>
  )
}

function LandCashModal({ open, project, onClose, onSaved }) {
  const { t } = useT()
  const [amount, setAmount] = useState(null)
  useEffect(() => { if (open) setAmount(toNumber(project.land_cash_compensation) || null) }, [open])
  if (!open) return null
  const save = async () => {
    try {
      await Projects.update(project.id, { land_cash_compensation: Number(amount || 0).toFixed(2) })
      onSaved()
    } catch { /* toast */ }
  }
  return (
    <Modal open onClose={onClose} title={t('econ.landCashTitle')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save}>{t('common.save')}</Button></>}>
      <Field label={t('budget.amount')}><MoneyInput value={amount} onChange={setAmount} /></Field>
      <p className="text-xs text-ink-400 mt-3 flex gap-1.5"><Landmark size={14} className="shrink-0" />{t('econ.landCashHint')}</p>
    </Modal>
  )
}
