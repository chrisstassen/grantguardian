import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  // Verify the caller's identity using their auth token
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use the admin client (service role) to bypass the missing RLS policy
  const { data: memberships, error } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('organization_id, role, organizations(id, name)')
    .eq('user_id', user.id)

  if (error) {
    console.error('Error loading memberships for user', user.id, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const organizations = (memberships ?? []).map(m => ({
    id: m.organization_id,
    name: (m.organizations as any)?.name ?? 'Unknown',
    role: m.role
  }))

  return NextResponse.json({ organizations })
}
