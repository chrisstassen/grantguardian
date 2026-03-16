'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InviteTeamMemberDialog } from '@/components/invite-team-member-dialog'
import { ArrowLeft, Copy, Check, Trash2, UserCog, Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useOrganization } from '@/contexts/organization-context'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'


interface TeamMember {
  id: string
  first_name: string
  last_name: string
  role: string
  created_at: string
}

export default function SettingsPage() {
  const router = useRouter()
  const { activeOrg, loading: orgLoading } = useOrganization()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [organizationName, setOrganizationName] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [tickets, setTickets] = useState<any[]>([])
  const [ticketFilter, setTicketFilter] = useState<'all' | 'active'>('active')
  const loadOrgTickets = async (organizationId: string) => {
    console.log('Loading tickets for org:', organizationId)
    
    // Load tickets without the join
    const { data, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, subject, status, priority, ticket_type, created_at, user_id')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    console.log('Tickets loaded:', data, ticketError)

    if (data && data.length > 0) {
      // Load user profiles separately
      const userIds = [...new Set(data.map(t => t.user_id))]
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name')
        .in('id', userIds)

      // Load attachment counts for all tickets
      const ticketIds = data.map(t => t.id)
      const { data: attachments } = await supabase
        .from('support_ticket_attachments')
        .select('ticket_id')
        .in('ticket_id', ticketIds)

      // Count attachments per ticket
      const attachmentCounts = attachments?.reduce((acc, att) => {
        acc[att.ticket_id] = (acc[att.ticket_id] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      // Attach profiles and attachment counts to tickets
      const ticketsWithProfiles = data.map(ticket => ({
        ...ticket,
        user_profiles: profiles?.find(p => p.id === ticket.user_id) || null,
        attachment_count: attachmentCounts[ticket.id] || 0
      }))

      console.log('Tickets with profiles:', ticketsWithProfiles)
      setTickets(ticketsWithProfiles)
    } else {
      setTickets([])
    }
  }

  useEffect(() => {
    if (!orgLoading) {
      checkAdminAndLoadData()
    }
  }, [orgLoading, activeOrg])

  const checkAdminAndLoadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Wait for org context to load
    if (orgLoading) return

    // Check if user is admin of active org
    if (!activeOrg || activeOrg.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    setCurrentUserId(user.id)
    setIsAdmin(true)
    setOrganizationName(activeOrg.name)
    setOrganizationId(activeOrg.id)
    setInviteCode('') // We'll load this separately

    // Load invite code
    const { data: org } = await supabase
      .from('organizations')
      .select('invite_code')
      .eq('id', activeOrg.id)
      .single()

    if (org) {
      setInviteCode(org.invite_code)
    }

    await loadTeamMembers(activeOrg.id)
    await loadOrgTickets(activeOrg.id)
    setLoading(false)
  }

  const loadTeamMembers = async (organizationId: string) => {
    console.log('Loading members for org:', organizationId)
    
    // Load team members from memberships table
    const { data: memberships, error } = await supabase
      .from('user_organization_memberships')
      .select('user_id, role, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    console.log('Memberships loaded:', memberships, error)

    if (memberships && memberships.length > 0) {
      // Load user profiles for each membership
      const userIds = memberships.map(m => m.user_id)
      
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds)

      console.log('Profiles loaded:', profiles, profileError)

      if (profiles) {
        const formattedMembers = memberships.map(m => {
          const profile = profiles.find(p => p.id === m.user_id)
          return {
            id: m.user_id,
            first_name: profile?.first_name || '',
            last_name: profile?.last_name || '',
            email: profile?.email || '',
            role: m.role,
            created_at: m.created_at
          }
        })
        
        console.log('Formatted members:', formattedMembers)
        setTeamMembers(formattedMembers)
      }
    }
  }

  const handleCopyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode)
    alert('Invite code copied to clipboard!')
  }

  const handleRemoveUser = async (userId: string) => {
    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId)

    if (error) {
      alert('Error removing user: ' + error.message)
    } else {
      setTeamMembers(teamMembers.filter(m => m.id !== userId))
      alert('User removed successfully')
    }
  }

  const handleChangeRole = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      alert('Error updating role: ' + error.message)
    } else {
      setTeamMembers(teamMembers.map(m => 
        m.id === userId ? { ...m, role: newRole } : m
      ))
      alert('Role updated successfully')
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/dashboard')}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold text-slate-900">Organization Settings</h1>
          <p className="text-slate-600 mt-1">{organizationName}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Invite Code */}
        <Card>
          <CardHeader>
            <CardTitle>Invite Code</CardTitle>
            <CardDescription>
              Share this code with team members to join your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <code className="flex-1 px-4 py-3 bg-slate-100 rounded-md text-lg font-mono font-semibold">
                {inviteCode}
              </code>
              <Button onClick={handleCopyInviteCode} variant="outline">
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  {teamMembers.length} member{teamMembers.length === 1 ? '' : 's'}
                </CardDescription>
              </div>
              <InviteTeamMemberDialog 
                organizationId={organizationId}
                organizationName={organizationName}
                onInviteSent={() => loadTeamMembers(organizationId)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-slate-900">
                        {member.first_name} {member.last_name}
                      </p>
                      {member.id === currentUserId && (
                        <Badge variant="outline" className="text-xs">You</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      Joined {new Date(member.created_at).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Role Selector */}
                    <Select
                      value={member.role}
                      onValueChange={(value) => handleChangeRole(member.id, value)}
                      disabled={member.id === currentUserId}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Remove User Button */}
                    {member.id !== currentUserId && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove {member.first_name} {member.last_name} from your organization. 
                              They will lose access to all grants and data.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveUser(member.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Remove User
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Organization Support Tickets */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Support Tickets</CardTitle>
                <CardDescription>
                  All support requests for your organization
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
                          Submitted by {ticket.user_profiles?.first_name} {ticket.user_profiles?.last_name} on{' '}
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
      </main>
    </div>
  )
}