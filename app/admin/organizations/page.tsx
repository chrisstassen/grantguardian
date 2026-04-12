'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search, Users, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AdminLayout } from '@/components/admin-layout'

export default function AdminOrganizationsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [organizations, setOrganizations] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')

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

    await loadOrganizations()
    setLoading(false)
  }

  const loadOrganizations = async () => {
    const res = await fetch('/api/admin/organizations')
    const json = await res.json()
    if (json.organizations) {
      setOrganizations(json.organizations)
    }
  }

  const filteredOrgs = organizations.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
  <AdminLayout
    title="Organizations"
    subtitle="View and manage all organizations"
    showBackButton={true}
  >
        {/* Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                placeholder="Search organizations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Organizations List */}
        <Card>
          <CardHeader>
            <CardTitle>All Organizations ({filteredOrgs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredOrgs.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  onClick={() => router.push(`/admin/organizations/${org.id}`)}
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{org.name}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {org.member_count} member{org.member_count !== 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Created {new Date(org.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">
                      {org.ticket_count} ticket{org.ticket_count !== 1 ? 's' : ''}
                    </Badge>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </div>
                </div>
              ))}

              {filteredOrgs.length === 0 && (
                <p className="text-center text-slate-500 py-8">
                  No organizations found
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </AdminLayout>
)
}