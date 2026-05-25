import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const BUCKET = 'organization-logos'
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']

// ── Auth helper ────────────────────────────────────────────────────────────────
async function authorizeAdmin(token: string | null, orgId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 as const }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { error: 'Unauthorized', status: 401 as const }

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .single()

  if (!membership) return { error: 'Forbidden', status: 403 as const }
  if (membership.role !== 'admin') return { error: 'Admin role required', status: 403 as const }

  return { user, orgId }
}

// ── POST: upload logo ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null

  const formData = await request.formData()
  const orgId = formData.get('orgId') as string | null
  const file  = formData.get('file') as File | null

  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })
  if (!file)  return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const auth = await authorizeAdmin(token, orgId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File must be PNG, JPEG, WebP, or SVG' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Logo must be under 2 MB' }, { status: 400 })
  }

  // Remove old logo if exists
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('logo_path')
    .eq('id', orgId)
    .single()

  if (org?.logo_path) {
    await supabaseAdmin.storage.from(BUCKET).remove([org.logo_path])
  }

  // Upload new logo
  const ext      = file.name.split('.').pop()?.toLowerCase() || 'png'
  const filePath = `${orgId}/logo_${Date.now()}.${ext}`
  const bytes    = await file.arrayBuffer()

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filePath, bytes, { contentType: file.type, upsert: false })

  if (uploadErr) {
    return NextResponse.json({ error: 'Upload failed: ' + uploadErr.message }, { status: 500 })
  }

  // Generate a signed URL (24 h) to return to client immediately
  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 86400)

  // Persist path in DB
  const { error: dbErr } = await supabaseAdmin
    .from('organizations')
    .update({ logo_path: filePath, logo_name: file.name })
    .eq('id', orgId)

  if (dbErr) {
    await supabaseAdmin.storage.from(BUCKET).remove([filePath])
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ logo_url: signed?.signedUrl ?? null, logo_path: filePath })
}

// ── DELETE: remove logo ────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const { searchParams } = request.nextUrl
  const orgId = searchParams.get('orgId')

  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  const auth = await authorizeAdmin(token, orgId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('logo_path')
    .eq('id', orgId)
    .single()

  if (org?.logo_path) {
    await supabaseAdmin.storage.from(BUCKET).remove([org.logo_path])
  }

  await supabaseAdmin
    .from('organizations')
    .update({ logo_path: null, logo_name: null })
    .eq('id', orgId)

  return NextResponse.json({ success: true })
}
