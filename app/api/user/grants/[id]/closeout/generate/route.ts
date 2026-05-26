import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function authorizeGrant(token: string | null, grantId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 }

  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('*, organizations(name, plan)')
    .eq('id', grantId)
    .single()
  if (!grant) return { error: 'Grant not found', status: 404 }

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role').eq('user_id', user.id).eq('organization_id', grant.organization_id).single()
  if (!membership || membership.role === 'viewer') return { error: 'Forbidden', status: 403 }

  // AI closeout generate is a Pro-only feature
  const orgPlan = (grant.organizations as any)?.plan ?? 'starter'
  if (orgPlan !== 'pro') {
    return { error: 'PLAN_LIMIT', message: 'AI-powered closeout checklists require the Pro plan.', status: 403 }
  }

  return { user, grant, role: membership.role }
}

// POST /api/user/grants/[id]/closeout/generate
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorizeGrant(token, id)
  if ('error' in auth) return NextResponse.json({ error: auth.error, message: (auth as any).message }, { status: auth.status })

  const { grant } = auth

  // Gather context for AI
  const [deliverableRes, requirementRes, conditionRes] = await Promise.all([
    supabaseAdmin.from('grant_deliverables').select('title, status, due_date').eq('grant_id', id),
    supabaseAdmin.from('compliance_requirements').select('title, status, due_date, priority').eq('grant_id', id),
    supabaseAdmin.from('special_conditions').select('title, description, risk_level').eq('grant_id', id),
  ])

  const deliverables = deliverableRes.data || []
  const requirements = requirementRes.data || []
  const conditions = conditionRes.data || []

  const grantContext = `
Grant Name: ${grant.grant_name}
Funding Agency: ${grant.funding_agency}
Program Type: ${grant.program_type || 'Not specified'}
Award Number: ${grant.award_number || 'Not specified'}
Award Amount: ${grant.award_amount ? '$' + grant.award_amount.toLocaleString() : 'Not specified'}
Period End: ${grant.period_end || 'Not specified'}
Scope of Work: ${grant.scope_of_work || 'Not specified'}

Deliverables (${deliverables.length}):
${deliverables.map(d => `- ${d.title} [${d.status}]${d.due_date ? ', due ' + d.due_date : ''}`).join('\n') || 'None'}

Compliance Requirements (${requirements.length}):
${requirements.map(r => `- ${r.title} [${r.status}, ${r.priority} priority]${r.due_date ? ', due ' + r.due_date : ''}`).join('\n') || 'None'}

Special Conditions (${conditions.length}):
${conditions.map(c => `- ${c.title} [${c.risk_level}]: ${c.description}`).join('\n') || 'None'}
`.trim()

  const prompt = `You are a grant management expert helping with federal/state grant closeout procedures.

Based on the following grant information, generate a targeted close-out checklist of additional items that are specific to this grant (beyond the standard template items the user already has). Focus on items that are genuinely tailored to this grant's agency, program type, deliverables, special conditions, or scope of work.

${grantContext}

Return ONLY a JSON array of checklist items (no markdown, no explanation). Each item must have:
- "category": one of "Financial", "Programmatic", "Compliance & Documentation", "Administrative"
- "title": concise action item (start with a verb)
- "description": 1-2 sentence explanation of what this involves and why it matters for this specific grant

Generate between 5 and 12 items. Only include items that are genuinely specific to this grant — do NOT include generic items like "submit final report" or "return unexpended funds" as those are already in the standard template.

Example output format:
[
  {
    "category": "Programmatic",
    "title": "Submit final Head Start enrollment data to ACF",
    "description": "Upload final unduplicated participant count and demographic breakdown to the ACF Head Start Enterprise System as required by your program type."
  }
]`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `AI request failed: ${err}` }, { status: 500 })
    }

    const aiData = await response.json()
    const text = aiData.content?.[0]?.text?.trim() ?? '[]'
    const clean = text.replace(/```json\n?|\n?```/g, '').trim()
    const items: any[] = JSON.parse(clean)

    return NextResponse.json({ items })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI generation failed' }, { status: 500 })
  }
}
