import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const { recipientEmail, organizationName, role, token, inviterName } = await request.json()

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/signup?invite=${token}`

    const { data, error } = await resend.emails.send({
      from: 'GrantGuardian <notifications@grantguardian.io>',
      to: recipientEmail,
      subject: `You're invited to join ${organizationName} on GrantGuardian`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #1e293b; color: white; padding: 30px; text-align: center; }
              .content { background-color: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
              .button { display: inline-block; background-color: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600; }
              .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 30px; }
              .info-box { background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 12px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>GrantGuardian</h1>
                <p style="margin: 0; opacity: 0.9;">Grant Management Made Simple</p>
              </div>
              <div class="content">
                <h2>You've been invited! 🎉</h2>
                <p>Hi there,</p>
                <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on GrantGuardian.</p>
                
                <div class="info-box">
                  <p style="margin: 0;"><strong>Your Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}</p>
                </div>
                
                <p><strong>What is GrantGuardian?</strong></p>
                <p>GrantGuardian is a comprehensive grant management platform that helps organizations:</p>
                <ul>
                  <li>Track grants, expenses, and compliance requirements</li>
                  <li>Collaborate with team members on grant administration</li>
                  <li>Monitor budgets and payment schedules</li>
                  <li>Stay compliant with federal regulations</li>
                </ul>
                
                <p>Click the button below to create your account and join the team:</p>
                
                <div style="text-align: center;">
                  <a href="${inviteUrl}" class="button">
                    Accept Invitation & Sign Up
                  </a>
                </div>
                
                <p style="margin-top: 30px; font-size: 14px; color: #64748b;">
                  This invitation will expire in 7 days. If the button doesn't work, copy and paste this link:<br>
                  <a href="${inviteUrl}" style="color: #3b82f6; word-break: break-all;">${inviteUrl}</a>
                </p>
              </div>
              <div class="footer">
                <p>You received this email because ${inviterName} invited you to join ${organizationName} on GrantGuardian.</p>
                <p>If you weren't expecting this invitation, you can safely ignore this email.</p>
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