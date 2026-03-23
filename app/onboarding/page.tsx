'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function OnboardingPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'choose' | 'join' | 'create'>('choose')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userName, setUserName] = useState({ first_name: '', last_name: '' })
  
  // For joining existing org
  const [organizations, setOrganizations] = useState<any[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  
  // For creating new org
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    checkIfSystemAdmin()
    loadOrganizations()
    loadUserName()
  }, [])

  const checkIfSystemAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_system_admin')
      .eq('id', user.id)
      .single()

    if (profile?.is_system_admin) {
      // Redirect system admins to admin dashboard
      router.push('/admin')
    }
  }

  const loadOrganizations = async () => {
    const { data } = await supabase
      .from('organizations')
      .select('id, name')
      .order('name')
    
    if (data) {
      setOrganizations(data)
    }
  }

  const loadUserName = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.user_metadata) {
      setUserName({
        first_name: user.user_metadata.first_name || '',
        last_name: user.user_metadata.last_name || ''
      })
    }
  }

  const handleJoinOrganization = async () => {
    setError('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in')
      setLoading(false)
      return
    }

    // Verify invite code
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, invite_code')
      .eq('id', selectedOrgId)
      .single()

    if (orgError || !org || org.invite_code !== inviteCode) {
      setError('Invalid invite code')
      setLoading(false)
      return
    }

    // Create or update user profile (without organization_id)
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert([{
        id: user.id,
        first_name: userName.first_name,
        last_name: userName.last_name,
        email: user.email
      }])

    if (profileError) {
      setError('Error creating profile: ' + profileError.message)
      setLoading(false)
      return
    }

    // Create organization membership
    const { error: membershipError } = await supabase
      .from('user_organization_memberships')
      .insert([{
        user_id: user.id,
        organization_id: org.id,
        role: 'staff',
        is_primary: true
      }])

    setLoading(false)

    if (membershipError) {
      setError('Error joining organization: ' + membershipError.message)
    } else {
      // Force full page reload to refresh organization context
      window.location.href = '/dashboard'
    }
  }

  const handleCreateOrganization = async () => {
    setError('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be logged in')
      setLoading(false)
      return
    }

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name: orgName }])
      .select()
      .single()

    if (orgError) {
      setError('Error creating organization: ' + orgError.message)
      setLoading(false)
      return
    }

    // Create or update user profile (without organization_id)
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert([{
        id: user.id,
        first_name: userName.first_name,
        last_name: userName.last_name,
        email: user.email
      }])

    if (profileError) {
      setError('Error creating profile: ' + profileError.message)
      setLoading(false)
      return
    }

    // Create organization membership as admin
    const { error: membershipError } = await supabase
      .from('user_organization_memberships')
      .insert([{
        user_id: user.id,
        organization_id: org.id,
        role: 'admin',
        is_primary: true
      }])

    setLoading(false)

    if (membershipError) {
      setError('Error creating membership: ' + membershipError.message)
    } else {
      // Force full page reload to refresh organization context
      window.location.href = '/dashboard'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to GrantGuardian</CardTitle>
          <CardDescription>
            {mode === 'choose' && 'Set up your organization'}
            {mode === 'join' && 'Join your organization'}
            {mode === 'create' && 'Create your organization'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'choose' && (
            <div className="space-y-4">
              <Button 
                onClick={() => setMode('join')} 
                className="w-full h-20 text-lg"
                variant="outline"
              >
                <div className="text-left">
                  <div className="font-semibold">My organization already uses GrantGuardian</div>
                  <div className="text-sm text-slate-600 font-normal">Join with an invite code</div>
                </div>
              </Button>
              
              <Button 
                onClick={() => setMode('create')} 
                className="w-full h-20 text-lg"
              >
                <div className="text-left">
                  <div className="font-semibold">I'm setting up GrantGuardian for my organization</div>
                  <div className="text-sm opacity-90 font-normal">Create a new organization</div>
                </div>
              </Button>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Your Organization</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {selectedOrgId
                        ? organizations.find((org) => org.id === selectedOrgId)?.name
                        : "Search for your organization..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Type to search organizations..." />
                      <CommandEmpty>No organization found.</CommandEmpty>
                      <CommandGroup>
                        {organizations.map((org) => (
                          <CommandItem
                            key={org.id}
                            value={org.name}
                            onSelect={() => {
                              setSelectedOrgId(org.id)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedOrgId === org.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {org.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inviteCode">Invite Code</Label>
                <Input
                  id="inviteCode"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Enter your organization's invite code"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setMode('choose')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleJoinOrganization} 
                  disabled={loading || !selectedOrgId || !inviteCode}
                  className="flex-1"
                >
                  {loading ? 'Joining...' : 'Join Organization'}
                </Button>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g., United Way of Central Texas"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setMode('choose')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleCreateOrganization} 
                  disabled={loading || !orgName}
                  className="flex-1"
                >
                  {loading ? 'Creating...' : 'Create Organization'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}