import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// POST /api/user/grants/[id]/notes/[noteId]/replies
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id: grantId, noteId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null

  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { content } = body
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })

  // Fetch note + grant in parallel
  const [noteRes, grantRes, authorProfileRes] = await Promise.all([
    supabaseAdmin
      .from('grant_notes')
      .select('id, grant_id, created_by_user_id, content')
      .eq('id', noteId)
      .single(),
    supabaseAdmin
      .from('grants')
      .select('id, grant_name, organization_id')
      .eq('id', grantId)
      .single(),
    supabaseAdmin
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single(),
  ])

  if (!noteRes.data) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  if (!grantRes.data) return NextResponse.json({ error: 'Grant not found' }, { status: 404 })

  // Verify org membership
  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grantRes.data.organization_id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const authorName = authorProfileRes.data
    ? `${authorProfileRes.data.first_name} ${authorProfileRes.data.last_name}`
    : 'A team member'
  const grant = grantRes.data
  const note = noteRes.data

  // 1. Insert reply
  const { data: reply, error: replyError } = await supabaseAdmin
    .from('grant_note_replies')
    .insert([{ note_id: noteId, created_by_user_id: user.id, content: content.trim() }])
    .select()
    .single()

  if (replyError || !reply) {
    return NextResponse.json({ error: replyError?.message || 'Failed to create reply' }, { status: 500 })
  }

  // 2. Collect everyone in the thread (note author + all recipients), excluding the replier
  const { data: noteRecipients } = await supabaseAdmin
    .from('note_recipients')
    .select('user_id')
    .eq('note_id', noteId)

  const usersToNotify = new Set<string>()
  if (note.created_by_user_id !== user.id) usersToNotify.add(note.created_by_user_id)
  noteRecipients?.forEach(r => { if (r.user_id !== user.id) usersToNotify.add(r.user_id) })

  if (usersToNotify.size > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('id, first_name, last_name, email')
      .in('id', Array.from(usersToNotify))

    if (profiles && profiles.length > 0) {
      const noteLink = `/grants/${grantId}?tab=notes`

      // 3. In-app notifications
      await supabaseAdmin.from('notifications').insert(
        profiles.map(p => ({
          user_id: p.id,
          type: 'note_reply',
          title: 'New reply on a note',
          message: `${authorName} replied to a note on "${grant.grant_name}"`,
          grant_id: grantId,
          note_id: noteId,
          link: noteLink,
        }))
      )

      // 4. Emails — include both original note snippet and the reply
      const replyPreview = content.length > 300 ? content.slice(0, 300) + '…' : content
      const originalPreview = note.content.length > 150 ? note.content.slice(0, 150) + '…' : note.content

      await Promise.allSettled(
        profiles
          .filter(p => p.email)
          .map(p =>
            resend.emails.send({
              from: 'GrantGuardian <notifications@grantguardian.io>',
              to: p.email,
              subject: `${authorName} replied to a note — ${grant.grant_name}`,
              html: buildReplyEmail({
                recipientName: `${p.first_name} ${p.last_name}`,
                authorName,
                grantName: grant.grant_name,
                originalContent: originalPreview,
                replyContent: replyPreview,
                noteLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://grantguardian.io'}${noteLink}`,
              }),
            })
          )
      )
    }
  }

  return NextResponse.json({ reply })
}

function buildReplyEmail({
  recipientName,
  authorName,
  grantName,
  originalContent,
  replyContent,
  noteLink,
}: {
  recipientName: string
  authorName: string
  grantName: string
  originalContent: string
  replyContent: string
  noteLink: string
}) {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background-color: #1e293b; color: white; padding: 20px 30px; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { padding: 30px; background: #f8fafc; border: 1px solid #e2e8f0; }
    .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 6px; }
    .original-note { background: #f1f5f9; border-left: 3px solid #cbd5e1; padding: 12px 14px; border-radius: 0 6px 6px 0; font-size: 13px; color: #64748b; margin-bottom: 16px; }
    .reply-note { background: white; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 0 6px 6px 0; font-size: 14px; color: #374151; }
    .button { display: inline-block; background-color: #1e293b; color: white !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 24px; font-weight: 600; font-size: 14px; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>GrantGuardian</h1></div>
    <div class="content">
      <p style="margin-top:0">Hi ${recipientName},</p>
      <p><strong>${authorName}</strong> replied to a note thread on <strong>${grantName}</strong>.</p>
      <div class="label">Original note</div>
      <div class="original-note">${escape(originalContent)}</div>
      <div class="label">${authorName}'s reply</div>
      <div class="reply-note">${escape(replyContent)}</div>
      <a href="${noteLink}" class="button">View Thread →</a>
    </div>
    <div class="footer">
      <p>You received this because you are part of a note thread on GrantGuardian.</p>
    </div>
  </div>
</body>
</html>`
}
