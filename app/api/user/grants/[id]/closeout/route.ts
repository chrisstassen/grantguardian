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

// GET /api/user/grants/[id]/closeout
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeGrant(token, id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await supabaseAdmin
    .from('grant_closeout_items')
    .select('*, assigned_to:user_profiles!grant_closeout_items_assigned_to_user_id_fkey(id, first_name, last_name)')
    .eq('grant_id', id)
    .order('category', { ascending: true })
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

// POST /api/user/grants/[id]/closeout
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

  // If inserting multiple items (bulk from template/AI)
  if (Array.isArray(body.items)) {
    const rows = body.items.map((item: any, idx: number) => ({
      grant_id: id,
      category: item.category || 'General',
      title: item.title,
      description: item.description || null,
      status: 'pending',
      due_date: item.due_date || null,
      assigned_to_user_id: null,
      notes: null,
      ai_generated: item.ai_generated || false,
      order_index: item.order_index ?? idx,
    }))
    const { data, error } = await supabaseAdmin
      .from('grant_closeout_items')
      .insert(rows)
      .select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data })
  }

  // Single item insert
  if (!body.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('grant_closeout_items')
    .insert([{
      grant_id: id,
      category: body.category || 'General',
      title: body.title.trim(),
      description: body.description || null,
      status: body.status || 'pending',
      due_date: body.due_date || null,
      assigned_to_user_id: body.assigned_to_user_id || null,
      notes: body.notes || null,
      ai_generated: body.ai_generated || false,
      order_index: body.order_index || 0,
    }])
    .select('*, assigned_to:user_profiles!grant_closeout_items_assigned_to_user_id_fkey(id, first_name, last_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
