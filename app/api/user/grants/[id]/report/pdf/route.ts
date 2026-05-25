import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib'

// ── Page constants ────────────────────────────────────────────────────────────
const PAGE_W  = 612
const PAGE_H  = 792
const MARGIN  = 50
const CWIDTH  = PAGE_W - MARGIN * 2  // 512

// ── Colour helpers ────────────────────────────────────────────────────────────
const C_BLACK  = rgb(0.059, 0.090, 0.176)   // slate-950
const C_DARK   = rgb(0.200, 0.255, 0.325)   // slate-700
const C_MID    = rgb(0.390, 0.455, 0.545)   // slate-500
const C_LIGHT  = rgb(0.580, 0.635, 0.710)   // slate-400
const C_BG     = rgb(0.965, 0.973, 0.984)   // slate-50
const C_BORDER = rgb(0.886, 0.906, 0.937)   // slate-200
const C_BLUE   = rgb(0.145, 0.388, 0.922)   // blue-600
const C_GREEN  = rgb(0.086, 0.647, 0.290)   // green-600
const C_RED    = rgb(0.863, 0.149, 0.149)   // red-600
const C_AMBER  = rgb(0.851, 0.604, 0.165)   // amber-500
const C_WHITE  = rgb(1, 1, 1)

// ── PDF Builder ───────────────────────────────────────────────────────────────

class PdfBuilder {
  doc: PDFDocument
  page!: PDFPage
  y = 0
  reg!: PDFFont
  bold!: PDFFont

  static async create() {
    const doc = await PDFDocument.create()
    const b = new PdfBuilder(doc)
    b.reg  = await doc.embedFont(StandardFonts.Helvetica)
    b.bold = await doc.embedFont(StandardFonts.HelveticaBold)
    b.newPage()
    return b
  }

  private constructor(doc: PDFDocument) { this.doc = doc }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H])
    this.y    = PAGE_H - MARGIN
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN + 10) this.newPage()
  }

  text(
    str: string,
    x: number,
    size: number,
    opts: { font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}
  ) {
    const font  = opts.font  ?? this.reg
    const color = opts.color ?? C_DARK
    const mw    = opts.maxWidth
    if (mw) {
      // Simple word-wrap
      const words = str.split(' ')
      let line = ''
      for (const w of words) {
        const test = line ? `${line} ${w}` : w
        if (font.widthOfTextAtSize(test, size) > mw && line) {
          this.page.drawText(line, { x, y: this.y, size, font, color })
          this.y -= size + 2
          line = w
        } else {
          line = test
        }
      }
      if (line) {
        this.page.drawText(line, { x, y: this.y, size, font, color })
        this.y -= size + 2
      }
    } else {
      this.page.drawText(str, { x, y: this.y, size, font, color })
    }
  }

  lineH(x = MARGIN, w = CWIDTH, color = C_BORDER) {
    this.page.drawLine({ start: { x, y: this.y }, end: { x: x + w, y: this.y }, thickness: 0.5, color })
  }

  rect(x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
    this.page.drawRectangle({ x, y, width: w, height: h, color })
  }

  // Section header with underline
  sectionHeader(title: string) {
    this.ensureSpace(30)
    this.y -= 18
    this.text(title.toUpperCase(), MARGIN, 8, { font: this.bold, color: C_MID })
    this.y -= 4
    this.lineH()
    this.y -= 10
  }

  // Key-value row pair (two columns)
  kvRow(label: string, value: string, color = C_DARK) {
    this.ensureSpace(18)
    this.rect(MARGIN, this.y - 14, CWIDTH, 18, C_BG)
    this.page.drawText(label, { x: MARGIN + 6, y: this.y - 10, size: 9, font: this.reg, color: C_MID })
    this.page.drawText(value, { x: MARGIN + CWIDTH / 2 + 6, y: this.y - 10, size: 9, font: this.bold, color })
    this.y -= 18
  }

  // Generic table
  table(
    headers: string[],
    rows: Array<Array<{ text: string; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' }>>,
    colWidths: number[]
  ) {
    const rowH   = 16
    const padX   = 5
    const startX = MARGIN

    // Header row
    this.ensureSpace(rowH + 4)
    this.rect(startX, this.y - rowH, CWIDTH, rowH, rgb(0.940, 0.949, 0.961)) // slate-100
    let cx = startX
    for (let i = 0; i < headers.length; i++) {
      this.page.drawText(headers[i].toUpperCase(), {
        x: cx + padX,
        y: this.y - rowH + 5,
        size: 7,
        font: this.bold,
        color: C_MID,
      })
      cx += colWidths[i]
    }
    this.y -= rowH

    // Data rows
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri]
      this.ensureSpace(rowH + 2)
      if (ri % 2 === 1) this.rect(startX, this.y - rowH, CWIDTH, rowH, rgb(0.984, 0.988, 0.996))
      cx = startX
      for (let ci = 0; ci < row.length; ci++) {
        const cell  = row[ci]
        const align = cell.align ?? 'left'
        const tw    = this.reg.widthOfTextAtSize(cell.text, 8)
        const tx    = align === 'right' ? cx + colWidths[ci] - padX - tw : cx + padX
        this.page.drawText(cell.text, {
          x: tx,
          y: this.y - rowH + 4,
          size: 8,
          font: this.reg,
          color: cell.color ?? C_DARK,
        })
        cx += colWidths[ci]
      }
      this.lineH(startX, CWIDTH, C_BORDER)
      this.y -= rowH
    }

    this.y -= 6
  }

  // Footer row for a table (bold totals)
  tableFooter(cells: Array<{ text: string; align?: 'left' | 'right' }>, colWidths: number[]) {
    const rowH = 16
    this.ensureSpace(rowH)
    this.rect(MARGIN, this.y - rowH, CWIDTH, rowH, rgb(0.940, 0.949, 0.961))
    let cx = MARGIN
    for (let i = 0; i < cells.length; i++) {
      const cell  = cells[i]
      const align = cell.align ?? 'left'
      const tw    = this.bold.widthOfTextAtSize(cell.text, 8)
      const tx    = align === 'right' ? cx + colWidths[i] - 5 - tw : cx + 5
      this.page.drawText(cell.text, { x: tx, y: this.y - rowH + 4, size: 8, font: this.bold, color: C_BLACK })
      cx += colWidths[i]
    }
    this.y -= rowH + 8
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

/** Strip characters outside WinAnsi (Latin-1 supplement) so Helvetica can encode them. */
function safe(s: string): string {
  return s.replace(/[^\x00-\xFF]/g, '?')
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(s: string | null) {
  if (!s) return 'N/A'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const SOURCE_LABELS: Record<string, string> = {
  federal: 'Federal', state: 'State', local: 'Local Gov.', insurance: 'Insurance',
  organization_budget: 'Org Budget', donation: 'Donations', other: 'Other',
}

const DELIVERABLE_STATUS: Record<string, string> = {
  not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed',
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function authorize(token: string | null, grantId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 as const }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorized', status: 401 as const }

  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('id, grant_name, funding_agency, program_type, award_number, award_amount, total_project_cost, period_start, period_end, status, percent_complete, organization_id')
    .eq('id', grantId).single()
  if (!grant) return { error: 'Grant not found', status: 404 as const }

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()
  if (!membership) return { error: 'Forbidden', status: 403 as const }

  return { grant }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: grantId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth  = await authorize(token, grantId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { grant } = auth

  // ── Fetch all data in parallel ──────────────────────────────────────────────
  const [expRes, payRes, reqRes, orgRes, delRes, fsRes] = await Promise.all([
    supabaseAdmin.from('expenses').select('id,expense_date,vendor,description,amount,category').eq('grant_id', grantId).order('expense_date', { ascending: false }),
    supabaseAdmin.from('payments_received').select('id,received_date,amount,funding_source,reference_number').eq('grant_id', grantId).order('received_date', { ascending: false }),
    supabaseAdmin.from('compliance_requirements').select('id,title,due_date,status').eq('grant_id', grantId).order('due_date', { ascending: true }),
    supabaseAdmin.from('organizations').select('name,logo_path').eq('id', grant.organization_id).single(),
    supabaseAdmin.from('grant_deliverables').select('*').eq('grant_id', grantId).order('created_at', { ascending: true }),
    supabaseAdmin.from('grant_funding_sources').select('*').eq('grant_id', grantId).order('amount', { ascending: false }),
  ])

  const expenses      = expRes.data  || []
  const payments      = payRes.data  || []
  const deliverables  = delRes.data  || []
  const fundingSources = fsRes.data  || []
  const orgName       = orgRes.data?.name || ''
  const logoPath      = orgRes.data?.logo_path

  // Overdue computation
  const today = new Date(); today.setHours(0,0,0,0)
  const requirements = (reqRes.data || []).map((r: any) => {
    if (r.status !== 'completed' && r.due_date && new Date(r.due_date) < today) return { ...r, status: 'overdue' }
    return r
  })

  // Financials
  const totalExpenses  = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const totalPayments  = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const awardAmount    = parseFloat(grant.award_amount) || 0
  const totalProjectCost = grant.total_project_cost ? parseFloat(grant.total_project_cost) : null
  const remaining      = awardAmount - totalExpenses
  const pctExpended    = awardAmount > 0 ? (totalExpenses / awardAmount) * 100 : 0
  const pctPayments    = awardAmount > 0 ? (totalPayments / awardAmount) * 100 : 0
  const totalFunding   = fundingSources.reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0)

  const byCategory: Record<string, number> = {}
  for (const e of expenses) {
    const cat = e.category || 'Uncategorized'
    byCategory[cat] = (byCategory[cat] || 0) + (parseFloat(e.amount) || 0)
  }
  const expByCat = Object.entries(byCategory).map(([k, v]) => ({ cat: k, amt: v })).sort((a, b) => b.amt - a.amt)

  const completedReqs   = requirements.filter((r: any) => r.status === 'completed')
  const openReqs        = requirements.filter((r: any) => r.status === 'open' || r.status === 'in_progress')
  const overdueReqs     = requirements.filter((r: any) => r.status === 'overdue')

  // ── Fetch logo bytes ────────────────────────────────────────────────────────
  let logoBytes: Uint8Array | null = null
  let logoMime  = 'image/png'
  if (logoPath) {
    try {
      const { data: blob } = await supabaseAdmin.storage.from('organization-logos').download(logoPath)
      if (blob) {
        logoBytes = new Uint8Array(await blob.arrayBuffer())
        const ext = logoPath.split('.').pop()?.toLowerCase() || 'png'
        logoMime  = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
        // SVG can't be embedded in pdf-lib directly — skip
        if (ext === 'svg') logoBytes = null
      }
    } catch { /* logo is optional */ }
  }

  // ── Build PDF ───────────────────────────────────────────────────────────────
  const b = await PdfBuilder.create()
  const { doc } = b

  // ── 1. Header ───────────────────────────────────────────────────────────────
  let headerX = MARGIN

  // Logo
  if (logoBytes) {
    try {
      const img = logoMime === 'image/jpeg' ? await doc.embedJpg(logoBytes) : await doc.embedPng(logoBytes)
      const { width: iw, height: ih } = img.scaleToFit(48, 48)
      b.page.drawImage(img, { x: MARGIN, y: b.y - ih, width: iw, height: ih })
      headerX = MARGIN + iw + 10
    } catch { /* skip broken logo */ }
  }

  // Org name + grant name block
  b.page.drawText(safe(orgName || 'Organization'), { x: headerX, y: b.y - 12, size: 9, font: b.reg, color: C_MID })
  b.page.drawText(safe(grant.grant_name), { x: headerX, y: b.y - 26, size: 16, font: b.bold, color: C_BLACK })
  const subtitleParts = [grant.funding_agency, grant.program_type].filter(Boolean)
  if (subtitleParts.length) {
    b.page.drawText(safe(subtitleParts.join(' / ')), { x: headerX, y: b.y - 40, size: 9, font: b.reg, color: C_MID })
  }
  if (grant.award_number) {
    b.page.drawText(safe(`Award #${grant.award_number}`), { x: headerX, y: b.y - 52, size: 8, font: b.reg, color: C_LIGHT })
  }
  b.y -= 60

  // Meta line
  b.y -= 4
  b.page.drawText(
    safe(`Period: ${fmtDate(grant.period_start)} - ${fmtDate(grant.period_end)}   Status: ${grant.status.charAt(0).toUpperCase() + grant.status.slice(1)}   Generated: ${fmtDateTime(new Date().toISOString())}`),
    { x: MARGIN, y: b.y, size: 7.5, font: b.reg, color: C_LIGHT }
  )
  b.y -= 14
  b.lineH()
  b.y -= 6

  // ── 2. Progress Metrics ─────────────────────────────────────────────────────
  b.sectionHeader('Grant Progress')

  const metrics = [
    { label: '% Complete',           value: `${grant.percent_complete ?? 0}%`, bar: grant.percent_complete ?? 0, barColor: C_DARK },
    { label: '% Expended',           value: `${pctExpended.toFixed(1)}%`,      bar: Math.min(100, pctExpended), barColor: pctExpended > 100 ? C_RED : C_BLUE },
    { label: '% Payments Received',  value: `${pctPayments.toFixed(1)}%`,      bar: Math.min(100, pctPayments), barColor: C_GREEN },
  ]
  const boxW = CWIDTH / 3 - 6
  const boxH = 52
  let mx = MARGIN
  b.ensureSpace(boxH + 10)
  for (const m of metrics) {
    b.rect(mx, b.y - boxH, boxW, boxH, C_BG)
    b.page.drawRectangle({ x: mx, y: b.y - boxH, width: boxW, height: boxH, borderColor: C_BORDER, borderWidth: 0.5, color: undefined })
    b.page.drawText(m.label, { x: mx + boxW / 2 - b.reg.widthOfTextAtSize(m.label, 7.5) / 2, y: b.y - 14, size: 7.5, font: b.reg, color: C_MID })
    b.page.drawText(m.value, { x: mx + boxW / 2 - b.bold.widthOfTextAtSize(m.value, 20) / 2, y: b.y - 32, size: 20, font: b.bold, color: C_BLACK })
    // Progress bar
    const barY = b.y - boxH + 6
    b.page.drawRectangle({ x: mx + 8, y: barY, width: boxW - 16, height: 4, color: C_BORDER })
    if (m.bar > 0) b.page.drawRectangle({ x: mx + 8, y: barY, width: Math.max(4, (boxW - 16) * m.bar / 100), height: 4, color: m.barColor })
    mx += boxW + 9
  }
  b.y -= boxH + 10

  // ── 3. Financial Summary ────────────────────────────────────────────────────
  b.sectionHeader('Financial Summary')

  const finRows: Array<[string, string, ReturnType<typeof rgb>?]> = [
    ['Award Amount',       fmtCurrency(awardAmount)],
    ...(totalProjectCost != null ? [['Total Project Cost', fmtCurrency(totalProjectCost)] as [string, string]] : []),
    ['Total Expenses Logged', fmtCurrency(totalExpenses), C_BLUE],
    ['Payments Received',  fmtCurrency(totalPayments), C_GREEN],
    ['Remaining Budget',   fmtCurrency(remaining), remaining < 0 ? C_RED : C_GREEN],
  ]
  for (let i = 0; i < finRows.length; i += 2) {
    b.ensureSpace(20)
    const rowY = b.y
    // Left cell
    b.rect(MARGIN, rowY - 16, CWIDTH / 2 - 4, 18, C_BG)
    b.page.drawText(finRows[i][0], { x: MARGIN + 6, y: rowY - 12, size: 8.5, font: b.reg, color: C_MID })
    b.page.drawText(finRows[i][1], { x: MARGIN + CWIDTH / 2 - 10 - b.bold.widthOfTextAtSize(finRows[i][1], 8.5), y: rowY - 12, size: 8.5, font: b.bold, color: finRows[i][2] ?? C_BLACK })
    // Right cell (if exists)
    if (finRows[i + 1]) {
      b.rect(MARGIN + CWIDTH / 2 + 4, rowY - 16, CWIDTH / 2 - 4, 18, C_BG)
      b.page.drawText(finRows[i + 1][0], { x: MARGIN + CWIDTH / 2 + 10, y: rowY - 12, size: 8.5, font: b.reg, color: C_MID })
      b.page.drawText(finRows[i + 1][1], { x: MARGIN + CWIDTH - 6 - b.bold.widthOfTextAtSize(finRows[i + 1][1], 8.5), y: rowY - 12, size: 8.5, font: b.bold, color: finRows[i + 1][2] ?? C_BLACK })
    }
    b.y -= 22
  }
  b.y -= 4

  // ── 4. Expenditures by Category ─────────────────────────────────────────────
  b.sectionHeader('Expenditures by Category')
  if (expByCat.length === 0) {
    b.ensureSpace(14)
    b.text('No expenses recorded.', MARGIN, 8.5, { color: C_LIGHT })
    b.y -= 14
  } else {
    const cw = [CWIDTH - 160, 100, 60]
    b.table(
      ['Category', 'Amount', '% of Award'],
      expByCat.map(r => [
        { text: safe(r.cat) },
        { text: fmtCurrency(r.amt), align: 'right' as const },
        { text: awardAmount > 0 ? `${((r.amt / awardAmount) * 100).toFixed(1)}%` : 'N/A', align: 'right' as const },
      ]),
      cw
    )
    b.tableFooter(
      [{ text: 'Total' }, { text: fmtCurrency(totalExpenses), align: 'right' }, { text: `${pctExpended.toFixed(1)}%`, align: 'right' }],
      cw
    )
  }

  // ── 5. Funding Sources ──────────────────────────────────────────────────────
  if (fundingSources.length > 0) {
    b.sectionHeader('Funding Sources')
    const cw = [CWIDTH - 260, 110, 100, 50]
    b.table(
      ['Source', 'Type', 'Amount', '% Total'],
      fundingSources.map((s: any) => [
        { text: safe(s.source_name || 'N/A') },
        { text: safe(SOURCE_LABELS[s.source_type] || s.source_type) },
        { text: fmtCurrency(parseFloat(s.amount) || 0), align: 'right' as const },
        { text: totalFunding > 0 ? `${((parseFloat(s.amount) / totalFunding) * 100).toFixed(1)}%` : 'N/A', align: 'right' as const },
      ]),
      cw
    )
    b.tableFooter(
      [{ text: 'Total' }, { text: '' }, { text: fmtCurrency(totalFunding), align: 'right' }, { text: '100%', align: 'right' }],
      cw
    )
  }

  // ── 6. Payments Received ────────────────────────────────────────────────────
  b.sectionHeader('Payments Received')
  if (payments.length === 0) {
    b.ensureSpace(14)
    b.text('No payments recorded.', MARGIN, 8.5, { color: C_LIGHT })
    b.y -= 14
  } else {
    const cw = [90, CWIDTH - 310, 120, 100]
    b.table(
      ['Date', 'Funding Source', 'Reference', 'Amount'],
      payments.map((p: any) => [
        { text: fmtDate(p.received_date) },
        { text: safe(p.funding_source || 'N/A') },
        { text: safe(p.reference_number || 'N/A') },
        { text: fmtCurrency(parseFloat(p.amount) || 0), align: 'right' as const, color: C_GREEN },
      ]),
      cw
    )
    b.tableFooter(
      [{ text: 'Total Received' }, { text: '' }, { text: '' }, { text: fmtCurrency(totalPayments), align: 'right' }],
      cw
    )
  }

  // ── 7. Deliverables ─────────────────────────────────────────────────────────
  b.sectionHeader('Deliverables')
  if (deliverables.length === 0) {
    b.ensureSpace(14)
    b.text('No deliverables recorded.', MARGIN, 8.5, { color: C_LIGHT })
    b.y -= 14
  } else {
    const cw = [CWIDTH - 250, 70, 70, 50, 60]
    b.table(
      ['Deliverable', 'Target', 'Actual', 'Progress', 'Status'],
      deliverables.map((d: any) => {
        const pct = d.target_value && d.target_value > 0 ? Math.min(100, (d.actual_value / d.target_value) * 100) : null
        const statusColor: Record<string, ReturnType<typeof rgb>> = { completed: C_GREEN, in_progress: C_BLUE, not_started: C_LIGHT }
        return [
          { text: safe(d.title || '') },
          { text: d.target_value != null ? safe(`${d.target_value.toLocaleString()}${d.unit ? ' ' + d.unit : ''}`) : 'N/A', align: 'right' as const },
          { text: safe(`${d.actual_value.toLocaleString()}${d.unit ? ' ' + d.unit : ''}`), align: 'right' as const },
          { text: pct != null ? `${pct.toFixed(0)}%` : '—', align: 'right' as const },
          { text: DELIVERABLE_STATUS[d.status] || d.status, color: statusColor[d.status] ?? C_MID },
        ]
      }),
      cw
    )
  }

  // ── 8. Requirements ─────────────────────────────────────────────────────────
  b.sectionHeader('Requirements')
  b.ensureSpace(14)
  b.text(
    `Total: ${requirements.length}   Completed: ${completedReqs.length}   Open: ${openReqs.length}   Overdue: ${overdueReqs.length}`,
    MARGIN, 8, { color: C_MID }
  )
  b.y -= 14

  if (requirements.length === 0) {
    b.ensureSpace(14)
    b.text('No requirements recorded.', MARGIN, 8.5, { color: C_LIGHT })
    b.y -= 14
  } else {
    if (completedReqs.length > 0) {
      b.ensureSpace(22)
      b.y -= 6
      b.text(`Completed (${completedReqs.length})`, MARGIN, 8.5, { font: b.bold, color: C_GREEN })
      b.y -= 10
      const cw = [CWIDTH - 100, 100]
      b.table(
        ['Requirement', 'Due Date'],
        completedReqs.map((r: any) => [{ text: safe(r.title || '') }, { text: fmtDate(r.due_date) }]),
        cw
      )
    }

    const outstanding = [...overdueReqs, ...openReqs]
    if (outstanding.length > 0) {
      b.ensureSpace(22)
      b.y -= 6
      b.text(`Outstanding (${outstanding.length})`, MARGIN, 8.5, { font: b.bold, color: C_AMBER })
      b.y -= 10
      const cw = [CWIDTH - 160, 100, 60]
      b.table(
        ['Requirement', 'Due Date', 'Status'],
        outstanding.map((r: any) => [
          { text: safe(r.title || '') },
          { text: fmtDate(r.due_date) },
          { text: r.status === 'overdue' ? 'Overdue' : 'Open', color: r.status === 'overdue' ? C_RED : C_AMBER },
        ]),
        cw
      )
    }
  }

  // ── Finalize ────────────────────────────────────────────────────────────────
  // Page numbers
  const totalPages = doc.getPageCount()
  for (let i = 0; i < totalPages; i++) {
    const pg = doc.getPage(i)
    const lbl = `Page ${i + 1} of ${totalPages}`
    pg.drawText(lbl, { x: PAGE_W - MARGIN - b.reg.widthOfTextAtSize(lbl, 7), y: 18, size: 7, font: b.reg, color: C_LIGHT })
    pg.drawText('GrantGuardian', { x: MARGIN, y: 18, size: 7, font: b.reg, color: C_LIGHT })
  }

  const pdfBytes = await doc.save()
  const safeName = (grant.grant_name || 'grant').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50)

  return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}_Report.pdf"`,
      'Content-Length':      String(pdfBytes.length),
    },
  })
}
