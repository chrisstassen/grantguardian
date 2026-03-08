'use client'

import { useState, useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Download, Trash2, Upload } from 'lucide-react'

interface ExpenseDetailDialogProps {
  expense: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onExpenseUpdated: () => void
  userRole: string
}

export function ExpenseDetailDialog({ 
  expense, 
  open, 
  onOpenChange, 
  onExpenseUpdated,
  userRole 
}: ExpenseDetailDialogProps) {
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [documents, setDocuments] = useState<any[]>([])
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  const [formData, setFormData] = useState({
    expense_date: expense.expense_date,
    vendor: expense.vendor,
    description: expense.description || '',
    amount: expense.amount?.toString() || '',
    category: expense.category || ''
  })

  useEffect(() => {
    if (open) {
      loadDocuments()
      setFormData({
        expense_date: expense.expense_date,
        vendor: expense.vendor,
        description: expense.description || '',
        amount: expense.amount?.toString() || '',
        category: expense.category || ''
      })
    }
  }, [open, expense])

  const loadDocuments = async () => {
    const { data } = await supabase
      .from('expense_documents')
      .select('*')
      .eq('expense_id', expense.id)
      .order('created_at', { ascending: false })

    if (data) {
      setDocuments(data)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('expenses')
      .update({
        expense_date: formData.expense_date,
        vendor: formData.vendor,
        description: formData.description || null,
        amount: parseFloat(formData.amount),
        category: formData.category || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', expense.id)

    setLoading(false)

    if (error) {
      alert('Error updating expense: ' + error.message)
    } else {
      setIsEditing(false)
      onExpenseUpdated()
      // DO NOT call onOpenChange(false) here - keep dialog open
    }
  }

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage
      .from('expense-documents')
      .download(doc.file_path)

    if (error) {
      alert('Error downloading file: ' + error.message)
      return
    }

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

    if (storageError) {
      alert('Error deleting file from storage: ' + storageError.message)
      return
    }

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

      if (uploadError) {
        console.error('Error uploading file:', uploadError)
        continue
      }

      await supabase.from('expense_documents').insert([
        {
          expense_id: expense.id,
          uploaded_by_user_id: user.id,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type
        }
      ])
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const canEdit = userRole !== 'viewer'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Expense' : 'Expense Details'}
          </DialogTitle>
          <DialogDescription>
            {formatDate(expense.expense_date)} • {expense.vendor}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="expense_date">Date *</Label>
              <Input
                id="expense_date"
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor/Payee *</Label>
              <Input
                id="vendor"
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Personnel">Personnel</SelectItem>
                  <SelectItem value="Travel">Travel</SelectItem>
                  <SelectItem value="Equipment">Equipment</SelectItem>
                  <SelectItem value="Supplies">Supplies</SelectItem>
                  <SelectItem value="Contractual">Contractual</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-slate-600">Amount</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {formatCurrency(expense.amount)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">Category</p>
                <p className="text-lg text-slate-900 mt-1">
                  {expense.category || 'Not specified'}
                </p>
              </div>
            </div>

            {expense.description && (
              <div>
                <p className="text-sm font-medium text-slate-600">Description</p>
                <p className="text-slate-900 mt-1">{expense.description}</p>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium text-slate-600">
                  Supporting Documents ({documents.length})
                </h3>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => document.getElementById('add-docs-input')?.click()}
                    disabled={uploadingDocs}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingDocs ? 'Uploading...' : 'Add Documents'}
                  </Button>
                )}
                <input
                  id="add-docs-input"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="hidden"
                  onChange={(e) => handleAddDocuments(e.target.files)}
                />
              </div>

              {documents.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No documents attached
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteDocument(doc)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canEdit && (
              <div className="flex justify-between pt-4 border-t">
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteExpense}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Expense'}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                  <Button onClick={() => setIsEditing(true)}>
                    Edit Expense
                  </Button>
                </div>
              </div>
            )}
            {!canEdit && (
              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}