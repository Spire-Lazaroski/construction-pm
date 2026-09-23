import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, Plus, FileText, MoreHorizontal, CheckCircle2, Banknote, Pencil, Trash2, AlertTriangle, Search } from 'lucide-react'
import { Expenses, Tasks, Vendors, Documents } from '../lib/api'
import { Card, PageHeader, Button, EmptyState, Loading, Badge, Drawer, Field, Input, Select, TextArea, Menu, Modal, Segmented } from '../components/ui.jsx'
import MoneyInput from '../components/MoneyInput.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useT } from '../lib/i18n.jsx'
import { useFeedback } from '../components/feedback.jsx'
import { formatDate, formatMoney, RATE_MKD_PER_EUR, toISODate, todayLocal, toNumber } from '../lib/format.js'
import { buildTree, flatten } from '../lib/wbs.js'
import DateInput from '../components/DateInput.jsx'

function payStatus(e) {
  const amt = toNumber(e.amount), paid = toNumber(e.amount_paid)
  if (paid >= amt && amt > 0) return 'paid'
  if (paid > 0) return 'partial'
  if (e.approval_status === 'approved') return 'approved'
  if (e.approval_status === 'rejected') return 'rejected'
  return 'received'
}
const STATUS_TONE = { paid: 'green', partial: 'blue', approved: 'blue', received: 'gray', rejected: 'red' }

export default function BudgetPage({ projectId }) {
  const { t } = useT()
  const { format } = useCurrency()
  const { toast, confirm } = useFeedback()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('positions')
  const [tasks, setTasks] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [vendors, setVendors] = useState([])
  const [collapsed, setCollapsed] = useState({})
  const [invoiceEditor, setInvoiceEditor] = useState(null) // { expense?, task? }
  const [paying, setPaying] = useState(null)
  const [query, setQuery] = useState('')

  const reload = () => {
    Tasks.list(projectId).then(setTasks)
    Expenses.list(projectId).then(setExpenses)
  }
  useEffect(() => {
    if (!projectId) return
    reload()
    Vendors.list().then(setVendors)
  }, [projectId])
  useEffect(() => {
    if (params.get('new') === 'invoice') {
      setInvoiceEditor({})
      const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true })
    }
  }, [params])

  const invoices = useMemo(() => expenses.filter(e => e.entry_type === 'actual').sort((a, b) => (b.date || '').localeCompare(a.date || '')), [expenses])
  const tree = useMemo(() => {
    if (!tasks) return null
    const { roots, byId } = buildTree(tasks)
    const inv = {}, paid = {}, statuses = {}
    invoices.forEach(e => {
      if (!e.task) return
      inv[e.task] = (inv[e.task] || 0) + toNumber(e.amount)
      paid[e.task] = (paid[e.task] || 0) + toNumber(e.amount_paid)
      ;(statuses[e.task] = statuses[e.task] || []).push(payStatus(e))
    })
    const agg = (n) => {
      n.invoiced = (inv[n.id] || 0) + n.children.reduce((s, c) => s + agg(c), 0)
      n.paidSum = (paid[n.id] || 0) + n.children.reduce((s, c) => s + c.paidSum, 0)
      return n.invoiced
    }
    roots.forEach(agg)
    return { roots, byId, all: flatten(roots), statuses, ownInv: inv, ownPaid: paid }
  }, [tasks, invoices])

  if (!projectId) return <Card><EmptyState title={t('common.noProject')} subtitle={t('common.noProjectHint')} /></Card>
  if (!tree) return <Loading rows={8} />

  const totals = {
    budget: tree.roots.reduce((s, r) => s + r.totalCost, 0),
    invoiced: invoices.reduce((s, e) => s + toNumber(e.amount), 0),
    paid: invoices.reduce((s, e) => s + toNumber(e.amount_paid), 0),
  }
  const progress = totals.budget ? tree.roots.reduce((s, r) => s + r.totalCost * r.rollProgress, 0) / totals.budget : 0
  const visible = tree.all.filter(n => !n.path.slice(0, -1).some(id => collapsed[id]))

  // Payment status of a position's OWN invoices ("Платена времена ситуација"), derived — never typed.
  const positionPayment = (n) => {
    const inv = tree.ownInv[n.id] || 0, pd = tree.ownPaid[n.id] || 0
    if (!inv) return null
    if (pd >= inv) return 'paid'
    if (pd > 0) return 'partial'
    const st = tree.statuses[n.id] || []
    return st.every(s => s === 'approved') ? 'approved' : 'received'
  }

  const approve = async (e) => { await Expenses.update(e.id, { approval_status: 'approved' }); reload(); toast(t('budget.approved'), { tone: 'success', duration: 3000 }) }
  const removeInvoice = async (e) => {
    const ok = await confirm({ title: t('budget.deleteInvoice'), message: `${e.vendor_name || ''} · ${format(e.amount)}`, danger: true, confirmLabel: t('common.delete') })
    if (!ok) return
    await Expenses.remove(e.id); reload()
  }

  const q = query.trim().toLowerCase()
  const shownInvoices = invoices.filter(e => !q || `${e.task_code || ''} ${e.task_name || ''} ${e.vendor_name || ''} ${e.invoice_number || ''} ${e.description}`.toLowerCase().includes(q))
  const cols = 'minmax(0,1fr) 140px 140px 130px 80px 140px'

  return (
    <div>
      <PageHeader title={t('nav.budget')} subtitle={t('budget.subtitle')}
        action={<Button icon={Plus} onClick={() => setInvoiceEditor({})}>{t('budget.newInvoice')}</Button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Kpi label={t('overview.budget')} value={format(totals.budget)} />
        <Kpi label={t('overview.invoiced')} value={format(totals.invoiced)} hint={totals.budget ? `${(totals.invoiced / totals.budget * 100).toFixed(1).replace('.', ',')} %` : ''} />
        <Kpi label={t('overview.paid')} value={format(totals.paid)} hint={`${t('budget.outstanding')}: ${format(totals.invoiced - totals.paid)}`} />
        <Kpi label={t('overview.progress')} value={`${Math.round(progress)} %`} hint={t('overview.progressHint')} />
      </div>

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <Segmented value={tab} onChange={setTab} label={t('budget.view')}
          options={[{ value: 'positions', label: `${t('budget.positions')} (${tree.all.filter(n => !n.children.length).length})` }, { value: 'invoices', label: `${t('budget.invoices')} (${invoices.length})` }]} />
        {tab === 'invoices' && (
          <label className="flex items-center gap-2 h-9 px-3 border border-line rounded-lg bg-white w-[280px]">
            <Search size={15} className="text-ink-300" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('budget.searchInvoices')} className="flex-1 min-w-0 text-[13px] outline-none bg-transparent" />
          </label>
        )}
      </div>

      {tab === 'positions' ? (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 900 }}>
              <div className="grid px-4 h-10 items-center text-xs font-semibold text-ink-400 bg-[#FAFBFC] border-b border-line" style={{ gridTemplateColumns: cols }}>
                <span className="pl-8">{t('gantt.colPosition')}</span>
                <span className="text-right">{t('overview.budget')}</span>
                <span className="text-right">{t('overview.invoiced')}</span>
                <span className="text-right">{t('budget.difference')}</span>
                <span className="text-right">{t('budget.done')}</span>
                <span className="pl-5">{t('budget.payment')}</span>
              </div>
              {visible.map(n => {
                const isParent = n.children.length > 0
                const diff = n.invoiced - n.totalCost
                const ps = positionPayment(n)
                return (
                  <div key={n.id} className={`group grid px-4 items-center border-b border-line-soft text-[13px] ${isParent ? 'bg-[#FAFBFC] h-11' : 'bg-white h-10 hover:bg-blueprint-50/40'}`} style={{ gridTemplateColumns: cols }}>
                    <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: n.depth * 20 }}>
                      {isParent ? (
                        <button type="button" onClick={() => setCollapsed(c => ({ ...c, [n.id]: !c[n.id] }))} aria-label={t('gantt.collapse')}
                          className="w-6 h-6 flex items-center justify-center rounded text-ink-400 hover:bg-ink-100 shrink-0">
                          <ChevronDown size={15} style={{ transform: collapsed[n.id] ? 'rotate(-90deg)' : 'none' }} />
                        </button>
                      ) : <span className="w-6 shrink-0" />}
                      <span className="text-xs text-ink-400 w-11 shrink-0">{n.wbs_code}</span>
                      <span className={`truncate ${isParent ? 'font-semibold' : ''}`}>{n.name}</span>
                      {!isParent && (
                        <button type="button" onClick={() => setInvoiceEditor({ task: n.id })} title={t('budget.newInvoiceFor')}
                          className="ml-1 text-blueprint-600 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"><Plus size={15} /></button>
                      )}
                    </div>
                    <span className={`text-right ${isParent ? 'font-semibold' : ''}`}>{n.totalCost ? format(n.totalCost) : '—'}</span>
                    <span className={`text-right ${isParent ? 'font-semibold' : ''}`}>{n.invoiced ? format(n.invoiced) : '—'}</span>
                    <span className={`text-right ${!n.invoiced ? 'text-ink-300' : diff > 0 ? 'text-status-red' : diff < 0 ? 'text-status-green' : 'text-ink-400'}`}>
                      {!n.invoiced || n.depth === 0 ? (n.depth === 0 && n.invoiced ? '' : '—') : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${format(Math.abs(diff))}`}
                    </span>
                    <span className="text-right text-ink-600">{isParent ? `${Math.round(n.rollProgress)} %` : `${n.progress_pct || 0} %`}</span>
                    <span className="pl-5">{ps ? <Badge tone={STATUS_TONE[ps]}>{t(`pay.${ps}`)}</Badge> : null}</span>
                  </div>
                )
              })}
              <div className="grid px-4 h-12 items-center text-sm font-semibold bg-[#F4F6F9]" style={{ gridTemplateColumns: cols }}>
                <span className="pl-8">{t('budget.total')}</span>
                <span className="text-right">{format(totals.budget)}</span>
                <span className="text-right">{format(totals.invoiced)}</span>
                <span />
                <span className="text-right">{Math.round(progress)} %</span>
                <span />
              </div>
            </div>
          </div>
          {tree.all.length === 0 && <EmptyState title={t('budget.noPositions')} />}
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[980px]">
              <thead className="bg-[#FAFBFC] border-b border-line text-xs text-ink-400 text-left">
                <tr>
                  <th className="font-semibold px-4 h-10">{t('budget.date')}</th>
                  <th className="font-semibold">{t('budget.number')}</th>
                  <th className="font-semibold">{t('editor.vendor')}</th>
                  <th className="font-semibold">{t('budget.position')}</th>
                  <th className="font-semibold text-right">{t('budget.amount')}</th>
                  <th className="font-semibold text-right">{t('overview.paid')}</th>
                  <th className="font-semibold pl-5">{t('budget.status')}</th>
                  <th className="font-semibold">PDF</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shownInvoices.map(e => {
                  const st = payStatus(e)
                  return (
                    <tr key={e.id} className="border-b border-line-soft hover:bg-blueprint-50/30">
                      <td className="px-4 h-11 whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="text-ink-600">{e.invoice_number || <span className="text-ink-300">—</span>}</td>
                      <td>{e.vendor_name || <span className="text-ink-300">—</span>}</td>
                      <td className="max-w-[280px] truncate"><span className="text-ink-400 mr-1.5">{e.task_code}</span>{e.description?.startsWith('[проверка]') ? <Badge tone="amber">{t('budget.check')}</Badge> : null} {e.task_name || e.description}</td>
                      <td className="text-right whitespace-nowrap font-medium">{format(e.amount)}{e.currency === 'MKD' && <div className="text-xs text-ink-400">{formatMoney(e.original_amount, 'EUR').replace(' €', '')} ден.</div>}</td>
                      <td className="text-right whitespace-nowrap">{toNumber(e.amount_paid) ? format(e.amount_paid) : <span className="text-ink-300">—</span>}</td>
                      <td className="pl-5"><Badge tone={STATUS_TONE[st]}>{t(`pay.${st}`)}</Badge></td>
                      <td>{e.document_url ? <a href={e.document_url} target="_blank" rel="noreferrer" className="text-blueprint-600 inline-flex items-center gap-1"><FileText size={15} />PDF</a> : <span className="text-ink-300">—</span>}</td>
                      <td className="pr-3">
                        <Menu trigger={({ toggle }) => (
                          <button type="button" onClick={toggle} aria-label={t('gantt.actions')} className="w-8 h-8 flex items-center justify-center rounded-md text-ink-400 hover:bg-ink-100"><MoreHorizontal size={17} /></button>
                        )} items={[
                          st === 'received' && { label: t('budget.approve'), icon: CheckCircle2, onClick: () => approve(e) },
                          st !== 'paid' && { label: t('budget.recordPayment'), icon: Banknote, onClick: () => setPaying(e) },
                          { label: t('gantt.edit'), icon: Pencil, onClick: () => setInvoiceEditor({ expense: e }) },
                          { divider: true },
                          { label: t('common.delete'), icon: Trash2, danger: true, onClick: () => removeInvoice(e) },
                        ]} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {shownInvoices.length === 0 && <EmptyState title={t('budget.noInvoices')} action={<Button icon={Plus} onClick={() => setInvoiceEditor({})}>{t('budget.newInvoice')}</Button>} />}
        </Card>
      )}

      <InvoiceEditor open={!!invoiceEditor} onClose={() => setInvoiceEditor(null)} expense={invoiceEditor?.expense} presetTask={invoiceEditor?.task}
        projectId={projectId} nodes={tree.all} byId={tree.byId} vendors={vendors} invoices={invoices}
        onVendorsChanged={() => Vendors.list().then(setVendors)} onSaved={reload} />
      <PaymentModal expense={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload() }} />
    </div>
  )
}

function Kpi({ label, value, hint }) {
  return (
    <Card className="!p-4">
      <div className="text-[13px] text-ink-400">{label}</div>
      <div className="text-[20px] font-semibold mt-1.5 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-ink-400 mt-1">{hint}</div>}
    </Card>
  )
}

function InvoiceEditor({ open, onClose, expense, presetTask, projectId, nodes, byId, vendors, invoices, onVendorsChanged, onSaved }) {
  const { t } = useT()
  const { toast } = useFeedback()
  const [f, setF] = useState({})
  const [file, setFile] = useState(null)
  const [newVendor, setNewVendor] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!open) return
    setFile(null); setNewVendor(null); setErrors({})
    if (expense) {
      const cur = expense.currency || 'EUR'
      setF({
        task: expense.task || '', vendor: expense.vendor || '', invoice_number: expense.invoice_number || '', date: expense.date,
        due_date: expense.due_date || '', currency: cur, total: toNumber(cur === 'MKD' ? expense.original_amount : expense.amount),
        vat_rate: String(Number(expense.vat_rate ?? 18)), description: expense.description || '',
      })
    } else {
      const task = presetTask ? byId.get(presetTask) : null
      setF({ task: presetTask || '', vendor: task?.vendor || '', invoice_number: '', date: toISODate(todayLocal()), due_date: '', currency: 'EUR', total: null, vat_rate: '18', description: '' })
    }
  }, [open, expense?.id, presetTask])

  const set = (k) => (v) => setF(x => ({ ...x, [k]: v?.target ? v.target.value : v }))
  const eurTotal = f.total ? (f.currency === 'MKD' ? f.total / RATE_MKD_PER_EUR : f.total) : 0
  const rate = Number(f.vat_rate || 0)
  const net = eurTotal / (1 + rate / 100)
  const task = f.task ? byId.get(f.task) : null
  const already = invoices.filter(e => e.task === f.task && e.id !== expense?.id).reduce((s, e) => s + toNumber(e.amount), 0)
  const budget = task ? toNumber(task.estimated_cost) : 0
  const after = already + eurTotal
  const earned = budget * (toNumber(task?.progress_pct) / 100)

  const save = async () => {
    const errs = {}
    if (!f.total) errs.total = t('budget.errAmount')
    if (!f.date) errs.date = t('budget.errDate')
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      let vendorId = f.vendor || null
      if (newVendor?.trim()) { vendorId = (await Vendors.create({ name: newVendor.trim() })).id; onVendorsChanged() }
      let documentId = expense?.document || null
      if (file) {
        const doc = await Documents.upload({ project: projectId, task: f.task || null, title: file.name, doc_type: 'invoice', file })
        documentId = doc.id
      }
      const payload = {
        project: projectId, task: f.task || null, vendor: vendorId, entry_type: 'actual',
        description: f.description || task?.name || t('budget.invoice'), invoice_number: f.invoice_number,
        date: f.date, due_date: f.due_date || null, currency: f.currency, original_amount: f.total.toFixed(2),
        amount: eurTotal.toFixed(2), vat_rate: rate.toFixed(2), document: documentId,
      }
      if (expense) await Expenses.update(expense.id, payload)
      else await Expenses.create(payload)
      toast(expense ? t('editor.saved') : t('budget.invoiceAdded'), { tone: 'success', duration: 3000 })
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  const label = (n) => `${'  '.repeat(n.depth)}${n.wbs_code ? n.wbs_code + ' ' : ''}${n.name}`
  return (
    <Drawer open={open} onClose={onClose} width={480} subtitle={expense ? t('budget.editInvoice') : t('budget.newInvoice')}
      title={task ? `${task.wbs_code || ''} ${task.name}` : t('budget.invoice')}
      footer={<>
        <Button size="lg" className="flex-1" onClick={save} disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
        <Button size="lg" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      </>}>
      <div className="space-y-4">
        <Field label={t('budget.position')}>
          <Select value={f.task || ''} onChange={set('task')}>
            <option value="">—</option>
            {nodes.map(n => <option key={n.id} value={n.id} disabled={n.depth === 0 && n.children.length > 0}>{label(n)}</option>)}
          </Select>
        </Field>
        <Field label={t('editor.vendor')}>
          {newVendor === null ? (
            <Select value={f.vendor || ''} onChange={(e) => e.target.value === '__new' ? setNewVendor('') : set('vendor')(e)}>
              <option value="">—</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              <option value="__new">+ {t('editor.newVendor')}</option>
            </Select>
          ) : <Input autoFocus value={newVendor} onChange={(e) => setNewVendor(e.target.value)} placeholder={t('editor.vendorName')} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('budget.number')}><Input value={f.invoice_number || ''} onChange={set('invoice_number')} /></Field>
          <Field label={t('budget.date')} required error={errors.date}><DateInput value={f.date || ''} onChange={set('date')} /></Field>
        </div>
        <Field label={t('budget.totalWithVat')} required error={errors.total}>
          <div className="flex gap-2 items-start">
            <MoneyInput className="flex-1" value={f.total} onChange={set('total')} currency={f.currency} size="lg" />
            <Segmented label={t('budget.currency')} value={f.currency || 'EUR'} onChange={set('currency')} options={[{ value: 'EUR', label: 'EUR' }, { value: 'MKD', label: 'MKD' }]} />
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('budget.vat')}>
            <Select value={f.vat_rate || '18'} onChange={set('vat_rate')}><option value="18">18 %</option><option value="10">10 %</option><option value="5">5 %</option><option value="0">0 %</option></Select>
          </Field>
          <Field label={t('budget.net')}><div className="h-10 flex items-center justify-end px-3 rounded-lg bg-ink-50 text-sm tabular-nums">{formatMoney(net)}</div></Field>
          <Field label={t('budget.vatAmount')}><div className="h-10 flex items-center justify-end px-3 rounded-lg bg-ink-50 text-sm tabular-nums">{formatMoney(eurTotal - net)}</div></Field>
        </div>
        {task && budget > 0 && eurTotal > 0 && (
          after > budget ? (
            <div className="flex gap-2 items-start text-[13px] text-status-red bg-status-redBg rounded-lg px-3 py-2.5"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{t('budget.warnOverBudget', { after: formatMoney(after), budget: formatMoney(budget) })}</div>
          ) : after > earned + 0.01 ? (
            <div className="flex gap-2 items-start text-[13px] text-status-amber bg-status-amberBg rounded-lg px-3 py-2.5"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{t('budget.warnAheadOfWork', { pct: task.progress_pct || 0, earned: formatMoney(earned) })}</div>
          ) : (
            <div className="flex gap-2 items-start text-[13px] text-status-green bg-status-greenBg rounded-lg px-3 py-2.5"><CheckCircle2 size={16} className="shrink-0 mt-0.5" />{t('budget.okBudget', { after: formatMoney(after), budget: formatMoney(budget) })}</div>
          )
        )}
        <Field label={t('budget.dueDate')}><DateInput value={f.due_date || ''} onChange={set('due_date')} /></Field>
        <Field label={t('budget.pdf')} hint={expense?.document_url ? t('budget.pdfReplace') : null}>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files[0] || null)}
            className="text-[13px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-line file:bg-white file:text-ink-600" />
        </Field>
        <Field label={t('budget.description')}><TextArea rows={2} value={f.description || ''} onChange={set('description')} /></Field>
      </div>
    </Drawer>
  )
}

function PaymentModal({ expense, onClose, onSaved }) {
  const { t } = useT()
  const [amount, setAmount] = useState(null)
  const [date, setDate] = useState(toISODate(todayLocal()))
  useEffect(() => {
    if (expense) { setAmount(Math.max(0, toNumber(expense.amount) - toNumber(expense.amount_paid))); setDate(toISODate(todayLocal())) }
  }, [expense?.id])
  if (!expense) return null
  const save = async () => {
    await Expenses.update(expense.id, {
      amount_paid: (toNumber(expense.amount_paid) + toNumber(amount)).toFixed(2), paid_date: date,
      approval_status: expense.approval_status === 'received' ? 'approved' : expense.approval_status,
    })
    onSaved()
  }
  return (
    <Modal open onClose={onClose} title={t('budget.recordPayment')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} disabled={!amount}>{t('common.save')}</Button></>}>
      <p className="text-[13px] text-ink-500 mb-4">{expense.vendor_name} · {formatMoney(expense.amount)} · {t('overview.paid')} {formatMoney(expense.amount_paid)}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('budget.amount')}><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label={t('budget.paidOn')}><DateInput value={date} onChange={(v) => setDate(v)} /></Field>
      </div>
    </Modal>
  )
}
