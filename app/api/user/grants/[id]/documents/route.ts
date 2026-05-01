import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ── Types ──────────────────────────────────────────────────────────────────────

export type DocumentSource = 'award_letter' | 'general' | 'expense' | 'request'

export interface UnifiedDocument {
  id: string
  file_name: string
  file_type: string
  file_size: number | null
  source: DocumentSource
  source_label: string    // human-readable detail (vendor name, request title, etc.)
  download_url: string | null
  created_at: string
  can_delete: boolean     // true only for 'general' source
  grant_document_id?: string  // for deletes
}

// ── Auth helper ────────────────────────────────────────────────────────────────

async function authorize(token: string | null, grantId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 as const }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { error: 'Unauthorized', status: 401 as const }

  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('id, organization_id, award_letter_url, award_letter_name, created_at')
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

  return { user, grant, role: membership.role }
}

// ── GET: unified document list ─────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: grantId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { grant } = auth
  const docs: UnifiedDocument[] = []

  // ── 1. Award Letter ─────────────────────────────────────────────────────────
  if (grant.award_letter_url) {
    let awardUrl: string | null = null
    try {
      const { data } = await supabaseAdmin.storage
        .from('award-letters')
        .createSignedUrl(grant.award_letter_url, 3600)
      awardUrl = data?.signedUrl ?? null
    } catch { /* ignore */ }

    docs.push({
      id: 'award-letter',
      file_name: grant.award_letter_name || 'Award Letter',
      file_type: grant.award_letter_name?.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
      file_size: null,
      source: 'award_letter',
      source_label: 'Award Letter',
      download_url: awardUrl,
      created_at: grant.created_at ?? new Date().toISOString(),
      can_delete: false,
    })
  }

  // ── 2. General grant documents ──────────────────────────────────────────────
  const { data: generalDocs } = await supabaseAdmin
    .from('grant_documents')
    .select('*')
    .eq('grant_id', grantId)
    .order('created_at', { ascending: false })

  if (generalDocs && generalDocs.length > 0) {
    const paths = generalDocs.map((d) => d.file_path)
    const { data: signedList } = await supabaseAdmin.storage
      .from('grant-documents')
      .createSignedUrls(paths, 3600)

    const urlMap = new Map((signedList || []).map((s) => [s.path, s.signedUrl]))

    for (const d of generalDocs) {
      docs.push({
        id: d.id,
        file_name: d.file_name,
        file_type: d.file_type,
        file_size: d.file_size,
        source: 'general',
        source_label: d.description || 'General Document',
        download_url: urlMap.get(d.file_path) ?? null,
        created_at: d.created_at,
        can_delete: true,
        grant_document_id: d.id,
      })
    }
  }

  // ── 3. Expense supporting documents ────────────────────────────────────────
  const debugExpense: Record<string, unknown> = {}
  try {
    const { data: grantExpenses, error: expErr1 } = await supabaseAdmin
      .from('expenses')
      .select('id, vendor, category')
      .eq('grant_id', grantId)

    debugExpense.expensesError = expErr1?.message ?? null
    debugExpense.expensesCount = grantExpenses?.length ?? 0

    if (grantExpenses && grantExpenses.length > 0) {
      const expenseIds = grantExpenses.map((e) => e.id)
      const expenseMap = new Map(grantExpenses.map((e) => [e.id, e]))

      const { data: expenseDocs, error: expErr2 } = await supabaseAdmin
        .from('expense_documents')
        .select('*')
        .in('expense_id', expenseIds)
        .order('created_at', { ascending: false })

      debugExpense.expenseDocsError = expErr2?.message ?? null
      debugExpense.expenseDocsCount = expenseDocs?.length ?? 0
      if (expenseDocs?.[0]) debugExpense.expenseDocSample = Object.keys(expenseDocs[0])

      if (expenseDocs && expenseDocs.length > 0) {
        const withUrls = await Promise.all(
          expenseDocs.map(async (d) => {
            const { data, error: urlErr } = await supabaseAdmin.storage
              .from('expense-documents')
              .createSignedUrl(d.file_path, 3600)
            if (urlErr) console.error('[documents] signed URL error for', d.file_path, urlErr)
            return { ...d, signedUrl: data?.signedUrl ?? null }
          })
        )

        for (const d of withUrls) {
          const exp = expenseMap.get(d.expense_id)
          const label = exp
            ? [exp.vendor, exp.category].filter(Boolean).join(' · ')
            : 'Expense Document'

          docs.push({
            id: d.id,
            file_name: d.file_name,
            file_type: d.file_type || 'application/octet-stream',
            file_size: d.file_size ?? null,
            source: 'expense',
            source_label: label || 'Expense Document',
            download_url: d.signedUrl,
            created_at: d.created_at,
            can_delete: false,
          })
        }
      }
    }
  } catch (err) {
    console.error('[documents] expense docs section threw:', err)
    debugExpense.threw = String(err)
  }

  // ── 4. Request attachments ──────────────────────────────────────────────────
  // grant_request_attachments links to reimbursement_requests (which has grant_id).
  try {
    const { data: grantRequests } = await supabaseAdmin
      .from('reimbursement_requests')
      .select('id, title, request_type')
      .eq('grant_id', grantId)

    if (grantRequests && grantRequests.length > 0) {
      const requestIds = grantRequests.map((r) => r.id)
      const requestMap = new Map(grantRequests.map((r) => [r.id, r]))

      const { data: requestAttachments } = await supabaseAdmin
        .from('grant_request_attachments')
        .select('id, file_name, file_path, file_type, file_size, created_at, request_id')
        .in('request_id', requestIds)
        .order('created_at', { ascending: false })

      if (requestAttachments && requestAttachments.length > 0) {
        const withUrls = await Promise.all(
          requestAttachments.map(async (d) => {
            const { data } = await supabaseAdmin.storage
              .from('grant-request-attachments')
              .createSignedUrl(d.file_path, 3600)
            return { ...d, signedUrl: data?.signedUrl ?? null }
          })
        )

        for (const d of withUrls) {
          const req = requestMap.get(d.request_id)
          const label = req ? (req.title || req.request_type || 'Request') : 'Request Attachment'

          docs.push({
            id: d.id,
            file_name: d.file_name,
            file_type: d.file_type || 'application/octet-stream',
            file_size: d.file_size,
            source: 'request',
            source_label: label,
            download_url: d.signedUrl,
            created_at: d.created_at,
            can_delete: false,
          })
        }
      }
    }
  } catch (err) {
    console.error('[documents] request attachments section failed:', err)
  }

  // Award letter always first; everything else newest-first
  const awardLetter = docs.filter((d) => d.source === 'award_letter')
  const rest = docs
    .filter((d) => d.source !== 'award_letter')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({
    documents: [...awardLetter, ...rest],
    _debug: { expense: debugExpense },
  })
}

// ── POST: upload a general document ───────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: grantId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const description = (formData.get('description') as string | null) || null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${grantId}/${Date.now()}_${safeName}`
  const bytes = await file.arrayBuffer()

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('grant-documents')
    .upload(filePath, bytes, { contentType: file.type || 'application/octet-stream' })

  if (uploadErr) {
    return NextResponse.json({ error: 'Upload failed: ' + uploadErr.message }, { status: 500 })
  }

  const { data: doc, error: dbErr } = await supabaseAdmin
    .from('grant_documents')
    .insert({
      grant_id: grantId,
      organization_id: auth.grant.organization_id,
      uploaded_by_user_id: auth.user.id,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      description,
    })
    .select()
    .single()

  if (dbErr) {
    await supabaseAdmin.storage.from('grant-documents').remove([filePath])
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ document: doc }, { status: 201 })
}

// ── DELETE: remove a general document ─────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: grantId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const documentId = request.nextUrl.searchParams.get('documentId')
  if (!documentId) {
    return NextResponse.json({ error: 'documentId query param required' }, { status: 400 })
  }

  const { data: doc } = await supabaseAdmin
    .from('grant_documents')
    .select('file_path')
    .eq('id', documentId)
    .eq('grant_id', grantId)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  await supabaseAdmin.storage.from('grant-documents').remove([doc.file_path])

  const { error } = await supabaseAdmin
    .from('grant_documents')
    .delete()
    .eq('id', documentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
