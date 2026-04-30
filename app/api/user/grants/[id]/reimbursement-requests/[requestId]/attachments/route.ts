import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ── Auth helper ──────────────────────────────────────────────────────────────
async function authorize(token: string | null, grantId: string, requestId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 as const }
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { error: 'Unauthorized', status: 401 as const }

  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('id, organization_id')
    .eq('id', grantId)
    .single()
  if (!grant) return { error: 'Grant not found', status: 404 as const }

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()
  if (!membership) return { error: 'Forbidden', status: 403 as const }

  const { data: rr } = await supabaseAdmin
    .from('reimbursement_requests')
    .select('id')
    .eq('id', requestId)
    .eq('grant_id', grantId)
    .single()
  if (!rr) return { error: 'Request not found', status: 404 as const }

  return { user, grant, role: membership.role }
}

// ── GET: list attachments with signed download URLs ──────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: grantId, requestId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId, requestId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: attachments, error } = await supabaseAdmin
    .from('grant_request_attachments')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate 1-hour signed URLs so the client can download directly
  const withUrls = await Promise.all((attachments || []).map(async (att) => {
    const { data } = await supabaseAdmin.storage
      .from('grant-request-attachments')
      .createSignedUrl(att.file_path, 3600)
    return { ...att, download_url: data?.signedUrl ?? null }
  }))

  return NextResponse.json({ attachments: withUrls })
}

// ── POST: upload a file ──────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: grantId, requestId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId, requestId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${requestId}/${Date.now()}_${safeName}`
  const bytes = await file.arrayBuffer()

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('grant-request-attachments')
    .upload(filePath, bytes, { contentType: file.type || 'application/octet-stream' })

  if (uploadErr) return NextResponse.json({ error: 'Upload failed: ' + uploadErr.message }, { status: 500 })

  const { data: att, error: dbErr } = await supabaseAdmin
    .from('grant_request_attachments')
    .insert({
      request_id: requestId,
      uploaded_by_user_id: auth.user.id,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
    })
    .select()
    .single()

  if (dbErr) {
    // Clean up the uploaded file if the DB insert fails
    await supabaseAdmin.storage.from('grant-request-attachments').remove([filePath])
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ attachment: att }, { status: 201 })
}

// ── DELETE: remove an attachment (pass ?attachmentId=... in query) ───────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: grantId, requestId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId, requestId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const attachmentId = request.nextUrl.searchParams.get('attachmentId')
  if (!attachmentId) return NextResponse.json({ error: 'attachmentId query param required' }, { status: 400 })

  const { data: att } = await supabaseAdmin
    .from('grant_request_attachments')
    .select('file_path')
    .eq('id', attachmentId)
    .eq('request_id', requestId)
    .single()

  if (!att) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

  await supabaseAdmin.storage.from('grant-request-attachments').remove([att.file_path])

  const { error } = await supabaseAdmin
    .from('grant_request_attachments')
    .delete()
    .eq('id', attachmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
