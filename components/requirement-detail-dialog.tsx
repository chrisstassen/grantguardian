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

interface RequirementDetailDialogProps {
  requirement: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequirementUpdated: () => void
  userRole: string
}

export function RequirementDetailDialog({ 
  requirement, 
  open, 
  onOpenChange, 
  onRequirementUpdated,
  userRole 
}: RequirementDetailDialogProps) {
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  const [formData, setFormData] = useState({
    title: requirement.title || '',
    description: requirement.description || '',
    due_date: requirement.due_date || '',
    priority: requirement.priority || 'medium',
    status: requirement.status || 'open',
    policy_source: requirement.policy_source || '',
    policy_citation: requirement.policy_citation || '',
    policy_url: requirement.policy_url || ''
  })

  useEffect(() => {
    if (open) {
      setFormData({
        title: requirement.title || '',
        description: requirement.description || '',
        due_date: requirement.due_date || '',
        priority: requirement.priority || 'medium',
        status: requirement.status || 'open',
        policy_source: requirement.policy_source || '',
        policy_citation: requirement.policy_citation || '',
        policy_url: requirement.policy_url || ''
      })
    }
  }, [open, requirement])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const updateData: any = {
      title: formData.title,
      description: formData.description || null,
      due_date: formData.due_date || null,
      priority: formData.priority,
      status: formData.status,
      policy_source: formData.policy_source || null,
      policy_citation: formData.policy_citation || null,
      policy_url: formData.policy_url || null,
      updated_at: new Date().toISOString()
    }

    // Handle completion
    if (formData.status === 'completed' && requirement.status !== 'completed') {
      const { data: { user } } = await supabase.auth.getUser()
      updateData.completed_at = new Date().toISOString()
      updateData.completed_by_user_id = user?.id
    } else if (formData.status !== 'completed') {
      updateData.completed_at = null
      updateData.completed_by_user_id = null
    }

    const { error } = await supabase
      .from('compliance_requirements')
      .update(updateData)
      .eq('id', requirement.id)

    setLoading(false)

    if (error) {
      alert('Error updating requirement: ' + error.message)
    } else {
      onOpenChange(false)
      onRequirementUpdated()
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this requirement? This cannot be undone.')) return
    
    setDeleting(true)
    
    const { error } = await supabase
      .from('compliance_requirements')
      .delete()
      .eq('id', requirement.id)
    
    if (error) {
      alert('Error deleting requirement: ' + error.message)
      setDeleting(false)
    } else {
      onOpenChange(false)
      onRequirementUpdated()
    }
  }

  const canEdit = userRole !== 'viewer'

  if (!canEdit) {
    // Viewers can't edit, so close dialog
    onOpenChange(false)
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Requirement</DialogTitle>
          <DialogDescription>
            Update compliance requirement details
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Requirement Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
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

          <div className="grid grid-cols-3 gap-4">
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
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
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
              placeholder="e.g., 2 CFR § 200.328"
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
            {formData.policy_url && (
              <a 
                href={formData.policy_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline inline-block"
              >
                View Policy Document →
              </a>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button 
              type="button"
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Requirement'}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}