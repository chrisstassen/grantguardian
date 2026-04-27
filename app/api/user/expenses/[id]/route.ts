import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ── Helper: verify auth + membership for the expense's grant ──────────────────
async function authorize(token: string | null, expenseId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: expense } = await supabaseAdmin
    .from('expenses')
    .select('id, grant_id, grants(organization_id)')
    .eq('id', expenseId)
    .single()

  if (!expense) return { error: 'Expense not found', status: 404 }

  const orgId = (expense.grants as any)?.organization_id
  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .single()

  if (!membership || membership.role === 'viewer') {
    return { error: 'Forbidden', status: 403 }
  }

  return { user, expense, orgId }
}

// PATCH /api/user/expenses/[id]
// Updates expense fields and replaces all budget allocations
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  const { id } = await params
  const auth = await authorize(token ?? null, id)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json()

  // ── Update expense fields ───────────────────────────────────────────────
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }
  if (body.expense_date !== undefined) updates.expense_date = body.expense_date
  if (body.vendor !== undefined) updates.vendor = body.vendor
  if (body.invoice_number !== undefined) updates.invoice_number = body.invoice_number || null
  if (body.description !== undefined) updates.description = body.description || null
  if (body.amount !== undefined) updates.amount = parseFloat(body.amount)
  if (body.category !== undefined) updates.category = body.category || null

  const { data: updatedExpense, error: updateError } = await supabaseAdmin
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (updateError || !updatedExpense) {
    return NextResponse.json({ error: updateError?.message || 'Update failed' }, { status: 500 })
  }

  // ── Replace budget allocations ──────────────────────────────────────────
  if (Array.isArray(body.allocations)) {
    // Delete existing allocations
    await supabaseAdmin
      .from('expense_budget_allocations')
      .delete()
      .eq('expense_id', id)

    // Insert new allocations
    const rows = body.allocations
      .filter((a: any) => a.budget_line_item_id && parseFloat(a.amount) > 0)
      .map((a: any) => ({
        expense_id: id,
        budget_line_item_id: a.budget_line_item_id,
        allocated_amount: parseFloat(a.amount),
      }))

    if (rows.length > 0) {
      const { error: allocError } = await supabaseAdmin
        .from('expense_budget_allocations')
        .insert(rows)

      if (allocError) {
        console.error('Allocation update error:', allocError)
        // Don't fail the whole request — expense is updated
      }
    }
  }

  return NextResponse.json({ expense: updatedExpense })
}
