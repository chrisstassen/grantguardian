import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/user/expense-allocations?grantId=xxx
// Returns all expense_budget_allocations for expenses belonging to a grant
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const grantId = request.nextUrl.searchParams.get('grantId')
  if (!grantId) return NextResponse.json({ error: 'grantId required' }, { status: 400 })

  // Verify membership
  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('id, organization_id')
    .eq('id', grantId)
    .single()

  if (!grant) return NextResponse.json({ error: 'Grant not found' }, { status: 404 })

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch all expense IDs for this grant, then their allocations
  const { data: expenses } = await supabaseAdmin
    .from('expenses')
    .select('id')
    .eq('grant_id', grantId)

  if (!expenses || expenses.length === 0) {
    return NextResponse.json({ allocations: [] })
  }

  const expenseIds = expenses.map(e => e.id)

  const { data: allocations, error } = await supabaseAdmin
    .from('expense_budget_allocations')
    .select('id, expense_id, budget_line_item_id, allocated_amount')
    .in('expense_id', expenseIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ allocations: allocations || [] })
}
