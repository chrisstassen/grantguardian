'use client'

import { useState } from 'react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserPlus } from 'lucide-react'

interface InviteTeamMemberDialogProps {
  organizationId: string
  organizationName: string
  onInviteSent: () => void
}

export function InviteTeamMemberDialog({ 
  organizationId, 
  organizationName,
  onInviteSent 
}: InviteTeamMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [message, setMessage] = useState('')

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
    setMessage('You must be logged in')
    setLoading(false)
    return
    }

    // Get the user's actual name from user_profiles
    const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single()

    const inviterName = userProfile 
    ? `${userProfile.first_name} ${userProfile.last_name}`
    : user.email?.split('@')[0] || 'A team member'

    // Check if email is already a member
    const { data: existingMember } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .single()

    if (existingMember) {
      setMessage('This user is already a member of your organization')
      setLoading(false)
      return
    }

    // Check if there's already a pending invitation
    const { data: existingInvite } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('invited_email', email)
      .eq('status', 'pending')
      .single()

    if (existingInvite) {
      setMessage('An invitation has already been sent to this email')
      setLoading(false)
      return
    }

    // Generate unique token
    const token = crypto.randomUUID()
    
    // Set expiration to 7 days from now
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .insert([{
        organization_id: organizationId,
        invited_email: email,
        role: role,
        token: token,
        invited_by_user_id: user.id,
        expires_at: expiresAt.toISOString(),
        status: 'pending'
      }])
      .select()
      .single()

    if (inviteError || !invitation) {
      setMessage('Error creating invitation: ' + inviteError?.message)
      setLoading(false)
      return
    }

    // Send invitation email via API
    const response = await fetch('/api/send-invitation-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invitationId: invitation.id,
        recipientEmail: email,
        organizationName: organizationName,
        role: role,
        token: token,
        inviterName: inviterName
        })
    })

    setLoading(false)

    if (!response.ok) {
      setMessage('Invitation created but email failed to send')
    } else {
      setMessage('Invitation sent successfully!')
      setEmail('')
      setRole('staff')
      setTimeout(() => {
        setOpen(false)
        setMessage('')
        onInviteSent()
      }, 2000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Team Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an email invitation to join {organizationName}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin - Full access</SelectItem>
                <SelectItem value="staff">Staff - Can add/edit grants</SelectItem>
                <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {message && (
            <p className={`text-sm ${message.includes('Error') || message.includes('already') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}