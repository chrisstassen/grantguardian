'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Pencil, Trash2, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react'

const CATEGORIES = ['Personnel', 'Travel', 'Equipment', 'Supplies', 'Contractual', 'Other']

interface BudgetLineItem {
  id: string
  grant_id: string
  category: string
  description: string | null
  budgeted_amount: number
  notes: string | null
  created_at: string
}

interface BudgetTabProps {
  grantId: string
  expenses: any[]          // passed from parent — already loaded (used for total spend only)
  awardAmount: number | null
  totalProjectCost: number | null
  canEdit: boolean
}

const emptyForm = { category: '', description: '', budgeted_amount: '', notes: '' }

export function BudgetTab({ grantId, expenses, awardAmount, totalProjectCost, canEdit }: BudgetTabProps) {
  const [items, setItems] = useState<BudgetLineItem[]>([])
  const [allocations, setAllocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<BudgetLineItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<BudgetLineItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ ...emptyForm })

  // ── Load budget line items ──────────────────────────────────────────────

  const load = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const [itemsRes, allocRes] = await Promise.all([
      fetch(`/api/user/budget-items?grantId=${grantId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      }),
      fetch(`/api/user/expense-allocations?grantId=${grantId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
    ])

    if (itemsRes.ok) {
      const data = await itemsRes.json()
      setItems(data.items || [])
    }
    if (allocRes.ok) {
      const data = await allocRes.json()
      setAllocations(data.allocations || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [grantId])

  // ── Spending per budget line item (from allocations) ───────────────────

  const spentByLineItem: Record<string, number> = {}
  for (const alloc of allocations) {
    const id = alloc.budget_line_item_id
    spentByLineItem[id] = (spentByLineItem[id] || 0) + (parseFloat(alloc.allocated_amount) || 0)
  }

  // ── Totals ──────────────────────────────────────────────────────────────

  const totalBudgeted = items.reduce((s, i) => s + i.budgeted_amount, 0)
  const totalSpent = items.reduce((s, i) => s + (spentByLineItem[i.id] || 0), 0)
  const totalRemaining = totalBudgeted - totalSpent
  const unallocated = (totalProjectCost ?? awardAmount ?? 0) - totalBudgeted

  // ── Dialog helpers ──────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingItem(null)
    setFormData({ ...emptyForm })
    setDialogOpen(true)
  }

  const openEdit = (item: BudgetLineItem) => {
    setEditingItem(item)
    setFormData({
      category: item.category,
      description: item.description || '',
      budgeted_amount: String(item.budgeted_amount),
      notes: item.notes || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.category || !formData.budgeted_amount) return
    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    const url = editingItem
      ? `/api/user/budget-items/${editingItem.id}`
      : '/api/user/budget-items'
    const method = editingItem ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...formData, grant_id: grantId }),
    })

    setSaving(false)
    if (res.ok) {
      setDialogOpen(false)
      load()
    } else {
      const data = await res.json()
      alert('Error saving: ' + data.error)
    }
  }

  const handleDelete = async () => {
    if (!deleteItem) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await fetch(`/api/user/budget-items/${deleteItem.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setDeleteItem(null)
    load()
  }

  // ── Formatting ──────────────────────────────────────────────────────────

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

  const pct = (spent: number, budgeted: number) =>
    budgeted > 0 ? Math.min((spent / budgeted) * 100, 100) : 0

  const barColor = (spent: number, budgeted: number) => {
    const p = budgeted > 0 ? (spent / budgeted) * 100 : 0
    if (p > 100) return 'bg-red-500'
    if (p > 85) return 'bg-orange-400'
    if (p > 60) return 'bg-amber-400'
    return 'bg-emerald-500'
  }

  const overBudgetItems = items.filter(i => (spentByLineItem[i.id] || 0) > i.budgeted_amount)

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Loading budget…</div>
  }

  return (
    <div className="space-y-6">

      {/* ── Summary cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Budget', value: fmt(totalBudgeted), sub: totalProjectCost ? `of ${fmt(totalProjectCost)} project cost` : awardAmount ? `of ${fmt(awardAmount)} awarded` : null, color: 'text-slate-800' },
          { label: 'Total Spent', value: fmt(totalSpent), sub: `${totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0}% of budget`, color: totalSpent > totalBudgeted ? 'text-red-600' : 'text-slate-800' },
          { label: 'Remaining', value: fmt(totalRemaining), sub: 'budget balance', color: totalRemaining < 0 ? 'text-red-600' : 'text-emerald-600' },
          { label: 'Unallocated', value: fmt(unallocated), sub: 'project cost not budgeted', color: unallocated < 0 ? 'text-red-600' : unallocated > 0 ? 'text-amber-600' : 'text-slate-800' },
        ].map(card => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
            {card.sub && <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Over-budget alert ─────────────────────────────────────────── */}
      {overBudgetItems.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">
            <span className="font-semibold">{overBudgetItems.length} line item{overBudgetItems.length > 1 ? 's' : ''} over budget:</span>{' '}
            {overBudgetItems.map(i => i.category).join(', ')}
          </p>
        </div>
      )}

      {/* ── Line items header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">
          Budget Line Items
          {items.length > 0 && <span className="ml-2 text-sm font-normal text-slate-500">({items.length})</span>}
        </h3>
        {canEdit && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add Line Item
          </Button>
        )}
      </div>

      {/* ── Line items list ───────────────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <DollarSign className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No budget line items yet</p>
          <p className="text-sm text-slate-400 mt-1">Add line items to track spending against your budget</p>
          {canEdit && (
            <Button size="sm" className="mt-4" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" /> Add First Line Item
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const spent = spentByLineItem[item.id] || 0
            const remaining = item.budgeted_amount - spent
            const percentage = pct(spent, item.budgeted_amount)
            const isOver = spent > item.budgeted_amount

            return (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-medium">{item.category}</Badge>
                      {isOver && (
                        <Badge className="text-xs bg-red-100 text-red-700 border-red-200 border">Over Budget</Badge>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-slate-700 mt-1 font-medium">{item.description}</p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-slate-500 mt-0.5">{item.notes}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{fmt(item.budgeted_amount)}</p>
                    <p className="text-xs text-slate-400">budgeted</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteItem(item)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {fmt(spent)} spent
                    </span>
                    <span className={isOver ? 'text-red-600 font-semibold' : remaining === 0 ? 'text-slate-500' : 'text-emerald-600'}>
                      {isOver ? `${fmt(Math.abs(remaining))} over` : `${fmt(remaining)} remaining`}
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(spent, item.budgeted_amount)}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 text-right">{Math.round(percentage)}% used</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Grand total row ───────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 px-1">
          <span className="text-sm font-semibold text-slate-700">Total</span>
          <div className="flex gap-8 text-sm">
            <span className="text-slate-500">Budgeted: <span className="font-semibold text-slate-800">{fmt(totalBudgeted)}</span></span>
            <span className="text-slate-500">Spent: <span className={`font-semibold ${totalSpent > totalBudgeted ? 'text-red-600' : 'text-slate-800'}`}>{fmt(totalSpent)}</span></span>
            <span className="text-slate-500">Remaining: <span className={`font-semibold ${totalRemaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(totalRemaining)}</span></span>
          </div>
        </div>
      )}

      {/* ── Add/Edit dialog ───────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Line Item' : 'Add Budget Line Item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update this budget line item.' : 'Define a budget category and amount.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Salary for program coordinator"
              />
            </div>
            <div className="space-y-2">
              <Label>Budgeted Amount ($) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.budgeted_amount}
                onChange={e => setFormData({ ...formData, budgeted_amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes / Justification</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Budget justification or narrative…"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formData.category || !formData.budgeted_amount}
              >
                {saving ? 'Saving…' : editingItem ? 'Save Changes' : 'Add Line Item'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={open => !open && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Line Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the <strong>{deleteItem?.category}</strong> budget line item. Expenses already logged won't be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
