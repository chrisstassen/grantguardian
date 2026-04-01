'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Camera, Paperclip } from 'lucide-react'
import { AppLayout } from '@/components/app-layout'

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)
  
  // Profile form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  
  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  // Support Tickets
  const [tickets, setTickets] = useState<any[]>([])
  const [ticketFilter, setTicketFilter] = useState<'all' | 'active'>('active')
  const loadTickets = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('support_tickets')
      .select('id, subject, status, priority, ticket_type, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      // Load attachment counts
      const ticketIds = data.map(t => t.id)
      const { data: attachments } = await supabase
        .from('support_ticket_attachments')
        .select('ticket_id')
        .in('ticket_id', ticketIds)

      const attachmentCounts = attachments?.reduce((acc, att) => {
        acc[att.ticket_id] = (acc[att.ticket_id] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      const ticketsWithCounts = data.map(ticket => ({
        ...ticket,
        attachment_count: attachmentCounts[ticket.id] || 0
      }))

      setTickets(ticketsWithCounts)
    } else {
      setTickets([])
    }
  }

  useEffect(() => {
    loadProfile()
    loadTickets()
  }, [])

  const loadProfile = async () => {
    // Refresh session first to get latest data
    await supabase.auth.refreshSession()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, email')
      .eq('id', user.id)
      .single()

    setUser(user)
    setEmail(profile?.email || user.email || '')
    setFirstName(profile?.first_name || '')
    setLastName(profile?.last_name || '')
    setLoading(false)
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileMessage('')
    setSaving(true)

    // Check if notification email is already in use by another user
    if (email !== user.email) {
      const { data: existingUsers } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .neq('id', user.id)

      if (existingUsers && existingUsers.length > 0) {
        setProfileMessage('This email is already in use by another user')
        setSaving(false)
        return
      }
    }

    // Update user_profiles (name + notification email)
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        email: email
      })
      .eq('id', user.id)

    setSaving(false)

    if (profileError) {
      setProfileMessage('Error updating profile: ' + profileError.message)
    } else {
      if (email !== user.email) {
        setProfileMessage('Profile updated! Your notification email is now ' + email + '. (Your login email remains ' + user.email + ')')
      } else {
        setProfileMessage('Profile updated successfully!')
      }
      loadProfile()
      setTimeout(() => setProfileMessage(''), 6000)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordMessage('')

    if (newPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setPasswordMessage('Password must be at least 6 characters')
      return
    }

    setSaving(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    setSaving(false)

    if (error) {
      setPasswordMessage('Error updating password: ' + error.message)
    } else {
      setPasswordMessage('Password updated successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordMessage(''), 3000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
  <AppLayout 
    title="My Profile" 
    showBackButton={true}
  >
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your personal details</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-500">
                  Notification email - where you'll receive grant updates and mentions.
                  {email !== user.email && (
                    <span className="block mt-1 text-amber-600">
                      Login email: {user.email} (contact admin to change)
                    </span>
                  )}
                </p>
              </div>

              {profileMessage && (
                <p className={`text-sm ${profileMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {profileMessage}
                </p>
              )}

              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  minLength={6}
                />
              </div>

              {passwordMessage && (
                <p className={`text-sm ${passwordMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {passwordMessage}
                </p>
              )}

              <Button type="submit" disabled={saving}>
                {saving ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* My Support Tickets */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Support Tickets</CardTitle>
                <CardDescription>
                  Track your support requests
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={ticketFilter === 'active' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTicketFilter('active')}
                >
                  Active Only
                </Button>
                <Button
                  variant={ticketFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTicketFilter('all')}
                >
                  All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tickets.filter(ticket => ticketFilter === 'all' || ticket.status !== 'closed').length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                {ticketFilter === 'active' ? 'No active support tickets' : 'No support tickets yet'}
              </p>
            ) : (
              <div className="space-y-2">
                {tickets
                  .filter(ticket => ticketFilter === 'all' || ticket.status !== 'closed')
                  .map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    onClick={() => router.push(`/support/tickets/${ticket.id}`)}
                  >
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-900">{ticket.subject}</h4>
                      <p className="text-sm text-slate-500">
                        {new Date(ticket.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {ticket.attachment_count > 0 && (
                        <Paperclip className="h-4 w-4 text-slate-400" />
                      )}
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        ticket.ticket_type === 'system_bug'
                          ? 'bg-red-100 text-red-800'
                          : ticket.ticket_type === 'enhancement_request'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {ticket.ticket_type.replace(/_/g, ' ')}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        ticket.status === 'open' 
                          ? 'bg-blue-100 text-blue-800' 
                          : ticket.status === 'submitted_to_grantguardian'
                          ? 'bg-purple-100 text-purple-800'
                          : ticket.status === 'grantguardian_processing_complete'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {ticket.status.replace(/_/g, ' ')}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        ticket.priority === 'urgent'
                          ? 'bg-red-100 text-red-800'
                          : ticket.priority === 'high'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {ticket.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </AppLayout>
)
}