'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface Grant {
  id: string
  grant_name: string
  funding_agency: string
  program_type: string | null
  award_number: string | null
  award_amount: number | null
  period_start: string | null
  period_end: string | null
  status: string
}

interface EditGrantDialogProps {
  grant: Grant
  open: boolean
  onOpenChange: (open: boolean) => void
  onGrantUpdated: () => void
}

export function EditGrantDialog({ grant, open, onOpenChange, onGrantUpdated }: EditGrantDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    grant_name: grant.grant_name,
    funding_agency: grant.funding_agency,
    program_type: grant.program_type || '',
    award_number: grant.award_number || '',
    award_amount: grant.award_amount?.toString() || '',
    period_start: grant.period_start || '',
    period_end: grant.period_end || '',
    status: grant.status
  })

  // Update form data when grant changes
  useEffect(() => {
    setFormData({
      grant_name: grant.grant_name,
      funding_agency: grant.funding_agency,
      program_type: grant.program_type || '',
      award_number: grant.award_number || '',
      award_amount: grant.award_amount?.toString() || '',
      period_start: grant.period_start || '',
      period_end: grant.period_end || '',
      status: grant.status
    })
  }, [grant])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase
      .from('grants')
      .update({
        grant_name: formData.grant_name,
        funding_agency: formData.funding_agency,
        program_type: formData.program_type || null,
        award_number: formData.award_number || null,
        award_amount: formData.award_amount ? parseFloat(formData.award_amount) : null,
        period_start: formData.period_start || null,
        period_end: formData.period_end || null,
        status: formData.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', grant.id)

    setLoading(false)

    if (error) {
      alert('Error updating grant: ' + error.message)
    } else {
      onOpenChange(false)
      onGrantUpdated()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Grant</DialogTitle>
          <DialogDescription>
            Update the details of your grant award
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="grant_name">Grant Name *</Label>
            <Input
              id="grant_name"
              value={formData.grant_name}
              onChange={(e) => setFormData({ ...formData, grant_name: e.target.value })}
              placeholder="e.g., Emergency Food & Shelter Program"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="funding_agency">Funding Agency *</Label>
            <Select
              value={formData.funding_agency}
              onValueChange={(value) => setFormData({ ...formData, funding_agency: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select agency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FEMA">FEMA</SelectItem>
                <SelectItem value="DOJ/OJP">DOJ/OJP (VOCA)</SelectItem>
                <SelectItem value="HHS">HHS</SelectItem>
                <SelectItem value="DHS">DHS (NSGP)</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="program_type">Program Type</Label>
            <Input
              id="program_type"
              value={formData.program_type}
              onChange={(e) => setFormData({ ...formData, program_type: e.target.value })}
              placeholder="e.g., EFSP, VOCA, NSGP"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="award_number">Award Number</Label>
            <Input
              id="award_number"
              value={formData.award_number}
              onChange={(e) => setFormData({ ...formData, award_number: e.target.value })}
              placeholder="e.g., EMW-2024-FP-12345"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="award_amount">Award Amount ($)</Label>
            <Input
              id="award_amount"
              type="number"
              step="0.01"
              value={formData.award_amount}
              onChange={(e) => setFormData({ ...formData, award_amount: e.target.value })}
              placeholder="e.g., 250000"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period_start">Performance Period Start</Label>
              <Input
                id="period_start"
                type="date"
                value={formData.period_start}
                onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period_end">Performance Period End</Label>
              <Input
                id="period_end"
                type="date"
                value={formData.period_end}
                onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}