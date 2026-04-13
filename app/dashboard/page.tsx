'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AddGrantDialog } from '@/components/add-grant-dialog'
import { OrganizationSwitcher } from '@/components/organization-switcher'
import { useOrganization } from '@/contexts/organization-context'
import { NotificationsDropdown } from '@/components/notifications-dropdown'
import { ComplianceHealthPanel } from '@/components/compliance-health-panel'
import { ShieldCheck, CalendarDays, LayoutDashboard } from 'lucide-react'

interface Grant {
  id: string
  grant_name: string
  funding_agency: string
  award_amount: number | null
  period_start: string | null
  period_end: string | null
  status: string
  total_expenses?: number
  balance?: number
}

export default function DashboardPage() {
  const router = useRouter()
  const { activeOrg, loading: orgLoading } = useOrganization()
  
  const [user, setUser] = useState<any>(null)
  const [grants, setGrants] = useState<Grant[]>([])
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!orgLoading) {
      checkUser()
    }
  }, [orgLoading, activeOrg])

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    console.log('Dashboard checkUser:', { user: !!user, activeOrg, orgLoading })
    
    if (!user) {
      router.push('/login')
      return
    }

    if (orgLoading) {
      return // Still loading, don't do anything
    }

    // Check if system admin
    const { data: adminProfile } = await supabase
      .from('user_profiles')
      .select('is_system_admin')
      .eq('id', user.id)
      .single()

    // System admins don't need an org - redirect to admin dashboard
    if (adminProfile?.is_system_admin) {
      router.push('/admin')
      return
    }

    // If no active org after loading is complete, go to onboarding
    if (!activeOrg) {
      console.log('No active org, redirecting to onboarding')
      router.push('/onboarding')
      return
    }

    console.log('Active org found:', activeOrg)
    
    setUser(user)
    setIsAdmin(activeOrg.role === 'admin')

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()

    setUserProfile(profile)

    await loadGrants()
    setLoading(false)
  }

  const loadGrants = async () => {
    if (!activeOrg) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch(`/api/user/grants?orgId=${activeOrg.id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })

    if (!res.ok) {
      console.error('Error loading grants:', await res.text())
      return
    }

    const json = await res.json()
    setGrants(json.grants ?? [])
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-slate-900">GrantGuardian</h1>
              <OrganizationSwitcher />
            </div>
            <nav className="hidden md:flex items-center gap-1">
              <a href="/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-slate-100 text-slate-900">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </a>
              <a href="/compliance" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors">
                <ShieldCheck className="h-4 w-4" />
                Compliance
              </a>
              <a href="/calendar" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors">
                <CalendarDays className="h-4 w-4" />
                Calendar
              </a>
            </nav>
          </div>
          <div className="flex gap-2 items-center">
            <NotificationsDropdown />
            
            {isAdmin && (
              <Button onClick={() => router.push('/settings')} variant="outline">
                Settings
              </Button>
            )}
            <Button onClick={() => router.push('/profile')} variant="outline">
              Profile
            </Button>
            <Button onClick={handleSignOut} variant="outline">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Dashboard</h2>
            <p className="text-slate-600 mt-2">
              Welcome back, {userProfile?.first_name || user?.email}
            </p>
          </div>
          {activeOrg?.role !== 'viewer' && (
            <AddGrantDialog onGrantAdded={loadGrants} />
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Grants</CardTitle>
              <CardDescription>Grants currently being managed</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">
                {grants.filter(g => g.status === 'active').length}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Funding</CardTitle>
              <CardDescription>Combined award amounts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">
                {formatCurrency(
                  grants.reduce((sum, g) => sum + (g.award_amount || 0), 0)
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Grants</CardTitle>
              <CardDescription>All grants in system</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{grants.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Compliance health panel */}
        <div className="mb-6">
          <ComplianceHealthPanel />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Grants</CardTitle>
            <CardDescription>
              {grants.length === 0 
                ? 'No grants yet. Click "Add Grant" to get started!' 
                : `Managing ${grants.length} grant${grants.length === 1 ? '' : 's'}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {grants.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p className="text-lg mb-4">You haven't added any grants yet.</p>
                <p>Click the "Add Grant" button above to get started!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-sm text-slate-600">
                      <th className="pb-3 font-medium">Grant Name</th>
                      <th className="pb-3 font-medium">Agency</th>
                      <th className="pb-3 font-medium">Award Amount</th>
                      <th className="pb-3 font-medium">Expended</th>
                      <th className="pb-3 font-medium">Balance</th>
                      <th className="pb-3 font-medium">Performance Period</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((grant) => (
                      <tr key={grant.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-4 font-medium text-slate-900">
                          <a 
                            href={`/grants/${grant.id}`} 
                            className="hover:text-blue-600 hover:underline cursor-pointer"
                          >
                            {grant.grant_name}
                          </a>
                        </td>
                        <td className="py-4 text-slate-600">{grant.funding_agency}</td>
                        <td className="py-4 text-slate-900">{formatCurrency(grant.award_amount)}</td>
                        <td className="py-4 text-blue-600 font-medium">{formatCurrency(grant.total_expenses || 0)}</td>
                        <td className={`py-4 font-medium ${(grant.balance || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(grant.balance || 0)}
                        </td>
                        <td className="py-4 text-slate-600 text-sm">
                          {formatDate(grant.period_start)} - {formatDate(grant.period_end)}
                        </td>
                        <td className="py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            grant.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : grant.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}>
                            {grant.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}