import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { organization_id } = body

  if (!organization_id) {
    return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
  }

  // Confirm caller is a non-viewer member of the org
  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', organization_id)
    .single()

  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: grant, error: insertError } = await supabaseAdmin
    .from('grants')
    .insert([{
      organization_id,
      grant_name: body.grant_name,
      funding_agency: body.funding_agency,
      program_type: body.program_type ?? null,
      award_number: body.award_number ?? null,
      award_amount: body.award_amount != null ? parseFloat(body.award_amount) : null,
      period_start: body.period_start ?? null,
      period_end: body.period_end ?? null,
      status: body.status || 'active',
      award_letter_url: body.award_letter_url ?? null,
      award_letter_name: body.award_letter_name ?? null,
      special_conditions: body.special_conditions ?? null,
    }])
    .select()
    .single()

  if (insertError) {
    console.error('Grant insert error:', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ grant })
}

export async function GET(request: Request) {
  // Verify the caller's identity
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const orgId = searchParams.get('orgId')

  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

  // Verify the user actually belongs to this org
  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch grants for the org
  const { data: grants, error: grantsError } = await supabaseAdmin
    .from('grants')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (grantsError) {
    console.error('Error fetching grants:', grantsError)
    return NextResponse.json({ error: grantsError.message }, { status: 500 })
  }

  if (!grants || grants.length === 0) {
    return NextResponse.json({ grants: [] })
  }

  // Fetch all expenses for these grants in one query
  const grantIds = grants.map(g => g.id)
  const { data: expenses } = await supabaseAdmin
    .from('expenses')
    .select('grant_id, amount')
    .in('grant_id', grantIds)

  // Attach totals to each grant
  const grantsWithExpenses = grants.map(grant => {
    const totalExpenses = (expenses ?? [])
      .filter(e => e.grant_id === grant.id)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0)

    return {
      ...grant,
      total_expenses: totalExpenses,
      balance: (grant.award_amount ?? 0) - totalExpenses
    }
  })

  return NextResponse.json({ grants: grantsWithExpenses })
}
