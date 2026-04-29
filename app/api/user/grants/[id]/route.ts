import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Verify JWT
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: grantId } = await params

  // Confirm the grant exists and get its org
  const { data: grant, error: grantError } = await supabaseAdmin
    .from('grants')
    .select('id, organization_id')
    .eq('id', grantId)
    .single()

  if (grantError || !grant) {
    return NextResponse.json({ error: 'Grant not found' }, { status: 404 })
  }

  // Confirm caller is a non-viewer member of that org
  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()

  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('grants')
    .update({
      grant_name: body.grant_name,
      funding_agency: body.funding_agency,
      program_type: body.program_type ?? null,
      award_number: body.award_number ?? null,
      award_amount: body.award_amount != null ? parseFloat(body.award_amount) : null,
      period_start: body.period_start ?? null,
      period_end: body.period_end ?? null,
      status: body.status,
      award_letter_url: body.award_letter_url ?? null,
      award_letter_name: body.award_letter_name ?? null,
      percent_complete: body.percent_complete != null ? Math.min(100, Math.max(0, parseInt(body.percent_complete))) : 0,
      scope_of_work: body.scope_of_work ?? null,
      total_project_cost: body.total_project_cost != null ? parseFloat(body.total_project_cost) : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', grantId)
    .select()
    .single()

  if (updateError) {
    console.error('Grant update error:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ grant: updated })
}
