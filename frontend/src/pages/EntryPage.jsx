import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Projects, Vendors, CalendarExceptions } from '../lib/api'
import { formatDate } from '../lib/format.js'
import { Card, PageHeader, Button, Field, Input, Select, EmptyState, Loading } from '../components/ui.jsx'
import MoneyInput from '../components/MoneyInput.jsx'
import { useT } from '../lib/i18n.jsx'
import { useFeedback } from '../components/feedback.jsx'
import { LocationPicker } from './NewProjectPage.jsx'
import DateInput from '../components/DateInput.jsx'

/** Project settings: details, location, vendors. (Replaces the old "Setup" page.) */
export default function ProjectSettingsPage({ projectId, onProjectsChanged }) {
  const { t } = useT()
  const { toast, confirm } = useFeedback()
  const navigate = useNavigate()
  const [f, setF] = useState(null)
  const [saving, setSaving] = useState(false)
  const [vendors, setVendors] = useState([])
  const [newVendor, setNewVendor] = useState({ name: '', trade: '', contact_name: '', phone: '', email: '' })

  useEffect(() => {
    if (!projectId) return
    Projects.get(projectId).then(p => setF({
      name: p.name, investor: p.investor || '', site_address: p.site_address || '', building_type: p.building_type || '',
      status: p.status, start_date: p.start_date || '', estimated_end_date: p.estimated_end_date || '',
      total_budget: p.total_budget ? Number(p.total_budget) : null, latitude: p.latitude, longitude: p.longitude, description: p.description || '',
    }))
    Vendors.list().then(setVendors)
  }, [projectId])

  if (!projectId) return <Card><EmptyState title={t('common.noProject')} subtitle={t('common.noProjectHint')} /></Card>
  if (!f) return <Loading rows={6} />
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e?.target ? e.target.value : e }))

  const save = async () => {
    setSaving(true)
    try {
      await Projects.update(projectId, { ...f, total_budget: f.total_budget ?? 0, start_date: f.start_date || null, estimated_end_date: f.estimated_end_date || null })
      onProjectsChanged?.()
      toast(t('editor.saved'), { tone: 'success', duration: 3000 })
    } finally { setSaving(false) }
  }

  const addVendor = async (e) => {
    e.preventDefault()
    if (!newVendor.name.trim()) return
    await Vendors.create(newVendor)
    setNewVendor({ name: '', trade: '', contact_name: '', phone: '', email: '' })
    Vendors.list().then(setVendors)
  }

  const deleteProject = async () => {
    const ok = await confirm({ title: t('settings.deleteTitle', { name: f.name }), message: t('settings.deleteMsg'), danger: true, confirmLabel: t('common.delete') })
    if (!ok) return
    await Projects.remove(projectId)
    onProjectsChanged?.()
    navigate('/')
  }

  return (
    <div>
      <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')}
        action={<Button onClick={save} disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>} />
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 mb-5">
        <Card>
          <h2 className="text-[15px] font-semibold mb-4">{t('newProject.basics')}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t('newProject.name')} required><Input value={f.name} onChange={set('name')} /></Field>
            <Field label={t('newProject.investor')}><Input value={f.investor} onChange={set('investor')} /></Field>
            <Field label={t('newProject.address')}><Input value={f.site_address} onChange={set('site_address')} /></Field>
            <Field label={t('newProject.type')}><Input value={f.building_type} onChange={set('building_type')} /></Field>
            <Field label={t('settings.status')}>
              <Select value={f.status} onChange={set('status')}>
                {['planning', 'active', 'on_hold', 'completed'].map(s => <option key={s} value={s}>{t(`projectStatus.${s}`)}</option>)}
              </Select>
            </Field>
            <div />
            <Field label={t('newProject.start')}><DateInput value={f.start_date} onChange={set('start_date')} /></Field>
            <Field label={t('newProject.end')}><DateInput value={f.estimated_end_date} onChange={set('estimated_end_date')} /></Field>
            <Field label={t('newProject.budget')} hint={t('settings.budgetHint')} className="sm:col-span-2"><MoneyInput value={f.total_budget} onChange={set('total_budget')} size="lg" /></Field>
          </div>
        </Card>
        <Card className="flex flex-col">
          <h2 className="text-[15px] font-semibold mb-4">{t('newProject.location')}</h2>
          <LocationPicker lat={f.latitude} lng={f.longitude} onChange={(a, b) => setF(x => ({ ...x, latitude: a, longitude: b }))} />
        </Card>
      </div>

      <Card className="mb-5">
        <h2 className="text-[15px] font-semibold mb-1">{t('settings.vendors')}</h2>
        <p className="text-[13px] text-ink-400 mb-4">{t('settings.vendorsHint')}</p>
        <form onSubmit={addVendor} className="grid sm:grid-cols-6 gap-2 mb-4">
          <Input placeholder={t('editor.vendorName')} value={newVendor.name} onChange={e => setNewVendor({ ...newVendor, name: e.target.value })} className="sm:col-span-2" required />
          <Input placeholder={t('settings.trade')} value={newVendor.trade} onChange={e => setNewVendor({ ...newVendor, trade: e.target.value })} />
          <Input placeholder={t('settings.contact')} value={newVendor.contact_name} onChange={e => setNewVendor({ ...newVendor, contact_name: e.target.value })} />
          <Input placeholder={t('settings.phone')} value={newVendor.phone} onChange={e => setNewVendor({ ...newVendor, phone: e.target.value })} />
          <Button type="submit" icon={Plus}>{t('common.add')}</Button>
        </form>
        <table className="w-full text-[13px]">
          <thead className="text-left text-xs text-ink-400 border-b border-line"><tr><th className="font-semibold py-2">{t('editor.vendor')}</th><th className="font-semibold">{t('settings.trade')}</th><th className="font-semibold">{t('settings.contact')}</th><th className="font-semibold">{t('settings.phone')}</th></tr></thead>
          <tbody>
            {vendors.map(v => (
              <tr key={v.id} className="border-b border-line-soft"><td className="py-2.5 font-medium">{v.name}</td><td className="text-ink-600">{v.trade}</td><td className="text-ink-600">{v.contact_name}</td><td className="text-ink-600">{v.phone}</td></tr>
            ))}
          </tbody>
        </table>
        {vendors.length === 0 && <EmptyState title={t('settings.noVendors')} />}
      </Card>

      <CalendarCard projectId={projectId} />

      <Card className="border-status-red/30">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="text-[15px] font-semibold">{t('settings.danger')}</h2><p className="text-[13px] text-ink-400 mt-1">{t('settings.dangerHint')}</p></div>
          <Button variant="danger" icon={Trash2} onClick={deleteProject}>{t('settings.deleteProject')}</Button>
        </div>
      </Card>
    </div>
  )
}

/** Working week + holidays + project-specific days. Feeds the critical-path calculation. */
function CalendarCard({ projectId }) {
  const { t } = useT()
  const { toast, confirm } = useFeedback()
  const [cal, setCal] = useState(null)
  const [row, setRow] = useState({ date: '', name: '', is_working: false })
  const load = () => Projects.calendar(projectId).then(setCal)
  useEffect(() => { load() }, [projectId])
  if (!cal) return null

  const toggleDay = async (d) => {
    const days = cal.working_weekdays.includes(d) ? cal.working_weekdays.filter(x => x !== d) : [...cal.working_weekdays, d]
    if (!days.length) return
    setCal(await Projects.saveCalendar(projectId, days))
    toast(t('cal.saved'), { tone: 'success', duration: 2000 })
  }
  const add = async (e) => {
    e.preventDefault()
    if (!row.date || !row.name) return
    await CalendarExceptions.create({ ...row, project: projectId })
    setRow({ date: '', name: '', is_working: false }); load()
  }
  const remove = async (x) => {
    if (!(await confirm({ title: t('common.delete') + '?', message: `${formatDate(x.date)} · ${x.name}`, danger: true, confirmLabel: t('common.delete') }))) return
    await CalendarExceptions.remove(x.id); load()
  }
  const national = cal.exceptions.filter(x => x.national)
  const own = cal.exceptions.filter(x => !x.national)

  return (
    <Card className="mb-5">
      <h2 className="text-[15px] font-semibold mb-1">{t('cal.title')}</h2>
      <p className="text-[13px] text-ink-400 mb-4">{t('cal.hint')}</p>
      <div className="text-xs font-semibold text-ink-500 mb-2">{t('cal.weekdays')}</div>
      <div className="flex flex-wrap gap-2 mb-5">
        {[0, 1, 2, 3, 4, 5, 6].map(d => {
          const on = cal.working_weekdays.includes(d)
          return (
            <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={on}
              className={`h-9 w-14 rounded-md border text-[13px] font-medium ${on ? 'bg-blueprint-600 border-blueprint-600 text-white' : 'bg-white border-line text-ink-500 hover:border-ink-300'}`}>
              {t(`cal.day.${d}`)}
            </button>
          )
        })}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold text-ink-500 mb-2">{t('cal.project')}</div>
          <form onSubmit={add} className="grid grid-cols-[150px_1fr_auto_auto] gap-2 mb-3 items-center">
            <DateInput value={row.date} onChange={v => setRow({ ...row, date: v })} />
            <Input placeholder={t('cal.name')} value={row.name} onChange={e => setRow({ ...row, name: e.target.value })} required />
            <Select value={row.is_working ? '1' : '0'} onChange={e => setRow({ ...row, is_working: e.target.value === '1' })}>
              <option value="0">{t('cal.nonWorking')}</option><option value="1">{t('cal.working')}</option>
            </Select>
            <Button type="submit" icon={Plus}>{t('common.add')}</Button>
          </form>
          {own.length === 0 ? <p className="text-[13px] text-ink-400">{t('cal.projectEmpty')}</p> : (
            <ul className="divide-y divide-line-soft text-[13px]">
              {own.map(x => (
                <li key={x.id} className="flex items-center gap-3 py-2">
                  <span className="tabular-nums w-24">{formatDate(x.date)}</span>
                  <span className="flex-1">{x.name}</span>
                  <span className={x.is_working ? 'text-status-green' : 'text-ink-400'}>{x.is_working ? t('cal.working') : t('cal.nonWorking')}</span>
                  <button onClick={() => remove(x)} className="text-ink-300 hover:text-status-red" aria-label={t('common.delete')}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold text-ink-500 mb-2">{t('cal.national')}</div>
          <ul className="divide-y divide-line-soft text-[13px] max-h-64 overflow-y-auto pr-2">
            {national.map(x => (
              <li key={x.id} className="flex gap-3 py-1.5"><span className="tabular-nums w-24 text-ink-500">{formatDate(x.date)}</span><span>{x.name}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}
