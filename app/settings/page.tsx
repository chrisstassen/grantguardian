'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InviteTeamMemberDialog } from '@/components/invite-team-member-dialog'
import { ArrowLeft, Copy, Check, Trash2, UserCog, Paperclip, LifeBuoy } from 'lucide-react'
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCog className="h-6 w-6 text-blue-600" />
                    Team Members
                  </CardTitle>
                  <CardDescription className="mt-2">
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
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => router.push('/settings/members')}
              >
                View All Members
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <LifeBuoy className="h-6 w-6 text-purple-600" />
                    Support Tickets
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {tickets.filter(ticket => ticketFilter === 'all' || ticket.status !== 'closed').length} {ticketFilter === 'active' ? 'active' : 'total'} ticket{tickets.filter(ticket => ticketFilter === 'all' || ticket.status !== 'closed').length === 1 ? '' : 's'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={ticketFilter === 'active' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTicketFilter('active')}
                  >
                    Active
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
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => router.push('/settings/tickets')}
              >
                View All Tickets
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}