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
    .select('id, organization_id, grant_name, funding_agency, award_number, award_amount, period_start, period_end')
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

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', grant.organization_id)
    .single()

  return { user, grant, org, role: membership.role }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (d: string | null) => {
  if (!d) return 'N/A'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const STATUS_LABELS: Record<string, string> = {
  pending_submission: 'Pending Submission',
  submitted: 'Submitted',
  payment_received: 'Payment Received',
  request_denied: 'Request Denied',
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF layout helpers
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 50
const CONTENT_W = PAGE_W - MARGIN * 2

interface DrawCtx {
  page: ReturnType<PDFDocument['addPage']>
  doc: PDFDocument
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
  regular: Awaited<ReturnType<PDFDocument['embedFont']>>
  y: number
}

function newPage(doc: PDFDocument, bold: any, regular: any): DrawCtx {
  const page = doc.addPage([PAGE_W, PAGE_H])
  return { page, doc, bold, regular, y: PAGE_H - MARGIN }
}

function checkPage(ctx: DrawCtx, needed = 60): DrawCtx {
  if (ctx.y - needed < MARGIN + 20) {
    return newPage(ctx.doc, ctx.bold, ctx.regular)
  }
  return ctx
}

function drawText(
  ctx: DrawCtx,
  text: string,
  opts: { size?: number; font?: any; color?: ReturnType<typeof rgb>; x?: number; indent?: number } = {}
): DrawCtx {
  const size = opts.size ?? 10
  const font = opts.font ?? ctx.regular
  const color = opts.color ?? rgb(0.1, 0.1, 0.1)
  const x = opts.x ?? (MARGIN + (opts.indent ?? 0))
  ctx.page.drawText(text, { x, y: ctx.y, size, font, color })
  ctx.y -= size * 1.6
  return ctx
}

function drawHRule(ctx: DrawCtx, lightness = 0.8): DrawCtx {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: rgb(lightness, lightness, lightness),
  })
  ctx.y -= 10
  return ctx
}

function drawSectionHeader(ctx: DrawCtx, title: string): DrawCtx {
  ctx = checkPage(ctx, 40)
  ctx.y -= 6
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 2,
    width: CONTENT_W,
    height: 20,
    color: rgb(0.12, 0.14, 0.18),
  })
  ctx.page.drawText(title.toUpperCase(), {
    x: MARGIN + 8,
    y: ctx.y + 3,
    size: 9,
    font: ctx.bold,
    color: rgb(1, 1, 1),
  })
  ctx.y -= 22
  return ctx
}

function drawLabelValue(ctx: DrawCtx, label: string, value: string, col2x?: number): DrawCtx {
  ctx = checkPage(ctx, 18)
  const x2 = col2x ?? MARGIN + 150
  ctx.page.drawText(label, { x: MARGIN, y: ctx.y, size: 9, font: ctx.bold, color: rgb(0.4, 0.4, 0.4) })
  ctx.page.drawText(value, { x: x2, y: ctx.y, size: 9, font: ctx.regular, color: rgb(0.1, 0.1, 0.1) })
  ctx.y -= 16
  return ctx
}

// Truncate text to fit in a pixel width
function truncate(text: string, font: any, size: number, maxWidth: number): string {
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxWidth) {
    t = t.slice(0, -1)
  }
  if (t.length < text.length) t = t.slice(0, -1) + '…'
  return t
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user/grants/[id]/reimbursement-requests/[requestId]/packet
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: grantId, requestId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth = await authorize(token, grantId, requestId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { grant, org } = auth

  // ── Fetch request + linked expenses ───────────────────────────────────────
  const { data: rr, error: rrError } = await supabaseAdmin
    .from('reimbursement_requests')
    .select(`
      *,
      reimbursement_request_expenses (
        expense_id,
        expenses (
          id, expense_date, vendor, amount, category, description, invoice_number
        )
      ),
      payment:payments_received (
        id, amount, received_date, funding_source
      )
    `)
    .eq('id', requestId)
    .single()

  if (rrError || !rr) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const expenses: any[] = (rr.reimbursement_request_expenses || [])
    .map((rre: any) => rre.expenses)
    .filter(Boolean)
    .sort((a: any, b: any) => (a.expense_date > b.expense_date ? 1 : -1))

  const totalAmount = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)

  // ── Fetch expense documents for all linked expenses ────────────────────────
  const expenseIds = expenses.map(e => e.id)
  const docsByExpense: Record<string, any[]> = {}
  if (expenseIds.length > 0) {
    const { data: allDocs } = await supabaseAdmin
      .from('expense_documents')
      .select('id, expense_id, file_name, file_path, file_type')
      .in('expense_id', expenseIds)
      .order('created_at', { ascending: true })

    for (const doc of allDocs || []) {
      if (!docsByExpense[doc.expense_id]) docsByExpense[doc.expense_id] = []
      docsByExpense[doc.expense_id].push(doc)
    }
  }

  // ── Build PDF ─────────────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create()
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // ── Page 1: Cover / Request Summary ──────────────────────────────────────
  let ctx = newPage(pdfDoc, bold, regular)

  // Header bar
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: rgb(0.12, 0.14, 0.18) })
  ctx.page.drawText('REIMBURSEMENT REQUEST PACKET', {
    x: MARGIN, y: PAGE_H - 38, size: 16, font: bold, color: rgb(1, 1, 1),
  })
  ctx.page.drawText(org?.name ?? '', {
    x: MARGIN, y: PAGE_H - 58, size: 10, font: regular, color: rgb(0.7, 0.75, 0.8),
  })
  ctx.page.drawText(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, {
    x: PAGE_W - MARGIN - 180, y: PAGE_H - 58, size: 9, font: regular, color: rgb(0.7, 0.75, 0.8),
  })
  ctx.y = PAGE_H - 100

  // Grant info
  ctx = drawSectionHeader(ctx, 'Grant Information')
  ctx = drawLabelValue(ctx, 'Grant Name', grant.grant_name)
  ctx = drawLabelValue(ctx, 'Funding Agency', grant.funding_agency)
  if (grant.award_number) ctx = drawLabelValue(ctx, 'Award Number', grant.award_number)
  if (grant.award_amount) ctx = drawLabelValue(ctx, 'Award Amount', fmt(grant.award_amount))
  if (grant.period_start || grant.period_end) {
    ctx = drawLabelValue(ctx, 'Performance Period', `${fmtDate(grant.period_start)} – ${fmtDate(grant.period_end)}`)
  }

  // Request details
  ctx.y -= 10
  ctx = drawSectionHeader(ctx, 'Request Details')
  ctx = drawLabelValue(ctx, 'Request Title', rr.title)
  if (rr.request_number) ctx = drawLabelValue(ctx, 'Request Number', rr.request_number)
  ctx = drawLabelValue(ctx, 'Status', STATUS_LABELS[rr.status] ?? rr.status)
  if (rr.submitted_date) ctx = drawLabelValue(ctx, 'Submitted Date', fmtDate(rr.submitted_date))
  if (rr.description) {
    ctx = checkPage(ctx, 30)
    ctx.page.drawText('Description:', { x: MARGIN, y: ctx.y, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) })
    ctx.y -= 14
    // Wrap description text
    const words = rr.description.split(' ')
    let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (regular.widthOfTextAtSize(test, 9) > CONTENT_W) {
        ctx = checkPage(ctx, 14)
        ctx.page.drawText(line, { x: MARGIN + 12, y: ctx.y, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2) })
        ctx.y -= 13
        line = word
      } else {
        line = test
      }
    }
    if (line) {
      ctx.page.drawText(line, { x: MARGIN + 12, y: ctx.y, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2) })
      ctx.y -= 13
    }
  }
  if (rr.notes) ctx = drawLabelValue(ctx, 'Notes', rr.notes)

  // Financial summary
  ctx.y -= 10
  ctx = drawSectionHeader(ctx, 'Financial Summary')
  ctx = drawLabelValue(ctx, 'Number of Expenses', String(expenses.length))
  ctx = drawLabelValue(ctx, 'Total Requested', fmt(totalAmount))

  if (rr.payment) {
    ctx.y -= 4
    ctx = drawLabelValue(ctx, 'Payment Received', fmt(parseFloat(rr.payment.amount) || 0))
    ctx = drawLabelValue(ctx, 'Payment Date', fmtDate(rr.payment.received_date))
    if (rr.payment.funding_source) ctx = drawLabelValue(ctx, 'Funding Source', rr.payment.funding_source)
  }

  // ── Page 2: Expense Summary Table ─────────────────────────────────────────
  ctx = newPage(pdfDoc, bold, regular)
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: rgb(0.12, 0.14, 0.18) })
  ctx.page.drawText('EXPENSE SUMMARY', { x: MARGIN, y: PAGE_H - 38, size: 16, font: bold, color: rgb(1, 1, 1) })
  ctx.page.drawText(rr.title, { x: MARGIN, y: PAGE_H - 58, size: 10, font: regular, color: rgb(0.7, 0.75, 0.8) })
  ctx.y = PAGE_H - 100

  if (expenses.length === 0) {
    ctx = drawText(ctx, 'No expenses linked to this request.', { font: regular, color: rgb(0.5, 0.5, 0.5) })
  } else {
    // Table header
    const cols = { num: MARGIN, date: MARGIN + 28, vendor: MARGIN + 95, cat: MARGIN + 275, inv: MARGIN + 360, amt: MARGIN + 440 }
    const drawTableHeader = (c: DrawCtx) => {
      c.page.drawRectangle({ x: MARGIN, y: c.y - 2, width: CONTENT_W, height: 18, color: rgb(0.93, 0.94, 0.96) })
      const headers = [['#', cols.num], ['Date', cols.date], ['Vendor', cols.vendor], ['Category', cols.cat], ['Invoice #', cols.inv], ['Amount', cols.amt]] as [string, number][]
      headers.forEach(([h, x]) => {
        c.page.drawText(h, { x, y: c.y + 2, size: 8, font: bold, color: rgb(0.3, 0.3, 0.3) })
      })
      c.y -= 22
      return c
    }

    ctx = drawTableHeader(ctx)

    expenses.forEach((exp, idx) => {
      if (ctx.y < MARGIN + 30) {
        ctx = newPage(pdfDoc, bold, regular)
        ctx = drawTableHeader(ctx)
      }
      const rowBg = idx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.99)
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 3, width: CONTENT_W, height: 16, color: rowBg })
      const amount = parseFloat(exp.amount) || 0
      const vendor = truncate(exp.vendor || '', regular, 8, 170)
      const cat = truncate(exp.category || '—', regular, 8, 80)
      const inv = truncate(exp.invoice_number || '—', regular, 8, 75)

      ctx.page.drawText(String(idx + 1), { x: cols.num, y: ctx.y, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) })
      ctx.page.drawText(fmtDate(exp.expense_date).replace(', ', '\n'), { x: cols.date, y: ctx.y, size: 8, font: regular, color: rgb(0.1, 0.1, 0.1) })
      ctx.page.drawText(vendor, { x: cols.vendor, y: ctx.y, size: 8, font: regular, color: rgb(0.1, 0.1, 0.1) })
      ctx.page.drawText(cat, { x: cols.cat, y: ctx.y, size: 8, font: regular, color: rgb(0.1, 0.1, 0.1) })
      ctx.page.drawText(inv, { x: cols.inv, y: ctx.y, size: 8, font: regular, color: rgb(0.1, 0.1, 0.1) })
      ctx.page.drawText(fmt(amount), { x: cols.amt, y: ctx.y, size: 8, font: bold, color: rgb(0.1, 0.3, 0.1) })
      ctx.y -= 16
    })

    // Total row
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 4 }, end: { x: PAGE_W - MARGIN, y: ctx.y + 4 }, thickness: 1, color: rgb(0.3, 0.3, 0.3) })
    ctx.y -= 4
    ctx.page.drawText('TOTAL', { x: MARGIN, y: ctx.y, size: 9, font: bold, color: rgb(0.1, 0.1, 0.1) })
    ctx.page.drawText(fmt(totalAmount), { x: cols.amt, y: ctx.y, size: 9, font: bold, color: rgb(0.0, 0.3, 0.0) })
    ctx.y -= 20
  }

  // ── Pages 3+: Individual Expense Details + Attachments ─────────────────────
  for (let i = 0; i < expenses.length; i++) {
    const exp = expenses[i]
    const docs = docsByExpense[exp.id] || []
    const amount = parseFloat(exp.amount) || 0

    ctx = newPage(pdfDoc, bold, regular)

    // Expense header bar
    ctx.page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: rgb(0.18, 0.28, 0.45) })
    ctx.page.drawText(`EXPENSE ${i + 1} OF ${expenses.length}`, {
      x: MARGIN, y: PAGE_H - 35, size: 11, font: bold, color: rgb(0.7, 0.8, 1.0),
    })
    ctx.page.drawText(truncate(exp.vendor || '', bold, 16, CONTENT_W - 120), {
      x: MARGIN, y: PAGE_H - 58, size: 16, font: bold, color: rgb(1, 1, 1),
    })
    ctx.page.drawText(fmt(amount), {
      x: PAGE_W - MARGIN - 110, y: PAGE_H - 52, size: 14, font: bold, color: rgb(0.7, 1.0, 0.7),
    })
    ctx.y = PAGE_H - 100

    ctx = drawSectionHeader(ctx, 'Expense Details')
    ctx = drawLabelValue(ctx, 'Date', fmtDate(exp.expense_date))
    ctx = drawLabelValue(ctx, 'Vendor', exp.vendor || '—')
    ctx = drawLabelValue(ctx, 'Amount', fmt(amount))
    ctx = drawLabelValue(ctx, 'Category', exp.category || '—')
    if (exp.invoice_number) ctx = drawLabelValue(ctx, 'Invoice Number', exp.invoice_number)
    if (exp.description) {
      ctx.page.drawText('Description:', { x: MARGIN, y: ctx.y, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) })
      ctx.y -= 14
      const words = exp.description.split(' ')
      let line = ''
      for (const word of words) {
        const test = line ? line + ' ' + word : word
        if (regular.widthOfTextAtSize(test, 9) > CONTENT_W) {
          ctx.page.drawText(line, { x: MARGIN + 12, y: ctx.y, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2) })
          ctx.y -= 13
          line = word
        } else {
          line = test
        }
      }
      if (line) {
        ctx.page.drawText(line, { x: MARGIN + 12, y: ctx.y, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2) })
        ctx.y -= 13
      }
    }

    // Supporting documents list
    ctx.y -= 8
    ctx = drawSectionHeader(ctx, 'Supporting Documentation')
    if (docs.length === 0) {
      ctx = drawText(ctx, 'No documents attached to this expense.', { font: regular, color: rgb(0.5, 0.5, 0.5), size: 9 })
    } else {
      docs.forEach((doc, di) => {
        ctx = checkPage(ctx, 16)
        ctx.page.drawText(`${di + 1}. ${doc.file_name}`, {
          x: MARGIN + 8, y: ctx.y, size: 9, font: regular, color: rgb(0.2, 0.2, 0.2),
        })
        ctx.y -= 14
      })
    }

    // ── Append actual document files ─────────────────────────────────────────
    for (const doc of docs) {
      try {
        // Download from Supabase storage
        const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
          .from('expense-documents')
          .download(doc.file_path)

        if (downloadErr || !fileData) continue

        const fileType: string = doc.file_type || ''
        const arrayBuffer = await fileData.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)

        if (fileType === 'application/pdf') {
          // Merge PDF pages
          try {
            const attachDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
            const copiedPages = await pdfDoc.copyPages(attachDoc, attachDoc.getPageIndices())
            copiedPages.forEach(p => pdfDoc.addPage(p))
            // Reset ctx to last page
            const pages = pdfDoc.getPages()
            ctx = { page: pages[pages.length - 1], doc: pdfDoc, bold, regular, y: MARGIN + 10 }
          } catch {
            // If PDF is corrupt or encrypted, just note it
          }
        } else if (fileType === 'image/jpeg' || fileType === 'image/jpg') {
          const imgPage = pdfDoc.addPage([PAGE_W, PAGE_H])
          const img = await pdfDoc.embedJpg(bytes)
          const dims = img.scaleToFit(CONTENT_W, PAGE_H - 2 * MARGIN)
          const xOff = MARGIN + (CONTENT_W - dims.width) / 2
          const yOff = MARGIN + (PAGE_H - 2 * MARGIN - dims.height) / 2
          imgPage.drawImage(img, { x: xOff, y: yOff, width: dims.width, height: dims.height })
          // Label
          imgPage.drawText(doc.file_name, {
            x: MARGIN, y: PAGE_H - 20, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5),
          })
          ctx = { page: imgPage, doc: pdfDoc, bold, regular, y: MARGIN }
        } else if (fileType === 'image/png') {
          const imgPage = pdfDoc.addPage([PAGE_W, PAGE_H])
          const img = await pdfDoc.embedPng(bytes)
          const dims = img.scaleToFit(CONTENT_W, PAGE_H - 2 * MARGIN)
          const xOff = MARGIN + (CONTENT_W - dims.width) / 2
          const yOff = MARGIN + (PAGE_H - 2 * MARGIN - dims.height) / 2
          imgPage.drawImage(img, { x: xOff, y: yOff, width: dims.width, height: dims.height })
          imgPage.drawText(doc.file_name, {
            x: MARGIN, y: PAGE_H - 20, size: 8, font: regular, color: rgb(0.5, 0.5, 0.5),
          })
          ctx = { page: imgPage, doc: pdfDoc, bold, regular, y: MARGIN }
        }
        // Other types (docx, xlsx, etc.) are listed in the index but not embedded
      } catch {
        // Skip any document that fails
      }
    }
  }

  // ── Serialize and return PDF ───────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save()

  const safeTitle = (rr.request_number || rr.title)
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 50)

  return new Response(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="reimbursement-packet-${safeTitle}.pdf"`,
    },
  })
}
