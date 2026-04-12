'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2, Edit2, Check, X, Lock } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Note {
  id: string
  created_at: string
  updated_at: string
  content: string
  is_private: boolean
  created_by_user_id: string
  edited_at: string | null
  user_profiles: {
    first_name: string
    last_name: string
  }
}

interface SupportTicketNotesProps {
  ticketId: string
  isSystemAdmin: boolean
}

export function SupportTicketNotes({ ticketId, isSystemAdmin }: SupportTicketNotesProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [newNoteContent, setNewNoteContent] = useState('')
  const [isPrivateNote, setIsPrivateNote] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [availableUsers, setAvailableUsers] = useState<any[]>([])
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionPosition, setMentionPosition] = useState(0)
  const [selectedMentions, setSelectedMentions] = useState<string[]>([])

  useEffect(() => {
    loadNotes()
    getCurrentUser()
    loadAvailableUsers()
  }, [ticketId])

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
    }
  }
  
  const loadAvailableUsers = async () => {
    // Get the ticket to find its organization
    const { data: ticket } = await supabase
        .from('support_tickets')
        .select('organization_id')
        .eq('id', ticketId)
        .single()

    if (!ticket) return

    // Load org members
    const { data: memberships } = await supabase
        .from('user_organization_memberships')
        .select('user_id')
        .eq('organization_id', ticket.organization_id)

    if (!memberships) return

    const userIds = memberships.map(m => m.user_id)

    // Load system admins
    const { data: systemAdmins } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email, is_system_admin')
        .eq('is_system_admin', true)

    // Load org member profiles
    const { data: orgMembers } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email, is_system_admin')
        .in('id', userIds)

    // Combine and deduplicate
    const allUsers = [...(systemAdmins || []), ...(orgMembers || [])]
    const uniqueUsers = Array.from(
        new Map(allUsers.map(user => [user.id, user])).values()
    )

    setAvailableUsers(uniqueUsers)
    }

  const loadNotes = async () => {
    console.log('Loading notes for ticket:', ticketId)
    
    // Load notes
    const { data: notesData, error } = await supabase
        .from('support_ticket_notes')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('Error loading notes:', error)
        alert('Error loading notes: ' + error.message)
        setLoading(false)
        return
    }

    if (!notesData || notesData.length === 0) {
        setNotes([])
        setLoading(false)
        return
    }

    // Load user profiles for all note creators
    const userIds = [...new Set(notesData.map(note => note.created_by_user_id))]
    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name')
        .in('id', userIds)

    // Combine notes with user profiles
    const notesWithProfiles = notesData.map(note => ({
        ...note,
        user_profiles: profiles?.find(p => p.id === note.created_by_user_id) || {
        first_name: 'Unknown',
        last_name: 'User'
        }
    }))

    console.log('Notes loaded:', notesWithProfiles)
    setNotes(notesWithProfiles)
    setLoading(false)
    }

  const handleSubmitNote = async (e: React.FormEvent) => {
  e.preventDefault()
  if (!newNoteContent.trim()) return

  setSubmitting(true)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    alert('You must be logged in to add notes')
    setSubmitting(false)
    return
  }

  const { data: note, error } = await supabase
    .from('support_ticket_notes')
    .insert([{
      ticket_id: ticketId,
      created_by_user_id: user.id,
      content: newNoteContent,
      is_private: isPrivateNote,
      mentioned_user_ids: selectedMentions
    }])
    .select()
    .single()

  if (error) {
    console.error('Error creating note:', error)
    alert('Error creating note: ' + error.message)
  } else {
    // Send notifications to @ mentioned users
    if (selectedMentions.length > 0 && note) {
      // Fetch the current user's name and the ticket subject in parallel
      const [profileResult, ticketResult] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single(),
        supabase
          .from('support_tickets')
          .select('subject')
          .eq('id', ticketId)
          .single()
      ])

      const senderName = profileResult.data
        ? `${profileResult.data.first_name} ${profileResult.data.last_name}`
        : 'Someone'

      const ticketSubject = ticketResult.data?.subject || 'a support ticket'

      // Create in-app notifications for all mentioned users
      const notifications = selectedMentions.map(userId => ({
        user_id: userId,
        type: 'ticket_note_mention',
        title: 'You were mentioned in a ticket note',
        message: `${senderName} mentioned you in a note on ticket: "${ticketSubject}"`,
        link: `/support/tickets/${ticketId}`
      }))

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications)

      if (notifError) {
        console.error('Error creating in-app notifications:', notifError)
      }

      // Send email notifications to each mentioned user
      for (const mentionedUserId of selectedMentions) {
        const recipient = availableUsers.find(u => u.id === mentionedUserId)
        if (recipient?.email) {
          try {
            await fetch('/api/send-ticket-mention-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipientEmail: recipient.email,
                recipientName: `${recipient.first_name} ${recipient.last_name}`,
                senderName,
                ticketSubject,
                ticketId
              })
            })
          } catch (emailErr) {
            console.error('Error sending mention email to', recipient.email, emailErr)
          }
        }
      }
    }

    setNewNoteContent('')
    setIsPrivateNote(false)
    setSelectedMentions([])
    await loadNotes()
  }

  setSubmitting(false)
}

  const handleEditNote = async (noteId: string) => {
    if (!editContent.trim()) return

    const { error } = await supabase
      .from('support_ticket_notes')
      .update({
        content: editContent,
        edited_at: new Date().toISOString()
      })
      .eq('id', noteId)

    if (error) {
      console.error('Error updating note:', error)
      alert('Error updating note: ' + error.message)
    } else {
      setEditingNoteId(null)
      setEditContent('')
      await loadNotes()
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    const { error } = await supabase
      .from('support_ticket_notes')
      .delete()
      .eq('id', noteId)

    if (error) {
      console.error('Error deleting note:', error)
      alert('Error deleting note: ' + error.message)
    } else {
      await loadNotes()
    }
  }

  const startEdit = (note: Note) => {
    setEditingNoteId(note.id)
    setEditContent(note.content)
  }

  const cancelEdit = () => {
    setEditingNoteId(null)
    setEditContent('')
    }

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setNewNoteContent(text)

    // Check for @ mention
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = text.slice(0, cursorPos)
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@')

    if (lastAtSymbol !== -1) {
        const textAfterAt = textBeforeCursor.slice(lastAtSymbol + 1)
        if (!textAfterAt.includes(' ')) {
        // Still typing a mention
        setMentionSearch(textAfterAt.toLowerCase())
        setMentionPosition(lastAtSymbol)
        setShowMentionDropdown(true)
        } else {
        setShowMentionDropdown(false)
        }
    } else {
        setShowMentionDropdown(false)
    }
    }

    const insertMention = (user: any) => {
    const beforeMention = newNoteContent.slice(0, mentionPosition)
    const afterMention = newNoteContent.slice(mentionPosition + mentionSearch.length + 1)
    const newText = `${beforeMention}@${user.first_name} ${user.last_name} ${afterMention}`
    
    setNewNoteContent(newText)
    setShowMentionDropdown(false)
    
    // Add to selected mentions for saving
    if (!selectedMentions.includes(user.id)) {
        setSelectedMentions([...selectedMentions, user.id])
    }
    }

    const getFilteredUsers = () => {
    let users = availableUsers

    // If private note, only show system admins
    if (isPrivateNote) {
        users = users.filter(u => u.is_system_admin)
    }

    // Filter by search
    if (mentionSearch) {
        users = users.filter(u => 
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(mentionSearch) ||
        u.email.toLowerCase().includes(mentionSearch)
        )
    }

    return users.filter(u => u.id !== currentUserId) // Don't show self
    }

  if (loading) {
    return <p className="text-slate-500">Loading notes...</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes & Updates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing Notes */}
        {notes.length === 0 ? (
          <p className="text-slate-500 text-sm">No notes yet. Add the first one below!</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`p-4 rounded-lg border ${
                  note.is_private ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900">
                      {note.user_profiles.first_name} {note.user_profiles.last_name}
                    </p>
                    {note.is_private && (
                      <div className="flex items-center gap-1 text-purple-700">
                        <Lock className="h-3 w-3" />
                        <span className="text-xs font-medium">Private</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500">
                      {new Date(note.created_at).toLocaleString()}
                      {note.edited_at && ' (edited)'}
                    </p>
                    {currentUserId === note.created_by_user_id && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(note)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Note?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this note. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteNote(note.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>

                {editingNoteId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleEditNote(note.id)}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelEdit}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-700 whitespace-pre-wrap">{note.content}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add New Note */}
        <form onSubmit={handleSubmitNote} className="space-y-3 pt-4 border-t">
          <div className="relative">
            <Textarea
                value={newNoteContent}
                onChange={handleTextareaChange}
                placeholder="Add a note or update... (type @ to mention someone)"
                className="min-h-[100px]"
                disabled={submitting}
            />
            
            {/* Mention Dropdown */}
            {showMentionDropdown && (
                <div className="absolute bottom-full mb-2 w-full bg-slate-300 border border-slate-400 rounded-lg shadow-xl max-h-48 overflow-y-auto z-10">
                {getFilteredUsers().length === 0 ? (
                    <div className="p-3 text-sm text-slate-600">
                    {isPrivateNote ? 'No system admins found' : 'No users found'}
                    </div>
                ) : (
                    getFilteredUsers().map(user => (
                    <button
                        key={user.id}
                        type="button"
                        onClick={() => insertMention(user)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-400 border-b border-slate-400 last:border-0 bg-slate-300"
                    >
                        <div className="font-medium text-slate-900">
                        {user.first_name} {user.last_name}
                        {user.is_system_admin && (
                            <span className="ml-2 text-xs text-purple-600">(System Admin)</span>
                        )}
                        </div>
                        <div className="text-sm text-slate-500">{user.email}</div>
                    </button>
                    ))
                )}
                </div>
            )}
            </div>

          {isSystemAdmin && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="private-note"
                checked={isPrivateNote}
                onCheckedChange={(checked) => setIsPrivateNote(checked as boolean)}
              />
              <Label htmlFor="private-note" className="text-sm cursor-pointer">
                Private note (visible only to GrantGuardian admins)
              </Label>
            </div>
          )}

          <Button type="submit" disabled={submitting || !newNoteContent.trim()}>
            {submitting ? 'Adding...' : 'Add Note'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}