import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('pm_token')
    if (token) config.headers.Authorization = `Token ${token}`
  } catch {}
  return config
})

/** Turn a DRF error body into one readable line ("End date is before the start date."). */
export function errorMessage(error) {
  const data = error?.response?.data
  if (!data) return error?.message || 'Network error'
  if (typeof data === 'string') return data.slice(0, 200)
  if (data.detail) return String(data.detail)
  const parts = []
  for (const [field, val] of Object.entries(data)) {
    const msg = Array.isArray(val) ? val.join(' ') : typeof val === 'object' ? JSON.stringify(val) : String(val)
    parts.push(field === 'non_field_errors' ? msg : `${field}: ${msg}`)
  }
  return parts.join(' · ')
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      try {
        localStorage.removeItem('pm_token')
        localStorage.removeItem('pm_username')
      } catch {}
      window.location.reload()
      return Promise.reject(error)
    }
    console.error(`API ${error.config?.method?.toUpperCase()} ${error.config?.url} failed:`, error.response?.data || error.message)
    // Shown as a toast by <ToastProvider>; callers that handle errors inline pass { silent: true }.
    if (!error.config?.silent) {
      window.dispatchEvent(new CustomEvent('api-error', { detail: errorMessage(error) }))
    }
    return Promise.reject(error)
  }
)

/** Fetch every page of a paginated list (no silent truncation at 100 rows). */
async function listAll(url, params = {}) {
  const out = []
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await api.get(url, { params: { ...params, page_size: 1000, page } })
    const data = r.data
    if (Array.isArray(data)) return data
    out.push(...data.results)
    if (!data.next) return out
    page += 1
  }
}

export const Projects = {
  list: () => listAll('/projects/'),
  get: (id) => api.get(`/projects/${id}/`).then(r => r.data),
  create: (data) => api.post('/projects/', data).then(r => r.data),
  update: (id, data) => api.patch(`/projects/${id}/`, data).then(r => r.data),
  analytics: (id, granularity = 'month') =>
    api.get(`/projects/${id}/analytics/`, { params: { granularity } }).then(r => r.data),
  feed: (id) => api.get(`/projects/${id}/feed/`).then(r => r.data),
  overview: () => api.get('/projects/overview/').then(r => r.data),
  remove: (id) => api.delete(`/projects/${id}/`),
  schedule: (id, params) => api.get(`/projects/${id}/schedule/`, { params, silent: true }).then(r => r.data),
  reschedule: (id, apply) => api.post(`/projects/${id}/reschedule/`, { apply }).then(r => r.data),
  baselines: (id) => api.get(`/projects/${id}/baselines/`).then(r => r.data),
  createBaseline: (id, name) => api.post(`/projects/${id}/baselines/`, { name }).then(r => r.data),
  calendar: (id) => api.get(`/projects/${id}/calendar/`).then(r => r.data),
  saveCalendar: (id, working_weekdays) => api.put(`/projects/${id}/calendar/`, { working_weekdays }).then(r => r.data),
  importPreview: (file, pdfs) => {
    const form = new FormData()
    form.append('file', file)
    pdfs.forEach(p => form.append('pdfs', p))
    return api.post('/projects/import_preview/', form, { silent: true }).then(r => r.data)
  },
  importCommit: (file, pdfs, { decisions, projectId, projectFields }) => {
    const form = new FormData()
    form.append('file', file)
    pdfs.forEach(p => form.append('pdfs', p))
    form.append('decisions', JSON.stringify(decisions || {}))
    if (projectId) form.append('project', projectId)
    if (projectFields) form.append('project_fields', JSON.stringify(projectFields))
    return api.post('/projects/import_commit/', form).then(r => r.data)
  },
}

export const Tasks = {
  list: (projectId) => listAll('/tasks/', { project: projectId }),
  get: (id) => api.get(`/tasks/${id}/`).then(r => r.data),
  create: (data) => api.post('/tasks/', data).then(r => r.data),
  update: (id, data) => api.patch(`/tasks/${id}/`, data).then(r => r.data),
  remove: (id) => api.delete(`/tasks/${id}/`),
  restore: (id) => api.post(`/tasks/${id}/restore/`).then(r => r.data),
  duplicate: (id) => api.post(`/tasks/${id}/duplicate/`).then(r => r.data),
  verify: (id, notes) => api.post(`/tasks/${id}/verify/`, { notes }).then(r => r.data),
  reject: (id, reason) => api.post(`/tasks/${id}/reject/`, { reason }).then(r => r.data),
  audit: (id) => api.get(`/tasks/${id}/audit/`).then(r => r.data),
}

export const Vendors = {
  list: () => listAll('/vendors/'),
  create: (data) => api.post('/vendors/', data).then(r => r.data),
  update: (id, data) => api.patch(`/vendors/${id}/`, data).then(r => r.data),
}

export const Expenses = {
  list: (projectId, taskId) => listAll('/expenses/', { project: projectId, task: taskId }),
  create: (data) => api.post('/expenses/', data).then(r => r.data),
  update: (id, data) => api.patch(`/expenses/${id}/`, data).then(r => r.data),
  remove: (id) => api.delete(`/expenses/${id}/`),
}

export const Documents = {
  list: (projectId, taskId, saleAgreementId) => listAll('/documents/', { project: projectId, task: taskId, sale_agreement: saleAgreementId }),
  upload: ({ project, task, sale_agreement, title, doc_type, notes, file }) => {
    const form = new FormData()
    form.append('project', project)
    if (task) form.append('task', task)
    if (sale_agreement) form.append('sale_agreement', sale_agreement)
    form.append('title', title)
    form.append('doc_type', doc_type || 'other')
    if (notes) form.append('notes', notes)
    form.append('file', file)
    return api.post('/documents/', form).then(r => r.data)
  },
  remove: (id) => api.delete(`/documents/${id}/`),
}

export const Customers = {
  list: () => listAll('/customers/'),
  create: (data) => api.post('/customers/', data).then(r => r.data),
}

export const Units = {
  list: (projectId) => listAll('/units/', { project: projectId }),
  create: (data) => api.post('/units/', data).then(r => r.data),
  update: (id, data) => api.patch(`/units/${id}/`, data).then(r => r.data),
  markSold: (id) => api.post(`/units/${id}/mark_sold/`).then(r => r.data),
}

export const SaleAgreements = {
  list: (unitId) => listAll('/sale-agreements/', { unit: unitId }),
  listByProject: (projectId) => listAll('/sale-agreements/', { project: projectId }),
  create: (data) => api.post('/sale-agreements/', data).then(r => r.data),
}

export const Installments = {
  update: (id, data) => api.patch(`/installments/${id}/`, data).then(r => r.data),
}

export const Issues = {
  list: (projectId, taskId) => listAll('/issues/', { project: projectId, task: taskId }),
  create: (data) => api.post('/issues/', data).then(r => r.data),
  update: (id, data) => api.patch(`/issues/${id}/`, data).then(r => r.data),
  start: (id) => api.post(`/issues/${id}/start/`).then(r => r.data),
  resolve: (id, data) => api.post(`/issues/${id}/resolve/`, data).then(r => r.data),
  spawnRemediationTask: (id, data) => api.post(`/issues/${id}/spawn_remediation_task/`, data).then(r => r.data),
}

export const Activities = {
  list: (projectId, taskId) => listAll('/activities/', { project: projectId, task: taskId }),
  create: (data) => api.post('/activities/', data).then(r => r.data),
  update: (id, data) => api.patch(`/activities/${id}/`, data).then(r => r.data),
  remove: (id) => api.delete(`/activities/${id}/`),
}

export const CalendarExceptions = {
  create: (data) => api.post('/calendar-exceptions/', data).then(r => r.data),
  remove: (id) => api.delete(`/calendar-exceptions/${id}/`),
}

export const Baselines = {
  remove: (id) => api.delete(`/baselines/${id}/`),
}
