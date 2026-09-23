import React, { useState, useEffect } from 'react'
import { Projects } from '../lib/api'
import { Card, SectionCard, PageHeader, StatCard } from '../components/ui.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useT } from '../lib/i18n.jsx'
import { FEATURE_CRM } from '../lib/features.js'
import { Loading, EmptyState, Segmented } from '../components/ui.jsx'
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts'

export default function AnalyticsPage({ projectId }) {
  const [granularity, setGranularity] = useState('month')
  const [data, setData] = useState(null)
  const { format } = useCurrency()
  const { t } = useT()
  const fmt0 = (v) => format(v, { decimals: 0 })

  useEffect(() => {
    if (!projectId) { setData(null); return }
    Projects.analytics(projectId, granularity).then(setData)
  }, [projectId, granularity])

  if (!projectId) {
    return <Card><EmptyState title={t('common.noProject')} subtitle={t('common.noProjectHint')} /></Card>
  }
  if (!data) {
    return <Loading rows={6} />
  }

  const totals = data.totals || {}
  const lastPoint = data.series[data.series.length - 1] || {}
  const breakeven = lastPoint.net_actual >= 0

  return (
    <div>
      <PageHeader
        title={t('nav.analytics')}
        subtitle={t('analytics.subtitle')}
        action={
          <Segmented label={t('analytics.granularity')} value={granularity} onChange={setGranularity}
            options={['week', 'month', 'quarter', 'year'].map(g => ({ value: g, label: t(`analytics.g.${g}`) }))} />
        }
      />

      {/* --- Projected vs. Real: the four numbers that matter most --- */}
      {FEATURE_CRM ? (
      <SectionCard title={t('analytics.projectedVsReal')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('analytics.projectedCost')} value={format(totals.projected_cost)} hint={t('analytics.projectedCostHint')} />
          <StatCard label={t('analytics.realCost')} value={format(totals.real_cost)} hint={t('analytics.realCostHint')} />
          <StatCard label={t('analytics.projectedRevenue')} value={format(totals.projected_revenue)} hint={t('analytics.projectedRevenueHint')} />
          <StatCard label={t('analytics.realRevenue')} value={format(totals.real_revenue)} hint={t('analytics.realRevenueHint')} />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <StatCard label={t('analytics.projectedProfit')} value={format(totals.projected_profit)} tone={totals.projected_profit >= 0 ? 'green' : 'red'} hint={t('analytics.projectedProfitHint')} />
          <StatCard label={t('analytics.realProfit')} value={format(totals.real_profit)} tone={totals.real_profit >= 0 ? 'green' : 'red'} hint={t('analytics.realProfitHint')} />
        </div>
      </SectionCard>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <StatCard label={t('analytics.projectedCost')} value={format(totals.projected_cost)} hint={t('analytics.projectedCostHint')} />
          <StatCard label={t('analytics.realCost')} value={format(totals.real_cost)} hint={t('analytics.realCostHint')} />
          <StatCard label={t('analytics.remaining')} value={format((totals.projected_cost || 0) - (totals.real_cost || 0))} hint={t('analytics.remainingHint')} />
          <StatCard label={t('analytics.invoicedPct')} value={`${totals.projected_cost ? Math.round((totals.real_cost / totals.projected_cost) * 1000) / 10 : 0} %`.replace('.', ',')} hint={t('analytics.invoicedPctHint')} />
        </div>
      )}

      {FEATURE_CRM && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label={t('analytics.estLogged')} value={format(totals.total_estimated)} />
        <StatCard label={t('analytics.actualSoFar')} value={format(totals.total_actual)} />
        <StatCard label={t('analytics.net')} value={format(lastPoint.net_actual)} tone={breakeven ? 'green' : 'red'} />
        <StatCard label={t('analytics.status')} value={breakeven ? t('analytics.breakeven') : t('analytics.preBreakeven')} tone={breakeven ? 'green' : 'amber'} />
      </div>
      )}

      <SectionCard title={t('analytics.cumulative')}>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7EBEF" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fontFamily: 'IBM Plex Sans' }} stroke="#9FADBD" />
            <YAxis tick={{ fontSize: 11, fontFamily: 'IBM Plex Sans' }} tickFormatter={fmt0} width={96} stroke="#9FADBD" />
            <Tooltip formatter={(v) => format(v)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E7EBEF' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#9FADBD" />
            {FEATURE_CRM && <Line type="monotone" dataKey="cumulative_cost_estimated" name={t('analytics.l.estCumCost')} stroke="#9FADBD" strokeDasharray="4 3" dot={false} />}
            <Line type="monotone" dataKey="cumulative_cost_actual" name={t('analytics.l.actCumCost')} stroke="#C2410F" strokeWidth={2} dot={false} />
            {FEATURE_CRM && <Line type="monotone" dataKey="cumulative_revenue_estimated" name={t('analytics.l.estCumRev')} stroke="#4E7BB5" strokeDasharray="4 3" dot={false} />}
            {FEATURE_CRM && <Line type="monotone" dataKey="cumulative_revenue_actual" name={t('analytics.l.actCumRev')} stroke="#1E8E5A" strokeWidth={2} dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title={t('analytics.perPeriod')}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7EBEF" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fontFamily: 'IBM Plex Sans' }} stroke="#9FADBD" />
            <YAxis tick={{ fontSize: 11, fontFamily: 'IBM Plex Sans' }} tickFormatter={fmt0} width={96} stroke="#9FADBD" />
            <Tooltip formatter={(v) => format(v)} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#E7EBEF' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {FEATURE_CRM && <Bar dataKey="cost_estimated" name={t('analytics.l.estCost')} fill="#CBD3DC" radius={[3, 3, 0, 0]} />}
            <Bar dataKey="cost_actual" name={t('analytics.l.actCost')} fill="#C2410F" radius={[3, 3, 0, 0]} />
            {FEATURE_CRM && <Bar dataKey="revenue_actual" name={t('analytics.l.actRev')} fill="#1E8E5A" radius={[3, 3, 0, 0]} />}
          </ComposedChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title={t('analytics.table')}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-ink-400 text-xs border-b border-line">
              <tr>
                <th className="py-2 font-semibold">{t('analytics.c.period')}</th>
                <th className="font-semibold text-right">{t('analytics.c.invoiced')}</th>
                <th className="font-semibold text-right">{t('analytics.c.cumInvoiced')}</th>
                {FEATURE_CRM && <><th className="font-semibold text-right">{t('analytics.l.actRev')}</th><th className="font-semibold text-right pr-1">{t('analytics.c.cumNet')}</th></>}
              </tr>
            </thead>
            <tbody>
              {data.series.map(row => (
                <tr key={row.period} className="border-b border-line-soft last:border-0">
                  <td className="py-2.5 font-medium text-ink-800">{row.period}</td>
                  <td className="text-right text-ink-600">{format(row.cost_actual)}</td>
                  <td className="text-right text-ink-800 font-medium">{format(row.cumulative_cost_actual)}</td>
                  {FEATURE_CRM && <>
                    <td className="text-right text-ink-600">{format(row.revenue_actual)}</td>
                    <td className={`text-right pr-1 font-semibold ${row.net_actual >= 0 ? 'text-status-green' : 'text-status-red'}`}>{format(row.net_actual)}</td>
                  </>}
                </tr>
              ))}
              {data.series.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-ink-300">{t('analytics.noData')}</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
