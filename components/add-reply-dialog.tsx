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
  grantId: string
  onReplyAdded: () => void
}

export function AddReplyDialog({ noteId, grantId, onReplyAdded }: AddReplyDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { alert('You must be logged in'); setLoading(false); return }

      const res = await fetch(`/api/user/grants/${grantId}/notes/${noteId}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: content.trim() }),
      })

      if (!res.ok) {
        const err = await res.json()
        alert('Error adding reply: ' + (err.error || 'Unknown error'))
        setLoading(false)
        return
      }

      setOpen(false)
      setContent('')
      onReplyAdded()
    } catch (err: any) {
      alert('Error adding reply: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="mt-3">
          Reply
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reply to Note</DialogTitle>
          <DialogDescription>
            Everyone in this thread will be notified by email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reply-content">Reply *</Label>
            <Textarea
              id="reply-content"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Type your reply here…"
              rows={4}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !content.trim()}>
              {loading ? 'Sending…' : 'Send Reply'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
