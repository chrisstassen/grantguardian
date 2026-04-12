import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const { recipientEmail, recipientName, senderName, ticketSubject, ticketId } = await request.json()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const ticketUrl = `${appUrl}/support/tickets/${ticketId}`

    const { data, error } = await resend.emails.send({
      from: 'GrantGuardian <notifications@grantguardian.io>',
      to: recipientEmail,
      subject: `You were mentioned in a note on ticket: ${ticketSubject}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #1e293b; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
              .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
              .content { background-color: #f8fafc; padding: 32px; border: 1px solid #e2e8f0; border-top: none; }
              .content h2 { margin-top: 0; color: #1e293b; }
              .ticket-badge { display: inline-block; background-color: #eff6ff; color: #1d4ed8; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; border: 1px solid #bfdbfe; }
              .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; margin-top: 24px; font-weight: 600; font-size: 14px; }
              .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 28px; }
              .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>GrantGuardian</h1>
              </div>
              <div class="content">
                <h2>Hi ${recipientName},</h2>
                <p><strong>${senderName}</strong> mentioned you in a note on the following support ticket:</p>
                <div class="ticket-badge">🎫 ${ticketSubject}</div>
                <p>Click the button below to view the note and respond:</p>
                <a href="${ticketUrl}" class="button">View Ticket</a>
                <hr class="divider" />
                <p style="font-size: 13px; color: #64748b;">
                  If the button above doesn't work, copy and paste this link into your browser:<br />
                  <a href="${ticketUrl}" style="color: #3b82f6;">${ticketUrl}</a>
                </p>
              </div>
              <div class="footer">
                <p>You received this email because you were mentioned in a support ticket note on GrantGuardian.</p>
                <p>GrantGuardian &mdash; Grant Management Made Simple</p>
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
    console.error('Ticket mention email error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
