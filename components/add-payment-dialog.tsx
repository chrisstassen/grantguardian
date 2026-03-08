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

interface AddPaymentDialogProps {
  grantId: string
  onPaymentAdded: () => void
}

export function AddPaymentDialog({ grantId, onPaymentAdded }: AddPaymentDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    amount: '',
    funding_source: '',
    received_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    notes: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      alert('You must be logged in')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('payments_received').insert([
      {
        grant_id: grantId,
        created_by_user_id: user.id,
        amount: parseFloat(formData.amount),
        funding_source: formData.funding_source,
        received_date: formData.received_date,
        reference_number: formData.reference_number || null,
        notes: formData.notes || null
      }
    ])

    setLoading(false)

    if (error) {
      alert('Error adding payment: ' + error.message)
    } else {
      setOpen(false)
      setFormData({
        amount: '',
        funding_source: '',
        received_date: new Date().toISOString().split('T')[0],
        reference_number: '',
        notes: ''
      })
      onPaymentAdded()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Add Payment</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Payment Received</DialogTitle>
          <DialogDescription>
            Log a payment received for this grant
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount Received ($) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="e.g., 25000.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="funding_source">Funding Source *</Label>
            <Input
              id="funding_source"
              value={formData.funding_source}
              onChange={(e) => setFormData({ ...formData, funding_source: e.target.value })}
              placeholder="e.g., FEMA, Department of Justice"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="received_date">Date Received *</Label>
            <Input
              id="received_date"
              type="date"
              value={formData.received_date}
              onChange={(e) => setFormData({ ...formData, received_date: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference_number">Reference Number</Label>
            <Input
              id="reference_number"
              value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              placeholder="e.g., Payment #12345, ACH Reference"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes about this payment"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
