import React, { useState, useEffect, Suspense, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { Plus, FileSpreadsheet, Globe2, ImagePlus, MapPin, Building2 } from 'lucide-react'
import { Projects, Documents } from '../lib/api'
import { Card, PageHeader, Badge, Button, EmptyState, Loading, Segmented } from '../components/ui.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { useT } from '../lib/i18n.jsx'
import { formatDate } from '../lib/format.js'

// Cesium is several MB: only downloaded when someone opens the 3D view.
const ProjectFlythrough = lazy(() => import('../lib/loadCesium.js')
  .then(m => m.default())
  .then(() => import('../components/ProjectFlythrough.jsx')))

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

const DEFAULT_CENTER = [41.6086, 21.7453] // North Macedonia — until a project has coordinates

export const TILE_LAYERS = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  },
}

export function useMapStyle() {
  const [style, setStyle] = useState(() => { try { return localStorage.getItem('pm_map_style') || 'satellite' } catch { return 'satellite' } })
  const set = (s) => { setStyle(s); try { localStorage.setItem('pm_map_style', s) } catch {} }
  return [style, set]
}

export function BaseTiles({ style }) {
  const l = TILE_LAYERS[style] || TILE_LAYERS.street
  return (
    <>
      <TileLayer key={style} url={l.url} attribution={l.attribution} maxZoom={19} />
      {l.labels && <TileLayer key={`${style}-labels`} url={l.labels} maxZoom={19} />}
    </>
  )
}

function ProjectCard({ project, onOpen, onChanged, onFlythrough }) {
  const { t } = useT()
  const { format } = useCurrency()
  const f = project.financials || {}
  const fileInputRef = React.useRef(null)
  const hasCoords = project.latitude && project.longitude
  const statusTone = { completed: 'green', on_hold: 'amber', active: 'blue', planning: 'slate' }[project.status] || 'slate'

  const uploadRender = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    await Documents.upload({ project: project.id, title: file.name, doc_type: 'drawing', file })
    e.target.value = ''
    onChanged()
  }

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <button type="button" onClick={() => onOpen(project.id)} className="font-semibold text-ink-800 truncate hover:text-blueprint-700 text-left text-[15px]">{project.name}</button>
          <p className="text-[13px] text-ink-400 truncate">{project.site_address || (hasCoords ? `${Number(project.latitude).toFixed(6)}, ${Number(project.longitude).toFixed(6)}` : t('portfolio.noAddress'))}</p>
        </div>
        <Badge tone={statusTone}>{t(`projectStatus.${project.status}`)}</Badge>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-[13px] text-ink-400 mb-1.5">
          <span>{t('portfolio.completion')}</span>
          <span className="font-semibold text-ink-800">{project.completion_pct} %</span>
        </div>
        <div className="w-full bg-ink-50 rounded-full h-2 overflow-hidden">
          <div className="bg-blueprint-600 h-2 rounded-full" style={{ width: `${project.completion_pct}%` }} />
        </div>
        {project.time_elapsed_pct !== null && (
          <div className="text-xs text-ink-400 mt-1.5">{t('portfolio.timeElapsed', { n: project.time_elapsed_pct })}</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-[13px] mb-3">
        <div><div className="text-ink-400">{t('portfolio.budget')}</div><div className="font-semibold text-ink-800">{format(f.projected_cost, { decimals: 0 })}</div></div>
        <div><div className="text-ink-400">{t('portfolio.invoiced')}</div><div className="font-semibold text-ink-800">{format(f.real_cost, { decimals: 0 })}</div></div>
        <div><div className="text-ink-400">{t('portfolio.start')}</div><div className="text-ink-700">{formatDate(project.start_date)}</div></div>
        <div><div className="text-ink-400">{t('portfolio.plannedEnd')}</div><div className="text-ink-700">{formatDate(project.estimated_end_date)}</div></div>
      </div>

      {project.current_phase && (
        <div className="text-[13px] text-ink-500 mb-3">
          {t('portfolio.currentlyOn')}: <span className="font-medium text-ink-700">{project.current_phase.name}</span>
        </div>
      )}

      <div className="pt-3 border-t border-line-soft">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] text-ink-400">{t('portfolio.renders')}</span>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[13px] text-blueprint-600 hover:underline inline-flex items-center gap-1"><ImagePlus size={14} />{t('common.add')}</button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={uploadRender} />
        </div>
        {project.drawings?.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {project.drawings.map(d => d.file_url && (
              <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" title={d.title}
                className="block w-16 h-16 rounded-md overflow-hidden border border-line bg-ink-50 shrink-0">
                <img src={d.file_url} alt={d.title} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
              </a>
            ))}
          </div>
        ) : <p className="text-[13px] text-ink-300">{t('portfolio.noRenders')}</p>}
      </div>

      <div className="flex gap-2 mt-4 pt-1">
        <Button size="sm" onClick={() => onOpen(project.id)} className="flex-1">{t('portfolio.open')}</Button>
        {hasCoords && <Button size="sm" variant="secondary" icon={Globe2} onClick={() => onFlythrough(project)}>3D</Button>}
      </div>
    </Card>
  )
}

export default function PortfolioPage({ onProjectsChanged }) {
  const { t } = useT()
  const [projects, setProjects] = useState(null)
  const [flythroughProject, setFlythroughProject] = useState(null)
  const [mapStyle, setMapStyle] = useMapStyle()
  const navigate = useNavigate()

  const refresh = () => Projects.overview().then(setProjects)
  useEffect(() => { refresh() }, [])
  const openProject = (id) => navigate(`/overview?project=${id}`)

  if (projects === null) return <Loading rows={6} />

  const withCoords = projects.filter(p => p.latitude && p.longitude)
  const center = withCoords.length
    ? [withCoords.reduce((s, p) => s + parseFloat(p.latitude), 0) / withCoords.length, withCoords.reduce((s, p) => s + parseFloat(p.longitude), 0) / withCoords.length]
    : DEFAULT_CENTER

  return (
    <div>
      <PageHeader title={t('portfolio.title')} subtitle={t('portfolio.subtitle', { n: projects.length })}
        action={<>
          <Button variant="secondary" icon={FileSpreadsheet} onClick={() => navigate('/import')}>{t('nav.import')}</Button>
          <Button icon={Plus} onClick={() => navigate('/new')}>{t('nav.newProject')}</Button>
        </>} />

      <Card padded={false} className="mb-6 overflow-hidden relative z-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-[15px] font-semibold flex items-center gap-2"><MapPin size={16} className="text-ink-400" />{t('portfolio.map')}</h2>
          <Segmented size="sm" label={t('portfolio.mapStyle')} value={mapStyle} onChange={setMapStyle}
            options={[{ value: 'street', label: t('portfolio.street') }, { value: 'satellite', label: t('portfolio.satellite') }]} />
        </div>
        <MapContainer center={center} zoom={withCoords.length === 1 ? 16 : withCoords.length ? 10 : 8} style={{ height: 340, width: '100%' }}>
          <BaseTiles style={mapStyle} />
          {withCoords.map(p => (
            <Marker key={p.id} position={[parseFloat(p.latitude), parseFloat(p.longitude)]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-ink-400 mb-1">{p.completion_pct} % · {Number(p.latitude).toFixed(6)}, {Number(p.longitude).toFixed(6)}</div>
                  <button type="button" className="text-blueprint-600 text-xs" onClick={() => openProject(p.id)}>{t('portfolio.open')}</button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {withCoords.length === 0 && <div className="px-4 py-2 text-[13px] text-ink-400 border-t border-line-soft">{t('portfolio.noCoords')}</div>}
      </Card>

      {projects.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title={t('portfolio.empty')} subtitle={t('portfolio.emptyHint')}
            action={<div className="flex gap-2 justify-center">
              <Button icon={Plus} onClick={() => navigate('/new')}>{t('nav.newProject')}</Button>
              <Button variant="secondary" icon={FileSpreadsheet} onClick={() => navigate('/import')}>{t('nav.import')}</Button>
            </div>} />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(p => <ProjectCard key={p.id} project={p} onOpen={openProject} onChanged={refresh} onFlythrough={setFlythroughProject} />)}
        </div>
      )}

      {flythroughProject && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center text-white text-sm">{t('common.loading')}</div>}>
          <ProjectFlythrough project={flythroughProject} onClose={() => setFlythroughProject(null)} />
        </Suspense>
      )}
    </div>
  )
}
