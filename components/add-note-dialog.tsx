'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
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
import { Checkbox } from '@/components/ui/checkbox'

interface AddNoteDialogProps {
  grantId: string
  teamMembers: any[]
  onNoteAdded: () => void
}

export function AddNoteDialog({ grantId, teamMembers, onNoteAdded }: AddNoteDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>('')

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
      }
    }
    getCurrentUser()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      alert('You must be logged in')
      setLoading(false)
      return
    }

    // Insert note
    const { data: note, error: noteError } = await supabase
      .from('grant_notes')
      .insert([
        {
          grant_id: grantId,
          created_by_user_id: user.id,
          content: content
        }
      ])
      .select()
      .single()

    if (noteError || !note) {
      alert('Error adding note: ' + noteError?.message)
      setLoading(false)
      return
    }

    // Add recipients and create notifications
    if (selectedRecipients.length > 0) {
      const recipients = selectedRecipients.map(userId => ({
        note_id: note.id,
        user_id: userId
      }))

      const { error: recipientsError } = await supabase
        .from('note_recipients')
        .insert(recipients)

      if (recipientsError) {
        console.error('Error adding recipients:', recipientsError)
      }

      // Get grant info for notification
      const { data: grant } = await supabase
        .from('grants')
        .select('grant_name')
        .eq('id', grantId)
        .single()

      // Get current user's name
      const { data: currentUserProfile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single()

      const userName = currentUserProfile 
        ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}`
        : 'Someone'

      // Create notifications for recipients
      const notifications = selectedRecipients.map(userId => ({
        user_id: userId,
        type: 'note_mention',
        title: 'You were mentioned in a note',
        message: `${userName} mentioned you in a note on ${grant?.grant_name || 'a grant'}`,
        grant_id: grantId,
        note_id: note.id
      }))

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications)

      if (notifError) {
        console.error('Error creating notifications:', notifError)
      }

      // Send email notifications
      for (const recipientId of selectedRecipients) {
        const recipient = teamMembers.find(m => m.id === recipientId)
        if (recipient) {
          // Get recipient's email from user_profiles
          const { data: recipientProfile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('id', recipientId)
            .single()
          
          if (recipientProfile) {
            // Get email from auth.users via RPC or just use a stored email field
            // For now, we'll skip the email part since we need admin access
            // You can add email field to user_profiles table later
            console.log('Would send email to:', recipient.first_name, recipient.last_name)
          }
        }
      }
    }

    setLoading(false)
    setOpen(false)
    setContent('')
    setSelectedRecipients([])
    onNoteAdded()
  }

  const toggleRecipient = (userId: string) => {
    setSelectedRecipients(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  // Filter out current user from team members
  const otherTeamMembers = teamMembers.filter(member => member.id !== currentUserId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ Add Note</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
          <DialogDescription>
            Add a note or discussion point about this grant
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">Note *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type your note here..."
              rows={5}
              required
            />
          </div>

          {otherTeamMembers.length > 0 && (
            <div className="space-y-2">
              <Label>Notify Team Members (Optional)</Label>
              <p className="text-xs text-slate-500 mb-2">
                Select team members to notify about this note
              </p>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3 space-y-2">
                {otherTeamMembers.map((member) => (
                  <div key={member.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`recipient-${member.id}`}
                      checked={selectedRecipients.includes(member.id)}
                      onCheckedChange={() => toggleRecipient(member.id)}
                    />
                    <label
                      htmlFor={`recipient-${member.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {member.first_name} {member.last_name}
                    </label>
                  </div>
                ))}
              </div>
              {selectedRecipients.length > 0 && (
                <p className="text-xs text-slate-600 mt-2">
                  {selectedRecipients.length} team member{selectedRecipients.length === 1 ? '' : 's'} will be notified
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Note'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}