'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search, Building2, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AdminLayout } from '@/components/admin-layout'

export default function AdminTicketsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'escalated' | 'open'>('escalated')

  useEffect(() => {
    checkSystemAdmin()
  }, [])

  const checkSystemAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_system_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_system_admin) {
      router.push('/dashboard')
      return
    }

    await loadTickets()
    setLoading(false)
  }

  const loadTickets = async () => {
    const res = await fetch('/api/admin/tickets')
    const json = await res.json()
    if (json.tickets) {
      setTickets(json.tickets)
    }
  }

  const filteredTickets = tickets.filter(ticket => {
    // Status filter
    if (statusFilter === 'escalated' && ticket.status !== 'submitted_to_grantguardian') {
      return false
    }
    if (statusFilter === 'open' && ticket.status === 'closed') {
        return false
    }

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      return (
        ticket.subject?.toLowerCase().includes(search) ||
        ticket.description?.toLowerCase().includes(search) ||
        ticket.organization?.name?.toLowerCase().includes(search) ||
        ticket.submitter?.email?.toLowerCase().includes(search)
      )
    }

    return true
  })

  const getStatusBadge = (status: string) => {
    const styles = {
      open: 'bg-blue-100 text-blue-800',
      submitted_to_grantguardian: 'bg-purple-100 text-purple-800',
      grantguardian_processing_complete: 'bg-green-100 text-green-800',
      closed: 'bg-slate-100 text-slate-800'
    }
    return styles[status as keyof typeof styles] || 'bg-slate-100 text-slate-800'
  }

  const getPriorityBadge = (priority: string) => {
    const styles = {
      urgent: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      normal: 'bg-slate-100 text-slate-600',
      low: 'bg-slate-100 text-slate-500'
    }
    return styles[priority as keyof typeof styles] || 'bg-slate-100 text-slate-600'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
  <AdminLayout
    title="Support Tickets"
    subtitle="View and manage all support tickets"
    showBackButton={true}
  >
        {/* Search and Filter */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  placeholder="Search tickets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === 'escalated' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('escalated')}
                >
                  Escalated
                </Button>
                <Button
                  variant={statusFilter === 'open' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('open')}
                >
                  Open
                </Button>
                <Button
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('all')}
                >
                  All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tickets List */}
        <Card>
          <CardHeader>
            <CardTitle>Support Tickets ({filteredTickets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-start justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  onClick={() => router.push(`/support/tickets/${ticket.id}`)}
                >
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">{ticket.subject}</h3>
                        <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                          {ticket.description}
                        </p>
                        <div className="flex items-center gap-4 mt-3 text-sm text-slate-600">
                          <div className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            {ticket.organization?.name}
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {ticket.submitter?.first_name} {ticket.submitter?.last_name}
                          </div>
                          <span>
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end ml-4">
                    <Badge className={getStatusBadge(ticket.status)}>
                      {ticket.status.replace(/_/g, ' ')}
                    </Badge>
                    <Badge className={getPriorityBadge(ticket.priority)}>
                      {ticket.priority}
                    </Badge>
                    <Badge variant="outline">
                      {ticket.ticket_type.replace(/_/g, ' ')}
                    </Badge>
                    {ticket.grantguardian_status && ticket.status === 'submitted_to_grantguardian' && (
                      <Badge variant="outline" className="text-xs">
                        GG: {ticket.grantguardian_status.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}

              {filteredTickets.length === 0 && (
                <p className="text-center text-slate-500 py-8">
                  No tickets found
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </AdminLayout>
)
}