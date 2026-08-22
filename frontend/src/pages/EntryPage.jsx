import React, { useState, useEffect } from 'react'
import { Projects, Tasks, Vendors, Customers, Units } from '../lib/api'
import { SectionCard, PageHeader, Badge, Button, Field, Input, EmptyState } from '../components/ui.jsx'
import { useCurrency } from '../lib/currency.jsx'
import TaskRow from '../components/TaskRow.jsx'

export default function EntryPage({ projectId, onProjectsChanged }) {
  const { format } = useCurrency()
  const [newProject, setNewProject] = useState({ name: '', site_address: '', total_budget: '', start_date: '', estimated_end_date: '' })
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState({ name: '', estimated_start: '', estimated_end: '', estimated_cost: '', predecessors: [] })
  const [vendors, setVendors] = useState([])
  const [newVendor, setNewVendor] = useState({ name: '', trade: '', contact_name: '', phone: '', email: '' })
  const [customers, setCustomers] = useState([])
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' })
  const [units, setUnits] = useState([])
  const [newUnit, setNewUnit] = useState({ identifier: '', sqm: '', list_price: '' })

  const refresh = () => {
    Vendors.list().then(setVendors)
    Customers.list().then(setCustomers)
    if (projectId) {
      Tasks.list(projectId).then(setTasks)
      Units.list(projectId).then(setUnits)
    }
  }

  useEffect(() => { refresh() }, [projectId])

  const createProject = async (e) => {
    e.preventDefault()
    await Projects.create({ ...newProject, total_budget: newProject.total_budget || 0 })
    setNewProject({ name: '', site_address: '', total_budget: '', start_date: '', estimated_end_date: '' })
    onProjectsChanged?.()
  }

  const createTask = async (e) => {
    e.preventDefault()
    if (!projectId) return alert('Select or create a project first.')
    await Tasks.create({ ...newTask, project: projectId, order: tasks.length, estimated_cost: newTask.estimated_cost || 0 })
    setNewTask({ name: '', estimated_start: '', estimated_end: '', estimated_cost: '', predecessors: [] })
    refresh()
  }

  const createVendor = async (e) => {
    e.preventDefault()
    await Vendors.create(newVendor)
    setNewVendor({ name: '', trade: '', contact_name: '', phone: '', email: '' })
    refresh()
  }

  const createCustomer = async (e) => {
    e.preventDefault()
    await Customers.create(newCustomer)
    setNewCustomer({ name: '', email: '', phone: '' })
    refresh()
  }

  const createUnit = async (e) => {
    e.preventDefault()
    if (!projectId) return alert('Select or create a project first.')
    await Units.create({ ...newUnit, project: projectId })
    setNewUnit({ identifier: '', sqm: '', list_price: '' })
    refresh()
  }

  return (
    <div>
      <PageHeader eyebrow="Plan" title="Setup" subtitle="Define the project, its process, and the parties involved." />

      <SectionCard eyebrow="01 — Project" title="Project details">
        <form onSubmit={createProject} className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Input placeholder="Project name" value={newProject.name} onChange={e => setNewProject({ ...newProject, name: e.target.value })} required />
          <Input placeholder="Site address" value={newProject.site_address} onChange={e => setNewProject({ ...newProject, site_address: e.target.value })} />
          <Input type="number" placeholder="Total budget" value={newProject.total_budget} onChange={e => setNewProject({ ...newProject, total_budget: e.target.value })} />
          <Input type="date" value={newProject.start_date} onChange={e => setNewProject({ ...newProject, start_date: e.target.value })} />
          <Input type="date" value={newProject.estimated_end_date} onChange={e => setNewProject({ ...newProject, estimated_end_date: e.target.value })} />
          <Button type="submit" className="col-span-2 md:col-span-5">Create project</Button>
        </form>
        {!projectId && <p className="text-sm text-safety-600 mt-3">Select a project from the top-right dropdown to manage its process, or create one above.</p>}
      </SectionCard>

      <SectionCard eyebrow="02 — Process" title="Construction phases &amp; tasks">
        <form onSubmit={createTask} className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
          <Input placeholder="Task / phase name (e.g. Land Acquisition)" value={newTask.name} onChange={e => setNewTask({ ...newTask, name: e.target.value })} required className="col-span-2" />
          <Input type="date" value={newTask.estimated_start} onChange={e => setNewTask({ ...newTask, estimated_start: e.target.value })} required />
          <Input type="date" value={newTask.estimated_end} onChange={e => setNewTask({ ...newTask, estimated_end: e.target.value })} required />
          <Input type="number" placeholder="Estimated cost" value={newTask.estimated_cost} onChange={e => setNewTask({ ...newTask, estimated_cost: e.target.value })} />
          {tasks.length > 0 && (
            <label className="col-span-2 md:col-span-5 block">
              <span className="text-xs font-medium text-ink-400 block mb-1">Depends on (optional — draws an arrow on the Gantt from these to this task)</span>
              <select
                multiple
                className="border border-ink-200 rounded-lg px-3 py-2 text-sm w-full h-24"
                value={newTask.predecessors}
                onChange={e => setNewTask({ ...newTask, predecessors: Array.from(e.target.selectedOptions, o => o.value) })}
              >
                {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <Button type="submit" className="col-span-2 md:col-span-5">Add task to process</Button>
        </form>
        <p className="text-xs text-ink-300 mb-5">Tip: set a task's start and end date to the same day to have it show as a milestone on the Gantt chart. Hover a row below to edit, delete, or view its change history.</p>
        <table className="w-full text-sm">
          <thead className="text-left text-ink-400 text-xs uppercase tracking-wide border-b border-ink-100">
            <tr><th className="py-2 font-medium">#</th><th className="font-medium">Name</th><th className="font-medium">Est. start</th><th className="font-medium">Est. end</th><th className="font-medium">Est. cost</th><th className="font-medium">Status</th><th className="font-medium"></th></tr>
          </thead>
          <tbody className="font-mono text-[13px]">
            {tasks.map((t, i) => (
              <TaskRow key={t.id} task={t} index={i} format={format} onChanged={refresh} />
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && <EmptyState title="No tasks yet" subtitle="Add the first phase of the process above." />}
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard eyebrow="03a — Cost side" title="Vendors">
          <form onSubmit={createVendor} className="grid grid-cols-2 gap-3 mb-4">
            <Input placeholder="Vendor name" value={newVendor.name} onChange={e => setNewVendor({ ...newVendor, name: e.target.value })} required />
            <Input placeholder="Trade (e.g. Electrical)" value={newVendor.trade} onChange={e => setNewVendor({ ...newVendor, trade: e.target.value })} />
            <Input placeholder="Contact name" value={newVendor.contact_name} onChange={e => setNewVendor({ ...newVendor, contact_name: e.target.value })} />
            <Input placeholder="Phone" value={newVendor.phone} onChange={e => setNewVendor({ ...newVendor, phone: e.target.value })} />
            <Button type="submit" className="col-span-2">Add vendor</Button>
          </form>
          <ul className="text-sm divide-y divide-ink-50">
            {vendors.map(v => <li key={v.id} className="py-2 flex justify-between"><span className="font-medium text-ink-700">{v.name}</span><span className="text-ink-400">{v.trade}</span></li>)}
          </ul>
          {vendors.length === 0 && <EmptyState title="No vendors yet" />}
        </SectionCard>

        <SectionCard eyebrow="03b — Sales side" title="Customers">
          <form onSubmit={createCustomer} className="grid grid-cols-2 gap-3 mb-4">
            <Input placeholder="Customer name" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} required />
            <Input placeholder="Email" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} />
            <Input placeholder="Phone" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="col-span-2" />
            <Button type="submit" className="col-span-2">Add customer</Button>
          </form>
          <ul className="text-sm divide-y divide-ink-50">
            {customers.map(c => <li key={c.id} className="py-2 flex justify-between"><span className="font-medium text-ink-700">{c.name}</span><span className="text-ink-400">{c.email}</span></li>)}
          </ul>
          {customers.length === 0 && <EmptyState title="No customers yet" />}
        </SectionCard>
      </div>

      <SectionCard eyebrow="04 — Inventory" title="Units for sale" className="mt-6">
        <form onSubmit={createUnit} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Input placeholder="Identifier (e.g. A-101)" value={newUnit.identifier} onChange={e => setNewUnit({ ...newUnit, identifier: e.target.value })} required />
          <Input type="number" placeholder="Sq. meters" value={newUnit.sqm} onChange={e => setNewUnit({ ...newUnit, sqm: e.target.value })} required />
          <Input type="number" placeholder="List price" value={newUnit.list_price} onChange={e => setNewUnit({ ...newUnit, list_price: e.target.value })} required />
          <Button type="submit">Add unit</Button>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-ink-400 text-xs uppercase tracking-wide border-b border-ink-100">
            <tr><th className="py-2 font-medium">Unit</th><th className="font-medium">Sq.m</th><th className="font-medium">List price</th><th className="font-medium">Status</th></tr>
          </thead>
          <tbody className="font-mono text-[13px]">
            {units.map(u => (
              <tr key={u.id} className="border-b border-ink-50 last:border-0">
                <td className="py-2.5 font-sans font-medium text-ink-800">{u.identifier}</td><td className="text-ink-500">{u.sqm}</td><td className="text-ink-500">{format(u.list_price)}</td>
                <td><Badge tone={u.status === 'sold' ? 'green' : u.status === 'reserved' ? 'amber' : 'slate'}>{u.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {units.length === 0 && <EmptyState title="No units yet" />}
      </SectionCard>
    </div>
  )
}
