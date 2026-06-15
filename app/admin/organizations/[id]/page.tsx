'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AdminLayout } from '@/components/admin-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Building2,
  Users,
  FileText,
  LifeBuoy,
  Calendar,
  Sparkles,
  ShieldCheck,
  Crown,
} from 'lucide-react'

interface OrgDetail {
  id: string
  name: string
  plan: 'starter' | 'pro'
  created_at: string
}

interface Member {
  user_id: string
  role: string
  joined_at: string
  first_name: string
  last_name: string
  email: string
}

interface Grant {
  id: string
  grant_name: string
  funding_agency: string
  status: string
  award_amount: number | null
  created_at: string
}

interface Ticket {
  id: string
  subject: string
  status: string
  priority: string
  created_at: string
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-violet-100 text-violet-800',
  staff: 'bg-blue-100 text-blue-800',
  viewer: 'bg-slate-100 text-slate-700',
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-800',
  closed:    'bg-slate-100 text-slate-700',
  closeout:  'bg-blue-100 text-blue-800',
  open:      'bg-yellow-100 text-yellow-800',
  resolved:  'bg-green-100 text-green-800',
  escalated: 'bg-red-100 text-red-800',
}

function fmt(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function AdminOrgDetailPage() {
  const router = useRouter()
  const params = useParams()
  const orgId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])

  useEffect(() => {
    checkAdminAndLoad()
  }, [orgId])

  const checkAdminAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_system_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_system_admin) { router.push('/admin'); return }

    const res = await fetch(`/api/admin/organizations/${orgId}`)
    if (!res.ok) { router.push('/admin/organizations'); return }

    const json = await res.json()
    setOrg(json.org)
    setMembers(json.members ?? [])
    setGrants(json.grants ?? [])
    setTickets(json.tickets ?? [])
    setLoading(false)
  }

  const handlePlanChange = async (newPlan: string) => {
    if (!org) return
    setSaving(true)
    const res = await fetch(`/api/admin/organizations/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: newPlan }),
    })
    if (res.ok) {
      const json = await res.json()
      setOrg(json.org)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading…</p>
      </div>
    )
  }

  if (!org) return null

  const activeGrants = grants.filter(g => g.status === 'active').length

  return (
    <AdminLayout
      title={org.name}
      subtitle="Organization details"
      showBackButton
      backUrl="/admin/organizations"
    >
      {/* ── Overview row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Members', value: members.length, icon: <Users className="h-4 w-4 text-blue-500" /> },
          { label: 'Total Grants', value: grants.length, icon: <FileText className="h-4 w-4 text-indigo-500" /> },
          { label: 'Active Grants', value: activeGrants, icon: <ShieldCheck className="h-4 w-4 text-green-500" /> },
          { label: 'Support Tickets', value: tickets.length, icon: <LifeBuoy className="h-4 w-4 text-orange-500" /> },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                {stat.icon}
                {stat.label}
              </div>
              <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6">

        {/* ── Left column ── */}
        <div className="space-y-6">

          {/* Org info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Organization Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-slate-500 text-xs mb-0.5">Name</p>
                <p className="font-medium text-slate-900">{org.name}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-0.5">Created</p>
                <p className="font-medium text-slate-900">{new Date(org.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Org ID</p>
                <p className="font-mono text-xs text-slate-600 break-all">{org.id}</p>
              </div>
            </CardContent>
          </Card>

          {/* Plan management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-violet-500" />
                Subscription Plan
              </CardTitle>
              <CardDescription>Change the organization's plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                {org.plan === 'pro' ? (
                  <Badge className="bg-violet-100 text-violet-800 border-violet-200 flex items-center gap-1">
                    <Crown className="h-3 w-3" /> Pro
                  </Badge>
                ) : (
                  <Badge variant="outline">Starter</Badge>
                )}
              </div>
              <Select value={org.plan} onValueChange={handlePlanChange} disabled={saving}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter — up to 5 grants &amp; members</SelectItem>
                  <SelectItem value="pro">Pro — unlimited everything + AI</SelectItem>
                </SelectContent>
              </Select>
              {saving && <p className="text-xs text-slate-500">Saving…</p>}
            </CardContent>
          </Card>
        </div>

        {/* ── Middle column — Members ── */}
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Members ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-4">No members yet</p>
                )}
                {members.map(m => (
                  <div key={m.user_id} className="flex items-start justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-900 truncate">
                        {m.first_name} {m.last_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{m.email}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Joined {new Date(m.joined_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={`text-xs flex-shrink-0 ${ROLE_COLORS[m.role] ?? 'bg-slate-100 text-slate-700'}`}>
                      {m.role}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right column — Grants + Tickets ── */}
        <div className="space-y-6">

          {/* Grants */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Grants ({grants.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {grants.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-4">No grants yet</p>
                )}
                {grants.map(g => (
                  <div key={g.id} className="py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm text-slate-900 leading-snug">{g.grant_name}</p>
                      <Badge className={`text-xs flex-shrink-0 ${STATUS_COLORS[g.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {g.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{g.funding_agency}</p>
                    <p className="text-xs text-slate-400">{fmt(g.award_amount)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tickets */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LifeBuoy className="h-4 w-4" />
                Support Tickets ({tickets.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tickets.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-4">No tickets</p>
                )}
                {tickets.map(t => (
                  <div
                    key={t.id}
                    className="py-2 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 -mx-1 px-1 rounded"
                    onClick={() => router.push(`/support/tickets/${t.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm text-slate-900 leading-snug">{t.subject}</p>
                      <Badge className={`text-xs flex-shrink-0 ${STATUS_COLORS[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {t.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">{t.priority}</Badge>
                      <span className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  )
}
