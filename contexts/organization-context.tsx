'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { getActiveOrgId, setActiveOrgId } from '@/lib/active-org'

interface Organization {
  id: string
  name: string
  role: string
}

interface OrganizationContextType {
  activeOrg: Organization | null
  organizations: Organization[]
  switchOrganization: (orgId: string) => void
  loading: boolean
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Do NOT call loadOrganizations() directly on mount.
    // Instead, wait for INITIAL_SESSION — this fires once the Supabase client has
    // restored the session from storage, guaranteeing auth.getUser() will succeed.
    // This prevents the race condition where loadOrganizations() runs before the
    // session is available and incorrectly clears the active org.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('OrganizationContext: Auth state changed:', event, !!session)

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) {
          loadOrganizations()
        } else {
          // No session on initial load (user is not logged in)
          setOrganizations([])
          setActiveOrg(null)
          setLoading(false)
        }
      } else if (event === 'SIGNED_OUT') {
        setOrganizations([])
        setActiveOrg(null)
        setLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const loadOrganizations = async () => {
    setLoading(true)

    // Use getSession() (cached, no server round-trip) to get the access token
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      console.log('OrganizationContext: No session, skipping org load')
      setOrganizations([])
      setActiveOrg(null)
      setLoading(false)
      return
    }

    console.log('OrganizationContext: Loading orgs for user:', session.user.id)

    // Fetch via server-side route to bypass RLS on user_organization_memberships
    try {
      const res = await fetch('/api/user/organizations', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const json = await res.json()

      if (!res.ok) {
        console.error('OrganizationContext: API error loading memberships:', json.error)
        setOrganizations([])
        setActiveOrg(null)
        setLoading(false)
        return
      }

      const orgs: Organization[] = json.organizations ?? []
      console.log('OrganizationContext: Orgs loaded:', orgs)

      if (orgs.length > 0) {
        setOrganizations(orgs)

        // Restore previously active org from localStorage, or fall back to first
        const savedOrgId = getActiveOrgId()
        const orgToActivate = (savedOrgId && orgs.find(o => o.id === savedOrgId)) || orgs[0]

        console.log('OrganizationContext: Active org set to:', orgToActivate)
        setActiveOrg(orgToActivate)
        setActiveOrgId(orgToActivate.id)
      } else {
        console.log('OrganizationContext: No memberships found for user')
        setOrganizations([])
        setActiveOrg(null)
      }
    } catch (err) {
      console.error('OrganizationContext: Unexpected error loading orgs:', err)
      setOrganizations([])
      setActiveOrg(null)
    }

    setLoading(false)
    console.log('OrganizationContext: Loading complete')
  }

  const switchOrganization = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId)
    if (org) {
      setActiveOrg(org)
      setActiveOrgId(orgId)
      // Reload the page to refresh all data for new org
      window.location.reload()
    }
  }

  return (
    <OrganizationContext.Provider value={{ activeOrg, organizations, switchOrganization, loading }}>
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (context === undefined) {
    throw new Error('useOrganization must be used within OrganizationProvider')
  }
  return context
}