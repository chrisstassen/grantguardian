import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = request.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  // Fetch active/pending grants for the org
  const { data: grants } = await supabaseAdmin
    .from('grants')
    .select('id, grant_name, funding_agency, period_end, status')
    .eq('organization_id', orgId)
    .in('status', ['active', 'pending'])

  if (!grants || grants.length === 0) {
    return NextResponse.json({ events: [] })
  }

  const grantIds = grants.map(g => g.id)

  // Fetch all incomplete compliance requirements with due dates
  const { data: requirements } = await supabaseAdmin
    .from('compliance_requirements')
    .select('id, grant_id, title, due_date, priority, status, category')
    .in('grant_id', grantIds)
    .neq('status', 'completed')
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const events: any[] = []

  // Build a quick lookup for grant names
  const grantMap = Object.fromEntries(grants.map(g => [g.id, g]))

  // Add requirement events
  for (const req of requirements || []) {
    const grant = grantMap[req.grant_id]
    if (!grant) continue

    const dueDate = new Date(req.due_date)
    dueDate.setHours(0, 0, 0, 0)
    const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))

    let urgency: 'overdue' | 'critical' | 'upcoming' | 'future'
    if (daysUntil < 0) urgency = 'overdue'
    else if (daysUntil <= 7) urgency = 'critical'
    else if (daysUntil <= 30) urgency = 'upcoming'
    else urgency = 'future'

    events.push({
      id: `req-${req.id}`,
      type: 'requirement',
      title: req.title,
      date: req.due_date,
      grantId: req.grant_id,
      grantName: grant.grant_name,
      fundingAgency: grant.funding_agency,
      priority: req.priority,
      category: req.category,
      urgency,
      daysUntil,
      link: `/grants/${req.grant_id}?tab=requirements`
    })
  }

  // Add grant period end events
  for (const grant of grants) {
    if (!grant.period_end) continue

    const endDate = new Date(grant.period_end)
    endDate.setHours(0, 0, 0, 0)
    const daysUntil = Math.ceil((endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))

    events.push({
      id: `grant-end-${grant.id}`,
      type: 'grant_end',
      title: `${grant.grant_name} — Period Ends`,
      date: grant.period_end,
      grantId: grant.id,
      grantName: grant.grant_name,
      fundingAgency: grant.funding_agency,
      urgency: daysUntil < 0 ? 'overdue' : daysUntil <= 30 ? 'critical' : 'future',
      daysUntil,
      link: `/grants/${grant.id}?tab=summary`
    })
  }

  // Sort all events by date
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return NextResponse.json({ events })
}
