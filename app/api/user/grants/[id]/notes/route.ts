import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

async function authorizeGrant(token: string | null, grantId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }

  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('id, grant_name, organization_id')
    .eq('id', grantId)
    .single()
  if (!grant) return { error: 'Grant not found', status: 404 }

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()
  if (!membership) return { error: 'Forbidden', status: 403 }

  return { user, grant, role: membership.role }
}

// POST /api/user/grants/[id]/notes
// Creates a note, recipients, in-app notifications, and sends emails — all server-side.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: grantId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeGrant(token, grantId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { user, grant } = auth
  const body = await request.json()
  const { content, recipientIds = [] } = body

  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })

  // 1. Get author profile
  const { data: authorProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single()
  const authorName = authorProfile
    ? `${authorProfile.first_name} ${authorProfile.last_name}`
    : 'A team member'

  // 2. Insert note
  const { data: note, error: noteError } = await supabaseAdmin
    .from('grant_notes')
    .insert([{ grant_id: grantId, created_by_user_id: user.id, content: content.trim() }])
    .select()
    .single()

  if (noteError || !note) {
    return NextResponse.json({ error: noteError?.message || 'Failed to create note' }, { status: 500 })
  }

  // 3. Insert note_recipients (deduplicated, exclude author)
  const uniqueRecipientIds = [...new Set(recipientIds as string[])].filter(id => id !== user.id)

  if (uniqueRecipientIds.length > 0) {
    await supabaseAdmin
      .from('note_recipients')
      .insert(uniqueRecipientIds.map(userId => ({ note_id: note.id, user_id: userId })))
  }

  // 4. Get recipient profiles (email + name) for notifications and emails
  if (uniqueRecipientIds.length > 0) {
    const { data: recipients } = await supabaseAdmin
      .from('user_profiles')
      .select('id, first_name, last_name, email')
      .in('id', uniqueRecipientIds)

    if (recipients && recipients.length > 0) {
      const noteLink = `/grants/${grantId}?tab=notes`

      // 5. Create in-app notifications
      await supabaseAdmin.from('notifications').insert(
        recipients.map(r => ({
          user_id: r.id,
          type: 'note_mention',
          title: 'You were mentioned in a note',
          message: `${authorName} mentioned you in a note on "${grant.grant_name}"`,
          grant_id: grantId,
          note_id: note.id,
          link: noteLink,
        }))
      )

      // 6. Send emails (fire-and-forget, don't block response)
      const contentPreview = content.length > 300 ? content.slice(0, 300) + '…' : content

      await Promise.allSettled(
        recipients
          .filter(r => r.email)
          .map(r =>
            resend.emails.send({
              from: 'GrantGuardian <notifications@grantguardian.io>',
              to: r.email,
              subject: `${authorName} mentioned you in a note — ${grant.grant_name}`,
              html: buildNoteEmail({
                recipientName: `${r.first_name} ${r.last_name}`,
                authorName,
                grantName: grant.grant_name,
                noteContent: contentPreview,
                noteLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://grantguardian.io'}${noteLink}`,
                type: 'mention',
              }),
            })
          )
      )
    }
  }

  return NextResponse.json({ note })
}

// ── Email template ────────────────────────────────────────────────────────────

function buildNoteEmail({
  recipientName,
  authorName,
  grantName,
  noteContent,
  noteLink,
  type,
}: {
  recipientName: string
  authorName: string
  grantName: string
  noteContent: string
  noteLink: string
  type: 'mention' | 'reply'
}) {
  const heading = type === 'mention'
    ? `${authorName} mentioned you in a note`
    : `${authorName} replied to a note thread you're part of`

  const escapedContent = noteContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background-color: #1e293b; color: white; padding: 20px 30px; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { padding: 30px; background: #f8fafc; border: 1px solid #e2e8f0; }
    .note-preview { background: white; border-left: 4px solid #3b82f6; padding: 14px 16px; margin: 20px 0; border-radius: 0 6px 6px 0; font-size: 14px; color: #374151; }
    .grant-label { font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .button { display: inline-block; background-color: #1e293b; color: white !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 24px; font-weight: 600; font-size: 14px; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>GrantGuardian</h1>
    </div>
    <div class="content">
      <p style="margin-top:0">Hi ${recipientName},</p>
      <p>${heading} on the grant <strong>${grantName}</strong>.</p>
      <div class="note-preview">
        <div class="grant-label">${grantName}</div>
        <div>${escapedContent}</div>
      </div>
      <a href="${noteLink}" class="button">View &amp; Reply →</a>
    </div>
    <div class="footer">
      <p>You received this because you were mentioned in a note on GrantGuardian.</p>
    </div>
  </div>
</body>
</html>`
}
