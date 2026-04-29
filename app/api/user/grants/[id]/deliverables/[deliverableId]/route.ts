import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function authorizeDeliverable(token: string | null, deliverableId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }

  const { data: deliverable } = await supabaseAdmin
    .from('grant_deliverables')
    .select('id, grant_id, grants(organization_id)')
    .eq('id', deliverableId)
    .single()
  if (!deliverable) return { error: 'Deliverable not found', status: 404 }

  const orgId = (deliverable.grants as any)?.organization_id
  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role').eq('user_id', user.id).eq('organization_id', orgId).single()
  if (!membership || membership.role === 'viewer') return { error: 'Forbidden', status: 403 }

  return { user, deliverable }
}

// PATCH /api/user/grants/[id]/deliverables/[deliverableId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> }
) {
  const { deliverableId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeDeliverable(token, deliverableId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) updates.title = body.title.trim()
  if (body.description !== undefined) updates.description = body.description || null
  if (body.unit !== undefined) updates.unit = body.unit || null
  if (body.target_value !== undefined) updates.target_value = body.target_value != null ? parseFloat(body.target_value) : null
  if (body.actual_value !== undefined) updates.actual_value = parseFloat(body.actual_value) || 0
  if (body.status !== undefined) updates.status = body.status
  if (body.progress_percent !== undefined) updates.progress_percent = Math.min(100, Math.max(0, parseInt(body.progress_percent) || 0))
  if (body.due_date !== undefined) updates.due_date = body.due_date || null
  if (body.notes !== undefined) updates.notes = body.notes || null

  const { data, error } = await supabaseAdmin
    .from('grant_deliverables')
    .update(updates)
    .eq('id', deliverableId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deliverable: data })
}

// DELETE /api/user/grants/[id]/deliverables/[deliverableId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> }
) {
  const { deliverableId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeDeliverable(token, deliverableId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await supabaseAdmin
    .from('grant_deliverables')
    .delete()
    .eq('id', deliverableId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
