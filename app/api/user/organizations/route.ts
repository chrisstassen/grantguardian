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
    .select('organization_id, role, organizations(id, name, logo_path, logo_name, plan)')
    .eq('user_id', user.id)

  if (error) {
    console.error('Error loading memberships for user', user.id, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Generate signed logo URLs in parallel
  const organizations = await Promise.all(
    (memberships ?? []).map(async (m) => {
      const org = m.organizations as any
      let logo_url: string | null = null
      if (org?.logo_path) {
        try {
          const { data } = await supabaseAdmin.storage
            .from('organization-logos')
            .createSignedUrl(org.logo_path, 86400) // 24h
          logo_url = data?.signedUrl ?? null
        } catch { /* ignore */ }
      }
      return {
        id: m.organization_id,
        name: org?.name ?? 'Unknown',
        role: m.role,
        logo_url,
        plan: org?.plan ?? 'starter',
      }
    })
  )

  return NextResponse.json({ organizations })
}
