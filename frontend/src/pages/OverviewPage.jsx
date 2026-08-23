import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { Projects } from '../lib/api'
import { Card, PageHeader, Badge, EmptyState } from '../components/ui.jsx'
import { useCurrency } from '../lib/currency.jsx'

// Vite bundles these image imports to real URLs — without this, Leaflet's default
// marker icons silently fail to load (a well-known Leaflet + bundler gotcha).
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const DEFAULT_CENTER = [41.9981, 21.4254] // Skopje — used only if no project has coordinates yet

function ProjectCard({ project, onOpen }) {
  const { format } = useCurrency()
  const f = project.financials || {}

  return (
    <Card className="cursor-pointer hover:shadow-pop transition" onClick={() => onOpen(project.id)}>
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink-900 truncate">{project.name}</h3>
          <p className="text-xs text-ink-400 truncate">{project.site_address || 'No address set'}</p>
        </div>
        <Badge tone={project.status === 'completed' ? 'green' : project.status === 'on_hold' ? 'amber' : 'blue'}>
          {project.status.replace('_', ' ')}
        </Badge>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-ink-400 mb-1">
          <span>Completion</span>
          <span className="font-mono font-semibold text-ink-800">{project.completion_pct}%</span>
        </div>
        <div className="w-full bg-ink-100 rounded-full h-2">
          <div className="bg-blueprint-500 h-2 rounded-full transition-all" style={{ width: `${project.completion_pct}%` }} />
        </div>
        {project.time_elapsed_pct !== null && (
          <div className="text-[10px] text-ink-300 font-mono mt-1">{project.time_elapsed_pct}% of planned time elapsed</div>
        )}
      </div>

      {project.current_phase && (
        <div className="text-xs text-ink-500 mb-3">
          Currently on: <span className="font-medium text-ink-700">{project.current_phase.name}</span>
          <span className="text-ink-400"> ({project.current_phase.progress_pct}%)</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <div className="text-ink-400">Projected profit</div>
          <div className={`font-mono font-semibold ${f.projected_profit >= 0 ? 'text-status-green' : 'text-status-red'}`}>{format(f.projected_profit)}</div>
        </div>
        <div>
          <div className="text-ink-400">Real profit (so far)</div>
          <div className={`font-mono font-semibold ${f.real_profit >= 0 ? 'text-status-green' : 'text-status-red'}`}>{format(f.real_profit)}</div>
        </div>
      </div>

      {project.drawings && project.drawings.length > 0 && (
        <div className="flex gap-2 pt-2 border-t border-ink-50">
          {project.drawings.map(d => d.file_url && (
            <a
              key={d.id} href={d.file_url} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="block w-12 h-12 rounded-md overflow-hidden border border-ink-100 bg-ink-50 shrink-0"
              title={d.title}
            >
              <img src={d.file_url} alt={d.title} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
            </a>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function OverviewPage() {
  const [projects, setProjects] = useState(null)
  const navigate = useNavigate()

  useEffect(() => { Projects.overview().then(setProjects) }, [])

  const openProject = (id) => navigate(`/setup?project=${id}`)

  if (projects === null) return <div className="text-ink-400 text-sm">Loading…</div>

  const withCoords = projects.filter(p => p.latitude && p.longitude)
  const center = withCoords.length > 0
    ? [
        withCoords.reduce((s, p) => s + parseFloat(p.latitude), 0) / withCoords.length,
        withCoords.reduce((s, p) => s + parseFloat(p.longitude), 0) / withCoords.length,
      ]
    : DEFAULT_CENTER

  return (
    <div>
      <PageHeader eyebrow="Portfolio" title="Overview" subtitle="Every project at a glance." />

      <Card padded={false} className="mb-6 overflow-hidden">
        <MapContainer center={center} zoom={withCoords.length > 0 ? 10 : 6} style={{ height: 320, width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {withCoords.map(p => (
            <Marker key={p.id} position={[parseFloat(p.latitude), parseFloat(p.longitude)]} eventHandlers={{ click: () => openProject(p.id) }}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.completion_pct}% complete</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {withCoords.length === 0 && (
          <div className="px-4 py-2 text-xs text-ink-300 border-t border-ink-50">
            No projects have coordinates yet — add latitude/longitude on the Setup page to see them pinned here.
          </div>
        )}
      </Card>

      {projects.length === 0 ? (
        <Card><EmptyState title="No projects yet" subtitle="Create your first project on the Setup page." /></Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => <ProjectCard key={p.id} project={p} onOpen={openProject} />)}
        </div>
      )}
    </div>
  )
}
