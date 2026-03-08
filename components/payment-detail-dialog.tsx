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

interface PaymentDetailDialogProps {
  payment: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaymentUpdated: () => void
  userRole: string
}

export function PaymentDetailDialog({ 
  payment, 
  open, 
  onOpenChange, 
  onPaymentUpdated,
  userRole 
}: PaymentDetailDialogProps) {
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  const [formData, setFormData] = useState({
    amount: payment.amount?.toString() || '',
    funding_source: payment.funding_source || '',
    received_date: payment.received_date || '',
    reference_number: payment.reference_number || '',
    notes: payment.notes || ''
  })

  useEffect(() => {
    if (open) {
      setFormData({
        amount: payment.amount?.toString() || '',
        funding_source: payment.funding_source || '',
        received_date: payment.received_date || '',
        reference_number: payment.reference_number || '',
        notes: payment.notes || ''
      })
    }
  }, [open, payment])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('payments_received')
      .update({
        amount: parseFloat(formData.amount),
        funding_source: formData.funding_source,
        received_date: formData.received_date,
        reference_number: formData.reference_number || null,
        notes: formData.notes || null
      })
      .eq('id', payment.id)

    setLoading(false)

    if (error) {
        alert('Error updating payment: ' + error.message)
        } else {
        setIsEditing(false)
        
        // Reload the payment data to show updated values
        const { data: updatedPayment } = await supabase
            .from('payments_received')
            .select('*')
            .eq('id', payment.id)
            .single()
        
        if (updatedPayment) {
            // Update the formData to reflect changes
            setFormData({
            amount: updatedPayment.amount?.toString() || '',
            funding_source: updatedPayment.funding_source || '',
            received_date: updatedPayment.received_date || '',
            reference_number: updatedPayment.reference_number || '',
            notes: updatedPayment.notes || ''
            })
        }
        
        onPaymentUpdated()
        }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this payment? This cannot be undone.')) return
    
    setDeleting(true)
    
    const { error } = await supabase
      .from('payments_received')
      .delete()
      .eq('id', payment.id)
    
    if (error) {
      alert('Error deleting payment: ' + error.message)
      setDeleting(false)
    } else {
      onOpenChange(false)
      onPaymentUpdated()
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Payment' : 'Payment Details'}
          </DialogTitle>
          <DialogDescription>
            {formatDate(payment.received_date)} • {payment.funding_source}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          <form onSubmit={handleUpdate} className="space-y-4">
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
              <Label htmlFor="funding_source">Funding Source *</Label>
              <Input
                id="funding_source"
                value={formData.funding_source}
                onChange={(e) => setFormData({ ...formData, funding_source: e.target.value })}
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {formatCurrency(payment.amount)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">Funding Source</p>
                <p className="text-lg text-slate-900 mt-1">
                  {payment.funding_source}
                </p>
              </div>
            </div>

            {payment.reference_number && (
              <div>
                <p className="text-sm font-medium text-slate-600">Reference Number</p>
                <p className="text-slate-900 mt-1">{payment.reference_number}</p>
              </div>
            )}

            {payment.notes && (
              <div>
                <p className="text-sm font-medium text-slate-600">Notes</p>
                <p className="text-slate-900 mt-1">{payment.notes}</p>
              </div>
            )}

            {canEdit && (
              <div className="flex justify-between pt-4 border-t">
                <Button 
                  variant="destructive" 
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Payment'}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                  <Button onClick={() => setIsEditing(true)}>
                    Edit Payment
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