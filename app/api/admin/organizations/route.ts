import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data: orgs, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .order('name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ organizations: [] })
    }

    const orgIds = orgs.map(o => o.id)

    // Fetch membership + ticket data in two queries (no N+1 loops)
    const [{ data: memberships }, { data: tickets }] = await Promise.all([
      supabaseAdmin
        .from('user_organization_memberships')
        .select('organization_id')
        .in('organization_id', orgIds),
      supabaseAdmin
        .from('support_tickets')
        .select('organization_id')
        .in('organization_id', orgIds)
    ])

    const orgsWithCounts = orgs.map(org => ({
      ...org,
      member_count: (memberships ?? []).filter(m => m.organization_id === org.id).length,
      ticket_count: (tickets ?? []).filter(t => t.organization_id === org.id).length
    }))

    return NextResponse.json({ organizations: orgsWithCounts })
  } catch (err: any) {
    console.error('Admin organizations API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
