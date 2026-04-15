'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { FileText, Sparkles, Upload, AlertTriangle, AlertCircle, Plus, Trash2, Link2 } from 'lucide-react'

interface AddExpenseChoiceDialogProps {
  grantId: string
  onExpenseAdded: () => void
}

interface Allocation {
  budget_line_item_id: string
  amount: string
}

const emptyForm = {
  expense_date: new Date().toISOString().split('T')[0],
  vendor: '',
  invoice_number: '',
  description: '',
  amount: '',
}

export function AddExpenseChoiceDialog({ grantId, onExpenseAdded }: AddExpenseChoiceDialogProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'choice' | 'manual' | 'ai'>('choice')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [extractedData, setExtractedData] = useState<any>(null)
  const [extracting, setExtracting] = useState(false)
  const [formData, setFormData] = useState({ ...emptyForm })
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [eligibilityIssues, setEligibilityIssues] = useState<any[] | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [duplicateExisting, setDuplicateExisting] = useState<any | null>(null)

  // Budget allocation state
  const [budgetLineItems, setBudgetLineItems] = useState<any[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])

  // ── Load budget line items when dialog opens ──────────────────────────

  useEffect(() => {
    if (!open) return
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/user/budget-items?grantId=${grantId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setBudgetLineItems(data.items || [])
      }
    }
    load()
  }, [open, grantId])

  // ── Reset ─────────────────────────────────────────────────────────────

  const handleReset = () => {
    setMode('choice')
    setUploadedFile(null)
    setExtractedData(null)
    setEligibilityIssues(null)
    setDuplicateWarning(null)
    setDuplicateExisting(null)
    setFormData({ ...emptyForm })
    setSelectedFiles([])
    setAllocations([])
  }

  // ── Allocation helpers ────────────────────────────────────────────────

  const addAllocation = () => {
    const usedIds = allocations.map(a => a.budget_line_item_id)
    const available = budgetLineItems.find(b => !usedIds.includes(b.id))
    if (available) {
      setAllocations([...allocations, { budget_line_item_id: available.id, amount: '' }])
    }
  }

  const removeAllocation = (idx: number) => {
    setAllocations(allocations.filter((_, i) => i !== idx))
  }

  const updateAllocation = (idx: number, field: 'budget_line_item_id' | 'amount', value: string) => {
    const updated = [...allocations]
    updated[idx] = { ...updated[idx], [field]: value }
    setAllocations(updated)
  }

  const totalAllocated = allocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
  const expenseAmount = parseFloat(formData.amount) || 0
  const allocationDiff = expenseAmount > 0 ? Math.abs(expenseAmount - totalAllocated) : 0
  const allocationMismatch = allocations.length > 0 && expenseAmount > 0 && allocationDiff > 0.01

  // ── AI extraction ─────────────────────────────────────────────────────

  const handleExtractFromDocument = async (file: File) => {
    setExtracting(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const response = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_data: base64, media_type: file.type || 'application/pdf' })
      })

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      const extracted = data.extracted
      if (extracted) {
        setFormData({
          vendor: extracted.vendor || '',
          invoice_number: extracted.invoice_number || '',
          amount: extracted.amount?.toString() || '',
          expense_date: extracted.date || new Date().toISOString().split('T')[0],
          description: extracted.description || '',
        })
        setExtractedData(extracted)
        setUploadedFile(file)
        setSelectedFiles([file])
      }
    } catch (error) {
      console.error('Extraction error:', error)
      alert('Could not extract data from document. Please try manual entry.')
    } finally {
      setExtracting(false)
    }
  }

  // ── Eligibility check → save pipeline ────────────────────────────────

  const checkEligibilityThenSave = async () => {
    setChecking(true)
    setEligibilityIssues(null)
    setDuplicateWarning(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setChecking(false); return }

      const res = await fetch('/api/compliance/check-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          grantId,
          vendor: formData.vendor,
          description: formData.description,
          amount: formData.amount,
          expenseDate: formData.expense_date
        })
      })

      const data = await res.json()
      const issues = data.issues || []

      if (issues.length > 0) {
        setEligibilityIssues(issues)
      } else {
        await handleSaveExpense(false)
      }
    } catch {
      await handleSaveExpense(false)
    } finally {
      setChecking(false)
    }
  }

  // ── Save expense ──────────────────────────────────────────────────────

  const handleSaveExpense = async (forceSave = false) => {
    setSaving(true)
    setDuplicateWarning(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    const res = await fetch('/api/user/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        grant_id: grantId,
        expense_date: formData.expense_date,
        vendor: formData.vendor,
        invoice_number: formData.invoice_number || null,
        description: formData.description || null,
        amount: formData.amount,
        allocations: allocations.filter(a => parseFloat(a.amount) > 0),
        force_save: forceSave,
      })
    })

    const data = await res.json()

    if (res.status === 409 && data.duplicate) {
      setDuplicateWarning(data.message)
      setDuplicateExisting(data.existing)
      setSaving(false)
      return
    }

    if (!res.ok) {
      alert('Error saving expense: ' + (data.error || 'Unknown error'))
      setSaving(false)
      return
    }

    const expense = data.expense

    // Upload documents (still client-side via Supabase storage)
    if (selectedFiles.length > 0) {
      const { data: { user } } = await supabase.auth.getUser()
      for (const file of selectedFiles) {
        const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const filePath = `${expense.id}_${Date.now()}_${fileName}`
        const { error: uploadError } = await supabase.storage
          .from('expense-documents')
          .upload(filePath, file)
        if (!uploadError) {
          await supabase.from('expense_documents').insert([{
            expense_id: expense.id,
            uploaded_by_user_id: user?.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type,
          }])
        }
      }
    }

    setSaving(false)
    setOpen(false)
    handleReset()
    onExpenseAdded()
  }

  // ── Shared expense form ───────────────────────────────────────────────

  const ExpenseForm = ({ isAI }: { isAI: boolean }) => (
    <form onSubmit={(e) => { e.preventDefault(); checkEligibilityThenSave() }} className="space-y-4">
      {isAI && extractedData && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-900">✨ Data extracted successfully — review before saving</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date *</Label>
          <Input type="date" value={formData.expense_date}
            onChange={e => setFormData({ ...formData, expense_date: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label>Invoice / Receipt #</Label>
          <Input value={formData.invoice_number} placeholder="e.g., INV-2024-001"
            onChange={e => setFormData({ ...formData, invoice_number: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Vendor / Payee *</Label>
          <Input value={formData.vendor} placeholder="e.g., Office Depot"
            onChange={e => setFormData({ ...formData, vendor: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label>Amount ($) *</Label>
          <Input type="number" step="0.01" value={formData.amount} placeholder="0.00"
            onChange={e => setFormData({ ...formData, amount: e.target.value })} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={formData.description} placeholder="Optional notes about this expense" rows={2}
          onChange={e => setFormData({ ...formData, description: e.target.value })} />
      </div>

      {/* ── Budget Allocations ── */}
      {budgetLineItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Budget Line Allocations
              <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            {allocations.length < budgetLineItems.length && (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addAllocation}>
                <Plus className="h-3 w-3 mr-1" /> Add Line
              </Button>
            )}
          </div>

          {allocations.length === 0 ? (
            <button type="button" onClick={addAllocation}
              className="w-full py-3 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
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
                      onChange={e => updateAllocation(idx, 'budget_line_item_id', e.target.value)}
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
                        type="number" step="0.01" min="0"
                        value={alloc.amount} placeholder="0.00"
                        onChange={e => updateAllocation(idx, 'amount', e.target.value)}
                        className="pl-6"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => removeAllocation(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}

              {/* Allocation total vs expense amount */}
              {allocations.length > 0 && expenseAmount > 0 && (
                <div className={`flex items-center justify-between text-xs px-1 ${allocationMismatch ? 'text-amber-600' : 'text-slate-500'}`}>
                  <span>Allocated: ${totalAllocated.toFixed(2)} of ${expenseAmount.toFixed(2)}</span>
                  {allocationMismatch && (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      ${allocationDiff.toFixed(2)} unallocated
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Duplicate warning */}
      {duplicateWarning && (
        <DuplicateWarning
          message={duplicateWarning}
          onProceed={() => handleSaveExpense(true)}
          onCancel={() => { setDuplicateWarning(null); setDuplicateExisting(null) }}
          saving={saving}
        />
      )}

      {/* Eligibility issues */}
      {eligibilityIssues && eligibilityIssues.length > 0 && (
        <EligibilityWarning
          issues={eligibilityIssues}
          onSaveAnyway={() => handleSaveExpense(false)}
          onGoBack={() => setEligibilityIssues(null)}
          saving={saving}
        />
      )}

      {/* Document upload for manual mode */}
      {!isAI && (
        <div className="space-y-2">
          <Label>Supporting Documents (Optional)</Label>
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple
            onChange={e => setSelectedFiles(Array.from(e.target.files || []))} />
          {selectedFiles.length > 0 && (
            <p className="text-xs text-slate-500">{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected</p>
          )}
        </div>
      )}

      {isAI && uploadedFile && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-sm text-slate-600">
          📄 {uploadedFile.name}
        </div>
      )}

      {!duplicateWarning && !eligibilityIssues && (
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={handleReset}>
            {isAI ? 'Start Over' : 'Back'}
          </Button>
          <Button type="submit" disabled={saving || checking}>
            {checking ? <><Sparkles className="h-4 w-4 mr-2 animate-pulse" />Checking…</>
              : saving ? 'Saving…' : 'Save Expense'}
          </Button>
        </div>
      )}
    </form>
  )

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) handleReset() }}>
      <DialogTrigger asChild>
        <Button>+ Add Expense</Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>Choose how you'd like to add this expense</DialogDescription>
        </DialogHeader>

        {/* Choice screen */}
        {mode === 'choice' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-6">
            <button onClick={() => setMode('ai')}
              className="p-6 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200">
                  <Sparkles className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-lg">AI Extraction</h3>
              </div>
              <p className="text-sm text-slate-600">Upload an invoice or receipt and let AI automatically extract the details</p>
              <div className="mt-3 text-xs text-blue-600 font-medium">✨ Powered by Claude AI</div>
            </button>

            <button onClick={() => setMode('manual')}
              className="p-6 border-2 border-slate-200 rounded-lg hover:border-slate-400 hover:bg-slate-50 transition-all text-left">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <FileText className="h-6 w-6 text-slate-600" />
                </div>
                <h3 className="font-semibold text-lg">Manual Entry</h3>
              </div>
              <p className="text-sm text-slate-600">Enter expense details manually using a form</p>
            </button>
          </div>
        )}

        {/* AI upload screen */}
        {mode === 'ai' && !extractedData && (
          <div className="py-6">
            <p className="text-sm text-slate-600 mb-4">
              Upload an invoice or receipt. AI will extract vendor, invoice number, amount, date, and description.
            </p>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <Upload className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700 mb-2">Drop your invoice here or click to browse</p>
              <p className="text-xs text-slate-500 mb-4">Supports PDF, JPG, PNG</p>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleExtractFromDocument(f) }}
                disabled={extracting} className="max-w-xs mx-auto" />
            </div>
            {extracting && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center animate-pulse">
                <Sparkles className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-blue-900">Analyzing document with AI…</p>
              </div>
            )}
            <div className="flex justify-end mt-6">
              <Button variant="outline" onClick={handleReset} disabled={extracting}>Back</Button>
            </div>
          </div>
        )}

        {/* AI review form */}
        {mode === 'ai' && extractedData && (
          <div className="py-4"><ExpenseForm isAI={true} /></div>
        )}

        {/* Manual form */}
        {mode === 'manual' && (
          <div className="py-4"><ExpenseForm isAI={false} /></div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Duplicate Warning ──────────────────────────────────────────────────────

function DuplicateWarning({ message, onProceed, onCancel, saving }: {
  message: string; onProceed: () => void; onCancel: () => void; saving: boolean
}) {
  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-300">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm text-amber-900">Possible duplicate expense</p>
          <p className="text-sm text-amber-800 mt-1">{message}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={onProceed} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white">
          {saving ? 'Saving…' : 'Save Anyway'}
        </Button>
      </div>
    </div>
  )
}

// ── Eligibility Warning ────────────────────────────────────────────────────

interface EligibilityWarningProps {
  issues: { title: string; description: string; severity: string }[]
  onSaveAnyway: () => void
  onGoBack: () => void
  saving: boolean
}

function EligibilityWarning({ issues, onSaveAnyway, onGoBack, saving }: EligibilityWarningProps) {
  const hasCritical = issues.some(i => i.severity === 'critical')
  const hasHigh = issues.some(i => i.severity === 'high')

  const severityStyle = (s: string) => {
    if (s === 'critical') return 'bg-red-50 border-red-200 text-red-800'
    if (s === 'high') return 'bg-orange-50 border-orange-200 text-orange-800'
    if (s === 'medium') return 'bg-amber-50 border-amber-200 text-amber-800'
    return 'bg-slate-50 border-slate-200 text-slate-700'
  }

  return (
    <div className="mt-4 space-y-3">
      <div className={`p-4 rounded-lg border ${hasCritical ? 'bg-red-50 border-red-300' : hasHigh ? 'bg-orange-50 border-orange-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className={`h-5 w-5 ${hasCritical ? 'text-red-600' : hasHigh ? 'text-orange-600' : 'text-amber-600'}`} />
          <p className={`font-semibold text-sm ${hasCritical ? 'text-red-900' : hasHigh ? 'text-orange-900' : 'text-amber-900'}`}>
            Potential compliance {issues.length === 1 ? 'issue' : 'issues'} detected
          </p>
        </div>
        <p className={`text-xs ${hasCritical ? 'text-red-700' : hasHigh ? 'text-orange-700' : 'text-amber-700'}`}>
          This expense may conflict with one or more of the grant's special conditions.
        </p>
      </div>
      <div className="space-y-2">
        {issues.map((issue, idx) => (
          <div key={idx} className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${severityStyle(issue.severity)}`}>
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{issue.title}</p>
              <p className="text-xs mt-0.5 opacity-80">{issue.description}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 flex items-center gap-1">
        <Sparkles className="h-3 w-3" />AI-generated analysis — review with your grants manager before proceeding.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onGoBack} disabled={saving}>Go Back & Edit</Button>
        <Button onClick={onSaveAnyway} disabled={saving}
          className={hasCritical ? 'bg-red-600 hover:bg-red-700 text-white' : hasHigh ? 'bg-orange-600 hover:bg-orange-700 text-white' : ''}>
          {saving ? 'Saving…' : 'Save Anyway'}
        </Button>
      </div>
    </div>
  )
}
