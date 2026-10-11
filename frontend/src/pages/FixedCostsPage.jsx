import React, { useEffect, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { RecurringCosts } from '../lib/api'
import { Card, PageHeader, Button, EmptyState, Loading } from '../components/ui.jsx'
import RecurringCostEditor from '../components/RecurringCostEditor.jsx'
import { CostList } from './EconomicsPage.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useT } from '../lib/i18n.jsx'
import { useFeedback } from '../components/feedback.jsx'
import { formatNumber, todayLocal, toNumber } from '../lib/format.js'

/** Company fixed costs and site running costs, plus how company costs are shared month by month. */
export default function FixedCostsPage({ projects }) {
  const { t } = useT()
  const { format } = useCurrency()
  const { confirm } = useFeedback()
  const [costs, setCosts] = useState(null)
  const [year, setYear] = useState(() => todayLocal().getFullYear())
  const [alloc, setAlloc] = useState(null)
  const [editor, setEditor] = useState(null)

  const reload = () => {
    RecurringCosts.list().then(setCosts)
    RecurringCosts.allocation(`${year}-01`, `${year}-12`).then(setAlloc)
  }
  useEffect(() => { reload() }, [year])

  if (!costs) return <Loading rows={6} />

  const company = costs.filter(c => !c.project)
  const site = costs.filter(c => c.project)
  const remove = async (cost) => {
    if (!await confirm({ title: t('fixed.delete'), message: cost.name, danger: true, confirmLabel: t('common.delete') })) return
    await RecurringCosts.remove(cost.id); reload()
  }
  const monthName = (iso) => `${iso.slice(5, 7)}.${iso.slice(0, 4)}`
  const shownProjects = alloc ? alloc.projects.filter(p => alloc.months.some(m => m.projects[p.id])) : []

  return (
    <div>
      <PageHeader title={t('nav.fixedCosts')} subtitle={t('fixed.subtitle')}
        action={<Button icon={Plus} onClick={() => setEditor({})}>{t('fixed.new')}</Button>} />

      {costs.length === 0 ? (
        <Card><EmptyState title={t('fixed.none')} action={<Button icon={Plus} onClick={() => setEditor({})}>{t('fixed.new')}</Button>} /></Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          <Card padded={false} className="overflow-hidden">
            <h2 className="text-[15px] font-semibold px-5 pt-4 pb-3">{t('fixed.company')}</h2>
            {company.length ? <CostList costs={company} onEdit={(cost) => setEditor({ cost })} onDelete={remove} />
              : <p className="text-[13px] text-ink-400 px-5 pb-5">—</p>}
          </Card>
          <Card padded={false} className="overflow-hidden">
            <h2 className="text-[15px] font-semibold px-5 pt-4 pb-3">{t('econ.site')}</h2>
            {site.length ? <CostList costs={site} showProject onEdit={(cost) => setEditor({ cost })} onDelete={remove} />
              : <p className="text-[13px] text-ink-400 px-5 pb-5">{t('econ.noSiteCosts')}</p>}
          </Card>
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold">{t('fixed.allocation')}</h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" icon={ChevronLeft} aria-label="−1" onClick={() => setYear(y => y - 1)} />
            <span className="w-14 text-center text-[13px] font-medium tabular-nums">{year}</span>
            <Button size="sm" variant="secondary" icon={ChevronRight} aria-label="+1" onClick={() => setYear(y => y + 1)} />
          </div>
        </div>
        {!alloc ? <Loading rows={4} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#FAFBFC] border-y border-line text-xs text-ink-400 text-left">
                <tr>
                  <th className="font-semibold px-5 h-10">{t('fixed.month')}</th>
                  <th className="font-semibold text-right">{t('fixed.companyTotal')}</th>
                  {shownProjects.map(p => <th key={p.id} className="font-semibold text-right">{p.name}</th>)}
                  <th className="font-semibold text-right pr-5">{t('fixed.unallocated')}</th>
                </tr>
              </thead>
              <tbody>
                {alloc.months.map(m => (
                  <tr key={m.month} className="border-b border-line-soft">
                    <td className="px-5 h-10 tabular-nums">{monthName(m.month)}</td>
                    <td className="text-right tabular-nums">{toNumber(m.company_total) ? format(m.company_total) : <span className="text-ink-300">—</span>}</td>
                    {shownProjects.map(p => {
                      const v = m.projects[p.id]
                      return (
                        <td key={p.id} className="text-right tabular-nums">
                          {v ? <>{format(v.amount)} <span className="text-xs text-ink-400">{formatNumber(v.share, 1)} %</span></> : <span className="text-ink-300">—</span>}
                        </td>
                      )
                    })}
                    <td className={`text-right tabular-nums pr-5 ${toNumber(m.unallocated) ? 'text-status-amber' : 'text-ink-300'}`}>
                      {toNumber(m.unallocated) ? format(m.unallocated) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RecurringCostEditor open={!!editor} cost={editor?.cost} projects={projects} onClose={() => setEditor(null)} onSaved={reload} />
    </div>
  )
}
