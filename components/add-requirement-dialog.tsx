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

interface AddRequirementDialogProps {
  grantId: string
  onRequirementAdded: () => void
}

export function AddRequirementDialog({ grantId, onRequirementAdded }: AddRequirementDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    policy_source: '',
    policy_citation: '',
    policy_url: ''
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

    const { error } = await supabase.from('compliance_requirements').insert([
      {
        grant_id: grantId,
        created_by_user_id: user.id,
        title: formData.title,
        description: formData.description || null,
        due_date: formData.due_date || null,
        priority: formData.priority,
        policy_source: formData.policy_source || null,
        policy_citation: formData.policy_citation || null,
        policy_url: formData.policy_url || null,
        status: 'open'
      }
    ])

    setLoading(false)

    if (error) {
      alert('Error adding requirement: ' + error.message)
    } else {
      setOpen(false)
      setFormData({
        title: '',
        description: '',
        due_date: '',
        priority: 'medium',
        policy_source: '',
        policy_citation: '',
        policy_url: ''
      })
      onRequirementAdded()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Add Requirement</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Compliance Requirement</DialogTitle>
          <DialogDescription>
            Track a compliance requirement for this grant
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Requirement Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Submit quarterly progress report"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Details about this requirement..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy_source">Policy Source</Label>
            <Select
              value={formData.policy_source}
              onValueChange={(value) => setFormData({ ...formData, policy_source: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select policy source (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OMB 2 CFR 200">OMB 2 CFR 200 (Uniform Guidance)</SelectItem>
                <SelectItem value="FEMA PAPPG">FEMA PAPPG</SelectItem>
                <SelectItem value="VOCA Final Rule">VOCA Final Rule</SelectItem>
                <SelectItem value="NSGP NOFO">NSGP NOFO</SelectItem>
                <SelectItem value="Award Letter">Award Letter</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy_citation">Policy Citation</Label>
            <Input
              id="policy_citation"
              value={formData.policy_citation}
              onChange={(e) => setFormData({ ...formData, policy_citation: e.target.value })}
              placeholder="e.g., 2 CFR § 200.328 or Section 4.2.1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy_url">Policy URL</Label>
            <Input
              id="policy_url"
              type="url"
              value={formData.policy_url}
              onChange={(e) => setFormData({ ...formData, policy_url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Requirement'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}