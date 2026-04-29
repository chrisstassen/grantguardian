'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FileText, Download, Loader2 } from 'lucide-react'

interface GenerateReportDialogProps {
  grantId: string
  grantName: string
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'N/A'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  })
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  federal: 'Federal Grant', state: 'State', local: 'Local Government',
  insurance: 'Insurance Proceeds', organization_budget: 'Organization Budget',
  donation: 'Donations', other: 'Other'
}

const DELIVERABLE_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed'
}

function buildHtmlReport(data: any): string {
  const { grant, organization, generatedAt, financials, expensesByCategory, payments, requirements, deliverables, fundingSources } = data

  const expByCatRows = expensesByCategory.map((r: any) => `
    <tr>
      <td>${r.category}</td>
      <td style="text-align:right">${formatCurrency(r.amount)}</td>
      <td style="text-align:right">${financials.awardAmount > 0 ? ((r.amount / financials.awardAmount) * 100).toFixed(1) : '0.0'}%</td>
    </tr>`).join('')

  const completedRows = requirements.completed.map((r: any) => `
    <tr>
      <td>${r.title}</td>
      <td>${r.due_date ? formatDate(r.due_date) : '—'}</td>
    </tr>`).join('')

  const outstandingReqs = [...requirements.overdue, ...requirements.open]
  const outstandingRows = outstandingReqs.map((r: any) => `
    <tr>
      <td>${r.title}</td>
      <td>${r.due_date ? formatDate(r.due_date) : '—'}</td>
      <td style="color:${r.status === 'overdue' ? '#dc2626' : '#d97706'};font-weight:600">${r.status === 'overdue' ? 'Overdue' : 'Open'}</td>
    </tr>`).join('')

  const paymentRows = payments.map((p: any) => `
    <tr>
      <td>${formatDate(p.received_date)}</td>
      <td>${p.funding_source || '—'}</td>
      <td>${p.reference_number || '—'}</td>
      <td style="text-align:right">${formatCurrency(parseFloat(p.amount) || 0)}</td>
    </tr>`).join('')

  const totalFromSources = (fundingSources || []).reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0)
  const fundingRows = (fundingSources || []).map((s: any) => `
    <tr>
      <td>${s.source_name}</td>
      <td>${SOURCE_TYPE_LABELS[s.source_type] || s.source_type}</td>
      <td style="text-align:right">${formatCurrency(parseFloat(s.amount) || 0)}</td>
      <td style="text-align:right">${totalFromSources > 0 ? ((parseFloat(s.amount) / totalFromSources) * 100).toFixed(1) + '%' : '—'}</td>
    </tr>`).join('')

  const deliverableRows = (deliverables || []).map((d: any) => {
    const pct = d.target_value && d.target_value > 0 ? Math.min(100, (d.actual_value / d.target_value) * 100) : null
    return `
    <tr>
      <td>${d.title}${d.description ? '<br><span style="font-size:11px;color:#94a3b8">' + d.description + '</span>' : ''}</td>
      <td style="text-align:right">${d.target_value != null ? d.target_value.toLocaleString() + (d.unit ? ' ' + d.unit : '') : '—'}</td>
      <td style="text-align:right">${d.actual_value.toLocaleString()}${d.unit ? ' ' + d.unit : ''}</td>
      <td style="text-align:right">${pct != null ? pct.toFixed(0) + '%' : '—'}</td>
      <td>${DELIVERABLE_STATUS_LABELS[d.status] || d.status}</td>
      <td>${d.due_date ? formatDate(d.due_date) : '—'}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Grant Report – ${grant.grant_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Georgia', serif; color: #1e293b; background: #fff; padding: 48px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 26px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    h2 { font-size: 17px; font-weight: 700; color: #0f172a; margin: 32px 0 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
    h3 { font-size: 14px; font-weight: 600; color: #334155; margin: 20px 0 8px; }
    .subtitle { font-size: 15px; color: #64748b; margin-bottom: 4px; }
    .meta { font-size: 12px; color: #94a3b8; margin-top: 8px; }
    .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
    .metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 16px 0; }
    .metric-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
    .metric-label { font-size: 12px; color: #64748b; font-family: sans-serif; text-transform: uppercase; letter-spacing: 0.05em; }
    .metric-value { font-size: 28px; font-weight: 700; margin-top: 4px; }
    .metric-value.blue { color: #2563eb; }
    .metric-value.green { color: #16a34a; }
    .metric-value.slate { color: #334155; }
    .progress-bar-wrap { background: #e2e8f0; border-radius: 4px; height: 8px; margin-top: 8px; overflow: hidden; }
    .progress-bar-fill { height: 8px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: sans-serif; margin-top: 8px; }
    th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    tr:last-child td { border-bottom: none; }
    .financials-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; font-family: sans-serif; font-size: 14px; }
    .fin-row { display: flex; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: 6px; }
    .fin-label { color: #64748b; }
    .fin-value { font-weight: 600; color: #0f172a; }
    .section-note { font-size: 12px; color: #94a3b8; font-family: sans-serif; margin-top: 6px; }
    @media print {
      body { padding: 24px; }
    }
  </style>
</head>
<body>
  <h1>${grant.grant_name}</h1>
  <p class="subtitle">${grant.funding_agency}${grant.program_type ? ' · ' + grant.program_type : ''}</p>
  ${grant.award_number ? `<p class="subtitle">Award #${grant.award_number}</p>` : ''}
  <p class="meta">
    Organization: ${organization || '—'} &nbsp;·&nbsp;
    Performance Period: ${formatDate(grant.period_start)} – ${formatDate(grant.period_end)} &nbsp;·&nbsp;
    Status: ${grant.status.charAt(0).toUpperCase() + grant.status.slice(1)}
  </p>
  <p class="meta">Report generated: ${formatDateTime(generatedAt)}</p>

  <hr class="divider" />

  <h2>Grant Progress</h2>
  <div class="metrics-grid">
    <div class="metric-box">
      <div class="metric-label">% Complete</div>
      <div class="metric-value slate">${grant.percent_complete ?? 0}%</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${Math.min(100, grant.percent_complete ?? 0)}%;background:#334155"></div>
      </div>
    </div>
    <div class="metric-box">
      <div class="metric-label">% Expended</div>
      <div class="metric-value blue">${financials.percentExpended.toFixed(1)}%</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${Math.min(100, financials.percentExpended)}%;background:${financials.percentExpended > 100 ? '#dc2626' : '#2563eb'}"></div>
      </div>
    </div>
    <div class="metric-box">
      <div class="metric-label">% Payments Received</div>
      <div class="metric-value green">${financials.percentPaymentsReceived.toFixed(1)}%</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${Math.min(100, financials.percentPaymentsReceived)}%;background:#16a34a"></div>
      </div>
    </div>
  </div>

  <h2>Financial Summary</h2>
  <div class="financials-grid">
    <div class="fin-row"><span class="fin-label">Award Amount</span><span class="fin-value">${formatCurrency(financials.awardAmount)}</span></div>
    ${financials.totalProjectCost != null ? `<div class="fin-row"><span class="fin-label">Total Project Cost</span><span class="fin-value">${formatCurrency(financials.totalProjectCost)}</span></div>` : ''}
    <div class="fin-row"><span class="fin-label">Total Expenses Logged</span><span class="fin-value">${formatCurrency(financials.totalExpenses)}</span></div>
    <div class="fin-row"><span class="fin-label">Payments Received</span><span class="fin-value" style="color:#16a34a">${formatCurrency(financials.totalPayments)}</span></div>
    <div class="fin-row"><span class="fin-label">Remaining Budget</span><span class="fin-value" style="color:${financials.remainingBudget < 0 ? '#dc2626' : '#16a34a'}">${formatCurrency(financials.remainingBudget)}</span></div>
  </div>

  ${fundingSources && fundingSources.length > 0 ? `
  <h3>Funding Sources</h3>
  <table>
    <thead><tr><th>Source</th><th>Type</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Total</th></tr></thead>
    <tbody>${fundingRows}</tbody>
    <tfoot>
      <tr style="font-weight:700;background:#f1f5f9">
        <td colspan="2">Total</td>
        <td style="text-align:right">${formatCurrency(totalFromSources)}</td>
        <td style="text-align:right">100%</td>
      </tr>
    </tfoot>
  </table>` : ''}

  <h3>Expenditures by Category</h3>
  ${expensesByCategory.length > 0 ? `
  <table>
    <thead><tr><th>Category</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Award</th></tr></thead>
    <tbody>${expByCatRows}</tbody>
    <tfoot>
      <tr style="font-weight:700;background:#f1f5f9">
        <td>Total</td>
        <td style="text-align:right">${formatCurrency(financials.totalExpenses)}</td>
        <td style="text-align:right">${financials.percentExpended.toFixed(1)}%</td>
      </tr>
    </tfoot>
  </table>` : '<p class="section-note">No expenses recorded.</p>'}

  <h2>Payments Received</h2>
  ${payments.length > 0 ? `
  <table>
    <thead><tr><th>Date</th><th>Funding Source</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${paymentRows}</tbody>
    <tfoot>
      <tr style="font-weight:700;background:#f1f5f9">
        <td colspan="3">Total Received</td>
        <td style="text-align:right">${formatCurrency(financials.totalPayments)}</td>
      </tr>
    </tfoot>
  </table>` : '<p class="section-note">No payments recorded.</p>'}

  <h2>Deliverables</h2>
  ${deliverables && deliverables.length > 0 ? `
  <table>
    <thead><tr><th>Deliverable</th><th style="text-align:right">Target</th><th style="text-align:right">Actual</th><th style="text-align:right">Progress</th><th>Status</th><th>Due Date</th></tr></thead>
    <tbody>${deliverableRows}</tbody>
  </table>` : '<p class="section-note">No deliverables recorded.</p>'}

  <h2>Requirements</h2>
  <p class="section-note" style="margin-bottom:12px">
    Total: ${requirements.total} &nbsp;·&nbsp;
    Completed: ${requirements.completed.length} &nbsp;·&nbsp;
    Open: ${requirements.open.length} &nbsp;·&nbsp;
    Overdue: ${requirements.overdue.length}
  </p>

  ${requirements.completed.length > 0 ? `
  <h3>Completed Requirements (${requirements.completed.length})</h3>
  <table>
    <thead><tr><th>Title</th><th>Due Date</th></tr></thead>
    <tbody>${completedRows}</tbody>
  </table>` : ''}

  ${outstandingReqs.length > 0 ? `
  <h3 style="margin-top:20px">Outstanding Requirements (${outstandingReqs.length})</h3>
  <table>
    <thead><tr><th>Title</th><th>Due Date</th><th>Status</th></tr></thead>
    <tbody>${outstandingRows}</tbody>
  </table>` : ''}

  ${requirements.total === 0 ? '<p class="section-note">No requirements recorded.</p>' : ''}

</body>
</html>`
}

export function GenerateReportDialog({ grantId, grantName }: GenerateReportDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchReport = async () => {
    setLoading(true)
    setError(null)
    setReportData(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not authenticated'); setLoading(false); return }

      const res = await fetch(`/api/user/grants/${grantId}/report`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Failed to generate report')
      } else {
        const data = await res.json()
        setReportData(data)
      }
    } catch {
      setError('Unexpected error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (val && !reportData) fetchReport()
  }

  const handleDownload = () => {
    if (!reportData) return
    const html = buildHtmlReport(reportData)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = grantName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50)
    a.download = `${safeName}_Report.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const { financials, requirements, expensesByCategory, payments, deliverables, fundingSources } = reportData || {}

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Generate Report
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grant Report</DialogTitle>
          <DialogDescription>
            Structured summary report for {grantName}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Generating report…</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
            {error}
            <button onClick={fetchReport} className="ml-3 underline text-red-700">Retry</button>
          </div>
        )}

        {reportData && !loading && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
              <p className="text-xs text-slate-500 font-mono">
                Generated {new Date(reportData.generatedAt).toLocaleString()}
                {reportData.organization && ` · ${reportData.organization}`}
              </p>
            </div>

            {/* Progress Metrics */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Grant Progress</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    label: '% Complete',
                    value: `${reportData.grant.percent_complete ?? 0}%`,
                    color: 'text-slate-800',
                    bar: reportData.grant.percent_complete ?? 0,
                    barColor: 'bg-slate-700'
                  },
                  {
                    label: '% Expended',
                    value: `${financials.percentExpended.toFixed(1)}%`,
                    color: 'text-blue-600',
                    bar: Math.min(100, financials.percentExpended),
                    barColor: financials.percentExpended > 100 ? 'bg-red-500' : 'bg-blue-500'
                  },
                  {
                    label: '% Payments Received',
                    value: `${financials.percentPaymentsReceived.toFixed(1)}%`,
                    color: 'text-green-600',
                    bar: Math.min(100, financials.percentPaymentsReceived),
                    barColor: 'bg-green-500'
                  }
                ].map(m => (
                  <div key={m.label} className="rounded-lg border border-slate-200 p-4 text-center bg-white">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{m.label}</p>
                    <p className={`text-3xl font-bold mt-1 ${m.color}`}>{m.value}</p>
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-2 overflow-hidden">
                      <div className={`h-2 rounded-full ${m.barColor}`} style={{ width: `${m.bar}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Financial Summary</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: 'Total Project Cost', value: financials.totalProjectCost != null ? formatCurrency(financials.totalProjectCost) : '—', color: '' },
                  { label: 'Award Amount', value: formatCurrency(financials.awardAmount), color: '' },
                  { label: 'Total Expenses', value: formatCurrency(financials.totalExpenses), color: 'text-blue-600' },
                  { label: 'Payments Received', value: formatCurrency(financials.totalPayments), color: 'text-green-600' },
                  { label: 'Remaining Budget', value: formatCurrency(financials.remainingBudget), color: financials.remainingBudget < 0 ? 'text-red-600' : 'text-green-600' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <span className="text-slate-600">{row.label}</span>
                    <span className={`font-semibold ${row.color || 'text-slate-900'}`}>{row.value}</span>
                  </div>
                ))}
              </div>

              {expensesByCategory.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">Expenditures by Category</p>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">% of Award</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expensesByCategory.map((row: any) => (
                          <tr key={row.category} className="border-t border-slate-100">
                            <td className="px-4 py-2 text-slate-700">{row.category}</td>
                            <td className="px-4 py-2 text-right font-medium">{formatCurrency(row.amount)}</td>
                            <td className="px-4 py-2 text-right text-slate-500">
                              {financials.awardAmount > 0 ? ((row.amount / financials.awardAmount) * 100).toFixed(1) : '0.0'}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Funding Sources */}
            {fundingSources && fundingSources.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Funding Sources</h3>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fundingSources.map((s: any) => {
                        const srcTotal = fundingSources.reduce((acc: number, r: any) => acc + (parseFloat(r.amount) || 0), 0)
                        return (
                          <tr key={s.id} className="border-t border-slate-100">
                            <td className="px-4 py-2 text-slate-700">{s.source_name}</td>
                            <td className="px-4 py-2 text-slate-500">{SOURCE_TYPE_LABELS[s.source_type] || s.source_type}</td>
                            <td className="px-4 py-2 text-right font-medium">{formatCurrency(parseFloat(s.amount) || 0)}</td>
                            <td className="px-4 py-2 text-right text-slate-500">{srcTotal > 0 ? ((parseFloat(s.amount) / srcTotal) * 100).toFixed(1) + '%' : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={2} className="px-4 py-2 font-semibold text-slate-700">Total</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-900">{formatCurrency(fundingSources.reduce((a: number, s: any) => a + (parseFloat(s.amount) || 0), 0))}</td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-600">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Payments Received */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Payments Received</h3>
              {payments.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No payments recorded for this grant.</p>
              ) : (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Funding Source</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p: any) => (
                        <tr key={p.id} className="border-t border-slate-100">
                          <td className="px-4 py-2 text-slate-700">{formatDate(p.received_date)}</td>
                          <td className="px-4 py-2 text-slate-700">{p.funding_source || '—'}</td>
                          <td className="px-4 py-2 text-slate-500">{p.reference_number || '—'}</td>
                          <td className="px-4 py-2 text-right font-medium text-green-700">{formatCurrency(parseFloat(p.amount) || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 font-semibold text-slate-700">Total Received</td>
                        <td className="px-4 py-2 text-right font-bold text-green-700">{formatCurrency(financials.totalPayments)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Deliverables */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Deliverables</h3>
              {!deliverables || deliverables.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No deliverables recorded for this grant.</p>
              ) : (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deliverable</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Target</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actual</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Progress</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliverables.map((d: any) => {
                        const pct = d.target_value && d.target_value > 0 ? Math.min(100, (d.actual_value / d.target_value) * 100) : null
                        const statusColors: Record<string, string> = { completed: 'text-green-700', in_progress: 'text-blue-700', not_started: 'text-slate-500' }
                        return (
                          <tr key={d.id} className="border-t border-slate-100">
                            <td className="px-4 py-2">
                              <p className="font-medium text-slate-800">{d.title}</p>
                              {d.description && <p className="text-xs text-slate-400">{d.description}</p>}
                            </td>
                            <td className="px-4 py-2 text-right text-slate-600">{d.target_value != null ? `${d.target_value.toLocaleString()}${d.unit ? ' ' + d.unit : ''}` : '—'}</td>
                            <td className="px-4 py-2 text-right text-slate-600">{`${d.actual_value.toLocaleString()}${d.unit ? ' ' + d.unit : ''}`}</td>
                            <td className="px-4 py-2 text-right">
                              {pct != null ? (
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                    <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-slate-500 text-xs">{pct.toFixed(0)}%</span>
                                </div>
                              ) : <span className="text-slate-400">—</span>}
                            </td>
                            <td className={`px-4 py-2 text-xs font-medium capitalize ${statusColors[d.status] || 'text-slate-500'}`}>{DELIVERABLE_STATUS_LABELS[d.status] || d.status}</td>
                            <td className="px-4 py-2 text-slate-500 text-xs">{d.due_date ? formatDate(d.due_date) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Requirements */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Requirements</h3>
              <p className="text-xs text-slate-500 mb-3">
                Total: {requirements.total} &nbsp;·&nbsp;
                Completed: {requirements.completed.length} &nbsp;·&nbsp;
                Open: {requirements.open.length} &nbsp;·&nbsp;
                Overdue: {requirements.overdue.length}
              </p>

              {requirements.total === 0 && (
                <p className="text-sm text-slate-400 italic">No requirements recorded for this grant.</p>
              )}

              {requirements.completed.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    ✓ Completed ({requirements.completed.length})
                  </p>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Requirement</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requirements.completed.map((r: any) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="px-4 py-2 text-slate-700">{r.title}</td>
                            <td className="px-4 py-2 text-slate-500">{r.due_date ? formatDate(r.due_date) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(requirements.open.length > 0 || requirements.overdue.length > 0) && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    ⚠ Outstanding ({requirements.open.length + requirements.overdue.length})
                  </p>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Requirement</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...requirements.overdue, ...requirements.open].map((r: any) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="px-4 py-2 text-slate-700">{r.title}</td>
                            <td className="px-4 py-2 text-slate-500">{r.due_date ? formatDate(r.due_date) : '—'}</td>
                            <td className={`px-4 py-2 font-semibold capitalize ${r.status === 'overdue' ? 'text-red-600' : 'text-amber-600'}`}>
                              {r.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Download Button */}
            <div className="flex justify-end pt-2 border-t">
              <Button onClick={handleDownload} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download Report (HTML)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
