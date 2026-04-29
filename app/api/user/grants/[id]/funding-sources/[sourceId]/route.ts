import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function authorizeSource(token: string | null, sourceId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }

  const { data: source } = await supabaseAdmin
    .from('grant_funding_sources')
    .select('id, grant_id, grants(organization_id)')
    .eq('id', sourceId)
    .single()
  if (!source) return { error: 'Funding source not found', status: 404 }

  const orgId = (source.grants as any)?.organization_id
  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role').eq('user_id', user.id).eq('organization_id', orgId).single()
  if (!membership || membership.role === 'viewer') return { error: 'Forbidden', status: 403 }

  return { user, source }
}

// PATCH /api/user/grants/[id]/funding-sources/[sourceId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { sourceId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeSource(token, sourceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.source_name !== undefined) updates.source_name = body.source_name.trim()
  if (body.source_type !== undefined) updates.source_type = body.source_type
  if (body.amount !== undefined) updates.amount = parseFloat(body.amount)
  if (body.notes !== undefined) updates.notes = body.notes || null

  const { data, error } = await supabaseAdmin
    .from('grant_funding_sources')
    .update(updates)
    .eq('id', sourceId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}

// DELETE /api/user/grants/[id]/funding-sources/[sourceId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { sourceId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeSource(token, sourceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await supabaseAdmin
    .from('grant_funding_sources')
    .delete()
    .eq('id', sourceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
