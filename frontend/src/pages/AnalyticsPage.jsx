import React, { useState, useEffect } from 'react'
import { Projects } from '../lib/api'
import { Card, SectionCard, PageHeader, StatCard } from '../components/ui.jsx'
import { useCurrency } from '../lib/currency.jsx'
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts'

export default function AnalyticsPage({ projectId }) {
  const [granularity, setGranularity] = useState('month')
  const [data, setData] = useState(null)
  const { format } = useCurrency()

  useEffect(() => {
    if (!projectId) { setData(null); return }
    Projects.analytics(projectId, granularity).then(setData)
  }, [projectId, granularity])

  if (!projectId) {
    return <Card><div className="text-center py-10 text-ink-400 text-sm">Select a project to view financials.</div></Card>
  }
  if (!data) {
    return <div className="text-ink-400 text-sm">Loading…</div>
  }

  const totals = data.totals || {}
  const lastPoint = data.series[data.series.length - 1] || {}
  const breakeven = lastPoint.net_actual >= 0

  return (
    <div>
      <PageHeader
        eyebrow="Analyze"
        title="Financial & Projectional Analytics"
        subtitle="Read-only reporting — log expenses and track payments in Operational."
        action={
          <div className="flex rounded-lg border border-ink-200 overflow-hidden text-xs">
            {['day', 'week', 'month', 'quarter', 'year'].map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 capitalize font-medium transition ${granularity === g ? 'bg-blueprint-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}
              >{g}</button>
            ))}
          </div>
        }
      />

      {/* --- Projected vs. Real: the four numbers that matter most --- */}
      <SectionCard eyebrow="Bottom line" title="Projected vs. Real">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Projected cost" value={format(totals.projected_cost)} hint="Sum of every task's planned budget" />
          <StatCard label="Real cost" value={format(totals.real_cost)} tone="red" hint="Actual vendor expenses logged" />
          <StatCard label="Projected revenue" value={format(totals.projected_revenue)} hint="Agreed price (sold) + list price (available)" />
          <StatCard label="Real revenue" value={format(totals.real_revenue)} tone="green" hint="Payments actually collected" />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <StatCard label="Projected profit" value={format(totals.projected_profit)} tone={totals.projected_profit >= 0 ? 'green' : 'red'} hint="Projected revenue − projected cost" />
          <StatCard label="Real profit (so far)" value={format(totals.real_profit)} tone={totals.real_profit >= 0 ? 'green' : 'red'} hint="Real revenue − real cost" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Est. total cost (logged)" value={format(totals.total_estimated)} />
        <StatCard label="Actual cost so far" value={format(totals.total_actual)} />
        <StatCard label="Net position" value={format(lastPoint.net_actual)} tone={breakeven ? 'green' : 'red'} />
        <StatCard label="Status" value={breakeven ? 'Break-even reached' : 'Pre break-even'} tone={breakeven ? 'green' : 'amber'} />
      </div>

      <SectionCard eyebrow="Chart" title="Cumulative cost vs. revenue (break-even)">
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7EBEF" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} stroke="#9FADBD" />
            <YAxis tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} tickFormatter={(v) => format(v)} stroke="#9FADBD" />
            <Tooltip formatter={(v) => format(v)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E7EBEF' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#9FADBD" />
            <Line type="monotone" dataKey="cumulative_cost_estimated" name="Est. cumulative cost" stroke="#9FADBD" strokeDasharray="4 3" dot={false} />
            <Line type="monotone" dataKey="cumulative_cost_actual" name="Actual cumulative cost" stroke="#C2410F" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="cumulative_revenue_estimated" name="Est. cumulative revenue" stroke="#7FA5E4" strokeDasharray="4 3" dot={false} />
            <Line type="monotone" dataKey="cumulative_revenue_actual" name="Actual cumulative revenue" stroke="#1E8E5A" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard eyebrow="Chart" title={`Per-period estimate vs. actual (${granularity})`}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7EBEF" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} stroke="#9FADBD" />
            <YAxis tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono' }} tickFormatter={(v) => format(v)} stroke="#9FADBD" />
            <Tooltip formatter={(v) => format(v)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E7EBEF' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="cost_estimated" name="Est. cost" fill="#CBD3DC" radius={[3, 3, 0, 0]} />
            <Bar dataKey="cost_actual" name="Actual cost" fill="#C2410F" radius={[3, 3, 0, 0]} />
            <Bar dataKey="revenue_actual" name="Actual revenue" fill="#1E8E5A" radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard eyebrow="Table" title={`Actuals vs. estimates (${granularity})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-400 text-xs uppercase tracking-wide border-b border-ink-100">
              <tr>
                <th className="py-2 font-medium">Period</th>
                <th className="font-medium">Est. cost</th><th className="font-medium">Actual cost</th><th className="font-medium">Cost Δ</th>
                <th className="font-medium">Est. revenue</th><th className="font-medium">Actual revenue</th>
                <th className="font-medium">Cumulative net</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[13px]">
              {data.series.map(row => {
                const delta = row.cost_estimated - row.cost_actual
                return (
                  <tr key={row.period} className="border-b border-ink-50 last:border-0">
                    <td className="py-2.5 font-sans font-medium text-ink-800">{row.period}</td>
                    <td className="text-ink-500">{format(row.cost_estimated)}</td>
                    <td className="text-ink-500">{format(row.cost_actual)}</td>
                    <td className={delta >= 0 ? 'text-status-green' : 'text-status-red'}>{format(delta)}</td>
                    <td className="text-ink-500">{format(row.revenue_estimated)}</td>
                    <td className="text-ink-500">{format(row.revenue_actual)}</td>
                    <td className={row.net_actual >= 0 ? 'text-status-green font-semibold' : 'text-status-red font-semibold'}>{format(row.net_actual)}</td>
                  </tr>
                )
              })}
              {data.series.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-ink-300 font-sans">No expense or sale data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
