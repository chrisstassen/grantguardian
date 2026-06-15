import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Org details
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Members with profiles
    const { data: memberships } = await supabaseAdmin
      .from('user_organization_memberships')
      .select('user_id, role, is_primary, created_at')
      .eq('organization_id', id)
      .order('created_at', { ascending: true })

    const userIds = (memberships ?? []).map(m => m.user_id)
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .in('id', userIds)
      : { data: [] }

    const members = (memberships ?? []).map(m => {
      const profile = (profiles ?? []).find(p => p.id === m.user_id)
      return {
        user_id: m.user_id,
        role: m.role,
        is_primary: m.is_primary,
        joined_at: m.created_at,
        first_name: profile?.first_name ?? '',
        last_name: profile?.last_name ?? '',
        email: profile?.email ?? '',
      }
    })

    // Grants summary
    const { data: grants } = await supabaseAdmin
      .from('grants')
      .select('id, grant_name, funding_agency, status, award_amount, created_at')
      .eq('organization_id', id)
      .order('created_at', { ascending: false })

    // Support tickets
    const { data: tickets } = await supabaseAdmin
      .from('support_tickets')
      .select('id, subject, status, priority, created_at')
      .eq('organization_id', id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ org, members, grants: grants ?? [], tickets: tickets ?? [] })
  } catch (err: any) {
    console.error('Admin org detail error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Only allow updating plan for now
    const allowed = ['plan']
    const updates = Object.fromEntries(
      Object.entries(body).filter(([k]) => allowed.includes(k))
    )

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ org: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
