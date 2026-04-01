'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useOrganization } from '@/contexts/organization-context'
import { AppLayout } from '@/components/app-layout'

export default function SettingsTicketsPage() {
  const router = useRouter()
  const { activeOrg, loading: orgLoading } = useOrganization()
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<any[]>([])
  const [ticketFilter, setTicketFilter] = useState<'all' | 'active'>('active')
  const [organizationName, setOrganizationName] = useState('')

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

    if (orgLoading) return

    if (!activeOrg || activeOrg.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    setOrganizationName(activeOrg.name)
    await loadOrgTickets(activeOrg.id)
    setLoading(false)
  }

  const loadOrgTickets = async (organizationId: string) => {
    const { data } = await supabase
      .from('support_tickets')
      .select('id, subject, status, priority, ticket_type, created_at, user_id')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(t => t.user_id))]
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name')
        .in('id', userIds)

      const ticketIds = data.map(t => t.id)
      const { data: attachments } = await supabase
        .from('support_ticket_attachments')
        .select('ticket_id')
        .in('ticket_id', ticketIds)

      const attachmentCounts = attachments?.reduce((acc, att) => {
        acc[att.ticket_id] = (acc[att.ticket_id] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      const ticketsWithProfiles = data.map(ticket => ({
        ...ticket,
        user_profiles: profiles?.find(p => p.id === ticket.user_id) || null,
        attachment_count: attachmentCounts[ticket.id] || 0
      }))

      setTickets(ticketsWithProfiles)
    } else {
      setTickets([])
    }
  }

  const filteredTickets = tickets.filter(ticket => 
    ticketFilter === 'all' || ticket.status !== 'closed'
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
  <AppLayout
    title="Support Tickets"
    subtitle={organizationName}
    showBackButton={true}
    backUrl="/settings"
  >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                All Support Tickets ({filteredTickets.length})
              </CardTitle>
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
            {filteredTickets.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                {ticketFilter === 'active' ? 'No active support tickets' : 'No support tickets yet'}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredTickets.map((ticket) => (
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
      </AppLayout>
)
}