import React, { useState, useEffect } from 'react'
import { Projects, Units, Customers, Vendors, Tasks, SaleAgreements, Installments, Expenses, Documents, Activities } from '../lib/api'
import { Card, SectionCard, PageHeader, Badge, Button, Field, Input, Select, EmptyState } from '../components/ui.jsx'
import { useCurrency } from '../lib/currency.jsx'
import TaskLogModal from '../components/TaskLogModal.jsx'

/* ============================= TODAY / THIS WEEK ============================= */

function FeedRow({ tone, primary, secondary, right, onFollowUp }) {
  return (
    <li className="py-2.5 flex items-center justify-between text-sm border-b border-ink-50 last:border-0 group">
      <div className="flex items-center gap-2 min-w-0">
        <Badge tone={tone}>{tone === 'red' ? 'overdue' : tone === 'blue' ? 'task' : 'upcoming'}</Badge>
        <span className="text-ink-700 truncate">{primary}</span>
        {secondary && <span className="text-ink-400 text-xs whitespace-nowrap">{secondary}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {right && <span className="font-mono text-xs text-ink-500">{right}</span>}
        {onFollowUp && (
          <button
            onClick={onFollowUp}
            title="Create a linked follow-up"
            className="text-blueprint-500 opacity-0 group-hover:opacity-100 transition text-sm leading-none px-1"
          >+</button>
        )}
      </div>
    </li>
  )
}

function TodayThisWeek({ projectId, vendors, customers, tasks }) {
  const [feed, setFeed] = useState(null)
  const [activityForm, setActivityForm] = useState({ title: '', activity_type: 'call', due_date: '', related_task: '', related_vendor: '', related_customer: '' })
  const { format } = useCurrency()

  const refresh = () => { if (projectId) Projects.feed(projectId).then(setFeed) }
  useEffect(() => { refresh() }, [projectId])

  const addActivity = async (e) => {
    e.preventDefault()
    await Activities.create({
      project: projectId,
      title: activityForm.title,
      activity_type: activityForm.activity_type,
      due_date: activityForm.due_date || null,
      related_task: activityForm.related_task || null,
      related_vendor: activityForm.related_vendor || null,
      related_customer: activityForm.related_customer || null,
    })
    setActivityForm({ title: '', activity_type: 'call', due_date: '', related_task: '', related_vendor: '', related_customer: '' })
    refresh()
  }

  // Turns any "needs attention" row directly into a linked to-do, so the automatic
  // feed and the manual follow-up list aren't two disconnected things — every
  // upcoming event is one click away from becoming a tracked action.
  const followUpOn = async ({ title, due_date, related_task, related_vendor, related_customer }) => {
    await Activities.create({
      project: projectId, title, activity_type: 'follow_up', due_date: due_date || null,
      related_task: related_task || null, related_vendor: related_vendor || null, related_customer: related_customer || null,
    })
    refresh()
  }

  const toggleDone = async (activity) => {
    await Activities.update(activity.id, { done: !activity.done })
    refresh()
  }

  if (!feed) return <Card><EmptyState title="Loading feed…" /></Card>

  const nothingUrgent = feed.overdue_installments.length === 0 && feed.overdue_payables.length === 0 &&
    feed.upcoming_installments.length === 0 && feed.upcoming_payables.length === 0 &&
    feed.tasks_soon.length === 0 && feed.open_issues.length === 0 && feed.pending_verification.length === 0

  return (
    <div className="grid md:grid-cols-2 gap-6 mb-6">
      <SectionCard eyebrow="Attention" title="Needs attention">
        {nothingUrgent && <EmptyState title="Nothing urgent" subtitle="No overdue items or tasks due in the next two weeks." />}
        <ul>
          {feed.overdue_installments.map(i => (
            <FeedRow key={`oi-${i.id}`} tone="red" primary={`${i.customer_name} — unit ${i.unit}`} secondary={`payment due ${i.due_date}`} right={format(i.amount_due)}
              onFollowUp={() => followUpOn({ title: `Chase overdue payment — ${i.customer_name} (unit ${i.unit})`, due_date: new Date().toISOString().slice(0, 10) })} />
          ))}
          {feed.overdue_payables.map(p => (
            <FeedRow key={`op-${p.id}`} tone="red" primary={p.vendor_name || p.description} secondary={`bill due ${p.due_date}`} right={format(p.amount - p.amount_paid)}
              onFollowUp={() => followUpOn({ title: `Pay overdue bill — ${p.vendor_name || p.description}`, due_date: new Date().toISOString().slice(0, 10) })} />
          ))}
          {feed.upcoming_installments.map(i => (
            <FeedRow key={`ui-${i.id}`} tone="amber" primary={`${i.customer_name} — unit ${i.unit}`} secondary={`due ${i.due_date}`} right={format(i.amount_due)}
              onFollowUp={() => followUpOn({ title: `Remind ${i.customer_name} — payment due ${i.due_date}`, due_date: i.due_date })} />
          ))}
          {feed.upcoming_payables.map(p => (
            <FeedRow key={`up-${p.id}`} tone="amber" primary={p.vendor_name || p.description} secondary={`due ${p.due_date}`} right={format(p.amount - p.amount_paid)}
              onFollowUp={() => followUpOn({ title: `Prepare payment — ${p.vendor_name || p.description}`, due_date: p.due_date })} />
          ))}
          {feed.tasks_soon.map(t => (
            <FeedRow key={`t-${t.id}`} tone="blue" primary={t.name} secondary={`${t.estimated_start} → ${t.estimated_end}`} right={t.status.replace('_', ' ')}
              onFollowUp={() => followUpOn({ title: `Check in on — ${t.name}`, due_date: t.estimated_start, related_task: t.id })} />
          ))}
          {feed.open_issues.map(i => (
            <FeedRow key={`iss-${i.id}`} tone="amber" primary={i.title} secondary={`issue · ${i.severity}`}
              onFollowUp={() => followUpOn({ title: `Resolve issue — ${i.title}`, due_date: new Date().toISOString().slice(0, 10), related_task: i.related_task })} />
          ))}
          {feed.pending_verification.map(t => (
            <FeedRow key={`pv-${t.id}`} tone="amber" primary={t.name} secondary="marked completed — awaiting sign-off"
              onFollowUp={() => followUpOn({ title: `Verify completed work — ${t.name}`, due_date: new Date().toISOString().slice(0, 10), related_task: t.id })} />
          ))}
        </ul>
      </SectionCard>

      <SectionCard eyebrow="Follow-ups" title="Your to-dos">
        <form onSubmit={addActivity} className="grid grid-cols-2 gap-2 mb-4">
          <Input placeholder="e.g. Call Dzoni about rebar delivery" value={activityForm.title} onChange={e => setActivityForm({ ...activityForm, title: e.target.value })} required className="col-span-2" />
          <Select value={activityForm.activity_type} onChange={e => setActivityForm({ ...activityForm, activity_type: e.target.value })}>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="site_visit">Site Visit</option>
            <option value="meeting">Meeting</option>
            <option value="follow_up">Follow-up</option>
            <option value="note">Note</option>
          </Select>
          <Input type="date" value={activityForm.due_date} onChange={e => setActivityForm({ ...activityForm, due_date: e.target.value })} />
          <Select value={activityForm.related_task} onChange={e => setActivityForm({ ...activityForm, related_task: e.target.value })}>
            <option value="">Link task (optional)</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select value={activityForm.related_vendor} onChange={e => setActivityForm({ ...activityForm, related_vendor: e.target.value })}>
            <option value="">Link vendor (optional)</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
          <Select value={activityForm.related_customer} onChange={e => setActivityForm({ ...activityForm, related_customer: e.target.value })}>
            <option value="">Link customer (optional)</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button type="submit" className="col-span-2">Add to-do</Button>
        </form>
        <ul>
          {feed.activities.map(a => (
            <li key={a.id} className="py-2 flex items-center gap-3 border-b border-ink-50 last:border-0 text-sm">
              <input type="checkbox" checked={a.done} onChange={() => toggleDone(a)} className="shrink-0" />
              <div className="flex-1">
                <span className="text-ink-700">{a.title}</span>
                {(a.related_task_name || a.related_vendor_name || a.related_customer_name) && (
                  <span className="text-ink-400 text-xs ml-2">({a.related_task_name || a.related_vendor_name || a.related_customer_name})</span>
                )}
              </div>
              <Badge tone="slate">{a.activity_type.replace('_', ' ')}</Badge>
              {a.due_date && <span className="font-mono text-xs text-ink-400">{a.due_date}</span>}
            </li>
          ))}
          {feed.activities.length === 0 && <EmptyState title="No to-dos yet" subtitle="Add a quick follow-up above." />}
        </ul>
      </SectionCard>
    </div>
  )
}

/* ============================= CUSTOMERS & SALES ============================= */

function DocList({ projectId, saleAgreementId }) {
  const [docs, setDocs] = useState([])
  const [form, setForm] = useState({ title: '', doc_type: 'contract', file: null })

  const refresh = () => { Documents.list(projectId, null, saleAgreementId).then(setDocs) }
  useEffect(() => { refresh() }, [saleAgreementId])

  const upload = async (e) => {
    e.preventDefault()
    if (!form.file) return
    await Documents.upload({ project: projectId, sale_agreement: saleAgreementId, title: form.title || form.file.name, doc_type: form.doc_type, file: form.file })
    setForm({ title: '', doc_type: 'contract', file: null })
    refresh()
  }

  return (
    <div className="mt-3 border-t border-ink-50 pt-3">
      <div className="text-xs font-medium text-ink-400 mb-2">Documents (contract, ID, proof of payment…)</div>
      <form onSubmit={upload} className="grid grid-cols-3 gap-2 mb-2">
        <Input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <Select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })}>
          <option value="contract">Contract</option>
          <option value="insurance">Insurance</option>
          <option value="invoice">Invoice</option>
          <option value="other">Other</option>
        </Select>
        <input type="file" className="text-xs" onChange={e => setForm({ ...form, file: e.target.files[0] })} />
      </form>
      <Button type="button" size="sm" variant="secondary" onClick={upload}>Upload</Button>
      <ul className="text-xs mt-2 divide-y divide-ink-50">
        {docs.map(d => (
          <li key={d.id} className="py-1 flex justify-between">
            <a href={d.file} target="_blank" rel="noreferrer" className="text-blueprint-600 hover:underline">{d.title}</a>
            <span className="text-ink-400">{d.doc_type}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SellUnitForm({ unit, customers, projectId, onDone }) {
  const [customerId, setCustomerId] = useState('')
  const [agreedPrice, setAgreedPrice] = useState(unit.list_price)
  const [agreedSqm, setAgreedSqm] = useState(unit.sqm)
  const [structure, setStructure] = useState('lump_sum')
  const [signedDate, setSignedDate] = useState('')
  const [installments, setInstallments] = useState([{ due_date: '', amount_due: '' }])

  const addRow = () => setInstallments([...installments, { due_date: '', amount_due: '' }])
  const updateRow = (i, field, value) => {
    const next = [...installments]
    next[i][field] = value
    setInstallments(next)
  }
  const removeRow = (i) => setInstallments(installments.filter((_, idx) => idx !== i))

  const submit = async (e) => {
    e.preventDefault()
    if (!customerId) return alert('Pick a customer')
    const payload = {
      unit: unit.id, customer: customerId, agreed_price: agreedPrice, agreed_sqm: agreedSqm,
      payment_structure: structure, signed_date: signedDate || null, status: 'signed',
    }
    // Every sale — regardless of structure — gets at least one payment-schedule row,
    // so "mark paid" and the sold/unsold status work the same way for all of them.
    let rows = installments.filter(i => i.due_date && i.amount_due)
    if (rows.length === 0) {
      rows = [{ due_date: signedDate || new Date().toISOString().slice(0, 10), amount_due: agreedPrice }]
    }
    payload.installments = rows.map(i => ({ due_date: i.due_date, amount_due: i.amount_due }))
    await SaleAgreements.create(payload)
    await Units.update(unit.id, { status: 'reserved' })
    onDone()
  }

  return (
    <form onSubmit={submit} className="bg-ink-50/60 border border-ink-100 rounded-lg p-4 mt-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <Select value={customerId} onChange={e => setCustomerId(e.target.value)} required>
          <option value="">Select customer…</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input type="number" placeholder="Agreed price (EUR)" value={agreedPrice} onChange={e => setAgreedPrice(e.target.value)} required />
        <Input type="number" placeholder="Agreed sq.m" value={agreedSqm} onChange={e => setAgreedSqm(e.target.value)} required />
        <Select value={structure} onChange={e => setStructure(e.target.value)}>
          <option value="lump_sum">Lump Sum</option>
          <option value="installments">Installments</option>
          <option value="mortgage">Mortgage</option>
        </Select>
        <Input type="date" value={signedDate} onChange={e => setSignedDate(e.target.value)} />
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium text-ink-400 mb-2">
          Payment schedule {structure === 'lump_sum' && '(leave blank to auto-fill one payment for the full price)'}
        </div>
        {installments.map((row, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <Input type="date" value={row.due_date} onChange={e => updateRow(i, 'due_date', e.target.value)} />
            <Input type="number" placeholder="Amount due (EUR)" value={row.amount_due} onChange={e => updateRow(i, 'amount_due', e.target.value)} />
            <button type="button" onClick={() => removeRow(i)} className="text-ink-300 hover:text-safety-600 px-2">✕</button>
          </div>
        ))}
        <button type="button" onClick={addRow} className="text-blueprint-600 text-xs hover:underline font-medium">+ add installment</button>
      </div>

      <Button type="submit" className="mt-3">Confirm sale</Button>
    </form>
  )
}

function AgreementCard({ agreement, projectId, onChanged }) {
  const { format } = useCurrency()
  const installments = agreement.installments || []
  const totalDue = installments.reduce((s, i) => s + parseFloat(i.amount_due), 0)
  const totalPaid = installments.reduce((s, i) => s + parseFloat(i.amount_paid || 0), 0)
  const anyOverdue = installments.some(i => !i.paid_date && new Date(i.due_date) < new Date())

  const markInstallmentPaid = async (inst) => {
    await Installments.update(inst.id, { paid_date: new Date().toISOString().slice(0, 10), amount_paid: inst.amount_due })
    onChanged()
  }

  return (
    <div className="border border-ink-100 rounded-lg p-3.5 mt-2.5 bg-white">
      <div className="flex justify-between items-center">
        <div>
          <span className="font-medium text-ink-800">{agreement.customer_name}</span>
          <span className="text-ink-400 ml-2 text-xs">{agreement.payment_structure.replace('_', ' ')} · {agreement.status}</span>
        </div>
        <div className="text-sm font-mono">
          <span className="font-semibold text-ink-800">{format(agreement.agreed_price)}</span>
          <span className="text-ink-400 text-xs ml-1">({agreement.agreed_sqm} sqm)</span>
        </div>
      </div>

      {agreement.payment_structure === 'installments' && installments.length > 0 && (
        <div className="mt-2.5">
          <div className="text-xs text-ink-400 mb-1 flex justify-between font-mono">
            <span>Paid {format(totalPaid)} of {format(totalDue)}</span>
            {anyOverdue && <span className="text-status-red font-semibold">Overdue payment(s)</span>}
          </div>
          <div className="w-full bg-ink-100 rounded-full h-1.5 mb-2">
            <div className="bg-status-green h-1.5 rounded-full transition-all" style={{ width: `${totalDue ? Math.min(100, (totalPaid / totalDue) * 100) : 0}%` }} />
          </div>
          <ul className="text-xs divide-y divide-ink-50">
            {installments.map(inst => {
              const overdue = !inst.paid_date && new Date(inst.due_date) < new Date()
              return (
                <li key={inst.id} className="py-1.5 flex justify-between items-center">
                  <span className={`font-mono ${overdue ? 'text-status-red' : 'text-ink-500'}`}>Due {inst.due_date} — {format(inst.amount_due)}</span>
                  {inst.paid_date ? (
                    <Badge tone="green">Paid {inst.paid_date}</Badge>
                  ) : (
                    <button onClick={() => markInstallmentPaid(inst)} className="text-blueprint-600 hover:underline font-medium">Mark paid</button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <DocList projectId={projectId} saleAgreementId={agreement.id} />
    </div>
  )
}

function CustomersSales({ projectId, customers }) {
  const [units, setUnits] = useState([])
  const [agreementsByUnit, setAgreementsByUnit] = useState({})
  const [sellingUnitId, setSellingUnitId] = useState(null)
  const { format } = useCurrency()

  const refresh = () => {
    if (!projectId) return
    // One project-scoped call instead of one call per unit — avoids N+1 requests.
    Promise.all([
      Units.list(projectId),
      SaleAgreements.listByProject(projectId),
    ]).then(([us, agreements]) => {
      setUnits(us)
      const map = {}
      for (const u of us) map[u.id] = agreements.filter(a => a.unit === u.id)
      setAgreementsByUnit(map)
    })
  }
  useEffect(() => { refresh() }, [projectId])

  const soldCount = units.filter(u => u.status === 'sold' || u.status === 'reserved').length
  const totalAgreed = Object.values(agreementsByUnit).flat().reduce((s, a) => s + parseFloat(a.agreed_price), 0)

  return (
    <SectionCard eyebrow="Sales" title="Customers & units">
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="text-xs text-ink-400">Units total <span className="block font-mono text-lg font-semibold text-ink-800">{units.length}</span></div>
        <div className="text-xs text-ink-400">Sold / reserved <span className="block font-mono text-lg font-semibold text-ink-800">{soldCount}</span></div>
        <div className="text-xs text-ink-400">Agreed value <span className="block font-mono text-lg font-semibold text-status-green">{format(totalAgreed)}</span></div>
      </div>

      <div className="space-y-3">
        {units.map(u => {
          const agreements = agreementsByUnit[u.id] || []
          const hasAgreement = agreements.length > 0
          return (
            <div key={u.id} className="border border-ink-100 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-ink-800">{u.identifier}</span>
                  <span className="text-ink-400 text-sm ml-2 font-mono">{u.sqm} sqm · {format(u.list_price)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={u.status === 'sold' ? 'green' : u.status === 'reserved' ? 'amber' : 'slate'}>{u.status}</Badge>
                  {!hasAgreement && u.status === 'available' && (
                    <Button size="sm" onClick={() => setSellingUnitId(sellingUnitId === u.id ? null : u.id)}>
                      {sellingUnitId === u.id ? 'Cancel' : 'Sell this unit'}
                    </Button>
                  )}
                  {u.status === 'reserved' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => { await Units.markSold(u.id); refresh() }}
                      title="Closes the sale out fully — marks any remaining installments as paid"
                    >
                      Mark as sold
                    </Button>
                  )}
                </div>
              </div>
              {sellingUnitId === u.id && (
                <SellUnitForm unit={u} customers={customers} projectId={projectId} onDone={() => { setSellingUnitId(null); refresh() }} />
              )}
              {agreements.map(a => <AgreementCard key={a.id} agreement={a} projectId={projectId} onChanged={refresh} />)}
            </div>
          )
        })}
        {units.length === 0 && <EmptyState title="No units yet" subtitle="Add units on the Setup page." />}
      </div>
    </SectionCard>
  )
}

/* ============================= VENDORS & PAYABLES ============================= */

function VendorsPayables({ projectId, vendors, tasks }) {
  const [expenses, setExpenses] = useState([])
  const [form, setForm] = useState({ vendor: '', task: '', entry_type: 'estimate', description: '', amount: '', date: '', due_date: '' })
  const { format } = useCurrency()

  const refresh = () => { if (projectId) Expenses.list(projectId).then(setExpenses) }
  useEffect(() => { refresh() }, [projectId])

  const addExpense = async (e) => {
    e.preventDefault()
    await Expenses.create({
      project: projectId, vendor: form.vendor || null, task: form.task || null,
      entry_type: form.entry_type, description: form.description, amount: form.amount,
      date: form.date, due_date: form.due_date || null,
    })
    setForm({ vendor: '', task: '', entry_type: 'estimate', description: '', amount: '', date: '', due_date: '' })
    refresh()
  }

  const markPaid = async (exp) => {
    await Expenses.update(exp.id, { amount_paid: exp.amount, paid_date: new Date().toISOString().slice(0, 10) })
    refresh()
  }

  const payables = expenses.filter(e => e.entry_type === 'actual' && e.vendor)
  const totalOutstanding = payables.reduce((s, e) => s + (parseFloat(e.amount) - parseFloat(e.amount_paid || 0)), 0)

  return (
    <SectionCard eyebrow="Payables" title="Vendors & bills">
      <div className="text-xs text-ink-400 mb-4">Outstanding to vendors <span className="block font-mono text-lg font-semibold text-status-amber">{format(totalOutstanding)}</span></div>

      <form onSubmit={addExpense} className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
        <Select value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}>
          <option value="">Vendor (optional)</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select value={form.task} onChange={e => setForm({ ...form, task: e.target.value })}>
          <option value="">Task (optional)</option>
          {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={form.entry_type} onChange={e => setForm({ ...form, entry_type: e.target.value })}>
          <option value="estimate">Estimate</option>
          <option value="actual">Actual (vendor bill)</option>
        </Select>
        <Input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
        <Input type="number" placeholder="Amount" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
        <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
        {form.entry_type === 'actual' && <Input type="date" placeholder="Due date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />}
        <Button type="submit">Add expense</Button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-ink-400 text-xs uppercase tracking-wide border-b border-ink-100">
            <tr><th className="py-2 font-medium">Vendor</th><th className="font-medium">Description</th><th className="font-medium">Amount</th><th className="font-medium">Paid</th><th className="font-medium">Outstanding</th><th className="font-medium">Due</th><th className="font-medium">Status</th><th></th></tr>
          </thead>
          <tbody className="font-mono text-[13px]">
            {payables.map(p => {
              const outstanding = parseFloat(p.amount) - parseFloat(p.amount_paid || 0)
              const overdue = p.due_date && outstanding > 0 && new Date(p.due_date) < new Date()
              return (
                <tr key={p.id} className="border-b border-ink-50 last:border-0">
                  <td className="py-2.5 font-sans text-ink-700">{p.vendor_name || '—'}</td>
                  <td className="font-sans text-ink-500">{p.description}</td>
                  <td className="text-ink-500">{format(p.amount)}</td>
                  <td className="text-ink-500">{format(p.amount_paid)}</td>
                  <td className={outstanding > 0 ? (overdue ? 'text-status-red font-semibold' : 'text-status-amber font-semibold') : 'text-status-green'}>{format(outstanding)}</td>
                  <td className={overdue ? 'text-status-red' : 'text-ink-500'}>{p.due_date || '—'}</td>
                  <td><Badge tone={p.payment_status === 'paid' ? 'green' : p.payment_status === 'partial' ? 'amber' : 'slate'}>{p.payment_status}</Badge></td>
                  <td>{outstanding > 0 && <button onClick={() => markPaid(p)} className="text-blueprint-600 hover:underline font-sans text-xs">Mark paid</button>}</td>
                </tr>
              )
            })}
            {payables.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-ink-300 font-sans">No vendor bills logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

/* ============================= PAGE ============================= */

export default function OperationalPage({ projectId }) {
  const [vendors, setVendors] = useState([])
  const [customers, setCustomers] = useState([])
  const [tasks, setTasks] = useState([])
  const [showTaskLog, setShowTaskLog] = useState(false)

  useEffect(() => {
    Vendors.list().then(setVendors)
    Customers.list().then(setCustomers)
    if (projectId) Tasks.list(projectId).then(setTasks)
  }, [projectId])

  if (!projectId) {
    return <Card><EmptyState title="No project selected" subtitle="Choose a project from the top-right dropdown." /></Card>
  }

  return (
    <div>
      <PageHeader
        eyebrow="Act"
        title="Operational"
        subtitle="Daily follow-ups, sales, and vendor payments — everything actionable."
        action={
          <Button variant="secondary" onClick={() => setShowTaskLog(true)}>
            View task log
          </Button>
        }
      />
      <TodayThisWeek projectId={projectId} vendors={vendors} customers={customers} tasks={tasks} />
      <CustomersSales projectId={projectId} customers={customers} />
      <VendorsPayables projectId={projectId} vendors={vendors} tasks={tasks} />
      {showTaskLog && <TaskLogModal projectId={projectId} onClose={() => setShowTaskLog(false)} />}
    </div>
  )
}
