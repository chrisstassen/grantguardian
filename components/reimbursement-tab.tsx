'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, ChevronDown, ChevronUp, Pencil, Trash2, FileDown,
  ReceiptText, Link2, Unlink, CreditCard, Loader2,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface ReimbursementRequest {
  id: string
  grant_id: string
  request_number: string | null
  title: string
  description: string | null
  status: 'pending_submission' | 'submitted' | 'payment_received' | 'request_denied'
  submitted_date: string | null
  payment_received_id: string | null
  notes: string | null
  created_at: string
  expense_ids: string[]
  expense_count: number
  total_amount: number
  // Populated when expanded
  expenses?: LinkedExpense[]
  payment?: any
}

interface LinkedExpense {
  id: string
  expense_date: string
  vendor: string
  amount: number | string
  category: string | null
  description: string | null
  invoice_number: string | null
}

interface ReimbursementTabProps {
  grantId: string
  expenses: any[]           // all grant expenses (from parent)
  payments: any[]           // all payments_received (from parent)
  userRole: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'pending_submission', label: 'Pending Submission' },
  { value: 'submitted',          label: 'Submitted' },
  { value: 'payment_received',   label: 'Payment Received' },
  { value: 'request_denied',     label: 'Request Denied' },
]

const STATUS_COLORS: Record<string, string> = {
  pending_submission: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  submitted:          'bg-blue-100 text-blue-800 border-blue-200',
  payment_received:   'bg-green-100 text-green-800 border-green-200',
  request_denied:     'bg-red-100 text-red-800 border-red-200',
}

const fmt = (n: number | string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    typeof n === 'string' ? parseFloat(n) || 0 : n
  )

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const emptyForm = {
  title: '',
  request_number: '',
  description: '',
  submitted_date: '',
  notes: '',
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReimbursementTab({ grantId, expenses, payments, userRole }: ReimbursementTabProps) {
  const canEdit = userRole !== 'viewer'

  // ── State ──────────────────────────────────────────────────────────────────
  const [requests, setRequests] = useState<ReimbursementRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null)
  const [detailsCache, setDetailsCache] = useState<Record<string, { expenses: LinkedExpense[], payment: any }>>({})

  // Create / edit dialog
  const [formOpen, setFormOpen] = useState(false)
  const [editingRequest, setEditingRequest] = useState<ReimbursementRequest | null>(null)
  const [formData, setFormData] = useState({ ...emptyForm })
  const [formStatus, setFormStatus] = useState<string>('pending_submission')
  const [saving, setSaving] = useState(false)

  // Link expenses dialog
  const [linkExpensesOpen, setLinkExpensesOpen] = useState(false)
  const [linkExpensesTarget, setLinkExpensesTarget] = useState<ReimbursementRequest | null>(null)
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set())
  const [savingLinks, setSavingLinks] = useState(false)

  // Link payment dialog
  const [linkPaymentOpen, setLinkPaymentOpen] = useState(false)
  const [linkPaymentTarget, setLinkPaymentTarget] = useState<ReimbursementRequest | null>(null)
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('')
  const [savingPayment, setSavingPayment] = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<ReimbursementRequest | null>(null)

  // Packet generation
  const [generatingPacket, setGeneratingPacket] = useState<string | null>(null)

  // ── Load requests ──────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const res = await fetch(`/api/user/grants/${grantId}/reimbursement-requests`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setRequests(data.requests || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [grantId])

  // ── Expand / collapse a request (with lazy detail loading) ─────────────────
  const toggleExpand = async (req: ReimbursementRequest) => {
    if (expandedId === req.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(req.id)

    if (detailsCache[req.id]) return // already loaded

    setLoadingDetails(req.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoadingDetails(null); return }

    const res = await fetch(`/api/user/grants/${grantId}/reimbursement-requests/${req.id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setDetailsCache(prev => ({
        ...prev,
        [req.id]: { expenses: data.request.expenses || [], payment: data.request.payment },
      }))
    }
    setLoadingDetails(null)
  }

  // ── Refresh a single request in the list ───────────────────────────────────
  const refreshRequest = async (requestId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch(`/api/user/grants/${grantId}/reimbursement-requests/${requestId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      const rr = data.request
      // Update in the requests list
      setRequests(prev => prev.map(r => r.id === requestId ? {
        ...r,
        ...rr,
        expense_ids: (rr.expenses || []).map((e: any) => e.id),
        expense_count: (rr.expenses || []).length,
        total_amount: (rr.expenses || []).reduce((s: number, e: any) => s + parseFloat(e.amount || 0), 0),
      } : r))
      // Update cache
      setDetailsCache(prev => ({
        ...prev,
        [requestId]: { expenses: rr.expenses || [], payment: rr.payment },
      }))
    }
  }

  // ── Create / Edit form ─────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingRequest(null)
    setFormData({ ...emptyForm })
    setFormStatus('pending_submission')
    setFormOpen(true)
  }

  const openEdit = (req: ReimbursementRequest) => {
    setEditingRequest(req)
    setFormData({
      title: req.title,
      request_number: req.request_number || '',
      description: req.description || '',
      submitted_date: req.submitted_date || '',
      notes: req.notes || '',
    })
    setFormStatus(req.status)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.title.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    const url = editingRequest
      ? `/api/user/grants/${grantId}/reimbursement-requests/${editingRequest.id}`
      : `/api/user/grants/${grantId}/reimbursement-requests`
    const method = editingRequest ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...formData, status: formStatus }),
    })

    setSaving(false)
    if (res.ok) {
      setFormOpen(false)
      if (editingRequest) {
        await refreshRequest(editingRequest.id)
        // Invalidate details cache so next expand refetches
        setDetailsCache(prev => { const n = { ...prev }; delete n[editingRequest.id]; return n })
      } else {
        await load()
      }
    } else {
      const d = await res.json()
      alert('Error: ' + d.error)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await fetch(`/api/user/grants/${grantId}/reimbursement-requests/${deleteTarget.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setDeleteTarget(null)
    if (expandedId === deleteTarget.id) setExpandedId(null)
    await load()
  }

  // ── Link Expenses dialog ───────────────────────────────────────────────────
  const openLinkExpenses = (req: ReimbursementRequest) => {
    setLinkExpensesTarget(req)
    setSelectedExpenseIds(new Set(req.expense_ids || []))
    setLinkExpensesOpen(true)
  }

  // Expenses already claimed by OTHER requests
  const claimedByOther = new Set<string>(
    requests
      .filter(r => r.id !== linkExpensesTarget?.id)
      .flatMap(r => r.expense_ids || [])
  )

  const handleSaveLinks = async () => {
    if (!linkExpensesTarget) return
    setSavingLinks(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSavingLinks(false); return }

    const res = await fetch(
      `/api/user/grants/${grantId}/reimbursement-requests/${linkExpensesTarget.id}/expenses`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ expense_ids: Array.from(selectedExpenseIds) }),
      }
    )

    setSavingLinks(false)
    if (res.ok) {
      setLinkExpensesOpen(false)
      await refreshRequest(linkExpensesTarget.id)
      setDetailsCache(prev => { const n = { ...prev }; delete n[linkExpensesTarget.id]; return n })
    } else {
      const d = await res.json()
      alert('Error: ' + d.error)
    }
  }

  // ── Link Payment dialog ────────────────────────────────────────────────────
  const openLinkPayment = (req: ReimbursementRequest) => {
    setLinkPaymentTarget(req)
    setSelectedPaymentId(req.payment_received_id || '')
    setLinkPaymentOpen(true)
  }

  const handleSavePayment = async () => {
    if (!linkPaymentTarget) return
    setSavingPayment(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSavingPayment(false); return }

    const res = await fetch(
      `/api/user/grants/${grantId}/reimbursement-requests/${linkPaymentTarget.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ payment_received_id: selectedPaymentId || null }),
      }
    )

    setSavingPayment(false)
    if (res.ok) {
      setLinkPaymentOpen(false)
      await refreshRequest(linkPaymentTarget.id)
      setDetailsCache(prev => { const n = { ...prev }; delete n[linkPaymentTarget.id]; return n })
    } else {
      const d = await res.json()
      alert('Error: ' + d.error)
    }
  }

  // ── Generate Packet ────────────────────────────────────────────────────────
  const handleGeneratePacket = async (req: ReimbursementRequest) => {
    setGeneratingPacket(req.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setGeneratingPacket(null); return }

    try {
      const res = await fetch(
        `/api/user/grants/${grantId}/reimbursement-requests/${req.id}/packet`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )

      if (!res.ok) {
        const d = await res.json()
        alert('Error generating packet: ' + d.error)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeTitle = (req.request_number || req.title).replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 50)
      a.download = `reimbursement-packet-${safeTitle}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Error generating packet. Make sure pdf-lib is installed (npm install pdf-lib).')
    } finally {
      setGeneratingPacket(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Loading reimbursement requests…</div>
  }

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            Reimbursement Requests
            {requests.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500">({requests.length})</span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Track requests for expense reimbursement from the funding agency.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> New Request
          </Button>
        )}
      </div>

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {requests.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <ReceiptText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No reimbursement requests yet</p>
          <p className="text-sm text-slate-400 mt-1">Create a request to bundle expenses for submission to the funding agency.</p>
          {canEdit && (
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Create First Request
            </Button>
          )}
        </div>
      )}

      {/* ── Request cards ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        {requests.map(req => {
          const isExpanded = expandedId === req.id
          const details = detailsCache[req.id]
          const isLoadingDetails = loadingDetails === req.id
          const isGenerating = generatingPacket === req.id

          return (
            <div key={req.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Card header row */}
              <div className="flex items-start gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm">{req.title}</span>
                    {req.request_number && (
                      <span className="text-xs text-slate-400 font-mono">#{req.request_number}</span>
                    )}
                    <Badge className={`text-xs border ${STATUS_COLORS[req.status]}`}>
                      {STATUS_OPTIONS.find(s => s.value === req.status)?.label ?? req.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
                    <span>{req.expense_count} expense{req.expense_count !== 1 ? 's' : ''}</span>
                    <span className="font-semibold text-slate-700">{fmt(req.total_amount)}</span>
                    {req.submitted_date && (
                      <span>Submitted {fmtDate(req.submitted_date)}</span>
                    )}
                    {req.status === 'payment_received' && req.payment && (
                      <span className="text-green-600">
                        Payment: {fmt(parseFloat(req.payment.amount) || 0)} on {fmtDate(req.payment.received_date)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 px-2 text-xs text-slate-600"
                      onClick={() => openLinkExpenses(req)}
                      title="Manage linked expenses"
                    >
                      <Link2 className="h-3.5 w-3.5 mr-1" />
                      Expenses
                    </Button>
                  )}
                  {canEdit && req.status === 'payment_received' && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 px-2 text-xs text-slate-600"
                      onClick={() => openLinkPayment(req)}
                      title="Link a payment to this request"
                    >
                      <CreditCard className="h-3.5 w-3.5 mr-1" />
                      Payment
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleGeneratePacket(req)}
                    title="Generate reimbursement packet PDF"
                    disabled={isGenerating}
                  >
                    {isGenerating
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <FileDown className="h-3.5 w-3.5" />
                    }
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(req)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(req)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => toggleExpand(req)}
                    title={isExpanded ? 'Collapse' : 'Expand details'}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 pb-4 pt-3">
                  {isLoadingDetails ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading details…
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Description / Notes */}
                      {(req.description || req.notes) && (
                        <div className="space-y-1">
                          {req.description && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Description</p>
                              <p className="text-sm text-slate-700 mt-0.5">{req.description}</p>
                            </div>
                          )}
                          {req.notes && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Notes</p>
                              <p className="text-sm text-slate-700 mt-0.5">{req.notes}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Linked expenses */}
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                          Linked Expenses ({details?.expenses?.length ?? 0})
                        </p>
                        {!details?.expenses?.length ? (
                          <p className="text-sm text-slate-400 italic">
                            No expenses linked yet.{canEdit && ' Click "Expenses" to add some.'}
                          </p>
                        ) : (
                          <div className="rounded-lg overflow-hidden border border-slate-200">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-100">
                                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Date</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Vendor</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Category</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Invoice #</th>
                                  <th className="text-right px-3 py-2 font-semibold text-slate-600">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {details.expenses.map((exp, i) => (
                                  <tr key={exp.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="px-3 py-2 text-slate-600">{fmtDate(exp.expense_date)}</td>
                                    <td className="px-3 py-2 font-medium text-slate-800">{exp.vendor}</td>
                                    <td className="px-3 py-2 text-slate-600">{exp.category || '—'}</td>
                                    <td className="px-3 py-2 text-slate-500 font-mono">{exp.invoice_number || '—'}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmt(exp.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-slate-200 bg-slate-100">
                                  <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-slate-600">Total</td>
                                  <td className="px-3 py-2 text-right text-xs font-bold text-slate-800">
                                    {fmt(req.total_amount)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Payment info */}
                      {req.status === 'payment_received' && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                            Associated Payment
                          </p>
                          {details?.payment ? (
                            <div className="flex items-center gap-6 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                              <div>
                                <p className="text-xs text-slate-500">Amount Received</p>
                                <p className="font-semibold text-green-700">{fmt(parseFloat(details.payment.amount) || 0)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Date</p>
                                <p className="font-medium text-slate-800">{fmtDate(details.payment.received_date)}</p>
                              </div>
                              {details.payment.funding_source && (
                                <div>
                                  <p className="text-xs text-slate-500">Funding Source</p>
                                  <p className="font-medium text-slate-800">{details.payment.funding_source}</p>
                                </div>
                              )}
                              {canEdit && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="ml-auto text-xs"
                                  onClick={() => openLinkPayment(req)}
                                >
                                  <Unlink className="h-3 w-3 mr-1" /> Change
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                              <CreditCard className="h-4 w-4" />
                              No payment linked yet.
                              {canEdit && (
                                <Button size="sm" variant="outline" className="ml-auto text-xs h-7"
                                  onClick={() => openLinkPayment(req)}>
                                  Link Payment
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Create / Edit Dialog                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRequest ? 'Edit Request' : 'New Reimbursement Request'}</DialogTitle>
            <DialogDescription>
              {editingRequest
                ? 'Update the details of this reimbursement request.'
                : 'Create a new request to bundle expenses for submission.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Q1 2025 Reimbursement"
                />
              </div>
              <div className="space-y-2">
                <Label>Request #</Label>
                <Input
                  value={formData.request_number}
                  onChange={e => setFormData({ ...formData, request_number: e.target.value })}
                  placeholder="e.g. REQ-001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Submitted Date</Label>
                <Input
                  type="date"
                  value={formData.submitted_date}
                  onChange={e => setFormData({ ...formData, submitted_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="What expenses does this request cover?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any internal notes about this request…"
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !formData.title.trim()}>
                {saving ? 'Saving…' : editingRequest ? 'Save Changes' : 'Create Request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Link Expenses Dialog                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={linkExpensesOpen} onOpenChange={setLinkExpensesOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Linked Expenses</DialogTitle>
            <DialogDescription>
              Select expenses to include in this request. Expenses already linked to another request are disabled.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-1 py-2">
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No expenses found for this grant.</p>
            ) : (
              expenses.map(exp => {
                const isLinkedHere = selectedExpenseIds.has(exp.id)
                const isLinkedElsewhere = claimedByOther.has(exp.id)
                const otherReq = isLinkedElsewhere
                  ? requests.find(r => r.id !== linkExpensesTarget?.id && (r.expense_ids || []).includes(exp.id))
                  : null

                return (
                  <label
                    key={exp.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer
                      ${isLinkedElsewhere ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-200' :
                        isLinkedHere ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isLinkedHere}
                      disabled={isLinkedElsewhere}
                      onChange={e => {
                        const next = new Set(selectedExpenseIds)
                        if (e.target.checked) next.add(exp.id)
                        else next.delete(exp.id)
                        setSelectedExpenseIds(next)
                      }}
                      className="mt-0.5 h-4 w-4 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate">{exp.vendor}</span>
                        <span className="text-sm font-semibold text-slate-900 flex-shrink-0">{fmt(exp.amount)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span>{fmtDate(exp.expense_date)}</span>
                        {exp.category && <span>{exp.category}</span>}
                        {exp.invoice_number && <span className="font-mono">#{exp.invoice_number}</span>}
                      </div>
                      {isLinkedElsewhere && otherReq && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          Already linked to: {otherReq.title}
                        </p>
                      )}
                    </div>
                  </label>
                )
              })
            )}
          </div>

          <div className="border-t pt-3 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {selectedExpenseIds.size} selected ·{' '}
              {fmt(expenses
                .filter(e => selectedExpenseIds.has(e.id))
                .reduce((s, e) => s + parseFloat(e.amount || 0), 0)
              )} total
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLinkExpensesOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveLinks} disabled={savingLinks}>
                {savingLinks ? 'Saving…' : 'Save Links'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Link Payment Dialog                                               */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={linkPaymentOpen} onOpenChange={setLinkPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Payment to Request</DialogTitle>
            <DialogDescription>
              Select the payment received that corresponds to this reimbursement request.
              A single payment can be associated with multiple requests.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Received</Label>
              <Select
                value={selectedPaymentId}
                onValueChange={setSelectedPaymentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a payment…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {payments.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {fmtDate(p.received_date)} · {fmt(parseFloat(p.amount) || 0)}
                      {p.funding_source ? ` · ${p.funding_source}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {payments.length === 0 && (
              <p className="text-xs text-slate-400">
                No payments recorded yet. Add payments on the Payments tab first.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setLinkPaymentOpen(false)}>Cancel</Button>
              <Button onClick={handleSavePayment} disabled={savingPayment}>
                {savingPayment ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reimbursement Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.title}</strong> and unlink all
              associated expenses. The expenses themselves will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
