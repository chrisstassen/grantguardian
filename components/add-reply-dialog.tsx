'use client'

import { useState } from 'react'
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

interface AddReplyDialogProps {
  noteId: string
  onReplyAdded: () => void
}

export function AddReplyDialog({ noteId, onReplyAdded }: AddReplyDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        alert('You must be logged in')
        setLoading(false)
        return
    }

    // Insert reply
    const { data: reply, error: replyError } = await supabase
        .from('grant_note_replies')
        .insert([
        {
            note_id: noteId,
            created_by_user_id: user.id,
            content: content
        }
        ])
        .select()
        .single()

    if (replyError || !reply) {
        alert('Error adding reply: ' + replyError?.message)
        setLoading(false)
        return
    }

    // Get the original note and grant info
    const { data: note } = await supabase
        .from('grant_notes')
        .select('grant_id, created_by_user_id')
        .eq('id', noteId)
        .single()

    if (note) {
        const { data: grant } = await supabase
        .from('grants')
        .select('grant_name')
        .eq('id', note.grant_id)
        .single()

        // Get all people involved in this thread (note author + all recipients)
        const { data: recipients } = await supabase
        .from('note_recipients')
        .select('user_id')
        .eq('note_id', noteId)

        // Collect unique user IDs (excluding current user)
        const userIdsToNotify = new Set<string>()
        
        // Add note author
        if (note.created_by_user_id !== user.id) {
        userIdsToNotify.add(note.created_by_user_id)
        }
        
        // Add recipients
        recipients?.forEach(r => {
        if (r.user_id !== user.id) {
            userIdsToNotify.add(r.user_id)
        }
        })

        // Get current user's name
        const { data: currentUserProfile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single()

        const userName = currentUserProfile 
        ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}`
        : 'Someone'

        // Create notifications
        if (userIdsToNotify.size > 0) {
        const notifications = Array.from(userIdsToNotify).map(userId => ({
            user_id: userId,
            type: 'note_reply',
            title: 'New reply on a note',
            message: `${userName} replied to a note on ${grant?.grant_name || 'a grant'}`,
            grant_id: note.grant_id,
            note_id: noteId
        }))

        const { error: notifError } = await supabase
            .from('notifications')
            .insert(notifications)

        if (notifError) {
            console.error('Error creating notifications:', notifError)
        }

        // Send email notifications
        if (userIdsToNotify.size > 0) {
        // Get all user profiles for recipients
        const { data: recipientProfiles } = await supabase
            .from('user_profiles')
            .select('id, first_name, last_name, email')
            .in('id', Array.from(userIdsToNotify))

        if (recipientProfiles) {
            for (const recipient of recipientProfiles) {
            if (recipient.email) {
                try {
                await fetch('/api/send-notification-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                    recipientEmail: recipient.email,
                    recipientName: `${recipient.first_name} ${recipient.last_name}`,
                    senderName: userName,
                    grantName: grant?.grant_name || 'a grant',
                    notificationType: 'note_reply',
                    grantId: note.grant_id
                    })
                })
                } catch (err) {
                console.error('Error sending email notification:', err)
                }
            }
            }
        }
        }
    }
    }
    setLoading(false)
    setOpen(false)
    setContent('')
    onReplyAdded()
    }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="mt-3">
          Reply
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Reply</DialogTitle>
          <DialogDescription>
            Reply to this note
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reply-content">Reply *</Label>
            <Textarea
              id="reply-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type your reply here..."
              rows={4}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Reply'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}