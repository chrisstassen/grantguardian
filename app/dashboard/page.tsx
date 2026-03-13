'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AddGrantDialog } from '@/components/add-grant-dialog'
import { LogOut, Settings, Bell } from 'lucide-react'

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
  const [user, setUser] = useState<any>(null)
  const [grants, setGrants] = useState<Grant[]>([])
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const router = useRouter() 

const loadGrants = async () => {
  const { data: grantsData, error: grantsError } = await supabase
    .from('grants')
    .select('*')
    .order('created_at', { ascending: false })

  if (grantsError) {
    console.error('Error loading grants:', grantsError)
    return
  }

  // Load expenses for each grant
  const grantsWithExpenses = await Promise.all(
    (grantsData || []).map(async (grant) => {
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('grant_id', grant.id)
      
      const totalExpenses = expenses?.reduce((sum, exp) => sum + parseFloat(exp.amount), 0) || 0
      
      return {
        ...grant,
        total_expenses: totalExpenses,
        balance: (grant.award_amount || 0) - totalExpenses
      }
    })
  )

  setGrants(grantsWithExpenses)
}

const loadUnreadNotifications = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  if (!error && count !== null) {
    setUnreadCount(count)
  }
}

  useEffect(() => {
    const checkUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    router.push('/login')
    return
  }

  // Check if user has an organization and get profile info
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id, role, first_name, last_name, organizations(name)')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.organization_id) {
    router.push('/onboarding')
    return
  }

  setUser(user)
  setUserProfile(profile)
  setOrganizationName((profile as any).organizations?.name || '')
  setIsAdmin(profile.role === 'admin')

  // Load unread notifications count
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  if (count !== null) {
    setUnreadCount(count)
  }

  await loadGrants()
  setLoading(false)
}

    checkUser()
  }, [router])

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-900">
            GrantGuardian{organizationName ? `: ${organizationName}` : ''}
          </h1>
          <div className="flex gap-2 items-center">
            <Link href="/notifications" className="relative">
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            
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
            {userProfile?.role !== 'viewer' && (
                <AddGrantDialog onGrantAdded={loadGrants} />
            )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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