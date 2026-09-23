import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, Marker, useMapEvents } from 'react-leaflet'
import { FilePlus2, LayoutTemplate, Copy, FileSpreadsheet } from 'lucide-react'
import { Projects } from '../lib/api'
import { Card, PageHeader, Button, Field, Input, Select, Segmented } from '../components/ui.jsx'
import MoneyInput from '../components/MoneyInput.jsx'
import { useT } from '../lib/i18n.jsx'
import { useFeedback } from '../components/feedback.jsx'
import { BaseTiles, useMapStyle } from './OverviewPage.jsx'
import DateInput from '../components/DateInput.jsx'

export const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/

function ClickToPlace({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

/** Coordinates field + map. Paste "41.350496, 21.564121" from Google Maps, or click the map. */
export function LocationPicker({ lat, lng, onChange }) {
  const { t } = useT()
  const [mapStyle, setMapStyle] = useMapStyle()
  const [text, setText] = useState(lat && lng ? `${lat}, ${lng}` : '')
  const [error, setError] = useState('')
  const apply = (v) => {
    setText(v)
    if (!v.trim()) { setError(''); onChange(null, null); return }
    const m = v.match(COORD_RE)
    if (!m) { setError(t('newProject.coordsInvalid')); return }
    const a = parseFloat(m[1]), b = parseFloat(m[2])
    if (Math.abs(a) > 90 || Math.abs(b) > 180) { setError(t('newProject.coordsInvalid')); return }
    setError('')
    onChange(a.toFixed(6), b.toFixed(6))
  }
  const has = lat && lng
  return (
    <div className="flex flex-col gap-3 h-full">
      <Field label={t('newProject.coords')} hint={error ? null : t('newProject.coordsHint')} error={error}>
        <Input value={text} onChange={(e) => apply(e.target.value)} placeholder="41.350496, 21.564121" />
      </Field>
      <div className="flex justify-end">
        <Segmented size="sm" label={t('portfolio.mapStyle')} value={mapStyle} onChange={setMapStyle}
          options={[{ value: 'street', label: t('portfolio.street') }, { value: 'satellite', label: t('portfolio.satellite') }]} />
      </div>
      <div className="flex-1 min-h-[320px] rounded-xl overflow-hidden border border-line relative z-0">
        <MapContainer key={has ? 'has' : 'none'} center={has ? [Number(lat), Number(lng)] : [41.6086, 21.7453]} zoom={has ? 17 : 8} style={{ height: '100%', minHeight: 320 }}>
          <BaseTiles style={mapStyle} />
          <ClickToPlace onPick={(a, b) => { const la = a.toFixed(6), lo = b.toFixed(6); setText(`${la}, ${lo}`); setError(''); onChange(la, lo) }} />
          {has && <Marker position={[Number(lat), Number(lng)]} />}
        </MapContainer>
      </div>
    </div>
  )
}

const STRUCTURES = [
  { value: 'empty', icon: FilePlus2 },
  { value: 'template', icon: LayoutTemplate },
  { value: 'copy', icon: Copy },
  { value: 'excel', icon: FileSpreadsheet },
]

export default function NewProjectPage({ projects, onProjectsChanged }) {
  const { t } = useT()
  const { toast } = useFeedback()
  const navigate = useNavigate()
  const [f, setF] = useState({
    name: '', investor: '', site_address: '', building_type: t('newProject.typeResidential'), start_date: '', estimated_end_date: '',
    total_budget: null, latitude: null, longitude: null, status: 'planning',
  })
  const [structure, setStructure] = useState('template')
  const [copyFrom, setCopyFrom] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e?.target ? e.target.value : e }))

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!f.name.trim()) errs.name = t('newProject.errName')
    if (f.start_date && f.estimated_end_date && f.estimated_end_date < f.start_date) errs.estimated_end_date = t('editor.errEnd')
    if (structure === 'copy' && !copyFrom) errs.copy = t('newProject.errCopy')
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (structure === 'excel') {
      navigate('/import', { state: { projectFields: { ...f, total_budget: f.total_budget ?? 0 } } })
      return
    }
    setSaving(true)
    try {
      const p = await Projects.create({
        ...f, total_budget: f.total_budget ?? 0, start_date: f.start_date || null, estimated_end_date: f.estimated_end_date || null,
        structure, copy_from: structure === 'copy' ? copyFrom : undefined,
      })
      onProjectsChanged?.()
      toast(t('newProject.created', { name: p.name }), { tone: 'success', duration: 4000 })
      navigate(`/schedule?project=${p.id}`)
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit}>
      <PageHeader title={t('nav.newProject')} subtitle={t('newProject.subtitle')} />
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 mb-5">
        <div className="space-y-5 min-w-0">
          <Card>
            <h2 className="text-[15px] font-semibold mb-4">{t('newProject.basics')}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t('newProject.name')} required error={errors.name}><Input value={f.name} onChange={set('name')} autoFocus placeholder="Идадија" /></Field>
              <Field label={t('newProject.investor')}><Input value={f.investor} onChange={set('investor')} /></Field>
              <Field label={t('newProject.address')}><Input value={f.site_address} onChange={set('site_address')} /></Field>
              <Field label={t('newProject.type')}>
                <Select value={f.building_type} onChange={set('building_type')}>
                  {['typeResidential', 'typeCommercial', 'typeHouse', 'typeInfrastructure', 'typeOther'].map(k => <option key={k}>{t(`newProject.${k}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('newProject.start')}><DateInput value={f.start_date} onChange={set('start_date')} /></Field>
              <Field label={t('newProject.end')} error={errors.estimated_end_date}><DateInput value={f.estimated_end_date} onChange={set('estimated_end_date')} /></Field>
              <Field label={t('newProject.budget')} hint={t('newProject.budgetHint')} className="sm:col-span-2">
                <MoneyInput value={f.total_budget} onChange={set('total_budget')} size="lg" />
              </Field>
            </div>
          </Card>
          <Card>
            <h2 className="text-[15px] font-semibold">{t('newProject.structure')}</h2>
            <p className="text-[13px] text-ink-400 mt-1 mb-4">{t('newProject.structureHint')}</p>
            <div className="grid sm:grid-cols-2 gap-3" role="radiogroup">
              {STRUCTURES.map(s => {
                const on = structure === s.value
                return (
                  <button key={s.value} type="button" role="radio" aria-checked={on} onClick={() => setStructure(s.value)}
                    className={`text-left flex gap-3 p-3.5 rounded-xl border transition ${on ? 'border-blueprint-600 bg-blueprint-50 ring-1 ring-blueprint-600' : 'border-line hover:border-ink-300 bg-white'}`}>
                    <s.icon size={20} className={on ? 'text-blueprint-700 mt-0.5' : 'text-ink-400 mt-0.5'} strokeWidth={1.75} />
                    <span>
                      <span className="block text-sm font-semibold text-ink-800">{t(`newProject.s.${s.value}`)}</span>
                      <span className="block text-[13px] text-ink-400 mt-0.5 leading-snug">{t(`newProject.s.${s.value}Hint`)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {structure === 'copy' && (
              <Field label={t('newProject.copyFrom')} error={errors.copy} className="mt-4">
                <Select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                  <option value="">—</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            )}
          </Card>
        </div>
        <Card className="flex flex-col">
          <h2 className="text-[15px] font-semibold mb-4">{t('newProject.location')}</h2>
          <LocationPicker lat={f.latitude} lng={f.longitude} onChange={(a, b) => setF(x => ({ ...x, latitude: a, longitude: b }))} />
        </Card>
      </div>
      <div className="flex justify-between items-center">
        <Button variant="secondary" size="lg" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? t('common.saving') : structure === 'excel' ? t('newProject.continueImport') : t('newProject.create')}
        </Button>
      </div>
    </form>
  )
}
