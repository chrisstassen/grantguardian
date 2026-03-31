'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Building2, Users, LifeBuoy, Search } from 'lucide-react'

export default function AdminDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isSystemAdmin, setIsSystemAdmin] = useState(false)
  const [stats, setStats] = useState({
    totalOrgs: 0,
    totalUsers: 0,
    escalatedTickets: 0,
    openTickets: 0
  })

  useEffect(() => {
    checkSystemAdmin()
  }, [])

  const checkSystemAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        router.push('/login')
        return
    }

    // Check if user is system admin
    const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('is_system_admin')
        .eq('id', user.id)
        .single()

    if (error || !profile) {
        // Profile might not exist yet - wait and try again
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        const { data: retryProfile } = await supabase
        .from('user_profiles')
        .select('is_system_admin')
        .eq('id', user.id)
        .single()
        
        if (!retryProfile?.is_system_admin) {
        router.push('/dashboard')
        return
        }
    } else if (!profile.is_system_admin) {
        router.push('/dashboard')
        return
    }

    setIsSystemAdmin(true)
    await loadStats()
    setLoading(false)
  }

  const loadStats = async () => {
    // Load organization count
    const { count: orgCount } = await supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true })

    // Load user count
    const { count: userCount } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })

    // Load escalated ticket count
    const { count: escalatedCount } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'submitted_to_grantguardian')

    // Load open ticket count
    const { count: openCount } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .in('status', ['submitted_to_grantguardian', 'grantguardian_processing_complete'])

    setStats({
      totalOrgs: orgCount || 0,
      totalUsers: userCount || 0,
      escalatedTickets: escalatedCount || 0,
      openTickets: openCount || 0
    })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
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
          <div>
            <h1 className="text-2xl font-bold text-slate-900">GrantGuardian Admin</h1>
            <p className="text-sm text-slate-600">System Administration</p>
          </div>
          <div className="flex gap-2">
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
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900">System Dashboard</h2>
          <p className="text-slate-600 mt-2">Manage organizations, users, and support tickets</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                Organizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{stats.totalOrgs}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" />
                Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{stats.totalUsers}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LifeBuoy className="h-5 w-5 text-purple-600" />
                Escalated Tickets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{stats.escalatedTickets}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LifeBuoy className="h-5 w-5 text-orange-600" />
                Open Tickets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{stats.openTickets}</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push('/admin/organizations')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-6 w-6 text-blue-600" />
                Organizations
              </CardTitle>
              <CardDescription>
                View and manage all organizations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                View All Organizations
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push('/admin/users')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-6 w-6 text-green-600" />
                Users
              </CardTitle>
              <CardDescription>
                View and manage all users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                View All Users
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push('/admin/tickets')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LifeBuoy className="h-6 w-6 text-purple-600" />
                Support Tickets
              </CardTitle>
              <CardDescription>
                Manage escalated support requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                View All Tickets
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}