import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: grantId } = await params

  // Fetch grant + membership in parallel
  const [grantResult, membershipResult] = await Promise.all([
    supabaseAdmin
      .from('grants')
      .select('id, grant_name, funding_agency, program_type, award_number, award_amount, period_start, period_end, status, percent_complete, organization_id')
      .eq('id', grantId)
      .single(),
    supabaseAdmin
      .from('grants')
      .select('organization_id')
      .eq('id', grantId)
      .single()
  ])

  const grant = grantResult.data
  if (!grant) return NextResponse.json({ error: 'Grant not found' }, { status: 404 })

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch all related data in parallel
  const [expensesResult, paymentsResult, requirementsResult, orgResult] = await Promise.all([
    supabaseAdmin
      .from('expenses')
      .select('id, expense_date, vendor, description, amount, category, invoice_number')
      .eq('grant_id', grantId)
      .order('expense_date', { ascending: false }),
    supabaseAdmin
      .from('payments_received')
      .select('id, received_date, amount, funding_source, reference_number, notes')
      .eq('grant_id', grantId)
      .order('received_date', { ascending: false }),
    supabaseAdmin
      .from('compliance_requirements')
      .select('id, title, description, due_date, status')
      .eq('grant_id', grantId)
      .order('due_date', { ascending: true }),
    supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', grant.organization_id)
      .single()
  ])

  const expenses = expensesResult.data || []
  const payments = paymentsResult.data || []
  const orgName = orgResult.data?.name || ''

  // Compute overdue status server-side (same logic as the page)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const requirements = (requirementsResult.data || []).map((r: any) => {
    if (r.status !== 'completed' && r.due_date) {
      const due = new Date(r.due_date)
      if (due < today) return { ...r, status: 'overdue' }
    }
    return r
  })

  // Compute financials
  const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
  const totalPayments = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const awardAmount = parseFloat(grant.award_amount) || 0

  // Expenses by category
  const byCategory: Record<string, number> = {}
  for (const exp of expenses) {
    const cat = exp.category || 'Uncategorized'
    byCategory[cat] = (byCategory[cat] || 0) + (parseFloat(exp.amount) || 0)
  }
  const expensesByCategory = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  // Requirements breakdown
  const completedReqs = requirements.filter(r => r.status === 'completed')
  const openReqs = requirements.filter(r => r.status === 'open' || r.status === 'in_progress')
  const overdueReqs = requirements.filter(r => r.status === 'overdue')

  return NextResponse.json({
    grant: {
      ...grant,
      percent_complete: grant.percent_complete ?? 0,
    },
    organization: orgName,
    generatedAt: new Date().toISOString(),
    financials: {
      awardAmount,
      totalExpenses,
      totalPayments,
      remainingBudget: awardAmount - totalExpenses,
      percentExpended: awardAmount > 0 ? (totalExpenses / awardAmount) * 100 : 0,
      percentPaymentsReceived: awardAmount > 0 ? (totalPayments / awardAmount) * 100 : 0,
    },
    expensesByCategory,
    expenses,
    payments,
    requirements: {
      total: requirements.length,
      completed: completedReqs,
      open: openReqs,
      overdue: overdueReqs,
    },
  })
}
