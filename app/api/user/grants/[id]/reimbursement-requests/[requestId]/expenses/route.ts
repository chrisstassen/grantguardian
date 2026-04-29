import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ── Auth helper ──────────────────────────────────────────────────────────────
async function authorize(token: string | null, grantId: string, requestId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 as const }
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { error: 'Unauthorized', status: 401 as const }

  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('id, organization_id')
    .eq('id', grantId)
    .single()
  if (!grant) return { error: 'Grant not found', status: 404 as const }

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()
  if (!membership) return { error: 'Forbidden', status: 403 as const }

  const { data: rr } = await supabaseAdmin
    .from('reimbursement_requests')
    .select('id')
    .eq('id', requestId)
    .eq('grant_id', grantId)
    .single()
  if (!rr) return { error: 'Reimbursement request not found', status: 404 as const }

  return { user, grant, role: membership.role }
}

// ── PUT /api/user/grants/[id]/reimbursement-requests/[requestId]/expenses ────
// Bulk-replaces all linked expenses for this request.
// Body: { expense_ids: string[] }
// Only expenses not already linked to a DIFFERENT request are accepted.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: grantId, requestId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId, requestId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const expenseIds: string[] = Array.isArray(body.expense_ids) ? body.expense_ids : []

  // Check none of the requested IDs are already linked to a DIFFERENT request
  if (expenseIds.length > 0) {
    const { data: conflicts } = await supabaseAdmin
      .from('reimbursement_request_expenses')
      .select('expense_id, reimbursement_request_id')
      .in('expense_id', expenseIds)
      .neq('reimbursement_request_id', requestId)

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json({
        error: 'One or more expenses are already linked to a different request',
        conflicting_expense_ids: conflicts.map((c: any) => c.expense_id),
      }, { status: 409 })
    }
  }

  // Delete existing links for this request
  await supabaseAdmin
    .from('reimbursement_request_expenses')
    .delete()
    .eq('reimbursement_request_id', requestId)

  // Insert new links
  if (expenseIds.length > 0) {
    const rows = expenseIds.map(expenseId => ({
      reimbursement_request_id: requestId,
      expense_id: expenseId,
    }))
    const { error: insertError } = await supabaseAdmin
      .from('reimbursement_request_expenses')
      .insert(rows)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Recompute total for response
  const { data: expenses } = await supabaseAdmin
    .from('expenses')
    .select('id, amount')
    .in('id', expenseIds.length > 0 ? expenseIds : ['00000000-0000-0000-0000-000000000000'])

  const total = (expenses || []).reduce((s: number, e: any) => s + (parseFloat(e.amount) || 0), 0)

  return NextResponse.json({ success: true, expense_count: expenseIds.length, total_amount: total })
}
