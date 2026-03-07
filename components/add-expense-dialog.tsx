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

interface AddExpenseDialogProps {
  grantId: string
  onExpenseAdded: () => void
}

export function AddExpenseDialog({ grantId, onExpenseAdded }: AddExpenseDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '',
    description: '',
    amount: '',
    category: ''
  })
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractedData, setExtractedData] = useState<any>(null)

  const handleExtractFromDocument = async (file: File) => {
  setExtracting(true)
  
  try {
    // Convert file to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1]) // Remove data:image/jpeg;base64, prefix
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    // Determine media type
    const mediaType = file.type || 'application/pdf'

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: mediaType.startsWith('image/') ? 'image' : 'document',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64
                }
              },
              {
                type: 'text',
                text: `Extract expense information from this invoice/receipt. Return ONLY a JSON object with these fields:
{
  "vendor": "vendor or payee name",
  "amount": numeric amount (just the number, no currency symbol),
  "date": "YYYY-MM-DD format",
  "description": "brief description of items/services",
  "category": "one of: Personnel, Travel, Equipment, Supplies, Contractual, Other (or null if unclear)"
}

If any field is unclear, use null. Return only the JSON object, no other text.`
              }
            ]
          }
        ]
      })
    })

    const data = await response.json()
    
    if (data.content && data.content[0]?.text) {
      // Parse Claude's response
      const jsonText = data.content[0].text.trim()
      const cleanJson = jsonText.replace(/```json\n?|\n?```/g, '').trim()
      const extracted = JSON.parse(cleanJson)
      
      // Auto-fill form
      setFormData({
        vendor: extracted.vendor || '',
        amount: extracted.amount?.toString() || '',
        expense_date: extracted.date || new Date().toISOString().split('T')[0],
        description: extracted.description || '',
        category: extracted.category || ''
      })
      
      setExtractedData(extracted)
      alert('Invoice data extracted! Please review and adjust if needed.')
    }
  } catch (error) {
    console.error('Extraction error:', error)
    alert('Could not extract data from document. Please enter manually.')
  } finally {
    setExtracting(false)
  }
}

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      alert('You must be logged in to add an expense')
      setLoading(false)
      return
    }

    // Insert expense first
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
      alert('Error adding expense: ' + expenseError?.message)
      setLoading(false)
      return
    }

    // Upload all selected files
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

    setLoading(false)
    setOpen(false)
    setFormData({
      expense_date: new Date().toISOString().split('T')[0],
      vendor: '',
      description: '',
      amount: '',
      category: ''
    })
    setSelectedFiles([])
    onExpenseAdded()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Add Expense</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>
            Enter expense details manually
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="e.g., Office Depot, John Smith"
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
              placeholder="e.g., 125.50"
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
              placeholder="Optional notes about this expense"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="documents">Supporting Documents (Optional)</Label>
            <Input
                id="documents"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                multiple
                onChange={(e) => {
                const files = Array.from(e.target.files || [])
                setSelectedFiles(files)
                }}
            />
            <p className="text-xs text-slate-500">
                Upload invoices, receipts, or other supporting documentation (multiple files allowed)
            </p>
            {selectedFiles.length > 0 && (
                <div className="text-sm text-slate-600 space-y-1 mt-2">
                <p className="font-medium">{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected:</p>
                {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between text-xs pl-2">
                    <span>• {file.name}</span>
                    {index === 0 && (file.type.startsWith('image/') || file.type === 'application/pdf') && (
                        <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleExtractFromDocument(file)}
                        disabled={extracting}
                        className="ml-2"
                        >
                        {extracting ? 'Extracting...' : '✨ Extract Data'}
                        </Button>
                    )}
                    </div>
                ))}
                </div>
            )}
            {extractedData && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                <p className="font-medium text-blue-900">✨ Data extracted from document</p>
                <p className="text-blue-700 text-xs mt-1">Review the auto-filled fields above and adjust if needed</p>
                </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Expense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}