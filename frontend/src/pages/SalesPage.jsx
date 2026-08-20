import React, { useState, useEffect } from 'react'
import { Units, Customers, SaleAgreements, Installments } from '../lib/api'

const inputClass = "border rounded-lg px-3 py-2 text-sm w-full"

function money(n) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)
}

function SellUnitForm({ unit, customers, onDone }) {
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
      unit: unit.id,
      customer: customerId,
      agreed_price: agreedPrice,
      agreed_sqm: agreedSqm,
      payment_structure: structure,
      signed_date: signedDate || null,
      status: 'signed',
    }
    if (structure === 'installments') {
      payload.installments = installments
        .filter(i => i.due_date && i.amount_due)
        .map(i => ({ due_date: i.due_date, amount_due: i.amount_due }))
    }
    await SaleAgreements.create(payload)
    await Units.update(unit.id, { status: 'reserved' })
    onDone()
  }

  return (
    <form onSubmit={submit} className="bg-slate-50 border rounded-xl p-4 mt-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <select className={inputClass} value={customerId} onChange={e => setCustomerId(e.target.value)} required>
          <option value="">Select customer…</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="number" className={inputClass} placeholder="Agreed price" value={agreedPrice} onChange={e => setAgreedPrice(e.target.value)} required />
        <input type="number" className={inputClass} placeholder="Agreed sq.m" value={agreedSqm} onChange={e => setAgreedSqm(e.target.value)} required />
        <select className={inputClass} value={structure} onChange={e => setStructure(e.target.value)}>
          <option value="lump_sum">Lump Sum</option>
          <option value="installments">Installments</option>
          <option value="mortgage">Mortgage</option>
        </select>
        <input type="date" className={inputClass} placeholder="Signed date" value={signedDate} onChange={e => setSignedDate(e.target.value)} />
      </div>

      {structure === 'installments' && (
        <div className="mt-3">
          <div className="text-xs text-slate-500 mb-2">Payment schedule</div>
          {installments.map((row, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input type="date" className={inputClass} value={row.due_date} onChange={e => updateRow(i, 'due_date', e.target.value)} />
              <input type="number" className={inputClass} placeholder="Amount due" value={row.amount_due} onChange={e => updateRow(i, 'amount_due', e.target.value)} />
              <button type="button" onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-600 px-2">✕</button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="text-blue-600 text-xs hover:underline">+ add installment</button>
        </div>
      )}

      <button className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium mt-3">Confirm sale</button>
    </form>
  )
}

function AgreementCard({ agreement, onChanged }) {
  const [installments, setInstallments] = useState([])

  useEffect(() => {
    setInstallments(agreement.installments || [])
  }, [agreement])

  const totalDue = installments.reduce((s, i) => s + parseFloat(i.amount_due), 0)
  const totalPaid = installments.reduce((s, i) => s + parseFloat(i.amount_paid || 0), 0)
  const anyOverdue = installments.some(i => !i.paid_date && new Date(i.due_date) < new Date())

  const markInstallmentPaid = async (inst) => {
    await Installments.update(inst.id, {
      paid_date: new Date().toISOString().slice(0, 10),
      amount_paid: inst.amount_due,
    })
    onChanged()
  }

  return (
    <div className="border rounded-lg p-3 mt-2 bg-white">
      <div className="flex justify-between items-center mb-1">
        <div>
          <span className="font-medium text-slate-800">{agreement.customer_name}</span>
          <span className="text-slate-400 ml-2 text-xs">{agreement.payment_structure} · {agreement.status}</span>
        </div>
        <div className="text-sm">
          <span className="font-medium">{money(agreement.agreed_price)}</span>
          <span className="text-slate-400 text-xs ml-1">({agreement.agreed_sqm} sqm)</span>
        </div>
      </div>

      {agreement.payment_structure === 'installments' && installments.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-slate-500 mb-1 flex justify-between">
            <span>Paid {money(totalPaid)} of {money(totalDue)}</span>
            {anyOverdue && <span className="text-status-red font-medium">Overdue payment(s)</span>}
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
            <div className="bg-status-green h-1.5 rounded-full" style={{ width: `${totalDue ? Math.min(100, (totalPaid / totalDue) * 100) : 0}%` }} />
          </div>
          <ul className="text-xs divide-y">
            {installments.map(inst => {
              const overdue = !inst.paid_date && new Date(inst.due_date) < new Date()
              return (
                <li key={inst.id} className="py-1 flex justify-between items-center">
                  <span className={overdue ? 'text-status-red' : 'text-slate-600'}>Due {inst.due_date} — {money(inst.amount_due)}</span>
                  {inst.paid_date ? (
                    <span className="text-status-green">Paid {inst.paid_date}</span>
                  ) : (
                    <button onClick={() => markInstallmentPaid(inst)} className="text-blue-600 hover:underline">Mark paid</button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function SalesPage({ projectId }) {
  const [units, setUnits] = useState([])
  const [customers, setCustomers] = useState([])
  const [agreementsByUnit, setAgreementsByUnit] = useState({})
  const [sellingUnitId, setSellingUnitId] = useState(null)

  const refresh = () => {
    if (!projectId) { setUnits([]); return }
    Units.list(projectId).then(async (us) => {
      setUnits(us)
      const map = {}
      for (const u of us) {
        map[u.id] = await SaleAgreements.list(u.id)
      }
      setAgreementsByUnit(map)
    })
  }

  useEffect(() => {
    Customers.list().then(setCustomers)
    refresh()
  }, [projectId])

  if (!projectId) {
    return <div className="bg-white border rounded-xl p-10 text-center text-slate-400">Select a project to manage sales.</div>
  }

  const soldCount = units.filter(u => u.status === 'sold' || u.status === 'reserved').length
  const totalRevenuePotential = units.reduce((s, u) => s + parseFloat(u.list_price), 0)
  const totalAgreed = Object.values(agreementsByUnit).flat().reduce((s, a) => s + parseFloat(a.agreed_price), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-semibold text-lg text-slate-800">Sales &amp; Customers</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Units total" value={units.length} />
        <StatCard label="Sold / reserved" value={soldCount} />
        <StatCard label="List value (all units)" value={money(totalRevenuePotential)} />
        <StatCard label="Agreed value (sold)" value={money(totalAgreed)} tone="green" />
      </div>

      <div className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold text-slate-800 mb-3">Units</h2>
        {units.length === 0 && <p className="text-sm text-slate-400">No units defined yet — add them on the Setup page.</p>}
        <div className="space-y-3">
          {units.map(u => {
            const agreements = agreementsByUnit[u.id] || []
            const hasAgreement = agreements.length > 0
            return (
              <div key={u.id} className="border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-800">{u.identifier}</span>
                    <span className="text-slate-400 text-sm ml-2">{u.sqm} sqm · list {money(u.list_price)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      u.status === 'sold' ? 'bg-green-100 text-green-700' :
                      u.status === 'reserved' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                    }`}>{u.status}</span>
                    {!hasAgreement && u.status === 'available' && (
                      <button
                        onClick={() => setSellingUnitId(sellingUnitId === u.id ? null : u.id)}
                        className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
                      >
                        {sellingUnitId === u.id ? 'Cancel' : 'Sell this unit'}
                      </button>
                    )}
                  </div>
                </div>

                {sellingUnitId === u.id && (
                  <SellUnitForm unit={u} customers={customers} onDone={() => { setSellingUnitId(null); refresh() }} />
                )}

                {agreements.map(a => (
                  <AgreementCard key={a.id} agreement={a} onChanged={refresh} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone }) {
  const toneClass = tone === 'green' ? 'text-status-green' : tone === 'red' ? 'text-status-red' : 'text-slate-800'
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}
