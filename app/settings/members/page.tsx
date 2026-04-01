'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InviteTeamMemberDialog } from '@/components/invite-team-member-dialog'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useOrganization } from '@/contexts/organization-context'
import { AppLayout } from '@/components/app-layout'
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
  email: string
  role: string
  created_at: string
}

export default function SettingsMembersPage() {
  const router = useRouter()
  const { activeOrg, loading: orgLoading } = useOrganization()
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
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

    setCurrentUserId(user.id)
    setOrganizationName(activeOrg.name)
    setOrganizationId(activeOrg.id)

    await loadTeamMembers(activeOrg.id)
    setLoading(false)
  }

  const loadTeamMembers = async (organizationId: string) => {
    const { data: memberships } = await supabase
      .from('user_organization_memberships')
      .select('user_id, role, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (memberships && memberships.length > 0) {
      const userIds = [...new Set(memberships.map(m => m.user_id))]
      
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds)

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
        
        setTeamMembers(formattedMembers)
      }
    }
  }

  const handleRemoveUser = async (userId: string) => {
    const { error } = await supabase
      .from('user_organization_memberships')
      .delete()
      .eq('user_id', userId)
      .eq('organization_id', organizationId)

    if (error) {
      alert('Error removing user: ' + error.message)
    } else {
      setTeamMembers(teamMembers.filter(m => m.id !== userId))
      alert('User removed successfully')
    }
  }

  const handleChangeRole = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from('user_organization_memberships')
      .update({ role: newRole })
      .eq('user_id', userId)
      .eq('organization_id', organizationId)

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
  <AppLayout 
    title="Team Members" 
    subtitle={organizationName}
    showBackButton={true}
    backUrl="/settings"
  >
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
                    <p className="text-sm text-slate-500 mt-1">{member.email}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      Joined {new Date(member.created_at).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
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
      </AppLayout>
)
}