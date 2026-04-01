'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search, Building2, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { InviteSystemAdminDialog } from '@/components/invite-system-admin-dialog'
import { AdminLayout } from '@/components/admin-layout'

export default function AdminUsersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
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

    await loadUsers()
    setLoading(false)
  }

  const loadUsers = async () => {
    // Load all users
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (profiles) {
      // Load organization memberships for each user
      const usersWithOrgs = await Promise.all(
        profiles.map(async (profile) => {
          const { data: memberships } = await supabase
            .from('user_organization_memberships')
            .select('organization_id, role, organizations(name)')
            .eq('user_id', profile.id)

          return {
            ...profile,
            organizations: memberships || []
          }
        })
      )

      setUsers(usersWithOrgs)
    }
  }

  const filteredUsers = users.filter(user =>
    user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
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
    title="Users" 
    subtitle="Manage all users in the system"
    showBackButton={true}
  >
        {/* Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
                <CardTitle>All Users ({filteredUsers.length})</CardTitle>
                <InviteSystemAdminDialog onInviteSent={loadUsers} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-sm text-slate-600">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Organizations</th>
                    <th className="pb-3 font-medium">System Admin</th>
                    <th className="pb-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-4 font-medium text-slate-900">
                        {user.first_name} {user.last_name}
                      </td>
                      <td className="py-4 text-slate-600">
                        {user.email}
                      </td>
                      <td className="py-4">
                        {user.organizations.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {user.organizations.map((membership: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-slate-400" />
                                <span className="text-sm text-slate-700">
                                  {(membership.organizations as any)?.name}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {membership.role}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">No organizations</span>
                        )}
                      </td>
                      <td className="py-4">
                        {user.is_system_admin && (
                          <Badge className="bg-purple-100 text-purple-800">
                            <Shield className="h-3 w-3 mr-1" />
                            System Admin
                          </Badge>
                        )}
                      </td>
                      <td className="py-4 text-sm text-slate-600">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredUsers.length === 0 && (
                <p className="text-center text-slate-500 py-8">
                  No users found
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </AdminLayout>
)
}