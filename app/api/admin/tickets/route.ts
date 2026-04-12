import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data: tickets, error } = await supabaseAdmin
      .from('support_tickets')
      .select('id, subject, description, status, priority, ticket_type, grantguardian_status, created_at, organization_id, user_id')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!tickets || tickets.length === 0) {
      return NextResponse.json({ tickets: [] })
    }

    const orgIds = [...new Set(tickets.map(t => t.organization_id))]
    const userIds = [...new Set(tickets.map(t => t.user_id))]

    const [{ data: orgs }, { data: users }] = await Promise.all([
      supabaseAdmin.from('organizations').select('id, name').in('id', orgIds),
      supabaseAdmin.from('user_profiles').select('id, first_name, last_name, email').in('id', userIds)
    ])

    const ticketsWithDetails = tickets.map(ticket => ({
      ...ticket,
      organization: orgs?.find(o => o.id === ticket.organization_id) ?? null,
      submitter: users?.find(u => u.id === ticket.user_id) ?? null
    }))

    return NextResponse.json({ tickets: ticketsWithDetails })
  } catch (err: any) {
    console.error('Admin tickets API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
