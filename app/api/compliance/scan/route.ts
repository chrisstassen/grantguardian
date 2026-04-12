import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(request: NextRequest) {
  // Verify JWT
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = request.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  // Fetch all active/pending grants for the org
  const { data: grants } = await supabaseAdmin
    .from('grants')
    .select('*')
    .eq('organization_id', orgId)
    .in('status', ['active', 'pending'])
    .order('period_end', { ascending: true })

  if (!grants || grants.length === 0) {
    return NextResponse.json({
      overallScore: 100,
      overallStatus: 'good',
      grants: [],
      totalIssues: 0,
      criticalIssues: 0,
      scannedAt: new Date().toISOString()
    })
  }

  const grantIds = grants.map(g => g.id)

  // Batch fetch all related data in parallel
  const [reqResult, expResult, condResult] = await Promise.all([
    supabaseAdmin.from('compliance_requirements').select('*').in('grant_id', grantIds),
    supabaseAdmin.from('expenses').select('*').in('grant_id', grantIds).order('expense_date', { ascending: false }),
    supabaseAdmin.from('special_conditions').select('*').in('grant_id', grantIds)
  ])

  const allRequirements = reqResult.data || []
  const allExpenses = expResult.data || []
  const allConditions = condResult.data || []

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  const grantResults = []

  for (const grant of grants) {
    const requirements = allRequirements.filter(r => r.grant_id === grant.id)
    const expenses = allExpenses.filter(e => e.grant_id === grant.id)
    const conditions = allConditions.filter(c => c.grant_id === grant.id)

    const issues: any[] = []

    // ── 1. Overdue & upcoming compliance requirements ──────────────────────
    for (const req of requirements) {
      if (req.status === 'completed') continue
      if (!req.due_date) continue

      const dueDate = new Date(req.due_date)
      dueDate.setHours(0, 0, 0, 0)
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))

      if (dueDate < today) {
        issues.push({
          type: 'overdue_requirement',
          severity: req.priority === 'critical' ? 'critical' : req.priority === 'high' ? 'high' : 'medium',
          title: `Overdue: ${req.title}`,
          description: `This requirement was due on ${dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} and has not been marked complete.`,
          link: `/grants/${grant.id}?tab=compliance`
        })
      } else if (dueDate <= in7Days) {
        issues.push({
          type: 'due_soon_critical',
          severity: 'high',
          title: `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}: ${req.title}`,
          description: `This requirement is due on ${dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Immediate action required.`,
          link: `/grants/${grant.id}?tab=compliance`
        })
      } else if (dueDate <= in30Days) {
        issues.push({
          type: 'due_soon',
          severity: 'medium',
          title: `Due in ${daysUntilDue} days: ${req.title}`,
          description: `This requirement is due on ${dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`,
          link: `/grants/${grant.id}?tab=compliance`
        })
      }
    }

    // ── 2. Budget & burn rate analysis ────────────────────────────────────
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
    const awardAmount = grant.award_amount || 0

    if (awardAmount > 0) {
      // Budget overrun
      if (totalExpenses > awardAmount) {
        const overBy = totalExpenses - awardAmount
        issues.push({
          type: 'budget_overrun',
          severity: 'critical',
          title: 'Budget overrun',
          description: `Total expenses ($${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) exceed the award amount ($${awardAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) by $${overBy.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
          link: `/grants/${grant.id}?tab=expenses`
        })
      }

      // Burn rate & period analysis
      if (grant.period_start && grant.period_end) {
        const start = new Date(grant.period_start)
        const end = new Date(grant.period_end)
        const totalDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
        const elapsedDays = Math.max(0, (today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
        const timeElapsedPct = Math.min(1, elapsedDays / totalDays)
        const budgetUsedPct = totalExpenses / awardAmount
        const daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))

        // Grant ending soon with significant unspent funds
        if (daysRemaining > 0 && daysRemaining <= 90 && budgetUsedPct < 0.5) {
          issues.push({
            type: 'underspend_risk',
            severity: 'high',
            title: `Underspend risk — grant ends in ${daysRemaining} days`,
            description: `Only ${Math.round(budgetUsedPct * 100)}% of funds have been expended but the grant ends in ${daysRemaining} days. Unspent funds may need to be returned to the funder.`,
            link: `/grants/${grant.id}?tab=expenses`
          })
        } else if (timeElapsedPct >= 0.75 && budgetUsedPct < 0.4 && daysRemaining > 90) {
          // >75% through period but <40% spent — slow burn warning
          issues.push({
            type: 'slow_burn_rate',
            severity: 'medium',
            title: 'Spending pace is significantly behind schedule',
            description: `${Math.round(timeElapsedPct * 100)}% of the grant period has elapsed but only ${Math.round(budgetUsedPct * 100)}% of the award has been expended. Review your spending plan.`,
            link: `/grants/${grant.id}?tab=expenses`
          })
        }

        // Grant period ending soon (even if spending is fine)
        if (daysRemaining > 0 && daysRemaining <= 30) {
          issues.push({
            type: 'grant_ending',
            severity: daysRemaining <= 14 ? 'high' : 'medium',
            title: `Grant period ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
            description: `The performance period ends on ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Ensure all closeout requirements are completed.`,
            link: `/grants/${grant.id}?tab=summary`
          })
        }
      }
    }

    // ── 3. AI expense eligibility check ───────────────────────────────────
    // Only run if there are special conditions and at least one expense
    let aiFindings: any[] = []
    if (conditions.length > 0 && expenses.length > 0) {
      try {
        const recentExpenses = expenses.slice(0, 25) // cap at 25 to keep prompt concise
        const prompt = `You are a federal grant compliance expert. Review these expenses against the grant's special conditions and identify any potential compliance issues.

Grant: ${grant.grant_name} (${grant.funding_agency})
Award Amount: $${awardAmount.toLocaleString()}

Special Conditions:
${conditions.map(c => `- [${c.risk_level?.toUpperCase()} risk] ${c.title}: ${c.description} (Type: ${c.restriction_type}, Applies to: ${c.applies_to})`).join('\n')}

Recent Expenses:
${recentExpenses.map(e => `- $${parseFloat(e.amount || 0).toFixed(2)} | ${e.expense_date} | ${e.description || 'No description'} | Vendor: ${e.vendor || 'N/A'} | Category: ${e.category || 'uncategorized'}`).join('\n')}

Identify only genuine, specific compliance concerns where an expense clearly conflicts with or may violate a special condition. Do not flag speculative or minor issues. If there are no issues, return an empty array.

Return ONLY a JSON array (no other text). Each item:
{
  "title": "Brief issue title (max 10 words)",
  "description": "Specific explanation citing the expense and the condition it may violate",
  "severity": "low|medium|high|critical"
}`

        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        })

        const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
        // Strip any markdown code fences if present
        const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed)) {
          aiFindings = parsed.map((f: any) => ({
            type: 'ai_expense_flag',
            severity: f.severity || 'medium',
            title: f.title,
            description: f.description,
            link: `/grants/${grant.id}?tab=expenses`,
            aiGenerated: true
          }))
        }
      } catch (err) {
        console.error('AI compliance analysis error for grant', grant.id, err)
      }
    }

    // ── 4. Compute health score ────────────────────────────────────────────
    const allIssues = [
      ...issues,
      ...aiFindings
    ].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 }
      return (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3)
    })

    let score = 100
    for (const issue of allIssues) {
      if (issue.severity === 'critical') score -= 25
      else if (issue.severity === 'high') score -= 15
      else if (issue.severity === 'medium') score -= 8
      else if (issue.severity === 'low') score -= 3
    }
    score = Math.max(0, score)

    grantResults.push({
      id: grant.id,
      grant_name: grant.grant_name,
      funding_agency: grant.funding_agency,
      period_end: grant.period_end,
      status: grant.status,
      healthScore: score,
      healthStatus: score >= 80 ? 'good' : score >= 55 ? 'warning' : 'critical',
      issues: allIssues,
      issueCount: allIssues.length,
      criticalCount: allIssues.filter(i => i.severity === 'critical').length,
      highCount: allIssues.filter(i => i.severity === 'high').length,
      mediumCount: allIssues.filter(i => i.severity === 'medium').length
    })
  }

  // Overall org-level score
  const overallScore = grantResults.length > 0
    ? Math.round(grantResults.reduce((sum, g) => sum + g.healthScore, 0) / grantResults.length)
    : 100

  return NextResponse.json({
    overallScore,
    overallStatus: overallScore >= 80 ? 'good' : overallScore >= 55 ? 'warning' : 'critical',
    grants: grantResults,
    totalIssues: grantResults.reduce((sum, g) => sum + g.issueCount, 0),
    criticalIssues: grantResults.reduce((sum, g) => sum + g.criticalCount, 0),
    highIssues: grantResults.reduce((sum, g) => sum + g.highCount, 0),
    scannedAt: new Date().toISOString()
  })
}
