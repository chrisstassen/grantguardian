'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react'

interface Deliverable {
  id: string
  title: string
  description: string | null
  unit: string | null
  target_value: number | null
  actual_value: number
  progress_percent: number
  status: string
  due_date: string | null
  notes: string | null
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', color: 'bg-slate-100 text-slate-700' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'completed',   label: 'Completed',   color: 'bg-green-100 text-green-700' },
]

function statusBadge(status: string) {
  const s = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0]
  return <Badge className={`${s.color} hover:${s.color} text-xs font-medium`}>{s.label}</Badge>
}

function displayProgress(d: Deliverable): number | null {
  if (d.status === 'not_started') return 0
  if (d.status === 'completed') return 100
  // in_progress: use stored progress_percent
  return d.progress_percent ?? 0
}

const emptyForm = {
  title: '', description: '', unit: '', target_value: '', actual_value: '',
  progress_percent: '0', status: 'not_started', due_date: '', notes: ''
}

interface Props {
  grantId: string
  userRole: string
}

export function DeliverablesSection({ grantId, userRole }: Props) {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canEdit = userRole !== 'viewer'

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/user/grants/${grantId}/deliverables?order=due_date`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setDeliverables(data.deliverables)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [grantId])

  const handleAdd = async () => {
    if (!addForm.title.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const res = await fetch(`/api/user/grants/${grantId}/deliverables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        ...addForm,
        target_value: addForm.target_value ? parseFloat(addForm.target_value) : null,
        actual_value: addForm.actual_value ? parseFloat(addForm.actual_value) : 0,
        progress_percent: addForm.status === 'completed' ? 100 : addForm.status === 'not_started' ? 0 : parseInt(addForm.progress_percent) || 0,
      })
    })
    setSaving(false)
    if (res.ok) {
      setAddForm(emptyForm)
      setShowAddForm(false)
      load()
    } else {
      alert('Failed to save deliverable.')
    }
  }

  const startEdit = (d: Deliverable) => {
    setEditingId(d.id)
    setEditForm({
      title: d.title,
      description: d.description || '',
      unit: d.unit || '',
      target_value: d.target_value?.toString() || '',
      actual_value: d.actual_value > 0 ? d.actual_value.toString() : '',
      progress_percent: (d.progress_percent ?? 0).toString(),
      status: d.status,
      due_date: d.due_date || '',
      notes: d.notes || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.title.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const res = await fetch(`/api/user/grants/${grantId}/deliverables/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        ...editForm,
        target_value: editForm.target_value ? parseFloat(editForm.target_value) : null,
        actual_value: editForm.actual_value ? parseFloat(editForm.actual_value) : 0,
        progress_percent: editForm.status === 'completed' ? 100 : editForm.status === 'not_started' ? 0 : parseInt(editForm.progress_percent) || 0,
      })
    })
    setSaving(false)
    if (res.ok) { setEditingId(null); load() }
    else alert('Failed to update deliverable.')
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setDeletingId(null); return }
    const res = await fetch(`/api/user/grants/${grantId}/deliverables/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    setDeletingId(null)
    if (res.ok) load()
    else alert('Failed to delete deliverable.')
  }

  const completedCount = deliverables.filter(d => d.status === 'completed').length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>Deliverables</CardTitle>
            {deliverables.length > 0 && (
              <span className="text-sm text-slate-500">
                {completedCount} / {deliverables.length} completed
              </span>
            )}
          </div>
          {canEdit && !showAddForm && (
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Deliverable
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Form */}
        {showAddForm && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">New Deliverable</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Input placeholder="Title *" value={addForm.title} onChange={e => setAddForm({ ...addForm, title: e.target.value })} />
              </div>
              <Input placeholder="Unit (e.g. people served)" value={addForm.unit} onChange={e => setAddForm({ ...addForm, unit: e.target.value })} />
              <Input type="date" placeholder="Due date" value={addForm.due_date} onChange={e => setAddForm({ ...addForm, due_date: e.target.value })} />
              <Input type="number" placeholder="Target value" min="0" value={addForm.target_value} onChange={e => setAddForm({ ...addForm, target_value: e.target.value })} />
              <Input type="number" placeholder="Actual value" min="0" value={addForm.actual_value} onChange={e => setAddForm({ ...addForm, actual_value: e.target.value })} />
              <select
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={addForm.status}
                onChange={e => setAddForm({ ...addForm, status: e.target.value, progress_percent: e.target.value === 'completed' ? '100' : e.target.value === 'not_started' ? '0' : addForm.progress_percent })}
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {addForm.status === 'in_progress' ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min="0" max="100" placeholder="Progress %"
                    value={addForm.progress_percent}
                    onChange={e => setAddForm({ ...addForm, progress_percent: e.target.value })}
                  />
                  <span className="text-sm text-slate-500 shrink-0">%</span>
                </div>
              ) : (
                <div className="flex items-center px-3 py-2 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-500">
                  {addForm.status === 'completed' ? '100%' : '0%'} progress
                </div>
              )}
              <div className="col-span-2">
                <Input placeholder="Description (optional)" value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setShowAddForm(false); setAddForm(emptyForm) }}>Cancel</Button>
              <Button size="sm" disabled={saving || !addForm.title.trim()} onClick={handleAdd}>
                {saving ? 'Saving…' : 'Add Deliverable'}
              </Button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && deliverables.length === 0 && !showAddForm && (
          <p className="text-sm text-slate-400 italic">
            No deliverables defined yet.{canEdit ? ' Click "Add Deliverable" to get started.' : ''}
          </p>
        )}

        {/* Table */}
        {deliverables.length > 0 && (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deliverable</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Target</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actual</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Progress</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
                  {canEdit && <th className="px-4 py-2.5 w-20" />}
                </tr>
              </thead>
              <tbody>
                {deliverables.map(d => (
                  editingId === d.id ? (
                    <tr key={d.id} className="border-t border-slate-100 bg-slate-50">
                      <td className="px-3 py-2" colSpan={canEdit ? 7 : 6}>
                        <div className="grid grid-cols-2 gap-2">
                          <Input className="col-span-2 h-8 text-sm" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} placeholder="Title *" />
                          <Input className="h-8 text-sm" value={editForm.unit} onChange={e => setEditForm({ ...editForm, unit: e.target.value })} placeholder="Unit" />
                          <Input className="h-8 text-sm" type="date" value={editForm.due_date} onChange={e => setEditForm({ ...editForm, due_date: e.target.value })} />
                          <Input className="h-8 text-sm" type="number" min="0" value={editForm.target_value} onChange={e => setEditForm({ ...editForm, target_value: e.target.value })} placeholder="Target" />
                          <Input className="h-8 text-sm" type="number" min="0" value={editForm.actual_value} onChange={e => setEditForm({ ...editForm, actual_value: e.target.value })} placeholder="Actual" />
                          <select
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                            value={editForm.status}
                            onChange={e => setEditForm({ ...editForm, status: e.target.value, progress_percent: e.target.value === 'completed' ? '100' : e.target.value === 'not_started' ? '0' : editForm.progress_percent })}
                          >
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {editForm.status === 'in_progress' ? (
                            <div className="flex items-center gap-2">
                              <Input
                                className="h-8 text-sm" type="number" min="0" max="100" placeholder="Progress %"
                                value={editForm.progress_percent}
                                onChange={e => setEditForm({ ...editForm, progress_percent: e.target.value })}
                              />
                              <span className="text-sm text-slate-500 shrink-0">%</span>
                            </div>
                          ) : (
                            <div className="flex items-center px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-500">
                              {editForm.status === 'completed' ? '100%' : '0%'} progress
                            </div>
                          )}
                          <Input className="col-span-2 h-8 text-sm" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description (optional)" />
                        </div>
                        <div className="flex gap-2 justify-end mt-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                            <X className="h-3 w-3 mr-1" />Cancel
                          </Button>
                          <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={handleSaveEdit}>
                            <Check className="h-3 w-3 mr-1" />{saving ? 'Saving…' : 'Save'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{d.title}</p>
                        {d.description && <p className="text-xs text-slate-500 mt-0.5">{d.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {d.target_value != null ? `${d.target_value.toLocaleString()}${d.unit ? ' ' + d.unit : ''}` : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {`${d.actual_value.toLocaleString()}${d.unit ? ' ' + d.unit : ''}`}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const pct = displayProgress(d)
                          if (pct == null) return <span className="text-slate-400 text-xs">—</span>
                          return (
                            <div className="space-y-1">
                              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${pct >= 100 ? 'bg-green-500' : d.status === 'not_started' ? 'bg-slate-300' : 'bg-blue-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="text-xs text-slate-500 text-center">{pct}%</p>
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3">{statusBadge(d.status)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {d.due_date ? new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="text-slate-400">—</span>}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => startEdit(d)} className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { if (confirm('Delete this deliverable?')) handleDelete(d.id) }}
                              disabled={deletingId === d.id}
                              className="p-1 rounded hover:bg-red-100 text-slate-500 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
