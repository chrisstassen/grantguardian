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

// GET /api/user/grants/[id]/funding-sources
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeGrant(token, id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await supabaseAdmin
    .from('grant_funding_sources')
    .select('*')
    .eq('grant_id', id)
    .order('amount', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data || [] })
}

// POST /api/user/grants/[id]/funding-sources
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
  if (!body.source_name?.trim()) return NextResponse.json({ error: 'source_name required' }, { status: 400 })
  if (!body.amount || parseFloat(body.amount) <= 0) return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('grant_funding_sources')
    .insert([{
      grant_id: id,
      source_name: body.source_name.trim(),
      source_type: body.source_type || 'other',
      amount: parseFloat(body.amount),
      notes: body.notes || null,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data }, { status: 201 })
}
