import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FileSpreadsheet, FileText, UploadCloud, Check, X } from 'lucide-react'
import { Projects } from '../lib/api'
import { errorMessage } from '../lib/api'
import { Card, PageHeader, Button, Field, Input, Select, Badge, EmptyState } from '../components/ui.jsx'
import { useT } from '../lib/i18n.jsx'
import { useFeedback } from '../components/feedback.jsx'
import { formatMoney } from '../lib/format.js'
import { LocationPicker } from './NewProjectPage.jsx'
import DateInput from '../components/DateInput.jsx'

/**
 * Stand-alone import tool: Excel Gantt workbook (+ invoice PDFs) -> new project, or update an
 * existing one. Nothing is written until "Import" — the review step shows every problem found.
 */
export default function ImportPage({ projects, projectId, onProjectsChanged }) {
  const { t } = useT()
  const { toast } = useFeedback()
  const navigate = useNavigate()
  const location = useLocation()
  const fromWizard = location.state?.projectFields
  const [step, setStep] = useState(1)
  const [xlsx, setXlsx] = useState(null)
  const [pdfs, setPdfs] = useState([])
  const [target, setTarget] = useState(new URLSearchParams(location.search).get('project') && !fromWizard ? 'existing' : 'new')
  const [existingId, setExistingId] = useState(projectId || '')
  const [fields, setFields] = useState({ name: fromWizard?.name || '', latitude: fromWizard?.latitude || null, longitude: fromWizard?.longitude || null, ...(fromWizard || {}) })
  const [preview, setPreview] = useState(null)
  const [decisions, setDecisions] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dropRef = useRef(null)

  const addFiles = (list) => {
    const files = Array.from(list || [])
    const x = files.find(f => /\.xlsx?$/i.test(f.name))
    if (x) setXlsx(x)
    const p = files.filter(f => /\.pdf$/i.test(f.name))
    if (p.length) setPdfs(prev => [...prev.filter(o => !p.some(n => n.name === o.name)), ...p])
  }

  const runPreview = async () => {
    setBusy(true); setError('')
    try {
      const pv = await Projects.importPreview(xlsx, pdfs)
      setPreview(pv)
      const d = {}
      pv.problems.forEach(p => { d[p.key] = p.action })
      setDecisions(d)
      setFields(f => ({ ...f, name: f.name || pv.project.name || xlsx.name.replace(/\.xlsx?$/i, ''), start_date: f.start_date || pv.project.start, estimated_end_date: f.estimated_end_date || pv.project.end }))
      setStep(2)
    } catch (e) {
      setError(errorMessage(e))
    } finally { setBusy(false) }
  }

  const runCommit = async () => {
    setBusy(true)
    try {
      const p = await Projects.importCommit(xlsx, pdfs, {
        decisions, projectId: target === 'existing' ? existingId : null,
        projectFields: target === 'new' ? { ...fields } : null,
      })
      onProjectsChanged?.()
      toast(t('import.done', { name: p.name }), { tone: 'success', duration: 5000 })
      navigate(`/schedule?project=${p.id}`)
    } finally { setBusy(false) }
  }

  const sevTone = { error: 'red', warning: 'amber', question: 'gray' }
  const msg = (p) => {
    const key = `import.msg.${p.code}`
    const s = t(key, p.params || {})
    return s === key ? p.message : s
  }
  const optLabel = (o) => { const k = `import.opt.${o.value}`; const s = t(k); return s === k ? o.label : s }
  const counts = preview ? preview.problems.reduce((a, p) => ({ ...a, [p.severity]: (a[p.severity] || 0) + 1 }), {}) : {}

  const Steps = () => (
    <Card className="!py-3.5 mb-5">
      <ol className="flex gap-2">
        {[t('import.step1'), t('import.step2'), t('import.step3')].map((label, i) => {
          const n = i + 1, done = step > n, now = step === n
          return (
            <li key={n} className="flex items-center gap-2.5 flex-1">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold ${done ? 'bg-status-green text-white' : now ? 'bg-blueprint-600 text-white' : 'bg-white text-ink-400 ring-1 ring-line'}`}>
                {done ? <Check size={15} strokeWidth={2.5} /> : n}
              </span>
              <span className={`text-sm ${now ? 'font-semibold text-ink-800' : 'text-ink-400'}`}>{label}</span>
              {n < 3 && <span className="flex-1 h-px bg-line mx-2" />}
            </li>
          )
        })}
      </ol>
    </Card>
  )

  return (
    <div>
      <PageHeader title={t('nav.import')} subtitle={t('import.subtitle')} />
      <Steps />

      {step === 1 && (
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5">
          <Card>
            <div ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); dropRef.current.classList.add('ring-2') }}
              onDragLeave={() => dropRef.current.classList.remove('ring-2')}
              onDrop={(e) => { e.preventDefault(); dropRef.current.classList.remove('ring-2'); addFiles(e.dataTransfer.files) }}
              className="border-2 border-dashed border-line rounded-xl p-8 text-center ring-blueprint-300">
              <UploadCloud size={32} className="mx-auto text-ink-300 mb-3" strokeWidth={1.5} />
              <div className="text-sm font-medium text-ink-700">{t('import.dropTitle')}</div>
              <div className="text-[13px] text-ink-400 mt-1 mb-4">{t('import.dropHint')}</div>
              <label className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-blueprint-600 text-white text-sm font-medium cursor-pointer hover:bg-blueprint-700">
                {t('import.choose')}
                <input type="file" multiple accept=".xlsx,.xls,.pdf" className="hidden" onChange={(e) => addFiles(e.target.files)} />
              </label>
            </div>
            <ul className="mt-4 text-sm divide-y divide-line-soft">
              {xlsx && (
                <li className="flex items-center gap-3 py-2.5">
                  <FileSpreadsheet size={18} className="text-status-green" /><span className="flex-1 truncate font-medium">{xlsx.name}</span>
                  <span className="text-xs text-ink-400">{Math.round(xlsx.size / 1024)} KB</span>
                  <button type="button" aria-label={t('common.remove')} onClick={() => setXlsx(null)} className="text-ink-300 hover:text-status-red"><X size={16} /></button>
                </li>
              )}
              {pdfs.length > 0 && (
                <li className="flex items-center gap-3 py-2.5">
                  <FileText size={18} className="text-status-red" /><span className="flex-1">{t('import.pdfCount', { n: pdfs.length })}</span>
                  <button type="button" aria-label={t('common.remove')} onClick={() => setPdfs([])} className="text-ink-300 hover:text-status-red"><X size={16} /></button>
                </li>
              )}
            </ul>
            {error && <div className="mt-3 text-[13px] text-status-red bg-status-redBg rounded-lg px-3 py-2">{error}</div>}
          </Card>
          <Card>
            <h2 className="text-[15px] font-semibold mb-3">{t('import.whereTo')}</h2>
            <div className="space-y-2.5">
              {['new', 'existing'].map(v => (
                <label key={v} className={`flex gap-3 items-start p-3.5 rounded-xl border cursor-pointer ${target === v ? 'border-blueprint-600 bg-blueprint-50 ring-1 ring-blueprint-600' : 'border-line'}`}>
                  <input type="radio" name="target" checked={target === v} onChange={() => setTarget(v)} className="mt-1 accent-blueprint-600" />
                  <span><span className="block text-sm font-semibold">{t(`import.target.${v}`)}</span><span className="block text-[13px] text-ink-400">{t(`import.target.${v}Hint`)}</span></span>
                </label>
              ))}
              {target === 'existing' && (
                <Select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
                  <option value="">—</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
            </div>
            <div className="mt-5 text-[13px] text-ink-400 leading-relaxed">{t('import.formatNote')}</div>
          </Card>
          <div className="lg:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
            <Button size="lg" disabled={!xlsx || busy || (target === 'existing' && !existingId)} onClick={runPreview}>{busy ? t('import.reading') : t('import.check')}</Button>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              [preview.groups.length, t('import.sumGroups')],
              [preview.summary.positions, t('import.sumPositions', { n: preview.summary.sub_positions })],
              [preview.summary.vendors, t('import.sumVendors')],
              [preview.summary.invoices, t('import.sumInvoices', { n: preview.summary.pdfs })],
              [formatMoney(preview.summary.budget), t('import.sumBudget')],
            ].map(([v, l], i) => (
              <Card key={i} className="!p-4"><div className="text-xl font-semibold tabular-nums">{v}</div><div className="text-[13px] text-ink-400 mt-1">{l}</div></Card>
            ))}
          </div>

          {target === 'new' && (
            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5">
              <Card>
                <h2 className="text-[15px] font-semibold mb-4">{t('import.newProject')}</h2>
                <div className="space-y-4">
                  <Field label={t('newProject.name')} required><Input value={fields.name || ''} onChange={(e) => setFields({ ...fields, name: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('newProject.start')}><DateInput value={fields.start_date || ''} onChange={(v) => setFields({ ...fields, start_date: v })} /></Field>
                    <Field label={t('newProject.end')}><DateInput value={fields.estimated_end_date || ''} onChange={(v) => setFields({ ...fields, estimated_end_date: v })} /></Field>
                  </div>
                </div>
              </Card>
              <Card className="flex flex-col">
                <LocationPicker lat={fields.latitude} lng={fields.longitude} onChange={(a, b) => setFields(f => ({ ...f, latitude: a, longitude: b }))} />
              </Card>
            </div>
          )}

          <Card padded={false} className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[15px] font-semibold">{t('import.problems')}</h2>
              <span className="text-[13px] text-ink-400">{t('import.problemCounts', { e: counts.error || 0, w: counts.warning || 0, q: counts.question || 0 })}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[860px]">
                <thead className="bg-[#FAFBFC] border-y border-line text-xs text-ink-400 text-left">
                  <tr><th className="px-5 h-10 font-semibold w-[140px]">{t('import.severity')}</th><th className="font-semibold w-[130px]">{t('import.where')}</th><th className="font-semibold">{t('import.problem')}</th><th className="font-semibold w-[320px] pr-5">{t('import.action')}</th></tr>
                </thead>
                <tbody>
                  {preview.problems.map(p => (
                    <tr key={p.key} className="border-b border-line-soft">
                      <td className="px-5 py-3"><Badge tone={sevTone[p.severity]}>{t(`import.sev.${p.severity}`)}</Badge></td>
                      <td className="font-medium">{({ Invoices: t('budget.invoices'), Vendors: t('settings.vendors') })[p.where] || p.where}</td>
                      <td className="text-ink-600 pr-4">{msg(p)}</td>
                      <td className="pr-5 py-2">
                        <Select value={decisions[p.key] || p.action} onChange={(e) => setDecisions(d => ({ ...d, [p.key]: e.target.value }))} className="!h-9 text-[13px]">
                          {p.options.map(o => <option key={o.value} value={o.value}>{optLabel(o)}</option>)}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.problems.length === 0 && <EmptyState title={t('import.noProblems')} />}
          </Card>

          <div className="flex justify-between items-center">
            <Button variant="secondary" size="lg" onClick={() => setStep(1)}>{t('common.back')}</Button>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-ink-400">{t('import.commitNote')}</span>
              <Button size="lg" disabled={busy || (target === 'new' && !fields.name)} onClick={runCommit}>
                {busy ? t('import.importing') : t('import.commit', { n: preview.summary.positions, i: preview.summary.invoices })}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
