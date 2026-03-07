'use client'

import { useState } from 'react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText, Sparkles, Upload } from 'lucide-react'

interface AddExpenseChoiceDialogProps {
  grantId: string
  onExpenseAdded: () => void
}

export function AddExpenseChoiceDialog({ grantId, onExpenseAdded }: AddExpenseChoiceDialogProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'choice' | 'manual' | 'ai'>('choice')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [extractedData, setExtractedData] = useState<any>(null)
  const [extracting, setExtracting] = useState(false)
  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '',
    description: '',
    amount: '',
    category: ''
  })
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const handleReset = () => {
    setMode('choice')
    setUploadedFile(null)
    setExtractedData(null)
    setFormData({
      expense_date: new Date().toISOString().split('T')[0],
      vendor: '',
      description: '',
      amount: '',
      category: ''
    })
    setSelectedFiles([])
  }

  const handleExtractFromDocument = async (file: File) => {
    setExtracting(true)
    
    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const mediaType = file.type || 'application/pdf'

      // Call our API route
      const response = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_data: base64,
          media_type: mediaType
        })
      })

      const data = await response.json()
      
      if (data.content && data.content[0]?.text) {
        const jsonText = data.content[0].text.trim()
        const cleanJson = jsonText.replace(/```json\n?|\n?```/g, '').trim()
        const extracted = JSON.parse(cleanJson)
        
        setFormData({
          vendor: extracted.vendor || '',
          amount: extracted.amount?.toString() || '',
          expense_date: extracted.date || new Date().toISOString().split('T')[0],
          description: extracted.description || '',
          category: extracted.category || ''
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

  const handleSaveExpense = async () => {
    setSaving(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert('You must be logged in')
      setSaving(false)
      return
    }

    // Insert expense
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert([
        {
          grant_id: grantId,
          created_by_user_id: user.id,
          expense_date: formData.expense_date,
          vendor: formData.vendor,
          description: formData.description || null,
          amount: parseFloat(formData.amount),
          category: formData.category || null
        }
      ])
      .select()
      .single()

    if (expenseError || !expense) {
      alert('Error saving expense: ' + expenseError?.message)
      setSaving(false)
      return
    }

    // Upload documents
    if (selectedFiles.length > 0) {
      for (const file of selectedFiles) {
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
    }

    setSaving(false)
    setOpen(false)
    handleReset()
    onExpenseAdded()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) handleReset()
    }}>
      <DialogTrigger asChild>
        <Button>+ Add Expense</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>
            Choose how you'd like to add this expense
          </DialogDescription>
        </DialogHeader>

        {mode === 'choice' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-6">
            <button
              onClick={() => setMode('ai')}
              className="p-6 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200">
                  <Sparkles className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-lg">AI Extraction</h3>
              </div>
              <p className="text-sm text-slate-600">
                Upload an invoice or receipt and let AI automatically extract the details
              </p>
              <div className="mt-3 text-xs text-blue-600 font-medium">
                ✨ Powered by Claude AI
              </div>
            </button>

            <button
              onClick={() => setMode('manual')}
              className="p-6 border-2 border-slate-200 rounded-lg hover:border-slate-400 hover:bg-slate-50 transition-all text-left"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <FileText className="h-6 w-6 text-slate-600" />
                </div>
                <h3 className="font-semibold text-lg">Manual Entry</h3>
              </div>
              <p className="text-sm text-slate-600">
                Enter expense details manually using a form
              </p>
            </button>
          </div>
        )}

        {mode === 'ai' && !extractedData && (
          <div className="py-6">
            <p className="text-sm text-slate-600 mb-4">
              Upload an invoice, receipt, or expense document. Our AI will extract the vendor, amount, date, and description automatically.
            </p>
            
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <Upload className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700 mb-2">
                Drop your invoice here or click to browse
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Supports PDF, JPG, PNG (max 10MB)
              </p>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleExtractFromDocument(file)
                }}
                disabled={extracting}
                className="max-w-xs mx-auto"
              />
            </div>

            {extracting && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                <div className="animate-pulse">
                  <Sparkles className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-blue-900">Analyzing document with AI...</p>
                  <p className="text-xs text-blue-700 mt-1">This may take a few seconds</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={handleReset} disabled={extracting}>
                Back
              </Button>
            </div>
          </div>
        )}

        {mode === 'ai' && extractedData && (
          <div className="py-6">
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-900">✨ Data extracted successfully!</p>
              <p className="text-xs text-green-700 mt-1">Review the information below and make any necessary adjustments</p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveExpense(); }} className="space-y-4">
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

              <div className="space-y-2">
                <Label>Attached Document</Label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded text-sm">
                  📄 {uploadedFile?.name}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleReset}>
                  Start Over
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Expense'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {mode === 'manual' && (
          <div className="py-6">
            <form onSubmit={(e) => { e.preventDefault(); handleSaveExpense(); }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="expense_date_manual">Date *</Label>
                <Input
                  id="expense_date_manual"
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor_manual">Vendor/Payee *</Label>
                <Input
                  id="vendor_manual"
                  value={formData.vendor}
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                  placeholder="e.g., Office Depot, John Smith"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount_manual">Amount ($) *</Label>
                <Input
                  id="amount_manual"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="e.g., 125.50"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category_manual">Category</Label>
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
                <Label htmlFor="description_manual">Description</Label>
                <Textarea
                  id="description_manual"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional notes about this expense"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="documents_manual">Supporting Documents (Optional)</Label>
                <Input
                  id="documents_manual"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    setSelectedFiles(files)
                  }}
                />
                <p className="text-xs text-slate-500">
                  Upload invoices, receipts, or other supporting documentation
                </p>
                {selectedFiles.length > 0 && (
                  <div className="text-sm text-slate-600 space-y-1 mt-2">
                    <p className="font-medium">{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected:</p>
                    {selectedFiles.map((file, index) => (
                      <p key={index} className="text-xs pl-2">• {file.name}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleReset}>
                  Back
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Expense'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}