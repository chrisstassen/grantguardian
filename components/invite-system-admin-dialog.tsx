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
import { UserPlus } from 'lucide-react'

interface InviteSystemAdminDialogProps {
  onInviteSent: () => void
}

export function InviteSystemAdminDialog({ onInviteSent }: InviteSystemAdminDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Check if email already has a profile
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('id, email')
        .eq('email', email)
        .single()

      if (existingProfile) {
        alert('This email is already registered in the system.')
        setLoading(false)
        return
      }

      // Check for existing pending invitation
      const { data: existingInvite } = await supabase
        .from('system_admin_invitations')
        .select('id')
        .eq('invited_email', email)
        .eq('status', 'pending')
        .single()

      if (existingInvite) {
        alert('An invitation has already been sent to this email.')
        setLoading(false)
        return
      }

      // Create invitation
      const { data: invitation, error: inviteError } = await supabase
        .from('system_admin_invitations')
        .insert([{
          invited_email: email,
          invited_by_user_id: user.id,
          status: 'pending'
        }])
        .select()
        .single()

      if (inviteError) throw inviteError

      // Get inviter name
      const { data: inviterProfile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single()

      const inviterName = inviterProfile 
        ? `${inviterProfile.first_name} ${inviterProfile.last_name}`
        : 'A GrantGuardian administrator'

      // Send invitation email
      const emailResponse = await fetch('/api/send-invitation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            recipientEmail: email,
            inviterName,
            organizationName: 'GrantGuardian System Administration',
            role: 'System Administrator',
            token: invitation.token,  // Send token, not full URL
            isSystemAdmin: true
        })
        })

      const emailResult = await emailResponse.json()
        if (!emailResponse.ok) {
        throw new Error('Failed to send email: ' + JSON.stringify(emailResult))
        }

      alert('System admin invitation sent successfully!')
      setOpen(false)
      setEmail('')
      onInviteSent()

    } catch (error: any) {
      console.error('Error sending invitation:', error)
      alert('Error sending invitation: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite System Admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite System Administrator</DialogTitle>
          <DialogDescription>
            Send an invitation to join as a GrantGuardian system administrator
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@grantguardian.io"
              required
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Note:</strong> System administrators have full access to all organizations, 
              users, and support tickets across the entire platform.
            </p>
          </div>

          <div className="flex justify-end gap-2">
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