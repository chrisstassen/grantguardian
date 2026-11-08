import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, forbidden } from '@/lib/api-auth'

// Changes a user's login email immediately (no confirmation email).
// Callers may only change their own email; system admins may change anyone's.
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error

  try {
    const { userId, newEmail } = await request.json()

    if (!userId || !newEmail) {
      return NextResponse.json({ error: 'Missing userId or newEmail' }, { status: 400 })
    }
    if (userId !== auth.user.id && !auth.isSystemAdmin) {
      return forbidden()
    }

    const email = String(newEmail).trim().toLowerCase()

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, { email })
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({ email })
      .eq('id', userId)
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Email updated' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Email update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
