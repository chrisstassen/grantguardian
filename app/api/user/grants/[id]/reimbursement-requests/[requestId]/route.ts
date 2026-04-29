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

// ── GET /api/user/grants/[id]/reimbursement-requests/[requestId] ──────────────
// Returns full request details including linked expenses with all fields.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: grantId, requestId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId, requestId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: rr, error } = await supabaseAdmin
    .from('reimbursement_requests')
    .select(`
      *,
      reimbursement_request_expenses (
        id,
        expense_id,
        expenses (
          id, expense_date, vendor, amount, category, description, invoice_number
        )
      ),
      payment:payments_received (
        id, amount, received_date, funding_source, description
      )
    `)
    .eq('id', requestId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const expenses = (rr.reimbursement_request_expenses || []).map((rre: any) => rre.expenses)
  const totalAmount = expenses.reduce((sum: number, e: any) => sum + (parseFloat(e?.amount) || 0), 0)

  return NextResponse.json({
    request: {
      ...rr,
      expenses,
      expense_count: expenses.length,
      total_amount: totalAmount,
      reimbursement_request_expenses: undefined,
    }
  })
}

// ── PATCH /api/user/grants/[id]/reimbursement-requests/[requestId] ─────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: grantId, requestId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId, requestId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  if (body.title !== undefined) updates.title = body.title?.trim() || ''
  if (body.request_number !== undefined) updates.request_number = body.request_number?.trim() || null
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.status !== undefined) updates.status = body.status
  if (body.submitted_date !== undefined) updates.submitted_date = body.submitted_date || null
  if (body.payment_received_id !== undefined) updates.payment_received_id = body.payment_received_id || null
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null

  const { data: updated, error } = await supabaseAdmin
    .from('reimbursement_requests')
    .update(updates)
    .eq('id', requestId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: updated })
}

// ── DELETE /api/user/grants/[id]/reimbursement-requests/[requestId] ────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: grantId, requestId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId, requestId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabaseAdmin
    .from('reimbursement_requests')
    .delete()
    .eq('id', requestId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
