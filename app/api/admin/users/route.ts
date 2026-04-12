import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data: profiles, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ users: [] })
    }

    const userIds = profiles.map(p => p.id)

    // Fetch all memberships in one query (no N+1)
    const { data: allMemberships } = await supabaseAdmin
      .from('user_organization_memberships')
      .select('user_id, organization_id, role')
      .in('user_id', userIds)

    // Fetch org names for all referenced orgs
    const orgIds = [...new Set((allMemberships ?? []).map(m => m.organization_id))]
    const { data: orgs } = orgIds.length > 0
      ? await supabaseAdmin.from('organizations').select('id, name').in('id', orgIds)
      : { data: [] }

    const users = profiles.map(profile => ({
      ...profile,
      organizations: (allMemberships ?? [])
        .filter(m => m.user_id === profile.id)
        .map(m => ({
          organization_id: m.organization_id,
          role: m.role,
          organizations: { name: orgs?.find(o => o.id === m.organization_id)?.name ?? 'Unknown' }
        }))
    }))

    return NextResponse.json({ users })
  } catch (err: any) {
    console.error('Admin users API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
