'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
    loadOrganizations()
    loadUserName()
  }, [])

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

    // Create user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert([{
        id: user.id,
        organization_id: selectedOrgId,
        role: 'staff',
        first_name: userName.first_name,
        last_name: userName.last_name
      }])

    setLoading(false)

    if (profileError) {
      setError('Error joining organization: ' + profileError.message)
    } else {
      router.push('/dashboard')
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

    // Create user profile as admin
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert([{
        id: user.id,
        organization_id: org.id,
        role: 'admin',
        first_name: userName.first_name,
        last_name: userName.last_name
      }])

    setLoading(false)

    if (profileError) {
      setError('Error creating profile: ' + profileError.message)
    } else {
      router.push('/dashboard')
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
                <Label htmlFor="organization">Select Your Organization</Label>
                <select
                  id="organization"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                >
                  <option value="">Choose organization...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
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