import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function authorizeGrant(token: string | null, grantId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }

  const { data: grant } = await supabaseAdmin
    .from('grants').select('id, organization_id').eq('id', grantId).single()
  if (!grant) return { error: 'Grant not found', status: 404 }

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role').eq('user_id', user.id).eq('organization_id', grant.organization_id).single()
  if (!membership) return { error: 'Forbidden', status: 403 }

  return { user, grant, role: membership.role }
}

// GET /api/user/grants/[id]/deliverables
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeGrant(token, id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await supabaseAdmin
    .from('grant_deliverables')
    .select('*')
    .eq('grant_id', id)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deliverables: data || [] })
}

// POST /api/user/grants/[id]/deliverables
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeGrant(token, id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  if (!body.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('grant_deliverables')
    .insert([{
      grant_id: id,
      title: body.title.trim(),
      description: body.description || null,
      unit: body.unit || null,
      target_value: body.target_value != null ? parseFloat(body.target_value) : null,
      actual_value: body.actual_value != null ? parseFloat(body.actual_value) : 0,
      status: body.status || 'not_started',
      progress_percent: body.progress_percent != null ? Math.min(100, Math.max(0, parseInt(body.progress_percent))) : 0,
      due_date: body.due_date || null,
      notes: body.notes || null,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deliverable: data }, { status: 201 })
}
