import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  // Verify JWT
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { grantId, vendor, description, amount, category, expenseDate } = await request.json()
  if (!grantId) return NextResponse.json({ error: 'grantId required' }, { status: 400 })

  // Fetch grant info + special conditions in parallel
  const [grantResult, conditionsResult] = await Promise.all([
    supabaseAdmin.from('grants').select('grant_name, funding_agency, award_amount').eq('id', grantId).single(),
    supabaseAdmin.from('special_conditions').select('title, description, risk_level, applies_to, restriction_type').eq('grant_id', grantId)
  ])

  const grant = grantResult.data
  const conditions = conditionsResult.data || []

  // No special conditions — nothing to check against
  if (conditions.length === 0) {
    return NextResponse.json({ issues: [] })
  }

  const expenseDetails = [
    `Amount: $${parseFloat(amount || 0).toFixed(2)}`,
    `Vendor/Payee: ${vendor || 'Not specified'}`,
    `Category: ${category || 'Not specified'}`,
    `Date: ${expenseDate || 'Not specified'}`,
    `Description: ${description || 'Not provided'}`
  ].join('\n')

  const prompt = `You are a federal grant compliance expert. A user is about to log an expense against a grant. Assess whether this expense may violate any of the grant's special conditions.

Grant: ${grant?.grant_name} (${grant?.funding_agency})

Special Conditions:
${conditions.map(c => `- [${c.risk_level?.toUpperCase()} risk | ${c.restriction_type}] ${c.title}: ${c.description} (Applies to: ${c.applies_to})`).join('\n')}

Expense being logged:
${expenseDetails}

Identify only genuine, specific concerns where this expense clearly conflicts with or may violate a special condition. Be concise and practical. Do not flag vague or highly speculative issues.

Return ONLY a JSON array (empty if no issues). Each item:
{
  "title": "Brief issue title (max 8 words)",
  "description": "One or two sentences explaining the specific concern and which condition it relates to",
  "severity": "low|medium|high|critical"
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
    const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const issues = JSON.parse(cleaned)

    return NextResponse.json({ issues: Array.isArray(issues) ? issues : [] })
  } catch (err) {
    console.error('Expense eligibility check error:', err)
    // Fail open — don't block the user if AI check fails
    return NextResponse.json({ issues: [] })
  }
}
