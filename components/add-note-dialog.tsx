'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface TeamMember {
  id: string
  first_name: string
  last_name: string
  email: string
}

interface AddNoteDialogProps {
  grantId: string
  teamMembers: TeamMember[]
  onNoteAdded: () => void
}

export function AddNoteDialog({ grantId, teamMembers, onNoteAdded }: AddNoteDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>('')

  // @mention state
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionDropdownIndex, setMentionDropdownIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [])

  const otherTeamMembers = teamMembers.filter(m => m.id !== currentUserId)

  // ── @mention autocomplete ──────────────────────────────────────────────────

  const filteredMentions = mentionQuery === ''
    ? otherTeamMembers
    : otherTeamMembers.filter(m =>
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(mentionQuery.toLowerCase())
      )

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setContent(val)

    // Detect @mention: look for @ followed by non-space chars before the cursor
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const mentionMatch = textBefore.match(/@([\w ]*)$/)

    if (mentionMatch) {
      setMentionQuery(mentionMatch[1])
      setShowMentionDropdown(true)
      setMentionDropdownIndex(0)
    } else {
      setShowMentionDropdown(false)
      setMentionQuery('')
    }
  }

  const insertMention = useCallback((member: TeamMember) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursor = textarea.selectionStart ?? content.length
    const textBefore = content.slice(0, cursor)
    const mentionStart = textBefore.lastIndexOf('@')
    const before = content.slice(0, mentionStart)
    const after = content.slice(cursor)
    const inserted = `@${member.first_name} ${member.last_name} `
    const newContent = before + inserted + after

    setContent(newContent)
    setShowMentionDropdown(false)
    setMentionQuery('')

    // Auto-add to recipients
    if (!selectedRecipients.includes(member.id)) {
      setSelectedRecipients(prev => [...prev, member.id])
    }

    // Restore focus and move cursor after the inserted mention
    setTimeout(() => {
      textarea.focus()
      const newCursor = mentionStart + inserted.length
      textarea.setSelectionRange(newCursor, newCursor)
    }, 0)
  }, [content, selectedRecipients])

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentionDropdown || filteredMentions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionDropdownIndex(i => Math.min(i + 1, filteredMentions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionDropdownIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(filteredMentions[mentionDropdownIndex])
    } else if (e.key === 'Escape') {
      setShowMentionDropdown(false)
    }
  }

  const toggleRecipient = (userId: string) => {
    setSelectedRecipients(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { alert('You must be logged in'); setLoading(false); return }

      const res = await fetch(`/api/user/grants/${grantId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: content.trim(), recipientIds: selectedRecipients }),
      })

      if (!res.ok) {
        const err = await res.json()
        alert('Error adding note: ' + (err.error || 'Unknown error'))
        setLoading(false)
        return
      }

      setOpen(false)
      setContent('')
      setSelectedRecipients([])
      onNoteAdded()
    } catch (err: any) {
      alert('Error adding note: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (!val) {
      setContent('')
      setSelectedRecipients([])
      setShowMentionDropdown(false)
    }
  }

  // Chip label for a recipient
  const recipientName = (id: string) => {
    const m = teamMembers.find(m => m.id === id)
    return m ? `${m.first_name} ${m.last_name}` : id
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>+ Add Note</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
          <DialogDescription>
            Add a note or discussion point. Type <strong>@name</strong> to mention a team member — they'll be notified by email.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Textarea with @mention dropdown */}
          <div className="space-y-2">
            <Label htmlFor="note-content">Note *</Label>
            <div className="relative">
              <textarea
                id="note-content"
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleTextareaKeyDown}
                onBlur={() => setTimeout(() => setShowMentionDropdown(false), 150)}
                placeholder="Type your note… use @name to mention a team member"
                rows={5}
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent resize-y"
              />

              {/* @mention dropdown */}
              {showMentionDropdown && filteredMentions.length > 0 && (
                <div className="absolute left-0 z-50 mt-1 w-64 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
                  <p className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-100">Mention a team member</p>
                  {filteredMentions.map((member, idx) => (
                    <button
                      key={member.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 ${
                        idx === mentionDropdownIndex ? 'bg-slate-100' : ''
                      }`}
                      onMouseDown={() => insertMention(member)}
                    >
                      <span className="flex-shrink-0 h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-700">
                        {member.first_name[0]}{member.last_name[0]}
                      </span>
                      {member.first_name} {member.last_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recipients — shows manually checked + auto-added via @mention */}
          {otherTeamMembers.length > 0 && (
            <div className="space-y-2">
              <Label>Also notify (optional)</Label>
              <p className="text-xs text-slate-500">
                @mentioned members are notified automatically. You can also add others below.
              </p>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-3 space-y-2">
                {otherTeamMembers.map(member => (
                  <label
                    key={member.id}
                    className="flex items-center gap-2.5 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      checked={selectedRecipients.includes(member.id)}
                      onChange={() => toggleRecipient(member.id)}
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900">
                      {member.first_name} {member.last_name}
                    </span>
                    {selectedRecipients.includes(member.id) && (
                      <span className="text-xs text-blue-600 ml-auto">will be notified</span>
                    )}
                  </label>
                ))}
              </div>

              {/* Recipient chips */}
              {selectedRecipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedRecipients.map(id => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium"
                    >
                      @{recipientName(id)}
                      <button
                        type="button"
                        onClick={() => setSelectedRecipients(prev => prev.filter(r => r !== id))}
                        className="ml-0.5 text-blue-500 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !content.trim()}>
              {loading ? 'Adding…' : 'Add Note'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
