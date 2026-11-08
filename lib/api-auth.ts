import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Server-side checks for API routes. Routes that use supabaseAdmin bypass
// row-level security, so they must confirm who is calling before doing anything.
//
// Usage:
//   const auth = await requireUser(request)
//   if (auth.error) return auth.error
//   const user = auth.user

type AuthResult =
  | { user: User; isSystemAdmin: boolean; error?: undefined }
  | { user?: undefined; isSystemAdmin?: undefined; error: NextResponse }

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

export async function requireUser(request: Request): Promise<AuthResult> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { error: unauthorized() }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return { error: unauthorized() }

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('is_system_admin')
    .eq('id', data.user.id)
    .maybeSingle()

  return { user: data.user, isSystemAdmin: profile?.is_system_admin === true }
}

export async function requireSystemAdmin(request: Request): Promise<AuthResult> {
  const auth = await requireUser(request)
  if (auth.error) return auth
  if (!auth.isSystemAdmin) return { error: forbidden() }
  return auth
}

// True if the caller may send email to this address: themselves, someone who
// shares an organization with them, or a GrantGuardian system admin.
// System admins may email anyone.
export async function canEmailRecipient(
  caller: { id: string; isSystemAdmin: boolean },
  recipientEmail: string
): Promise<boolean> {
  if (caller.isSystemAdmin) return true
  const email = recipientEmail.trim().toLowerCase()

  const { data: recipient } = await supabaseAdmin
    .from('user_profiles')
    .select('id, is_system_admin')
    .ilike('email', email)
    .maybeSingle()
  if (!recipient) return false
  if (recipient.id === caller.id || recipient.is_system_admin) return true

  const { data: callerOrgs } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('organization_id')
    .eq('user_id', caller.id)
  const orgIds = (callerOrgs ?? []).map(m => m.organization_id)
  if (orgIds.length === 0) return false

  const { count } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', recipient.id)
    .in('organization_id', orgIds)
  return (count ?? 0) > 0
}

export { forbidden }
