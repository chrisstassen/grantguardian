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

interface AddGrantDialogProps {
  onGrantAdded: () => void
}

export function AddGrantDialog({ onGrantAdded }: AddGrantDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    grant_name: '',
    funding_agency: '',
    program_type: '',
    award_number: '',
    award_amount: '',
    period_start: '',
    period_end: '',
    status: 'active'
  })

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setLoading(true)

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    alert('You must be logged in to add a grant')
    setLoading(false)
    return
  }

  // Get user's organization
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    alert('No organization found')
    setLoading(false)
    return
  }

  const { error } = await supabase.from('grants').insert([
    {
      organization_id: profile.organization_id,
      grant_name: formData.grant_name,
      funding_agency: formData.funding_agency,
      program_type: formData.program_type || null,
      award_number: formData.award_number || null,
      award_amount: formData.award_amount ? parseFloat(formData.award_amount) : null,
      period_start: formData.period_start || null,
      period_end: formData.period_end || null,
      status: formData.status
    }
  ])

  setLoading(false)

  if (error) {
    alert('Error adding grant: ' + error.message)
  } else {
    setOpen(false)
    setFormData({
      grant_name: '',
      funding_agency: '',
      program_type: '',
      award_number: '',
      award_amount: '',
      period_start: '',
      period_end: '',
      status: 'active'
    })
    onGrantAdded()
  }
}

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Add Grant</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Grant</DialogTitle>
          <DialogDescription>
            Enter the details of your grant award
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Grant'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}