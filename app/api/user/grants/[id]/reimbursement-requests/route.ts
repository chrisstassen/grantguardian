import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ── Auth helper ──────────────────────────────────────────────────────────────
async function authorizeGrant(token: string | null, grantId: string) {
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

  return { user, grant, role: membership.role }
}

// ── GET /api/user/grants/[id]/reimbursement-requests ─────────────────────────
// Returns all requests for the grant, with expense count, total amount,
// all linked expense IDs (so the UI can compute availability), and payment info.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: grantId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeGrant(token, grantId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: requests, error } = await supabaseAdmin
    .from('reimbursement_requests')
    .select(`
      *,
      reimbursement_request_expenses (
        expense_id,
        expenses ( id, amount )
      ),
      payment:payments_received (
        id, amount, received_date, funding_source
      )
    `)
    .eq('grant_id', grantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = (requests || []).map((r: any) => {
    const rreList: any[] = r.reimbursement_request_expenses || []
    const totalAmount = rreList.reduce(
      (sum: number, rre: any) => sum + (parseFloat(rre.expenses?.amount) || 0), 0
    )
    return {
      ...r,
      expense_ids: rreList.map((rre: any) => rre.expense_id),
      expense_count: rreList.length,
      total_amount: totalAmount,
      reimbursement_request_expenses: undefined, // strip raw join
    }
  })

  return NextResponse.json({ requests: enriched })
}

// ── POST /api/user/grants/[id]/reimbursement-requests ────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: grantId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeGrant(token, grantId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  if (!body.title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const { data: rr, error } = await supabaseAdmin
    .from('reimbursement_requests')
    .insert({
      grant_id: grantId,
      organization_id: auth.grant.organization_id,
      request_number: body.request_number?.trim() || null,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: 'pending_submission',
      notes: body.notes?.trim() || null,
      created_by_user_id: auth.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: { ...rr, expense_ids: [], expense_count: 0, total_amount: 0 } })
}
