import React, { useState } from 'react'
import { Tasks } from '../lib/api'
import { Badge, Input } from './ui.jsx'
import TaskHistoryModal from './TaskHistoryModal.jsx'

export default function TaskRow({ task, index, format, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: task.name, estimated_start: task.estimated_start,
    estimated_end: task.estimated_end, estimated_cost: task.estimated_cost,
  })
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await Tasks.update(task.id, form)
      setEditing(false)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setForm({ name: task.name, estimated_start: task.estimated_start, estimated_end: task.estimated_end, estimated_cost: task.estimated_cost })
    setEditing(false)
  }

  const remove = async () => {
    if (!window.confirm(`Delete "${task.name}"? This can't be undone — but the deletion will stay in the audit log.`)) return
    await Tasks.remove(task.id)
    onChanged()
  }

  if (editing) {
    return (
      <tr className="border-b border-ink-50 last:border-0 bg-blueprint-50/30">
        <td className="py-2 text-ink-300">{index + 1}</td>
        <td><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="!py-1 text-xs" /></td>
        <td><Input type="date" value={form.estimated_start} onChange={e => setForm({ ...form, estimated_start: e.target.value })} className="!py-1 text-xs" /></td>
        <td><Input type="date" value={form.estimated_end} onChange={e => setForm({ ...form, estimated_end: e.target.value })} className="!py-1 text-xs" /></td>
        <td><Input type="number" value={form.estimated_cost} onChange={e => setForm({ ...form, estimated_cost: e.target.value })} className="!py-1 text-xs" /></td>
        <td><Badge tone="slate">{task.status.replace('_', ' ')}</Badge></td>
        <td className="whitespace-nowrap font-sans text-xs">
          <button onClick={save} disabled={saving} className="text-blueprint-600 hover:underline mr-2">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={cancel} className="text-ink-400 hover:underline">Cancel</button>
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr className="border-b border-ink-50 last:border-0 group">
        <td className="py-2.5 text-ink-300">{index + 1}</td>
        <td className="font-sans font-medium text-ink-800">{task.name}</td>
        <td className="text-ink-500">{task.estimated_start}</td>
        <td className="text-ink-500">{task.estimated_end}</td>
        <td className="text-ink-500">{format(task.estimated_cost)}</td>
        <td><Badge tone="slate">{task.status.replace('_', ' ')}</Badge></td>
        <td className="whitespace-nowrap font-sans text-xs opacity-0 group-hover:opacity-100 transition">
          <button onClick={() => setEditing(true)} className="text-blueprint-600 hover:underline mr-2">Edit</button>
          <button onClick={() => setShowHistory(true)} className="text-ink-400 hover:underline mr-2">History</button>
          <button onClick={remove} className="text-safety-600 hover:underline">Delete</button>
        </td>
      </tr>
      {showHistory && <TaskHistoryModal task={task} onClose={() => setShowHistory(false)} />}
    </>
  )
}
