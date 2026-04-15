import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { grant_id, force_save } = body

  if (!grant_id) return NextResponse.json({ error: 'grant_id required' }, { status: 400 })

  // Verify membership
  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('id, organization_id')
    .eq('id', grant_id)
    .single()

  if (!grant) return NextResponse.json({ error: 'Grant not found' }, { status: 404 })

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()

  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Duplicate check ─────────────────────────────────────────────────────
  // Check by vendor + invoice_number (only if invoice_number is provided)
  if (!force_save && body.invoice_number) {
    const { data: existing } = await supabaseAdmin
      .from('expenses')
      .select('id, expense_date, amount, vendor, invoice_number')
      .eq('grant_id', grant_id)
      .eq('vendor', body.vendor)
      .eq('invoice_number', body.invoice_number)
      .limit(1)

    if (existing && existing.length > 0) {
      const dup = existing[0]
      return NextResponse.json({
        duplicate: true,
        message: `An expense from "${dup.vendor}" with invoice #${dup.invoice_number} for $${parseFloat(dup.amount).toFixed(2)} already exists on this grant (${dup.expense_date}).`,
        existing: dup,
      }, { status: 409 })
    }
  }

  // ── Insert expense ──────────────────────────────────────────────────────
  const { data: expense, error: expenseError } = await supabaseAdmin
    .from('expenses')
    .insert([{
      grant_id,
      created_by_user_id: user.id,
      expense_date: body.expense_date,
      vendor: body.vendor,
      description: body.description || null,
      amount: parseFloat(body.amount),
      invoice_number: body.invoice_number || null,
    }])
    .select()
    .single()

  if (expenseError || !expense) {
    console.error('Expense insert error:', expenseError)
    return NextResponse.json({ error: expenseError?.message || 'Failed to save expense' }, { status: 500 })
  }

  // ── Insert budget allocations ───────────────────────────────────────────
  const allocations = Array.isArray(body.allocations) ? body.allocations : []
  let allocationsInserted = 0

  if (allocations.length > 0) {
    const rows = allocations
      .filter((a: any) => a.budget_line_item_id && parseFloat(a.amount) > 0)
      .map((a: any) => ({
        expense_id: expense.id,
        budget_line_item_id: a.budget_line_item_id,
        allocated_amount: parseFloat(a.amount),
      }))

    if (rows.length > 0) {
      const { data: inserted, error: allocError } = await supabaseAdmin
        .from('expense_budget_allocations')
        .insert(rows)
        .select()

      if (allocError) {
        console.error('Allocation insert error:', allocError)
        // Don't fail the whole request — expense is saved, allocations can be re-added
      } else {
        allocationsInserted = inserted?.length ?? 0
      }
    }
  }

  return NextResponse.json({ expense, allocationsInserted })
}
