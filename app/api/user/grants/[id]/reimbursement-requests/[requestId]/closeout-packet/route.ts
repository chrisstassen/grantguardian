import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────
async function authorize(token: string | null, grantId: string, requestId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 as const }
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { error: 'Unauthorized', status: 401 as const }

  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('*, organizations(name)')
    .eq('id', grantId)
    .single()
  if (!grant) return { error: 'Grant not found', status: 404 as const }

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()
  if (!membership) return { error: 'Forbidden', status: 403 as const }

  const { data: rr } = await supabaseAdmin
    .from('reimbursement_requests')
    .select('*')
    .eq('id', requestId)
    .eq('grant_id', grantId)
    .single()
  if (!rr) return { error: 'Request not found', status: 404 as const }

  return { user, grant, role: membership.role, rr }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Layout constants & helpers
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_W = 612, PAGE_H = 792, MARGIN = 50
const CONTENT_W = PAGE_W - MARGIN * 2

const fmt = (n: number | string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(typeof n === 'string' ? parseFloat(n) || 0 : n)

const fmtDate = (d: string | null) => {
  if (!d) return 'N/A'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function truncate(text: string, font: any, size: number, maxPx: number): string {
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxPx) t = t.slice(0, -1)
  if (t.length < text.length) t = t.slice(0, -1) + '…'
  return t
}

interface Ctx { page: any; doc: PDFDocument; bold: any; regular: any; y: number }

function newPage(doc: PDFDocument, bold: any, regular: any): Ctx {
  return { page: doc.addPage([PAGE_W, PAGE_H]), doc, bold, regular, y: PAGE_H - MARGIN }
}

function checkPage(ctx: Ctx, needed = 50): Ctx {
  return ctx.y - needed < MARGIN + 20 ? newPage(ctx.doc, ctx.bold, ctx.regular) : ctx
}

function sectionHeader(ctx: Ctx, title: string): Ctx {
  ctx = checkPage(ctx, 40)
  ctx.y -= 6
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 2, width: CONTENT_W, height: 20, color: rgb(0.12, 0.14, 0.18) })
  ctx.page.drawText(title.toUpperCase(), { x: MARGIN + 8, y: ctx.y + 3, size: 9, font: ctx.bold, color: rgb(1, 1, 1) })
  ctx.y -= 22
  return ctx
}

function labelValue(ctx: Ctx, label: string, value: string, x2 = MARGIN + 160): Ctx {
  ctx = checkPage(ctx, 16)
  ctx.page.drawText(label, { x: MARGIN, y: ctx.y, size: 9, font: ctx.bold, color: rgb(0.4, 0.4, 0.4) })
  ctx.page.drawText(truncate(value, ctx.regular, 9, PAGE_W - x2 - MARGIN), { x: x2, y: ctx.y, size: 9, font: ctx.regular, color: rgb(0.1, 0.1, 0.1) })
  ctx.y -= 16
  return ctx
}

function wrapText(ctx: Ctx, text: string, indent = 12): Ctx {
  const words = text.split(' ')
  let line = ''
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.regular.widthOfTextAtSize(test, 9) > CONTENT_W - indent) {
      ctx = checkPage(ctx, 14)
      ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size: 9, font: ctx.regular, color: rgb(0.2, 0.2, 0.2) })
      ctx.y -= 13
      line = word
    } else { line = test }
  }
  if (line) {
    ctx = checkPage(ctx, 14)
    ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size: 9, font: ctx.regular, color: rgb(0.2, 0.2, 0.2) })
    ctx.y -= 13
  }
  return ctx
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user/grants/[id]/reimbursement-requests/[requestId]/closeout-packet
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: grantId, requestId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId, requestId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { grant, rr } = auth
  const orgName = (grant.organizations as any)?.name ?? ''
  const closeoutData = rr.type_data || {}

  // ── Fetch all grant data ──────────────────────────────────────────────────
  const [expensesRes, deliverablesRes, paymentsRes, fundingRes] = await Promise.all([
    supabaseAdmin.from('expenses').select('*').eq('grant_id', grantId).order('expense_date', { ascending: true }),
    supabaseAdmin.from('grant_deliverables').select('*').eq('grant_id', grantId).order('due_date', { ascending: true, nullsFirst: false }),
    supabaseAdmin.from('payments_received').select('*').eq('grant_id', grantId).order('received_date', { ascending: true }),
    supabaseAdmin.from('grant_funding_sources').select('*').eq('grant_id', grantId),
  ])

  const expenses = expensesRes.data || []
  const deliverables = deliverablesRes.data || []
  const payments = paymentsRes.data || []
  const fundingSources = fundingRes.data || []

  // Fetch expense documents
  const expenseIds = expenses.map(e => e.id)
  const docsByExpense: Record<string, any[]> = {}
  if (expenseIds.length > 0) {
    const { data: allDocs } = await supabaseAdmin
      .from('expense_documents')
      .select('*')
      .in('expense_id', expenseIds)
      .order('created_at', { ascending: true })
    for (const doc of allDocs || []) {
      if (!docsByExpense[doc.expense_id]) docsByExpense[doc.expense_id] = []
      docsByExpense[doc.expense_id].push(doc)
    }
  }

  // Fetch closeout letter attachments (from grant_request_attachments)
  const { data: closeoutAttachments } = await supabaseAdmin
    .from('grant_request_attachments')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })

  // ── Computed financials ───────────────────────────────────────────────────
  const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const totalPayments = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const awardAmount = parseFloat(grant.award_amount) || 0
  const totalProjectCost = parseFloat(grant.total_project_cost) || awardAmount
  const percentExpended = totalProjectCost > 0 ? (totalExpenses / totalProjectCost) * 100 : 0
  const percentPayments = awardAmount > 0 ? (totalPayments / awardAmount) * 100 : 0

  // ── Build PDF ─────────────────────────────────────────────────────────────
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)

  // ─ Page 1: Cover ─────────────────────────────────────────────────────────
  let ctx = newPage(doc, bold, regular)
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 100, width: PAGE_W, height: 100, color: rgb(0.08, 0.12, 0.22) })
  ctx.page.drawText('GRANT CLOSEOUT PACKET', { x: MARGIN, y: PAGE_H - 42, size: 18, font: bold, color: rgb(1, 1, 1) })
  ctx.page.drawText(orgName, { x: MARGIN, y: PAGE_H - 62, size: 11, font: regular, color: rgb(0.7, 0.8, 1.0) })
  ctx.page.drawText(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, { x: PAGE_W - MARGIN - 180, y: PAGE_H - 82, size: 9, font: regular, color: rgb(0.6, 0.7, 0.9) })
  ctx.y = PAGE_H - 120

  ctx = sectionHeader(ctx, 'Grant Information')
  ctx = labelValue(ctx, 'Grant Name', grant.grant_name)
  ctx = labelValue(ctx, 'Funding Agency', grant.funding_agency)
  if (grant.award_number) ctx = labelValue(ctx, 'Award Number', grant.award_number)
  if (grant.period_start || grant.period_end) ctx = labelValue(ctx, 'Performance Period', `${fmtDate(grant.period_start)} – ${fmtDate(grant.period_end)}`)

  ctx.y -= 8
  ctx = sectionHeader(ctx, 'Closeout Details')
  if (closeoutData.completion_date) ctx = labelValue(ctx, 'Completion Date', fmtDate(closeoutData.completion_date))
  if (closeoutData.submission_date) ctx = labelValue(ctx, 'Submission Date', fmtDate(closeoutData.submission_date))
  ctx = labelValue(ctx, 'Status', closeoutData.status === 'complete' ? 'Complete' : 'Pending')
  if (closeoutData.closed_date) ctx = labelValue(ctx, 'Closed Date', fmtDate(closeoutData.closed_date))

  ctx.y -= 8
  ctx = sectionHeader(ctx, 'Financial Summary')
  ctx = labelValue(ctx, 'Total Project Cost', fmt(totalProjectCost))
  ctx = labelValue(ctx, 'Award Amount', fmt(awardAmount))
  ctx = labelValue(ctx, 'Total Expended', `${fmt(totalExpenses)} (${percentExpended.toFixed(1)}%)`)
  ctx = labelValue(ctx, 'Remaining Budget', fmt(totalProjectCost - totalExpenses))
  ctx = labelValue(ctx, 'Total Payments Received', `${fmt(totalPayments)} (${percentPayments.toFixed(1)}%)`)
  ctx = labelValue(ctx, 'Grant % Complete', `${grant.percent_complete ?? 0}%`)
  ctx = labelValue(ctx, 'Total Expenses', String(expenses.length))
  ctx = labelValue(ctx, 'Total Deliverables', String(deliverables.length))

  // ─ Page 2: Scope of Work ──────────────────────────────────────────────────
  if (grant.scope_of_work) {
    ctx = newPage(doc, bold, regular)
    ctx.page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: rgb(0.08, 0.12, 0.22) })
    ctx.page.drawText('SCOPE OF WORK', { x: MARGIN, y: PAGE_H - 42, size: 16, font: bold, color: rgb(1, 1, 1) })
    ctx.y = PAGE_H - 90
    ctx = wrapText(ctx, grant.scope_of_work, 0)
  }

  // ─ Deliverables ───────────────────────────────────────────────────────────
  if (deliverables.length > 0) {
    ctx = newPage(doc, bold, regular)
    ctx.page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: rgb(0.08, 0.12, 0.22) })
    ctx.page.drawText('DELIVERABLES', { x: MARGIN, y: PAGE_H - 42, size: 16, font: bold, color: rgb(1, 1, 1) })
    ctx.y = PAGE_H - 90

    const dCols = { title: MARGIN, target: MARGIN + 240, actual: MARGIN + 300, prog: MARGIN + 360, status: MARGIN + 420, due: MARGIN + 480 }
    const drawDHeader = (c: Ctx) => {
      c.page.drawRectangle({ x: MARGIN, y: c.y - 2, width: CONTENT_W, height: 18, color: rgb(0.93, 0.94, 0.96) })
      ;[['Deliverable', dCols.title], ['Target', dCols.target], ['Actual', dCols.actual], ['Prog%', dCols.prog], ['Status', dCols.status], ['Due', dCols.due]].forEach(([h, x]) => {
        c.page.drawText(h as string, { x: x as number, y: c.y + 2, size: 8, font: bold, color: rgb(0.3, 0.3, 0.3) })
      })
      c.y -= 22
      return c
    }
    ctx = drawDHeader(ctx)
    deliverables.forEach((d, i) => {
      if (ctx.y < MARGIN + 30) { ctx = newPage(doc, bold, regular); ctx = drawDHeader(ctx) }
      const bg = i % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.99)
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 3, width: CONTENT_W, height: 16, color: bg })
      const prog = d.status === 'completed' ? 100 : d.status === 'not_started' ? 0 : (d.progress_percent ?? 0)
      ctx.page.drawText(truncate(d.title, regular, 8, 180), { x: dCols.title, y: ctx.y, size: 8, font: regular, color: rgb(0.1, 0.1, 0.1) })
      ctx.page.drawText(d.target_value != null ? String(d.target_value) : '—', { x: dCols.target, y: ctx.y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) })
      ctx.page.drawText(d.actual_value != null ? String(d.actual_value) : '—', { x: dCols.actual, y: ctx.y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) })
      ctx.page.drawText(`${prog}%`, { x: dCols.prog, y: ctx.y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) })
      ctx.page.drawText(d.status?.replace(/_/g, ' ') || '—', { x: dCols.status, y: ctx.y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) })
      ctx.page.drawText(d.due_date ? fmtDate(d.due_date).slice(0, 12) : '—', { x: dCols.due, y: ctx.y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) })
      ctx.y -= 16
    })
  }

  // ─ Expense Summary ────────────────────────────────────────────────────────
  ctx = newPage(doc, bold, regular)
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: rgb(0.08, 0.12, 0.22) })
  ctx.page.drawText('EXPENSE SUMMARY', { x: MARGIN, y: PAGE_H - 42, size: 16, font: bold, color: rgb(1, 1, 1) })
  ctx.page.drawText(`${expenses.length} expenses · Total: ${fmt(totalExpenses)}`, { x: MARGIN, y: PAGE_H - 60, size: 10, font: regular, color: rgb(0.7, 0.8, 1.0) })
  ctx.y = PAGE_H - 90

  if (expenses.length === 0) {
    ctx.page.drawText('No expenses recorded.', { x: MARGIN, y: ctx.y, size: 10, font: regular, color: rgb(0.5, 0.5, 0.5) })
  } else {
    const eCols = { num: MARGIN, date: MARGIN + 24, vendor: MARGIN + 85, cat: MARGIN + 255, inv: MARGIN + 340, amt: MARGIN + 440 }
    const drawEHeader = (c: Ctx) => {
      c.page.drawRectangle({ x: MARGIN, y: c.y - 2, width: CONTENT_W, height: 18, color: rgb(0.93, 0.94, 0.96) })
      ;[['#', eCols.num], ['Date', eCols.date], ['Vendor', eCols.vendor], ['Category', eCols.cat], ['Invoice', eCols.inv], ['Amount', eCols.amt]].forEach(([h, x]) => {
        c.page.drawText(h as string, { x: x as number, y: c.y + 2, size: 8, font: bold, color: rgb(0.3, 0.3, 0.3) })
      })
      c.y -= 22
      return c
    }
    ctx = drawEHeader(ctx)
    expenses.forEach((exp, i) => {
      if (ctx.y < MARGIN + 30) { ctx = newPage(doc, bold, regular); ctx = drawEHeader(ctx) }
      const bg = i % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.99)
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 3, width: CONTENT_W, height: 16, color: bg })
      ctx.page.drawText(String(i + 1), { x: eCols.num, y: ctx.y, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) })
      ctx.page.drawText(fmtDate(exp.expense_date).slice(0, 12), { x: eCols.date, y: ctx.y, size: 8, font: regular, color: rgb(0.2, 0.2, 0.2) })
      ctx.page.drawText(truncate(exp.vendor || '', regular, 8, 165), { x: eCols.vendor, y: ctx.y, size: 8, font: regular, color: rgb(0.1, 0.1, 0.1) })
      ctx.page.drawText(truncate(exp.category || '—', regular, 8, 80), { x: eCols.cat, y: ctx.y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) })
      ctx.page.drawText(truncate(exp.invoice_number || '—', regular, 8, 80), { x: eCols.inv, y: ctx.y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) })
      ctx.page.drawText(fmt(exp.amount), { x: eCols.amt, y: ctx.y, size: 8, font: bold, color: rgb(0.1, 0.3, 0.1) })
      ctx.y -= 16
    })
    // Total row
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 4 }, end: { x: PAGE_W - MARGIN, y: ctx.y + 4 }, thickness: 1, color: rgb(0.3, 0.3, 0.3) })
    ctx.y -= 4
    ctx.page.drawText('TOTAL', { x: MARGIN, y: ctx.y, size: 9, font: bold, color: rgb(0.1, 0.1, 0.1) })
    ctx.page.drawText(fmt(totalExpenses), { x: eCols.amt, y: ctx.y, size: 9, font: bold, color: rgb(0.0, 0.3, 0.0) })
    ctx.y -= 20
  }

  // ─ Appendix: Expense Detail + Supporting Documentation ────────────────────
  for (let i = 0; i < expenses.length; i++) {
    const exp = expenses[i]
    const docs = docsByExpense[exp.id] || []
    if (docs.length === 0) continue  // Skip expenses with no attachments in appendix

    ctx = newPage(doc, bold, regular)
    ctx.page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: rgb(0.18, 0.28, 0.45) })
    ctx.page.drawText(`APPENDIX – EXPENSE ${i + 1}`, { x: MARGIN, y: PAGE_H - 35, size: 11, font: bold, color: rgb(0.7, 0.8, 1.0) })
    ctx.page.drawText(truncate(exp.vendor || '', bold, 14, CONTENT_W - 120), { x: MARGIN, y: PAGE_H - 56, size: 14, font: bold, color: rgb(1, 1, 1) })
    ctx.page.drawText(fmt(exp.amount), { x: PAGE_W - MARGIN - 110, y: PAGE_H - 52, size: 13, font: bold, color: rgb(0.7, 1.0, 0.7) })
    ctx.y = PAGE_H - 100

    ctx = labelValue(ctx, 'Date', fmtDate(exp.expense_date))
    ctx = labelValue(ctx, 'Category', exp.category || '—')
    if (exp.invoice_number) ctx = labelValue(ctx, 'Invoice #', exp.invoice_number)

    ctx.y -= 8
    ctx.page.drawText(`Supporting Documents (${docs.length}):`, { x: MARGIN, y: ctx.y, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) })
    ctx.y -= 14
    docs.forEach((d, di) => {
      ctx.page.drawText(`${di + 1}. ${d.file_name}`, { x: MARGIN + 8, y: ctx.y, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2) })
      ctx.y -= 13
    })

    // Append actual files
    for (const d of docs) {
      try {
        const { data: fileData, error } = await supabaseAdmin.storage.from('expense-documents').download(d.file_path)
        if (error || !fileData) continue
        const bytes = new Uint8Array(await fileData.arrayBuffer())
        const ft: string = d.file_type || ''
        if (ft === 'application/pdf') {
          try {
            const attachDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
            const copied = await doc.copyPages(attachDoc, attachDoc.getPageIndices())
            copied.forEach(p => doc.addPage(p))
            const pages = doc.getPages()
            ctx = { page: pages[pages.length - 1], doc, bold, regular, y: MARGIN + 10 }
          } catch { /* skip corrupt */ }
        } else if (ft === 'image/jpeg' || ft === 'image/jpg') {
          const imgPage = doc.addPage([PAGE_W, PAGE_H])
          const img = await doc.embedJpg(bytes)
          const dims = img.scaleToFit(CONTENT_W, PAGE_H - 2 * MARGIN)
          imgPage.drawImage(img, { x: MARGIN + (CONTENT_W - dims.width) / 2, y: MARGIN + (PAGE_H - 2 * MARGIN - dims.height) / 2, ...dims })
          imgPage.drawText(d.file_name, { x: MARGIN, y: PAGE_H - 20, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) })
          ctx = { page: imgPage, doc, bold, regular, y: MARGIN }
        } else if (ft === 'image/png') {
          const imgPage = doc.addPage([PAGE_W, PAGE_H])
          const img = await doc.embedPng(bytes)
          const dims = img.scaleToFit(CONTENT_W, PAGE_H - 2 * MARGIN)
          imgPage.drawImage(img, { x: MARGIN + (CONTENT_W - dims.width) / 2, y: MARGIN + (PAGE_H - 2 * MARGIN - dims.height) / 2, ...dims })
          imgPage.drawText(d.file_name, { x: MARGIN, y: PAGE_H - 20, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5) })
          ctx = { page: imgPage, doc, bold, regular, y: MARGIN }
        }
      } catch { /* skip */ }
    }
  }

  // ─ Closeout Letter (if any) ────────────────────────────────────────────────
  for (const att of closeoutAttachments || []) {
    try {
      const { data: fileData } = await supabaseAdmin.storage.from('grant-request-attachments').download(att.file_path)
      if (!fileData) continue
      const bytes = new Uint8Array(await fileData.arrayBuffer())
      if (att.file_type === 'application/pdf') {
        const attachDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const copied = await doc.copyPages(attachDoc, attachDoc.getPageIndices())
        copied.forEach(p => doc.addPage(p))
      }
    } catch { /* skip */ }
  }

  const pdfBytes = await doc.save()
  const safeTitle = grant.grant_name.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40)
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="closeout-packet-${safeTitle}.pdf"`,
    },
  })
}
