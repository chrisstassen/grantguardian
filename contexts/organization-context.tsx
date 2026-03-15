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
    loadOrganizations()
    
    // Listen for auth changes and reload orgs
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('OrganizationContext: Auth state changed:', event, !!session)
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadOrganizations()
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
    setLoading(true) // Ensure loading is true while we work
    
    const { data: { user } } = await supabase.auth.getUser()
    
    console.log('OrganizationContext: Loading orgs for user:', !!user, user?.id)
    
    if (!user) {
        console.log('OrganizationContext: No user yet, waiting...')
        setOrganizations([])
        setActiveOrg(null)
        setLoading(false)
        return
    }

    // Load all organizations user belongs to
    const { data: memberships, error } = await supabase
        .from('user_organization_memberships')
        .select('organization_id, role, organizations(id, name)')
        .eq('user_id', user.id)

    console.log('OrganizationContext: Memberships loaded:', memberships, error)

    if (memberships && memberships.length > 0) {
        const orgs = memberships.map(m => ({
        id: m.organization_id,
        name: (m.organizations as any).name,
        role: m.role
        }))
        
        console.log('OrganizationContext: Formatted orgs:', orgs)
        
        setOrganizations(orgs)

        // Set active org from localStorage or use first org
        const savedOrgId = getActiveOrgId()
        const orgToActivate = savedOrgId 
        ? orgs.find(o => o.id === savedOrgId) || orgs[0]
        : orgs[0]

        console.log('OrganizationContext: Active org set to:', orgToActivate)

        if (orgToActivate) {
        setActiveOrg(orgToActivate)
        setActiveOrgId(orgToActivate.id)
        }
        
        // Wait a tiny bit to ensure state has updated
        await new Promise(resolve => setTimeout(resolve, 50))
    } else {
        console.log('OrganizationContext: No memberships found')
        setOrganizations([])
        setActiveOrg(null)
    }

    setLoading(false) // Only set loading false at the very end
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