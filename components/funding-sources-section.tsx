'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Trash2, Plus, Check, X, AlertCircle } from 'lucide-react'

interface FundingSource {
  id: string
  source_name: string
  source_type: string
  amount: number
  notes: string | null
}

const SOURCE_TYPES = [
  { value: 'federal',             label: 'Federal Grant' },
  { value: 'state',               label: 'State' },
  { value: 'local',               label: 'Local Government' },
  { value: 'insurance',           label: 'Insurance Proceeds' },
  { value: 'organization_budget', label: 'Organization Budget' },
  { value: 'donation',            label: 'Donations' },
  { value: 'other',               label: 'Other' },
]

const TYPE_COLORS: Record<string, string> = {
  federal:             'bg-blue-100 text-blue-800',
  state:               'bg-purple-100 text-purple-800',
  local:               'bg-indigo-100 text-indigo-800',
  insurance:           'bg-amber-100 text-amber-800',
  organization_budget: 'bg-slate-100 text-slate-700',
  donation:            'bg-green-100 text-green-800',
  other:               'bg-gray-100 text-gray-700',
}

// Simple distinct colors for the stacked bar
const BAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500',
  'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500'
]

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

const emptyForm = { source_name: '', source_type: 'federal', amount: '', notes: '' }

interface Props {
  grantId: string
  userRole: string
  awardAmount: number | null
  totalProjectCost: number | null
}

export function FundingSourcesSection({ grantId, userRole, awardAmount, totalProjectCost }: Props) {
  const [sources, setSources] = useState<FundingSource[]>([])
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
    const res = await fetch(`/api/user/grants/${grantId}/funding-sources`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setSources(data.sources)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [grantId])

  const handleAdd = async () => {
    if (!addForm.source_name.trim() || !addForm.amount) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const res = await fetch(`/api/user/grants/${grantId}/funding-sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...addForm, amount: parseFloat(addForm.amount) })
    })
    setSaving(false)
    if (res.ok) { setAddForm(emptyForm); setShowAddForm(false); load() }
    else alert('Failed to save funding source.')
  }

  const startEdit = (s: FundingSource) => {
    setEditingId(s.id)
    setEditForm({ source_name: s.source_name, source_type: s.source_type, amount: s.amount.toString(), notes: s.notes || '' })
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.source_name.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const res = await fetch(`/api/user/grants/${grantId}/funding-sources/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...editForm, amount: parseFloat(editForm.amount) })
    })
    setSaving(false)
    if (res.ok) { setEditingId(null); load() }
    else alert('Failed to update funding source.')
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setDeletingId(null); return }
    const res = await fetch(`/api/user/grants/${grantId}/funding-sources/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    setDeletingId(null)
    if (res.ok) load()
    else alert('Failed to delete funding source.')
  }

  const totalFromSources = sources.reduce((s, r) => s + (parseFloat(r.amount as any) || 0), 0)
  const displayTotal = totalProjectCost ?? (sources.length > 0 ? totalFromSources : null)
  const variance = displayTotal != null ? totalFromSources - displayTotal : null
  const hasVariance = variance != null && Math.abs(variance) > 0.01

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Funding Sources</CardTitle>
          {canEdit && !showAddForm && (
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Source
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Cost summary row */}
        {(awardAmount != null || displayTotal != null) && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Project Cost</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">
                {displayTotal != null ? fmt(displayTotal) : '—'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {totalProjectCost != null ? 'From grant settings' : sources.length > 0 ? 'Sum of all sources' : 'Set via Edit Grant'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Award Amount</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{awardAmount != null ? fmt(awardAmount) : '—'}</p>
              <p className="text-xs text-slate-400 mt-1">Primary grant award</p>
            </div>
          </div>
        )}

        {/* Variance warning */}
        {hasVariance && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Sources total {fmt(totalFromSources)}, which is {variance! > 0 ? fmt(variance!) + ' more' : fmt(Math.abs(variance!)) + ' less'} than the Total Project Cost of {fmt(totalProjectCost!)}.
            </span>
          </div>
        )}

        {/* Stacked bar */}
        {sources.length > 0 && totalFromSources > 0 && (
          <div className="space-y-2">
            <div className="flex w-full h-6 rounded-full overflow-hidden">
              {sources.map((s, i) => {
                const pct = (parseFloat(s.amount as any) / totalFromSources) * 100
                return (
                  <div
                    key={s.id}
                    className={`${BAR_COLORS[i % BAR_COLORS.length]} h-full transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${s.source_name}: ${fmt(parseFloat(s.amount as any))} (${pct.toFixed(1)}%)`}
                  />
                )
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {sources.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <div className={`w-2.5 h-2.5 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                  {s.source_name} ({((parseFloat(s.amount as any) / totalFromSources) * 100).toFixed(1)}%)
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">New Funding Source</p>
            <div className="grid grid-cols-2 gap-3">
              <Input className="col-span-2" placeholder="Source name * (e.g. FEMA BRIC Grant)" value={addForm.source_name} onChange={e => setAddForm({ ...addForm, source_name: e.target.value })} />
              <select
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={addForm.source_type}
                onChange={e => setAddForm({ ...addForm, source_type: e.target.value })}
              >
                {SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <Input type="number" placeholder="Amount *" min="0" step="0.01" value={addForm.amount} onChange={e => setAddForm({ ...addForm, amount: e.target.value })} />
              <Input className="col-span-2" placeholder="Notes (optional)" value={addForm.notes} onChange={e => setAddForm({ ...addForm, notes: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setShowAddForm(false); setAddForm(emptyForm) }}>Cancel</Button>
              <Button size="sm" disabled={saving || !addForm.source_name.trim() || !addForm.amount} onClick={handleAdd}>
                {saving ? 'Saving…' : 'Add Source'}
              </Button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && sources.length === 0 && !showAddForm && (
          <p className="text-sm text-slate-400 italic">
            No funding sources defined yet.{canEdit ? ' Click "Add Source" to break down where project funding comes from.' : ''}
          </p>
        )}

        {/* Table */}
        {sources.length > 0 && (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">% of Total</th>
                  {canEdit && <th className="px-4 py-2.5 w-20" />}
                </tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  editingId === s.id ? (
                    <tr key={s.id} className="border-t border-slate-100 bg-slate-50">
                      <td className="px-3 py-2" colSpan={canEdit ? 5 : 4}>
                        <div className="grid grid-cols-2 gap-2">
                          <Input className="col-span-2 h-8 text-sm" value={editForm.source_name} onChange={e => setEditForm({ ...editForm, source_name: e.target.value })} placeholder="Source name *" />
                          <select
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                            value={editForm.source_type}
                            onChange={e => setEditForm({ ...editForm, source_type: e.target.value })}
                          >
                            {SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <Input className="h-8 text-sm" type="number" min="0" step="0.01" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} placeholder="Amount *" />
                          <Input className="col-span-2 h-8 text-sm" value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes (optional)" />
                        </div>
                        <div className="flex gap-2 justify-end mt-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}><X className="h-3 w-3 mr-1" />Cancel</Button>
                          <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={handleSaveEdit}><Check className="h-3 w-3 mr-1" />{saving ? 'Saving…' : 'Save'}</Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{s.source_name}</p>
                        {s.notes && <p className="text-xs text-slate-500 mt-0.5">{s.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[s.source_type] || TYPE_COLORS.other}`}>
                          {SOURCE_TYPES.find(t => t.value === s.source_type)?.label || s.source_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{fmt(parseFloat(s.amount as any))}</td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {totalFromSources > 0 ? ((parseFloat(s.amount as any) / totalFromSources) * 100).toFixed(1) + '%' : '—'}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={() => startEdit(s)} className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { if (confirm('Delete this funding source?')) handleDelete(s.id) }}
                              disabled={deletingId === s.id}
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
              {sources.length > 1 && (
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-700" colSpan={2}>Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">{fmt(totalFromSources)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-600">100%</td>
                    {canEdit && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
