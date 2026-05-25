'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Sparkles, Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { exportToCsv } from '@/lib/export-csv'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CloseoutItem {
  id: string
  grant_id: string
  category: string
  title: string
  description: string | null
  status: 'pending' | 'completed' | 'not_applicable'
  due_date: string | null
  assigned_to_user_id: string | null
  notes: string | null
  ai_generated: boolean
  order_index: number
  assigned_to?: { id: string; first_name: string; last_name: string } | null
}

interface TeamMember {
  id: string
  first_name: string
  last_name: string
}

interface Props {
  grantId: string
  grantName: string
  awardNumber: string | null
  userRole: string
  teamMembers: TeamMember[]
}

// ─── Standard template ────────────────────────────────────────────────────────

const STANDARD_TEMPLATE: { category: string; title: string; description: string }[] = [
  // Financial
  { category: 'Financial', title: 'Reconcile all grant expenditures', description: 'Ensure all costs are allowable, allocable, and reasonable per the grant agreement.' },
  { category: 'Financial', title: 'Submit final Financial Status Report (FSR)', description: 'Complete and submit the final financial report to the funding agency by the deadline.' },
  { category: 'Financial', title: 'Return any unexpended funds', description: 'Calculate and remit any unspent award funds to the grantor as required.' },
  { category: 'Financial', title: 'Resolve outstanding advances or loans', description: 'Ensure all cash advances are liquidated and accounted for before closeout.' },
  { category: 'Financial', title: 'Final indirect cost rate reconciliation', description: 'Reconcile any indirect costs charged to the grant with the approved rate agreement.' },

  // Programmatic
  { category: 'Programmatic', title: 'Complete all grant deliverables', description: 'Confirm every deliverable in the grant agreement has been fulfilled or document any exceptions.' },
  { category: 'Programmatic', title: 'Submit final Progress/Performance Report', description: 'Prepare and submit the final program narrative report documenting outcomes achieved.' },
  { category: 'Programmatic', title: 'Collect and submit required performance data', description: 'Compile all performance metrics, statistics, and data required by the funding agency.' },
  { category: 'Programmatic', title: 'Document lessons learned', description: 'Record program successes, challenges, and recommendations for future grants.' },

  // Compliance & Documentation
  { category: 'Compliance & Documentation', title: 'Conduct final compliance review', description: 'Review all grant activities against federal/state regulations and grant-specific requirements.' },
  { category: 'Compliance & Documentation', title: 'Complete equipment/property inventory', description: 'Document and determine disposition of all property and equipment purchased with grant funds.' },
  { category: 'Compliance & Documentation', title: 'Ensure subcontractor closeout', description: 'Verify all sub-recipients and contractors have submitted required reports and final invoices.' },
  { category: 'Compliance & Documentation', title: 'Retain grant records per retention schedule', description: 'Archive all grant documentation in accordance with the funder\'s records retention policy (typically 3–7 years).' },
  { category: 'Compliance & Documentation', title: 'Final personnel effort certifications', description: 'Obtain signed effort reports for all personnel whose salaries were charged to this grant.' },

  // Administrative
  { category: 'Administrative', title: 'Notify funding agency of project completion', description: 'Send formal written notice to the program officer that all activities have concluded.' },
  { category: 'Administrative', title: 'Close all grant-specific accounts and cost centers', description: 'Work with finance to ensure no further charges can be made against the grant budget.' },
  { category: 'Administrative', title: 'Update grant status to Closed', description: 'Mark the grant as closed in all internal tracking systems.' },
  { category: 'Administrative', title: 'Archive all grant documentation', description: 'Compile and securely store all grant files including correspondence, reports, and financial records.' },
]

const CATEGORIES = ['Financial', 'Programmatic', 'Compliance & Documentation', 'Administrative']

const STATUS_CONFIG = {
  pending:        { label: 'Pending',      color: 'bg-slate-100 text-slate-700 hover:bg-slate-100' },
  completed:      { label: 'Completed',    color: 'bg-green-100 text-green-700 hover:bg-green-100' },
  not_applicable: { label: 'N/A',          color: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CloseoutTab({ grantId, grantName, awardNumber, userRole, teamMembers }: Props) {
  const [items, setItems] = useState<CloseoutItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<CloseoutItem>>({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ category: 'Administrative', title: '', description: '', due_date: '', assigned_to_user_id: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canEdit = userRole !== 'viewer'

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/user/grants/${grantId}/closeout`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [grantId])

  // ── Populate standard template + AI ───────────────────────────────────────

  const handleGenerate = async () => {
    if (!confirm('This will add a standard close-out checklist plus AI-suggested items specific to this grant. Continue?')) return
    setGenerating(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setGenerating(false); return }

      // 1. Insert standard template
      const templatePayload = STANDARD_TEMPLATE.map((item, idx) => ({
        ...item,
        ai_generated: false,
        order_index: idx,
      }))

      const templateRes = await fetch(`/api/user/grants/${grantId}/closeout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ items: templatePayload }),
      })
      if (!templateRes.ok) throw new Error('Failed to insert template items')

      // 2. Fetch AI additions
      const aiRes = await fetch(`/api/user/grants/${grantId}/closeout/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({}),
      })

      if (aiRes.ok) {
        const aiData = await aiRes.json()
        const aiItems = (aiData.items || []).map((item: any, idx: number) => ({
          ...item,
          ai_generated: true,
          order_index: STANDARD_TEMPLATE.length + idx,
        }))
        if (aiItems.length > 0) {
          await fetch(`/api/user/grants/${grantId}/closeout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ items: aiItems }),
          })
        }
      }

      await load()
    } catch (err: any) {
      alert('Error generating checklist: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Status cycling ─────────────────────────────────────────────────────────

  const cycleStatus = async (item: CloseoutItem) => {
    if (!canEdit) return
    const order: CloseoutItem['status'][] = ['pending', 'completed', 'not_applicable']
    const next = order[(order.indexOf(item.status) + 1) % order.length]
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i))

    const res = await fetch(`/api/user/grants/${grantId}/closeout/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ status: next }),
    })
    if (!res.ok) load() // revert on failure
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  const startEdit = (item: CloseoutItem) => {
    setEditingId(item.id)
    setEditForm({
      title: item.title,
      description: item.description || '',
      category: item.category,
      due_date: item.due_date || '',
      assigned_to_user_id: item.assigned_to_user_id || '',
      notes: item.notes || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    const res = await fetch(`/api/user/grants/${grantId}/closeout/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        title: editForm.title,
        description: editForm.description || null,
        category: editForm.category,
        due_date: editForm.due_date || null,
        assigned_to_user_id: editForm.assigned_to_user_id || null,
        notes: editForm.notes || null,
      }),
    })
    setSaving(false)
    if (res.ok) { setEditingId(null); load() }
    else alert('Failed to save changes.')
  }

  // ── Add ───────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!addForm.title.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    const res = await fetch(`/api/user/grants/${grantId}/closeout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        category: addForm.category,
        title: addForm.title.trim(),
        description: addForm.description || null,
        due_date: addForm.due_date || null,
        assigned_to_user_id: addForm.assigned_to_user_id || null,
        notes: addForm.notes || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setShowAddForm(false)
      setAddForm({ category: 'Administrative', title: '', description: '', due_date: '', assigned_to_user_id: '', notes: '' })
      load()
    } else {
      alert('Failed to add item.')
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this checklist item?')) return
    setDeletingId(id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setDeletingId(null); return }

    const res = await fetch(`/api/user/grants/${grantId}/closeout/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setDeletingId(null)
    if (res.ok) load()
    else alert('Failed to delete item.')
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalItems = items.length
  const completedItems = items.filter(i => i.status === 'completed').length
  const naItems = items.filter(i => i.status === 'not_applicable').length
  const effectiveTotal = totalItems - naItems
  const pctComplete = effectiveTotal > 0 ? Math.round((completedItems / effectiveTotal) * 100) : 0

  const byCategory = CATEGORIES.map(cat => ({
    category: cat,
    items: items.filter(i => i.category === cat),
  })).filter(g => g.items.length > 0)

  // Uncategorized (AI might return unexpected category names)
  const knownCategories = new Set(CATEGORIES)
  const otherItems = items.filter(i => !knownCategories.has(i.category))
  if (otherItems.length > 0) byCategory.push({ category: 'Other', items: otherItems })

  const toggleCategory = (cat: string) =>
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = () => {
    exportToCsv(
      `${grantName}-closeout-checklist`,
      ['Grant Name', 'Award Number', 'Category', 'Title', 'Status', 'Due Date', 'Assigned To', 'Notes'],
      items.map(i => [
        grantName,
        awardNumber ?? '',
        i.category,
        i.title,
        i.status,
        i.due_date ?? '',
        i.assigned_to ? `${i.assigned_to.first_name} ${i.assigned_to.last_name}` : '',
        i.notes ?? '',
      ])
    )
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="py-12 text-center text-slate-500">Loading checklist…</div>
  }

  return (
    <div className="space-y-6">
      {/* Header card with progress */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Grant Close-Out Checklist</CardTitle>
              <CardDescription>
                {totalItems === 0
                  ? 'No checklist items yet. Generate a checklist to get started.'
                  : `${completedItems} of ${effectiveTotal} items complete${naItems > 0 ? ` (${naItems} marked N/A)` : ''}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              )}
              {canEdit && items.length === 0 && (
                <Button
                  size="sm"
                  disabled={generating}
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5"
                >
                  <Sparkles className="h-4 w-4" />
                  {generating ? 'Generating…' : 'Generate Checklist'}
                </Button>
              )}
              {canEdit && items.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        {totalItems > 0 && (
          <CardContent>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-slate-600">Overall Progress</span>
                <span className="text-slate-900">{pctComplete}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${pctComplete}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-slate-500 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                  Completed: {completedItems}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" />
                  Pending: {items.filter(i => i.status === 'pending').length}
                </span>
                {naItems > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    N/A: {naItems}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Empty state */}
      {totalItems === 0 && !generating && (
        <div className="text-center py-16 text-slate-500">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-lg font-medium mb-2">No checklist items yet</p>
          <p className="text-sm mb-6 max-w-sm mx-auto">
            Generate a checklist to get a standard close-out template plus AI-suggested items
            tailored to this grant.
          </p>
          {canEdit && (
            <Button onClick={handleGenerate} disabled={generating}>
              <Sparkles className="h-4 w-4 mr-2" />
              {generating ? 'Generating…' : 'Generate Checklist'}
            </Button>
          )}
        </div>
      )}

      {generating && (
        <div className="text-center py-12 text-slate-500">
          <div className="inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 animate-pulse text-blue-500" />
            <span>Building your checklist — adding standard items and consulting AI for grant-specific additions…</span>
          </div>
        </div>
      )}

      {/* Add Item form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Checklist Item</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Input
                  placeholder="Title *"
                  value={addForm.title}
                  onChange={e => setAddForm({ ...addForm, title: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Input
                  placeholder="Description (optional)"
                  value={addForm.description}
                  onChange={e => setAddForm({ ...addForm, description: e.target.value })}
                />
              </div>
              <select
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={addForm.category}
                onChange={e => setAddForm({ ...addForm, category: e.target.value })}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input
                type="date"
                value={addForm.due_date}
                onChange={e => setAddForm({ ...addForm, due_date: e.target.value })}
              />
              <select
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={addForm.assigned_to_user_id}
                onChange={e => setAddForm({ ...addForm, assigned_to_user_id: e.target.value })}
              >
                <option value="">Unassigned</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
              <Input
                placeholder="Notes (optional)"
                value={addForm.notes}
                onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-end mt-3">
              <Button
                variant="outline" size="sm"
                onClick={() => { setShowAddForm(false); setAddForm({ category: 'Administrative', title: '', description: '', due_date: '', assigned_to_user_id: '', notes: '' }) }}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={saving || !addForm.title.trim()} onClick={handleAdd}>
                {saving ? 'Adding…' : 'Add Item'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checklist grouped by category */}
      {byCategory.map(({ category, items: catItems }) => {
        const collapsed = collapsedCategories.has(category)
        const catCompleted = catItems.filter(i => i.status === 'completed').length
        const catNa = catItems.filter(i => i.status === 'not_applicable').length

        return (
          <Card key={category}>
            <CardHeader className="pb-2">
              <button
                className="flex items-center justify-between w-full group"
                onClick={() => toggleCategory(category)}
              >
                <div className="flex items-center gap-3">
                  {collapsed
                    ? <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
                    : <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
                  }
                  <h3 className="font-semibold text-slate-900">{category}</h3>
                  <span className="text-xs text-slate-500">
                    {catCompleted} / {catItems.length - catNa} complete
                  </span>
                </div>
                {/* mini progress pill */}
                <div className="flex items-center gap-2 mr-1">
                  <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full bg-green-500"
                      style={{ width: `${catItems.length - catNa > 0 ? (catCompleted / (catItems.length - catNa)) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right">
                    {catItems.length - catNa > 0 ? Math.round((catCompleted / (catItems.length - catNa)) * 100) : 0}%
                  </span>
                </div>
              </button>
            </CardHeader>

            {!collapsed && (
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {catItems.map(item => (
                    editingId === item.id ? (
                      // ── Inline edit form ──────────────────────────────
                      <div key={item.id} className="p-4 border border-blue-200 bg-blue-50 rounded-lg space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            className="col-span-2 h-8 text-sm"
                            value={editForm.title as string}
                            onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                            placeholder="Title *"
                          />
                          <Input
                            className="col-span-2 h-8 text-sm"
                            value={editForm.description as string}
                            onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Description"
                          />
                          <select
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                            value={editForm.category as string}
                            onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                          >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <Input
                            type="date"
                            className="h-8 text-sm"
                            value={editForm.due_date as string}
                            onChange={e => setEditForm({ ...editForm, due_date: e.target.value })}
                          />
                          <select
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                            value={editForm.assigned_to_user_id as string}
                            onChange={e => setEditForm({ ...editForm, assigned_to_user_id: e.target.value })}
                          >
                            <option value="">Unassigned</option>
                            {teamMembers.map(m => (
                              <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                            ))}
                          </select>
                          <Input
                            className="h-8 text-sm"
                            value={editForm.notes as string}
                            onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                            placeholder="Notes"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                            <X className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                          <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={handleSaveEdit}>
                            <Check className="h-3 w-3 mr-1" /> {saving ? 'Saving…' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // ── Item row ──────────────────────────────────────
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          item.status === 'completed'
                            ? 'border-green-200 bg-green-50/50'
                            : item.status === 'not_applicable'
                            ? 'border-slate-200 bg-slate-50 opacity-60'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        {/* Status toggle button */}
                        <button
                          onClick={() => cycleStatus(item)}
                          disabled={!canEdit}
                          title="Click to cycle status"
                          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            item.status === 'completed'
                              ? 'bg-green-500 border-green-500 text-white'
                              : item.status === 'not_applicable'
                              ? 'bg-amber-400 border-amber-400 text-white'
                              : 'border-slate-300 hover:border-slate-500'
                          } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          {item.status === 'completed' && <Check className="h-3 w-3" />}
                          {item.status === 'not_applicable' && <span className="text-[9px] font-bold leading-none">N/A</span>}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${item.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {item.title}
                            </span>
                            {item.ai_generated && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-medium flex-shrink-0">
                                <Sparkles className="h-2.5 w-2.5" /> AI
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                            {item.due_date && (
                              <span>Due: {new Date(item.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            )}
                            {item.assigned_to && (
                              <span>👤 {item.assigned_to.first_name} {item.assigned_to.last_name}</span>
                            )}
                            {item.notes && (
                              <span className="text-slate-500 italic">📝 {item.notes}</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        {canEdit && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEdit(item)}
                              className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              disabled={deletingId === item.id}
                              className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
