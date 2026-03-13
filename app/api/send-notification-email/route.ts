import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const { recipientEmail, recipientName, senderName, grantName, notificationType, grantId } = await request.json()

    const subject = notificationType === 'note_mention' 
      ? `You were mentioned in a note on ${grantName}`
      : `New reply on ${grantName}`

    const message = notificationType === 'note_mention'
      ? `${senderName} mentioned you in a note on the grant "${grantName}".`
      : `${senderName} replied to a note on the grant "${grantName}".`

    const { data, error } = await resend.emails.send({
      from: 'GrantGuardian <notifications@resend.dev>', // Use resend.dev domain for testing
      to: recipientEmail,
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #1e293b; color: white; padding: 20px; text-align: center; }
              .content { background-color: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
              .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
              .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 30px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>GrantGuardian</h1>
              </div>
              <div class="content">
                <h2>Hi ${recipientName},</h2>
                <p>${message}</p>
                <p>Click the button below to view the note and respond:</p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/grants/${grantId}?tab=notes" class="button">
                  View Note
                </a>
              </div>
              <div class="footer">
                <p>You received this email because you were mentioned in a note on GrantGuardian.</p>
                <p>GrantGuardian - Grant Management Made Simple</p>
              </div>
            </div>
          </body>
        </html>
      `
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Email send error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}