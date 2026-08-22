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
    const detail = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message
    console.error(`API ${error.config?.method?.toUpperCase()} ${error.config?.url} failed:`, detail)
    if (error.response && error.response.status >= 400) {
      alert(`Request failed (${error.response.status}): ${detail}`)
    }
    return Promise.reject(error)
  }
)

export const Projects = {
  list: () => api.get('/projects/').then(r => r.data.results),
  get: (id) => api.get(`/projects/${id}/`).then(r => r.data),
  create: (data) => api.post('/projects/', data).then(r => r.data),
  update: (id, data) => api.patch(`/projects/${id}/`, data).then(r => r.data),
  analytics: (id, granularity = 'month') =>
    api.get(`/projects/${id}/analytics/`, { params: { granularity } }).then(r => r.data),
  feed: (id) => api.get(`/projects/${id}/feed/`).then(r => r.data),
}

export const Tasks = {
  list: (projectId) => api.get('/tasks/', { params: { project: projectId } }).then(r => r.data.results),
  create: (data) => api.post('/tasks/', data).then(r => r.data),
  update: (id, data) => api.patch(`/tasks/${id}/`, data).then(r => r.data),
  remove: (id) => api.delete(`/tasks/${id}/`),
  verify: (id, notes) => api.post(`/tasks/${id}/verify/`, { notes }).then(r => r.data),
  reject: (id, reason) => api.post(`/tasks/${id}/reject/`, { reason }).then(r => r.data),
  audit: (id) => api.get(`/tasks/${id}/audit/`).then(r => r.data),
}

export const Vendors = {
  list: () => api.get('/vendors/').then(r => r.data.results),
  create: (data) => api.post('/vendors/', data).then(r => r.data),
}

export const Expenses = {
  list: (projectId, taskId) => api.get('/expenses/', { params: { project: projectId, task: taskId } }).then(r => r.data.results),
  create: (data) => api.post('/expenses/', data).then(r => r.data),
  update: (id, data) => api.patch(`/expenses/${id}/`, data).then(r => r.data),
}

export const Documents = {
  list: (projectId, taskId, saleAgreementId) => api.get('/documents/', { params: { project: projectId, task: taskId, sale_agreement: saleAgreementId } }).then(r => r.data.results),
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
  list: () => api.get('/customers/').then(r => r.data.results),
  create: (data) => api.post('/customers/', data).then(r => r.data),
}

export const Units = {
  list: (projectId) => api.get('/units/', { params: { project: projectId } }).then(r => r.data.results),
  create: (data) => api.post('/units/', data).then(r => r.data),
  update: (id, data) => api.patch(`/units/${id}/`, data).then(r => r.data),
  markSold: (id) => api.post(`/units/${id}/mark_sold/`).then(r => r.data),
}

export const SaleAgreements = {
  list: (unitId) => api.get('/sale-agreements/', { params: { unit: unitId } }).then(r => r.data.results),
  listByProject: (projectId) => api.get('/sale-agreements/', { params: { project: projectId } }).then(r => r.data.results),
  create: (data) => api.post('/sale-agreements/', data).then(r => r.data),
}

export const Installments = {
  update: (id, data) => api.patch(`/installments/${id}/`, data).then(r => r.data),
}

export const Issues = {
  list: (projectId, taskId) => api.get('/issues/', { params: { project: projectId, task: taskId } }).then(r => r.data.results),
  create: (data) => api.post('/issues/', data).then(r => r.data),
  update: (id, data) => api.patch(`/issues/${id}/`, data).then(r => r.data),
}

export const Activities = {
  list: (projectId) => api.get('/activities/', { params: { project: projectId } }).then(r => r.data.results),
  create: (data) => api.post('/activities/', data).then(r => r.data),
  update: (id, data) => api.patch(`/activities/${id}/`, data).then(r => r.data),
  remove: (id) => api.delete(`/activities/${id}/`),
}
