'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Download, Trash2, Upload, Plus, Link2, AlertTriangle } from 'lucide-react'

const EXPENSE_CATEGORIES = ['Personnel', 'Travel', 'Equipment', 'Supplies', 'Contractual', 'Other']

interface Allocation {
  id?: string
  budget_line_item_id: string
  amount: string
}

interface ExpenseDetailDialogProps {
  expense: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onExpenseUpdated: () => void
  userRole: string
  grantId: string
}

const emptyEditForm = {
  expense_date: '',
  vendor: '',
  invoice_number: '',
  description: '',
  amount: '',
  category: '',
}

// ── EditForm lives outside the parent to avoid re-mounts that would lose focus ──

interface EditFormProps {
  initialData: typeof emptyEditForm
  onFormDataChange: (data: typeof emptyEditForm) => void
  budgetLineItems: any[]
  allocations: Allocation[]
  onAddAllocation: () => void
  onRemoveAllocation: (idx: number) => void
  onUpdateAllocation: (idx: number, field: 'budget_line_item_id' | 'amount', value: string) => void
  saving: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}

function EditForm({
  initialData, onFormDataChange,
  budgetLineItems, allocations,
  onAddAllocation, onRemoveAllocation, onUpdateAllocation,
  saving, onSubmit, onCancel,
}: EditFormProps) {
  const [formData, setFormData] = useState(initialData)

  useEffect(() => {
    setFormData(initialData)
  }, [initialData])

  const handleChange = (newData: typeof emptyEditForm) => {
    setFormData(newData)
    onFormDataChange(newData)
  }

  const expenseAmount = parseFloat(formData.amount) || 0
  const totalAllocated = allocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
  const allocationDiff = expenseAmount > 0 ? Math.abs(expenseAmount - totalAllocated) : 0
  const allocationMismatch = allocations.length > 0 && expenseAmount > 0 && allocationDiff > 0.01

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date *</Label>
          <Input
            type="date"
            value={formData.expense_date}
            onChange={e => handleChange({ ...formData, expense_date: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Invoice / Receipt #</Label>
          <Input
            value={formData.invoice_number}
            placeholder="e.g., INV-2024-001"
            onChange={e => handleChange({ ...formData, invoice_number: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Vendor / Payee *</Label>
          <Input
            value={formData.vendor}
            placeholder="e.g., Office Depot"
            onChange={e => handleChange({ ...formData, vendor: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Amount ($) *</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.amount}
            placeholder="0.00"
            onChange={e => handleChange({ ...formData, amount: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Category *</Label>
        <select
          value={formData.category}
          onChange={e => handleChange({ ...formData, category: e.target.value })}
          required
          className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="" disabled>Select a category…</option>
          {EXPENSE_CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>Description *</Label>
        <Textarea
          value={formData.description}
          placeholder="Describe the items or services purchased"
          rows={2}
          onChange={e => handleChange({ ...formData, description: e.target.value })}
          required
        />
      </div>

      {/* Budget Allocations */}
      {budgetLineItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Budget Line Allocations
              <span className="text-slate-400 font-normal text-xs">(optional)</span>
            </Label>
            {allocations.length < budgetLineItems.length && (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onAddAllocation}>
                <Plus className="h-3 w-3 mr-1" /> Add Line
              </Button>
            )}
          </div>

          {allocations.length === 0 ? (
            <button
              type="button"
              onClick={onAddAllocation}
              className="w-full py-3 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
            >
              + Allocate this expense to budget line items
            </button>
          ) : (
            <div className="space-y-2">
              {allocations.map((alloc, idx) => {
                const usedIds = allocations.filter((_, i) => i !== idx).map(a => a.budget_line_item_id)
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={alloc.budget_line_item_id}
                      onChange={e => onUpdateAllocation(idx, 'budget_line_item_id', e.target.value)}
                      className="flex-1 h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      {budgetLineItems
                        .filter(b => !usedIds.includes(b.id) || b.id === alloc.budget_line_item_id)
                        .map(b => (
                          <option key={b.id} value={b.id}>
                            {b.category}{b.description ? ` — ${b.description}` : ''}
                          </option>
                        ))}
                    </select>
                    <div className="relative w-32">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={alloc.amount}
                        placeholder="0.00"
                        onChange={e => onUpdateAllocation(idx, 'amount', e.target.value)}
                        className="pl-6"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => onRemoveAllocation(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
              {allocations.length > 0 && expenseAmount > 0 && (
                <div className={`flex items-center justify-between text-xs px-1 ${allocationMismatch ? 'text-amber-600' : 'text-slate-500'}`}>
                  <span>Allocated: ${totalAllocated.toFixed(2)} of ${expenseAmount.toFixed(2)}</span>
                  {allocationMismatch && (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />${allocationDiff.toFixed(2)} unallocated
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}

// ── Main dialog ────────────────────────────────────────────────────────────────

export function ExpenseDetailDialog({
  expense,
  open,
  onOpenChange,
  onExpenseUpdated,
  userRole,
  grantId,
}: ExpenseDetailDialogProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [documents, setDocuments] = useState<any[]>([])
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [budgetLineItems, setBudgetLineItems] = useState<any[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loadingAllocations, setLoadingAllocations] = useState(false)

  // Current form data tracked via ref to avoid re-renders while typing
  const formDataRef = useRef<typeof emptyEditForm>(buildInitialData(expense))
  const [initialData, setInitialData] = useState<typeof emptyEditForm>(buildInitialData(expense))

  function buildInitialData(exp: any): typeof emptyEditForm {
    return {
      expense_date: exp?.expense_date || '',
      vendor: exp?.vendor || '',
      invoice_number: exp?.invoice_number || '',
      description: exp?.description || '',
      amount: exp?.amount?.toString() || '',
      category: exp?.category || '',
    }
  }

  useEffect(() => {
    if (!open) return
    const fresh = buildInitialData(expense)
    formDataRef.current = fresh
    setInitialData(fresh)
    setIsEditing(false)
    loadDocuments()
    loadAllocationsAndBudget()
  }, [open, expense])

  const loadDocuments = async () => {
    const { data } = await supabase
      .from('expense_documents')
      .select('*')
      .eq('expense_id', expense.id)
      .order('created_at', { ascending: false })
    if (data) setDocuments(data)
  }

  const loadAllocationsAndBudget = async () => {
    setLoadingAllocations(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoadingAllocations(false); return }

    // Load budget line items + existing allocations in parallel
    const [budgetRes, allocRes] = await Promise.all([
      fetch(`/api/user/budget-items?grantId=${grantId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      }),
      fetch(`/api/user/expense-allocations?grantId=${grantId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      }),
    ])

    if (budgetRes.ok) {
      const data = await budgetRes.json()
      setBudgetLineItems(data.items || [])
    }

    if (allocRes.ok) {
      const data = await allocRes.json()
      // Filter to just this expense's allocations and map to editable format
      const mine: Allocation[] = (data.allocations || [])
        .filter((a: any) => a.expense_id === expense.id)
        .map((a: any) => ({
          id: a.id,
          budget_line_item_id: a.budget_line_item_id,
          amount: parseFloat(a.allocated_amount).toFixed(2),
        }))
      setAllocations(mine)
    }

    setLoadingAllocations(false)
  }

  const handleFormDataChange = (data: typeof emptyEditForm) => {
    formDataRef.current = data
  }

  // Allocation helpers
  const addAllocation = () => {
    const usedIds = allocations.map(a => a.budget_line_item_id)
    const available = budgetLineItems.find(b => !usedIds.includes(b.id))
    if (available) setAllocations([...allocations, { budget_line_item_id: available.id, amount: '' }])
  }
  const removeAllocation = (idx: number) => setAllocations(allocations.filter((_, i) => i !== idx))
  const updateAllocation = (idx: number, field: 'budget_line_item_id' | 'amount', value: string) => {
    const updated = [...allocations]
    updated[idx] = { ...updated[idx], [field]: value }
    setAllocations(updated)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const formData = formDataRef.current

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    const res = await fetch(`/api/user/expenses/${expense.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        expense_date: formData.expense_date,
        vendor: formData.vendor,
        invoice_number: formData.invoice_number || null,
        description: formData.description || null,
        amount: formData.amount,
        category: formData.category || null,
        allocations: allocations.filter(a => parseFloat(a.amount) > 0),
      }),
    })

    setSaving(false)

    if (!res.ok) {
      const data = await res.json()
      alert('Error updating expense: ' + (data.error || 'Unknown error'))
    } else {
      setIsEditing(false)
      onExpenseUpdated()
    }
  }

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage
      .from('expense-documents')
      .download(doc.file_path)

    if (error) { alert('Error downloading file: ' + error.message); return }

    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDeleteDocument = async (doc: any) => {
    if (!confirm(`Delete ${doc.file_name}?`)) return

    const { error: storageError } = await supabase.storage
      .from('expense-documents')
      .remove([doc.file_path])

    if (storageError) { alert('Error deleting file: ' + storageError.message); return }

    const { error: dbError } = await supabase
      .from('expense_documents')
      .delete()
      .eq('id', doc.id)

    if (dbError) {
      alert('Error deleting document record: ' + dbError.message)
    } else {
      loadDocuments()
      onExpenseUpdated()
    }
  }

  const handleAddDocuments = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingDocs(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    for (const file of Array.from(files)) {
      const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filePath = `${expense.id}_${Date.now()}_${fileName}`
      const { error: uploadError } = await supabase.storage
        .from('expense-documents')
        .upload(filePath, file)

      if (!uploadError) {
        await supabase.from('expense_documents').insert([{
          expense_id: expense.id,
          uploaded_by_user_id: user.id,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
        }])
      }
    }

    setUploadingDocs(false)
    loadDocuments()
    onExpenseUpdated()
  }

  const handleDeleteExpense = async () => {
    if (!confirm('Delete this expense? This cannot be undone.')) return
    setDeleting(true)

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expense.id)

    if (error) {
      alert('Error deleting expense: ' + error.message)
      setDeleting(false)
    } else {
      onOpenChange(false)
      onExpenseUpdated()
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const canEdit = userRole !== 'viewer'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Expense' : 'Expense Details'}</DialogTitle>
          <DialogDescription>
            {formatDate(expense.expense_date)} • {expense.vendor}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          <EditForm
            initialData={initialData}
            onFormDataChange={handleFormDataChange}
            budgetLineItems={budgetLineItems}
            allocations={allocations}
            onAddAllocation={addAllocation}
            onRemoveAllocation={removeAllocation}
            onUpdateAllocation={updateAllocation}
            saving={saving}
            onSubmit={handleUpdate}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Amount</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(expense.amount)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Date</p>
                <p className="text-lg text-slate-900 mt-1">{formatDate(expense.expense_date)}</p>
              </div>
              {expense.invoice_number && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Invoice #</p>
                  <p className="text-sm text-slate-900 mt-1">{expense.invoice_number}</p>
                </div>
              )}
              {expense.vendor && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Vendor</p>
                  <p className="text-sm text-slate-900 mt-1">{expense.vendor}</p>
                </div>
              )}
              {expense.category && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Category</p>
                  <p className="text-sm text-slate-900 mt-1">{expense.category}</p>
                </div>
              )}
            </div>

            {expense.description && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-slate-900">{expense.description}</p>
              </div>
            )}

            {/* Budget Allocations (view mode) */}
            {!loadingAllocations && allocations.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  Budget Allocations
                </p>
                <div className="space-y-1">
                  {allocations.map((alloc, idx) => {
                    const lineItem = budgetLineItems.find(b => b.id === alloc.budget_line_item_id)
                    return (
                      <div key={idx} className="flex items-center justify-between py-1.5 px-3 bg-slate-50 rounded text-sm">
                        <span className="text-slate-700">
                          {lineItem ? `${lineItem.category}${lineItem.description ? ` — ${lineItem.description}` : ''}` : alloc.budget_line_item_id}
                        </span>
                        <span className="font-medium text-slate-900">{formatCurrency(parseFloat(alloc.amount))}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Documents */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Supporting Documents ({documents.length})
                </p>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => document.getElementById('add-docs-input')?.click()}
                    disabled={uploadingDocs}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingDocs ? 'Uploading…' : 'Add Documents'}
                  </Button>
                )}
                <input
                  id="add-docs-input"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="hidden"
                  onChange={e => handleAddDocuments(e.target.files)}
                />
              </div>

              {documents.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No documents attached</p>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{doc.file_name}</p>
                        <p className="text-xs text-slate-500">
                          {(doc.file_size / 1024).toFixed(1)} KB • {formatDate(doc.created_at)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleDownload(doc)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteDocument(doc)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer actions */}
            {canEdit ? (
              <div className="flex justify-between pt-4 border-t">
                <Button variant="destructive" onClick={handleDeleteExpense} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete Expense'}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                  <Button onClick={() => setIsEditing(true)}>Edit Expense</Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
