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
  award_letter_url: string | null
  award_letter_name: string | null
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
  const [newAwardLetterFile, setNewAwardLetterFile] = useState<File | null>(null)
  const [deleteAwardLetter, setDeleteAwardLetter] = useState(false)
  const [uploading, setUploading] = useState(false)

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

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      alert('You must be logged in')
      setLoading(false)
      return
    }

    let awardLetterUrl = grant.award_letter_url
    let awardLetterName = grant.award_letter_name

    // Handle award letter deletion
    if (deleteAwardLetter && grant.award_letter_url) {
      const { error: deleteError } = await supabase.storage
        .from('award-letters')
        .remove([grant.award_letter_url])
      if (!deleteError) {
        awardLetterUrl = null
        awardLetterName = null
      }
    }

    // Handle new award letter upload (use grant.id for the path since org_id isn't on user_profiles)
    if (newAwardLetterFile) {
      setUploading(true)

      if (grant.award_letter_url) {
        await supabase.storage.from('award-letters').remove([grant.award_letter_url])
      }

      const fileName = newAwardLetterFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filePath = `${grant.id}/${Date.now()}_${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('award-letters')
        .upload(filePath, newAwardLetterFile)

      if (uploadError) {
        console.error('Error uploading award letter:', uploadError)
        alert('Error uploading award letter. Continuing without it.')
      } else {
        awardLetterUrl = filePath
        awardLetterName = newAwardLetterFile.name
      }

      setUploading(false)
    }

    const res = await fetch(`/api/user/grants/${grant.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        grant_name: formData.grant_name,
        funding_agency: formData.funding_agency,
        program_type: formData.program_type || null,
        award_number: formData.award_number || null,
        award_amount: formData.award_amount || null,
        period_start: formData.period_start || null,
        period_end: formData.period_end || null,
        status: formData.status,
        award_letter_url: awardLetterUrl,
        award_letter_name: awardLetterName
      })
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      alert('Error updating grant: ' + (data.error || res.statusText))
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

          <div className="space-y-2">
            <Label>Award Letter Management</Label>
            
            {grant.award_letter_url && !deleteAwardLetter && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900">
                    📄 {grant.award_letter_name || 'Current Award Letter'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteAwardLetter(true)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )}
            
            {deleteAwardLetter && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-red-800">
                    Award letter will be deleted when you save
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteAwardLetter(false)}
                  >
                    Undo
                  </Button>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="new_award_letter">
                {grant.award_letter_url ? 'Replace Award Letter' : 'Upload Award Letter'}
              </Label>
              <Input
                id="new_award_letter"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => {
                  setNewAwardLetterFile(e.target.files?.[0] || null)
                  setDeleteAwardLetter(false) // Cancel deletion if uploading new file
                }}
              />
              <p className="text-xs text-slate-500">
                {grant.award_letter_url 
                  ? 'Upload a new file to replace the current award letter'
                  : 'Upload the official award letter (optional)'}
              </p>
              {newAwardLetterFile && (
                <p className="text-sm text-slate-600">
                  📄 New file: {newAwardLetterFile.name}
                </p>
              )}
            </div>
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