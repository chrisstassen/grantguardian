import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function authorizeItem(token: string | null, itemId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }

  const { data: item } = await supabaseAdmin
    .from('grant_closeout_items')
    .select('id, grant_id, grants(organization_id)')
    .eq('id', itemId)
    .single()
  if (!item) return { error: 'Item not found', status: 404 }

  const orgId = (item.grants as any)?.organization_id
  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role').eq('user_id', user.id).eq('organization_id', orgId).single()
  if (!membership || membership.role === 'viewer') return { error: 'Forbidden', status: 403 }

  return { user, item }
}

// PATCH /api/user/grants/[id]/closeout/[itemId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeItem(token, itemId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) updates.title = body.title.trim()
  if (body.description !== undefined) updates.description = body.description || null
  if (body.category !== undefined) updates.category = body.category || 'General'
  if (body.status !== undefined) updates.status = body.status
  if (body.due_date !== undefined) updates.due_date = body.due_date || null
  if (body.assigned_to_user_id !== undefined) updates.assigned_to_user_id = body.assigned_to_user_id || null
  if (body.notes !== undefined) updates.notes = body.notes || null
  if (body.order_index !== undefined) updates.order_index = body.order_index

  const { data, error } = await supabaseAdmin
    .from('grant_closeout_items')
    .update(updates)
    .eq('id', itemId)
    .select('*, assigned_to:user_profiles!grant_closeout_items_assigned_to_user_id_fkey(id, first_name, last_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE /api/user/grants/[id]/closeout/[itemId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeItem(token, itemId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await supabaseAdmin
    .from('grant_closeout_items')
    .delete()
    .eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
