'use client'

import { useState, useEffect, useRef } from 'react'
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
  Plus, ChevronDown, ChevronUp, Trash2, FileDown,
  ReceiptText, Link2, Unlink, CreditCard, Loader2, Upload, Download, FileText,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestType =
  | 'reimbursement'
  | 'request_for_information'
  | 'appeal'
  | 'time_extension'
  | 'scope_budget_change'
  | 'closeout'

interface GrantRequest {
  id: string
  grant_id: string
  request_number: string | null
  title: string
  description: string | null
  request_type: RequestType
  status: string
  submitted_date: string | null
  payment_received_id: string | null
  notes: string | null
  type_data: Record<string, any> | null
  created_at: string
  expense_ids: string[]
  expense_count: number
  total_amount: number
  attachment_count: number
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

interface RequestAttachment {
  id: string
  request_id: string
  file_name: string
  file_path: string
  file_type: string | null
  file_size: number | null
  created_at: string
}

interface RequestsTabProps {
  grantId: string
  expenses: any[]
  payments: any[]
  userRole: string
  onCountChange?: (count: number) => void
  onLinkedIdsChange?: (expenseIds: string[], paymentIds: string[]) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUEST_TYPE_OPTIONS = [
  { value: 'reimbursement',          label: 'Reimbursement' },
  { value: 'request_for_information',label: 'Request for Information' },
  { value: 'appeal',                 label: 'Appeal' },
  { value: 'time_extension',         label: 'Time Extension' },
  { value: 'scope_budget_change',    label: 'Scope/Budget Change' },
  { value: 'closeout',               label: 'Closeout' },
]

const REIMBURSEMENT_STATUS_OPTIONS = [
  { value: 'pending_submission', label: 'Pending Submission' },
  { value: 'submitted',          label: 'Submitted' },
  { value: 'payment_received',   label: 'Payment Received' },
  { value: 'request_denied',     label: 'Request Denied' },
]

const RFI_LEVEL_OPTIONS = [
  { value: '1st_informal', label: '1st Informal' },
  { value: '2nd_informal', label: '2nd Informal' },
  { value: '1st_formal',   label: '1st Formal' },
  { value: '2nd_formal',   label: '2nd Formal' },
]

const APPEAL_LEVEL_OPTIONS = [
  { value: '1st_appeal',  label: '1st Appeal' },
  { value: '2nd_appeal',  label: '2nd Appeal' },
  { value: 'arbitration', label: 'Arbitration' },
]

const APPEAL_OUTCOME_OPTIONS = [
  { value: 'appeal_won',       label: 'Appeal Won' },
  { value: 'appeal_lost',      label: 'Appeal Lost' },
  { value: 'appeal_withdrawn', label: 'Appeal Withdrawn' },
]

const APPROVAL_STATUS_OPTIONS = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied',   label: 'Denied' },
]

const CHANGE_TYPE_OPTIONS = [
  { value: 'scope_change',          label: 'Scope Change' },
  { value: 'budget_change',         label: 'Budget Change' },
  { value: 'scope_and_budget_change', label: 'Scope & Budget Change' },
]

const CLOSEOUT_STATUS_OPTIONS = [
  { value: 'pending',  label: 'Pending' },
  { value: 'complete', label: 'Complete' },
]

const TYPE_COLORS: Record<string, string> = {
  reimbursement:           'bg-blue-100 text-blue-800 border-blue-200',
  request_for_information: 'bg-purple-100 text-purple-800 border-purple-200',
  appeal:                  'bg-orange-100 text-orange-800 border-orange-200',
  time_extension:          'bg-yellow-100 text-yellow-800 border-yellow-200',
  scope_budget_change:     'bg-teal-100 text-teal-800 border-teal-200',
  closeout:                'bg-slate-100 text-slate-800 border-slate-200',
}

const REIMBURSEMENT_STATUS_COLORS: Record<string, string> = {
  pending_submission: 'bg-yellow-100 text-yellow-800',
  submitted:          'bg-blue-100 text-blue-800',
  payment_received:   'bg-green-100 text-green-800',
  request_denied:     'bg-red-100 text-red-800',
}

const APPROVAL_STATUS_COLORS: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  denied:   'bg-red-100 text-red-800',
  complete: 'bg-green-100 text-green-800',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    typeof n === 'string' ? parseFloat(n) || 0 : n
  )

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function typeLabel(t: string) {
  return REQUEST_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t
}

// ─── Attachments Sub-Component ────────────────────────────────────────────────
// Uses server-side API routes (supabaseAdmin) so no storage bucket policies needed.

interface AttachmentWithUrl extends RequestAttachment {
  download_url: string | null
}

function AttachmentsSection({ requestId, grantId, canEdit }: {
  requestId: string
  grantId: string
  canEdit: boolean
}) {
  const [attachments, setAttachments] = useState<AttachmentWithUrl[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const baseUrl = `/api/user/grants/${grantId}/reimbursement-requests/${requestId}/attachments`

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setAttachments(data.attachments || [])
    }
  }

  useEffect(() => { load() }, [requestId])

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUploading(false); return }

    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert('Upload failed: ' + (d.error || 'Unknown error'))
      }
    }
    setUploading(false)
    load()
  }

  const handleDownload = (att: AttachmentWithUrl) => {
    if (!att.download_url) { alert('Download URL unavailable — please reload and try again.'); return }
    const a = document.createElement('a')
    a.href = att.download_url
    a.download = att.file_name
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const handleDelete = async (att: AttachmentWithUrl) => {
    if (!confirm(`Delete "${att.file_name}"?`)) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`${baseUrl}?attachmentId=${att.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Attachments ({attachments.length})
        </p>
        {canEdit && (
          <>
            <input type="file" multiple ref={fileInputRef} className="hidden"
              onChange={e => handleUpload(e.target.files)} />
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
              onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        )}
      </div>
      {attachments.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No attachments yet.</p>
      ) : (
        <div className="space-y-1">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded text-xs">
              <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <span className="flex-1 truncate font-medium text-slate-700">{att.file_name}</span>
              {att.file_size != null && (
                <span className="text-slate-400">{(att.file_size / 1024).toFixed(0)} KB</span>
              )}
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDownload(att)}>
                <Download className="h-3 w-3" />
              </Button>
              {canEdit && (
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                  onClick={() => handleDelete(att)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Type-Specific Form Sections ──────────────────────────────────────────────

function ReimbursementFields({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={data.status || 'pending_submission'} onValueChange={v => onChange('status', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {REIMBURSEMENT_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Submitted Date</Label>
        <Input type="date" value={data.submitted_date || ''} onChange={e => onChange('submitted_date', e.target.value)} />
      </div>
    </div>
  )
}

function RFIFields({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Request Level *</Label>
          <Select value={data.request_level || ''} onValueChange={v => onChange('request_level', v)}>
            <SelectTrigger><SelectValue placeholder="Select level…" /></SelectTrigger>
            <SelectContent>
              {RFI_LEVEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Received Date</Label>
          <Input type="date" value={data.received_date || ''} onChange={e => onChange('received_date', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Response Due Date</Label>
          <Input type="date" value={data.response_due_date || ''} onChange={e => onChange('response_due_date', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Response Submitted Date</Label>
          <Input type="date" value={data.response_submitted_date || ''} onChange={e => onChange('response_submitted_date', e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Requested Information *</Label>
        <Textarea rows={3} value={data.requested_information || ''}
          onChange={e => onChange('requested_information', e.target.value)}
          placeholder="Describe the information being requested…" />
      </div>
    </div>
  )
}

function AppealFields({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Request Level *</Label>
          <Select value={data.request_level || ''} onValueChange={v => onChange('request_level', v)}>
            <SelectTrigger><SelectValue placeholder="Select level…" /></SelectTrigger>
            <SelectContent>
              {APPEAL_LEVEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Disputed Dollar Value</Label>
          <Input type="number" step="0.01" min="0" value={data.disputed_dollar_value || ''}
            onChange={e => onChange('disputed_dollar_value', e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Appeal Description *</Label>
        <Textarea rows={3} value={data.appeal_description || ''}
          onChange={e => onChange('appeal_description', e.target.value)}
          placeholder="Describe the basis for this appeal…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Appeal Outcome</Label>
          <Select value={data.appeal_outcome || 'none'} onValueChange={v => onChange('appeal_outcome', v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Not yet determined" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Not yet determined —</SelectItem>
              {APPEAL_OUTCOME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Determination Date</Label>
          <Input type="date" value={data.determination_date || ''} onChange={e => onChange('determination_date', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

function TimeExtensionFields({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Requested Date *</Label>
          <Input type="date" value={data.requested_date || ''} onChange={e => onChange('requested_date', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Submitted Date</Label>
          <Input type="date" value={data.submitted_date || ''} onChange={e => onChange('submitted_date', e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Justification</Label>
        <Textarea rows={3} value={data.justification || ''}
          onChange={e => onChange('justification', e.target.value)}
          placeholder="Reason for requesting a time extension…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={data.status || 'pending'} onValueChange={v => onChange('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {APPROVAL_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Determination Date</Label>
          <Input type="date" value={data.determination_date || ''} onChange={e => onChange('determination_date', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

function ScopeBudgetChangeFields({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const includesBudget = data.change_request_type === 'budget_change' || data.change_request_type === 'scope_and_budget_change'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Change Type *</Label>
          <Select value={data.change_request_type || ''} onValueChange={v => onChange('change_request_type', v)}>
            <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
            <SelectContent>
              {CHANGE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={data.status || 'pending'} onValueChange={v => onChange('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {APPROVAL_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {includesBudget && (
        <div className="space-y-2">
          <Label>Budget Change Amount ($)</Label>
          <Input type="number" step="0.01" value={data.budget_change_amount || ''}
            onChange={e => onChange('budget_change_amount', e.target.value)} placeholder="0.00" />
        </div>
      )}
      <div className="space-y-2">
        <Label>Description of Change Requested *</Label>
        <Textarea rows={3} value={data.description || ''}
          onChange={e => onChange('description', e.target.value)}
          placeholder="Describe the scope or budget change being requested…" />
      </div>
    </div>
  )
}

function CloseoutFields({ data, onChange }: { data: any; onChange: (k: string, v: string) => void }) {
  const isComplete = data.status === 'complete'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Completion Date *</Label>
          <Input type="date" value={data.completion_date || ''} onChange={e => onChange('completion_date', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Submission Date</Label>
          <Input type="date" value={data.submission_date || ''} onChange={e => onChange('submission_date', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={data.status || 'pending'} onValueChange={v => onChange('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CLOSEOUT_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isComplete && (
          <div className="space-y-2">
            <Label>Closed Date *</Label>
            <Input type="date" value={data.closed_date || ''} onChange={e => onChange('closed_date', e.target.value)} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Card secondary info helpers ──────────────────────────────────────────────

function RequestSecondaryInfo({ req }: { req: GrantRequest }) {
  const td = req.type_data || {}
  switch (req.request_type) {
    case 'reimbursement':
      return (
        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
          <span>{req.expense_count} expense{req.expense_count !== 1 ? 's' : ''}</span>
          <span className="font-semibold text-slate-700">{fmt(req.total_amount)}</span>
          {req.submitted_date && <span>Submitted {fmtDate(req.submitted_date)}</span>}
          {req.status === 'payment_received' && req.payment && (
            <span className="text-green-600">Paid {fmtDate(req.payment.received_date)}</span>
          )}
          <Badge className={`text-xs ${REIMBURSEMENT_STATUS_COLORS[req.status] || 'bg-slate-100 text-slate-800'}`}>
            {REIMBURSEMENT_STATUS_OPTIONS.find(o => o.value === req.status)?.label ?? req.status}
          </Badge>
        </div>
      )
    case 'request_for_information':
      return (
        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
          {td.request_level && <span>{RFI_LEVEL_OPTIONS.find(o => o.value === td.request_level)?.label}</span>}
          {td.received_date && <span>Received {fmtDate(td.received_date)}</span>}
          {td.response_due_date && <span>Due {fmtDate(td.response_due_date)}</span>}
          {td.response_submitted_date && <span className="text-green-600">Responded {fmtDate(td.response_submitted_date)}</span>}
        </div>
      )
    case 'appeal':
      return (
        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
          {td.request_level && <span>{APPEAL_LEVEL_OPTIONS.find(o => o.value === td.request_level)?.label}</span>}
          {td.disputed_dollar_value && <span>{fmt(td.disputed_dollar_value)} disputed</span>}
          {td.appeal_outcome && (
            <Badge className={`text-xs ${td.appeal_outcome === 'appeal_won' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {APPEAL_OUTCOME_OPTIONS.find(o => o.value === td.appeal_outcome)?.label}
            </Badge>
          )}
        </div>
      )
    case 'time_extension':
      return (
        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
          {td.requested_date && <span>Requested {fmtDate(td.requested_date)}</span>}
          {td.status && (
            <Badge className={`text-xs ${APPROVAL_STATUS_COLORS[td.status] || ''}`}>
              {APPROVAL_STATUS_OPTIONS.find(o => o.value === td.status)?.label ?? td.status}
            </Badge>
          )}
        </div>
      )
    case 'scope_budget_change':
      return (
        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
          {td.change_request_type && <span>{CHANGE_TYPE_OPTIONS.find(o => o.value === td.change_request_type)?.label}</span>}
          {td.budget_change_amount && <span>{fmt(td.budget_change_amount)}</span>}
          {td.status && (
            <Badge className={`text-xs ${APPROVAL_STATUS_COLORS[td.status] || ''}`}>
              {APPROVAL_STATUS_OPTIONS.find(o => o.value === td.status)?.label ?? td.status}
            </Badge>
          )}
        </div>
      )
    case 'closeout':
      return (
        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
          {td.completion_date && <span>Completed {fmtDate(td.completion_date)}</span>}
          {td.status && (
            <Badge className={`text-xs ${td.status === 'complete' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {CLOSEOUT_STATUS_OPTIONS.find(o => o.value === td.status)?.label ?? td.status}
            </Badge>
          )}
        </div>
      )
    default:
      return null
  }
}

// ─── Expanded Detail Views ────────────────────────────────────────────────────

function RequestExpandedDetails({ req, details, canEdit, grantId, onPaymentLink }: {
  req: GrantRequest
  details?: { expenses: LinkedExpense[]; payment: any }
  canEdit: boolean
  grantId: string
  onPaymentLink: () => void
}) {
  const td = req.type_data || {}

  return (
    <div className="space-y-4">
      {/* Description / Notes */}
      {(req.description || req.notes) && (
        <div className="space-y-2">
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

      {/* Type-specific detail fields */}
      {req.request_type === 'request_for_information' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {td.request_level && <div><p className="text-xs text-slate-400">Request Level</p><p className="font-medium">{RFI_LEVEL_OPTIONS.find(o => o.value === td.request_level)?.label}</p></div>}
          {td.received_date && <div><p className="text-xs text-slate-400">Received Date</p><p className="font-medium">{fmtDate(td.received_date)}</p></div>}
          {td.response_due_date && <div><p className="text-xs text-slate-400">Response Due</p><p className="font-medium">{fmtDate(td.response_due_date)}</p></div>}
          {td.response_submitted_date && <div><p className="text-xs text-slate-400">Response Submitted</p><p className="font-medium text-green-700">{fmtDate(td.response_submitted_date)}</p></div>}
          {td.requested_information && <div className="col-span-2"><p className="text-xs text-slate-400">Requested Information</p><p className="font-medium whitespace-pre-wrap">{td.requested_information}</p></div>}
        </div>
      )}

      {req.request_type === 'appeal' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {td.request_level && <div><p className="text-xs text-slate-400">Request Level</p><p className="font-medium">{APPEAL_LEVEL_OPTIONS.find(o => o.value === td.request_level)?.label}</p></div>}
          {td.disputed_dollar_value && <div><p className="text-xs text-slate-400">Disputed Amount</p><p className="font-semibold text-red-600">{fmt(td.disputed_dollar_value)}</p></div>}
          {td.appeal_outcome && <div><p className="text-xs text-slate-400">Outcome</p><p className="font-medium">{APPEAL_OUTCOME_OPTIONS.find(o => o.value === td.appeal_outcome)?.label}</p></div>}
          {td.determination_date && <div><p className="text-xs text-slate-400">Determination Date</p><p className="font-medium">{fmtDate(td.determination_date)}</p></div>}
          {td.appeal_description && <div className="col-span-2"><p className="text-xs text-slate-400">Appeal Description</p><p className="font-medium whitespace-pre-wrap">{td.appeal_description}</p></div>}
        </div>
      )}

      {req.request_type === 'time_extension' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {td.requested_date && <div><p className="text-xs text-slate-400">Requested Date</p><p className="font-medium">{fmtDate(td.requested_date)}</p></div>}
          {td.submitted_date && <div><p className="text-xs text-slate-400">Submitted Date</p><p className="font-medium">{fmtDate(td.submitted_date)}</p></div>}
          {td.status && <div><p className="text-xs text-slate-400">Status</p><Badge className={`text-xs ${APPROVAL_STATUS_COLORS[td.status] || ''}`}>{APPROVAL_STATUS_OPTIONS.find(o => o.value === td.status)?.label}</Badge></div>}
          {td.determination_date && <div><p className="text-xs text-slate-400">Determination Date</p><p className="font-medium">{fmtDate(td.determination_date)}</p></div>}
          {td.justification && <div className="col-span-2"><p className="text-xs text-slate-400">Justification</p><p className="font-medium whitespace-pre-wrap">{td.justification}</p></div>}
        </div>
      )}

      {req.request_type === 'scope_budget_change' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {td.change_request_type && <div><p className="text-xs text-slate-400">Change Type</p><p className="font-medium">{CHANGE_TYPE_OPTIONS.find(o => o.value === td.change_request_type)?.label}</p></div>}
          {td.budget_change_amount && <div><p className="text-xs text-slate-400">Budget Change Amount</p><p className="font-semibold">{fmt(td.budget_change_amount)}</p></div>}
          {td.status && <div><p className="text-xs text-slate-400">Status</p><Badge className={`text-xs ${APPROVAL_STATUS_COLORS[td.status] || ''}`}>{APPROVAL_STATUS_OPTIONS.find(o => o.value === td.status)?.label}</Badge></div>}
          {td.description && <div className="col-span-2"><p className="text-xs text-slate-400">Description</p><p className="font-medium whitespace-pre-wrap">{td.description}</p></div>}
        </div>
      )}

      {req.request_type === 'closeout' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {td.completion_date && <div><p className="text-xs text-slate-400">Completion Date</p><p className="font-medium">{fmtDate(td.completion_date)}</p></div>}
          {td.submission_date && <div><p className="text-xs text-slate-400">Submission Date</p><p className="font-medium">{fmtDate(td.submission_date)}</p></div>}
          {td.status && <div><p className="text-xs text-slate-400">Status</p><Badge className={`text-xs ${td.status === 'complete' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{CLOSEOUT_STATUS_OPTIONS.find(o => o.value === td.status)?.label}</Badge></div>}
          {td.closed_date && <div><p className="text-xs text-slate-400">Closed Date</p><p className="font-medium">{fmtDate(td.closed_date)}</p></div>}
        </div>
      )}

      {/* Reimbursement: linked expenses */}
      {req.request_type === 'reimbursement' && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Linked Expenses ({details?.expenses?.length ?? 0})
          </p>
          {!details?.expenses?.length ? (
            <p className="text-sm text-slate-400 italic">No expenses linked yet.{canEdit && ' Click "Expenses" to add some.'}</p>
          ) : (
            <div className="rounded-lg overflow-hidden border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    {['Date', 'Vendor', 'Category', 'Invoice #', 'Amount'].map(h => (
                      <th key={h} className={`text-left px-3 py-2 font-semibold text-slate-600 ${h === 'Amount' ? 'text-right' : ''}`}>{h}</th>
                    ))}
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
                    <td className="px-3 py-2 text-right text-xs font-bold text-slate-800">{fmt(req.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reimbursement: payment info */}
      {req.request_type === 'reimbursement' && req.status === 'payment_received' && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Associated Payment</p>
          {details?.payment ? (
            <div className="flex items-center gap-6 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
              <div><p className="text-xs text-slate-500">Amount</p><p className="font-semibold text-green-700">{fmt(parseFloat(details.payment.amount) || 0)}</p></div>
              <div><p className="text-xs text-slate-500">Date</p><p className="font-medium">{fmtDate(details.payment.received_date)}</p></div>
              {details.payment.funding_source && <div><p className="text-xs text-slate-500">Source</p><p className="font-medium">{details.payment.funding_source}</p></div>}
              {canEdit && <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={onPaymentLink}><Unlink className="h-3 w-3 mr-1" />Change</Button>}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <CreditCard className="h-4 w-4" />
              No payment linked yet.
              {canEdit && <Button size="sm" variant="outline" className="ml-auto text-xs h-7" onClick={onPaymentLink}>Link Payment</Button>}
            </div>
          )}
        </div>
      )}

      {/* Attachments for all request types */}
      <AttachmentsSection requestId={req.id} grantId={grantId} canEdit={canEdit} />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RequestsTab({ grantId, expenses, payments, userRole, onCountChange, onLinkedIdsChange }: RequestsTabProps) {
  const canEdit = userRole !== 'viewer'

  // List state
  const [requests, setRequests] = useState<GrantRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<RequestType | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null)
  const [detailsCache, setDetailsCache] = useState<Record<string, { expenses: LinkedExpense[]; payment: any }>>({})

  // Form dialog
  const [formOpen, setFormOpen] = useState(false)
  const [editingRequest, setEditingRequest] = useState<GrantRequest | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formNumber, setFormNumber] = useState('')
  const [formType, setFormType] = useState<RequestType>('reimbursement')
  const [formNotes, setFormNotes] = useState('')
  // Unified type-specific data state
  const [typeData, setTypeData] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Link expenses dialog (reimbursement only)
  const [linkExpensesOpen, setLinkExpensesOpen] = useState(false)
  const [linkExpensesTarget, setLinkExpensesTarget] = useState<GrantRequest | null>(null)
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set())
  const [savingLinks, setSavingLinks] = useState(false)

  // Link payment dialog (reimbursement only)
  const [linkPaymentOpen, setLinkPaymentOpen] = useState(false)
  const [linkPaymentTarget, setLinkPaymentTarget] = useState<GrantRequest | null>(null)
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('none')
  const [savingPayment, setSavingPayment] = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<GrantRequest | null>(null)

  // Packet generation
  const [generatingPacket, setGeneratingPacket] = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────
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

  // Notify parent when requests change (for tab badge + expense/payment indicators)
  useEffect(() => {
    onCountChange?.(requests.length)
    const expIds = requests.flatMap(r => r.expense_ids || [])
    const payIds = requests.filter(r => r.payment_received_id).map(r => r.payment_received_id as string)
    onLinkedIdsChange?.(expIds, payIds)
  }, [requests])

  // ── Expand/collapse ─────────────────────────────────────────────────────────
  const toggleExpand = async (req: GrantRequest) => {
    if (expandedId === req.id) { setExpandedId(null); return }
    setExpandedId(req.id)
    if (detailsCache[req.id]) return

    setLoadingDetails(req.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoadingDetails(null); return }

    const res = await fetch(`/api/user/grants/${grantId}/reimbursement-requests/${req.id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setDetailsCache(prev => ({ ...prev, [req.id]: { expenses: data.request.expenses || [], payment: data.request.payment } }))
    }
    setLoadingDetails(null)
  }

  // ── Refresh single request ──────────────────────────────────────────────────
  const refreshRequest = async (requestId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/user/grants/${grantId}/reimbursement-requests/${requestId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const data = await res.json()
      const rr = data.request
      setRequests(prev => prev.map(r => r.id === requestId ? {
        ...r, ...rr,
        expense_ids: (rr.expenses || []).map((e: any) => e.id),
        expense_count: (rr.expenses || []).length,
        total_amount: (rr.expenses || []).reduce((s: number, e: any) => s + parseFloat(e.amount || 0), 0),
        attachment_count: rr.attachment_count ?? r.attachment_count ?? 0,
      } : r))
      setDetailsCache(prev => ({ ...prev, [requestId]: { expenses: rr.expenses || [], payment: rr.payment } }))
    }
  }

  // ── Form open/save ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingRequest(null)
    setFormTitle(''); setFormNumber(''); setFormType('reimbursement'); setFormNotes('')
    setTypeData({ status: 'pending_submission' })
    setFormOpen(true)
  }

  const openEdit = (req: GrantRequest) => {
    setEditingRequest(req)
    setFormTitle(req.title)
    setFormNumber(req.request_number || '')
    setFormType(req.request_type)
    setFormNotes(req.notes || '')
    // Seed typeData with both top-level reimbursement fields and type_data
    setTypeData({
      status: req.status || 'pending_submission',
      submitted_date: req.submitted_date || '',
      ...Object.fromEntries(Object.entries(req.type_data || {}).map(([k, v]) => [k, String(v ?? '')])),
    })
    setFormOpen(true)
  }

  const updateTypeData = (key: string, value: string) => setTypeData(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!formTitle.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }

    // Build payload
    const isReimbursement = formType === 'reimbursement'
    const payload: Record<string, any> = {
      title: formTitle.trim(),
      request_number: formNumber.trim() || null,
      notes: formNotes.trim() || null,
      request_type: formType,
    }

    if (isReimbursement) {
      payload.status = typeData.status || 'pending_submission'
      payload.submitted_date = typeData.submitted_date || null
      payload.type_data = null
    } else {
      // Persist all type-specific data in type_data JSONB
      const { status: _s, submitted_date: _sd, ...rest } = typeData
      payload.type_data = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== '')
      )
    }

    const url = editingRequest
      ? `/api/user/grants/${grantId}/reimbursement-requests/${editingRequest.id}`
      : `/api/user/grants/${grantId}/reimbursement-requests`
    const method = editingRequest ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    })

    setSaving(false)
    if (res.ok) {
      setFormOpen(false)
      await load()
    } else {
      const d = await res.json()
      alert('Error: ' + d.error)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/user/grants/${grantId}/reimbursement-requests/${deleteTarget.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setDeleteTarget(null)
    if (expandedId === deleteTarget.id) setExpandedId(null)
    await load()
  }

  // ── Link expenses ────────────────────────────────────────────────────────────
  const openLinkExpenses = (req: GrantRequest) => {
    setLinkExpensesTarget(req)
    setSelectedExpenseIds(new Set(req.expense_ids || []))
    setLinkExpensesOpen(true)
  }

  const claimedByOther = new Set<string>(
    requests.filter(r => r.id !== linkExpensesTarget?.id).flatMap(r => r.expense_ids || [])
  )

  const handleSaveLinks = async () => {
    if (!linkExpensesTarget) return
    setSavingLinks(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSavingLinks(false); return }
    const res = await fetch(`/api/user/grants/${grantId}/reimbursement-requests/${linkExpensesTarget.id}/expenses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ expense_ids: Array.from(selectedExpenseIds) }),
    })
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

  // ── Link payment ─────────────────────────────────────────────────────────────
  const openLinkPayment = (req: GrantRequest) => {
    setLinkPaymentTarget(req)
    setSelectedPaymentId(req.payment_received_id || 'none')
    setLinkPaymentOpen(true)
  }

  const handleSavePayment = async () => {
    if (!linkPaymentTarget) return
    setSavingPayment(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSavingPayment(false); return }
    const res = await fetch(`/api/user/grants/${grantId}/reimbursement-requests/${linkPaymentTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ payment_received_id: selectedPaymentId === 'none' ? null : selectedPaymentId }),
    })
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

  // ── Generate packet ──────────────────────────────────────────────────────────
  const handleGeneratePacket = async (req: GrantRequest) => {
    setGeneratingPacket(req.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setGeneratingPacket(null); return }

    const endpoint = req.request_type === 'closeout' ? 'closeout-packet' : 'packet'
    try {
      const res = await fetch(`/api/user/grants/${grantId}/reimbursement-requests/${req.id}/${endpoint}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { const d = await res.json(); alert('Error: ' + d.error); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeTitle = (req.request_number || req.title).replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 50)
      a.download = `${endpoint === 'closeout-packet' ? 'closeout' : 'reimbursement'}-packet-${safeTitle}.pdf`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch {
      alert('Error generating packet.')
    } finally {
      setGeneratingPacket(null)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <div className="py-12 text-center text-slate-400">Loading requests…</div>

  // Filter
  const filteredRequests = filterType === 'all' ? requests : requests.filter(r => r.request_type === filterType)
  const typeCounts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.request_type] = (acc[r.request_type] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            Requests
            {requests.length > 0 && <span className="ml-2 text-sm font-normal text-slate-500">({requests.length})</span>}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Track reimbursements, RFIs, appeals, extensions, change requests, and closeout.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> New Request
          </Button>
        )}
      </div>

      {/* Filter pills */}
      {requests.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterType === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
            }`}
          >
            All ({requests.length})
          </button>
          {REQUEST_TYPE_OPTIONS.filter(o => typeCounts[o.value]).map(o => (
            <button
              key={o.value}
              onClick={() => setFilterType(filterType === o.value ? 'all' : o.value as RequestType)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterType === o.value
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
              }`}
            >
              {o.label} ({typeCounts[o.value]})
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {requests.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <ReceiptText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No requests yet</p>
          <p className="text-sm text-slate-400 mt-1">Track reimbursements, appeals, extensions, and more.</p>
          {canEdit && <Button size="sm" className="mt-4" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Request</Button>}
        </div>
      )}

      {/* Request cards */}
      <div className="space-y-3">
        {filteredRequests.map(req => {
          const isExpanded = expandedId === req.id
          const details = detailsCache[req.id]
          const isLoadingDetails = loadingDetails === req.id
          const isGenerating = generatingPacket === req.id
          const canGeneratePacket = req.request_type === 'reimbursement' || req.request_type === 'closeout'

          return (
            <div key={req.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                {/* Clickable main content — opens edit dialog for editors, expands for viewers */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => canEdit ? openEdit(req) : toggleExpand(req)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm">{req.title}</span>
                    {req.request_number && <span className="text-xs text-slate-400 font-mono">#{req.request_number}</span>}
                    <Badge className={`text-xs border ${TYPE_COLORS[req.request_type] || ''}`}>
                      {typeLabel(req.request_type)}
                    </Badge>
                    {req.attachment_count > 0 && (
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                        📎 {req.attachment_count} attachment{req.attachment_count === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <RequestSecondaryInfo req={req} />
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {canEdit && req.request_type === 'reimbursement' && (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-slate-600"
                      onClick={() => openLinkExpenses(req)}>
                      <Link2 className="h-3.5 w-3.5 mr-1" />Expenses
                    </Button>
                  )}
                  {canEdit && req.request_type === 'reimbursement' && req.status === 'payment_received' && (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-slate-600"
                      onClick={() => openLinkPayment(req)}>
                      <CreditCard className="h-3.5 w-3.5 mr-1" />Payment
                    </Button>
                  )}
                  {canGeneratePacket && (
                    <Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5 text-xs text-slate-600"
                      title="Generate PDF packet"
                      onClick={() => handleGeneratePacket(req)} disabled={isGenerating}>
                      {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                      Generate PDF
                    </Button>
                  )}
                  {canEdit && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(req)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleExpand(req)}>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 pb-4 pt-3">
                  {isLoadingDetails ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />Loading details…
                    </div>
                  ) : (
                    <RequestExpandedDetails
                      req={req}
                      details={details}
                      canEdit={canEdit}
                      grantId={grantId}
                      onPaymentLink={() => openLinkPayment(req)}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ══ Create/Edit Dialog ════════════════════════════════════════════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRequest ? 'Edit Request' : 'New Request'}</DialogTitle>
            <DialogDescription>
              {editingRequest ? 'Update the details of this request.' : 'Select a request type to get started.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Request type — only editable on create */}
            <div className="space-y-2">
              <Label>Request Type *</Label>
              <Select value={formType} onValueChange={v => {
                setFormType(v as RequestType)
                setTypeData({ status: 'pending_submission' }) // reset type-specific data
              }} disabled={!!editingRequest}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Common fields */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Title *</Label>
                <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Q1 2025 Reimbursement" />
              </div>
              <div className="space-y-2">
                <Label>Request #</Label>
                <Input value={formNumber} onChange={e => setFormNumber(e.target.value)} placeholder="e.g. REQ-001" />
              </div>
            </div>

            {/* Type-specific fields */}
            {formType === 'reimbursement' && (
              <ReimbursementFields data={typeData} onChange={updateTypeData} />
            )}
            {formType === 'request_for_information' && (
              <RFIFields data={typeData} onChange={updateTypeData} />
            )}
            {formType === 'appeal' && (
              <AppealFields data={typeData} onChange={updateTypeData} />
            )}
            {formType === 'time_extension' && (
              <TimeExtensionFields data={typeData} onChange={updateTypeData} />
            )}
            {formType === 'scope_budget_change' && (
              <ScopeBudgetChangeFields data={typeData} onChange={updateTypeData} />
            )}
            {formType === 'closeout' && (
              <CloseoutFields data={typeData} onChange={updateTypeData} />
            )}

            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)}
                placeholder="Any internal notes…" rows={2} />
            </div>

            {/* Attachments — only available when editing an existing request */}
            {editingRequest && (
              <div className="pt-2 border-t border-slate-100">
                <AttachmentsSection requestId={editingRequest.id} grantId={grantId} canEdit={canEdit} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !formTitle.trim()}>
                {saving ? 'Saving…' : editingRequest ? 'Save Changes' : 'Create Request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Link Expenses Dialog (reimbursement only) ═════════════════════════ */}
      <Dialog open={linkExpensesOpen} onOpenChange={setLinkExpensesOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Linked Expenses</DialogTitle>
            <DialogDescription>Select expenses to include. Expenses linked to another request are disabled.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-1 py-2">
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No expenses found for this grant.</p>
            ) : expenses.map(exp => {
              const isLinkedHere = selectedExpenseIds.has(exp.id)
              const isLinkedElsewhere = claimedByOther.has(exp.id)
              const otherReq = isLinkedElsewhere ? requests.find(r => r.id !== linkExpensesTarget?.id && (r.expense_ids || []).includes(exp.id)) : null
              return (
                <label key={exp.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer
                  ${isLinkedElsewhere ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-200' :
                    isLinkedHere ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                  <input type="checkbox" checked={isLinkedHere} disabled={isLinkedElsewhere} className="mt-0.5 h-4 w-4 rounded"
                    onChange={e => {
                      const next = new Set(selectedExpenseIds)
                      if (e.target.checked) next.add(exp.id); else next.delete(exp.id)
                      setSelectedExpenseIds(next)
                    }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{exp.vendor}</span>
                      <span className="text-sm font-semibold text-slate-900 flex-shrink-0">{fmt(exp.amount)}</span>
                    </div>
                    <div className="flex gap-3 mt-0.5 text-xs text-slate-500">
                      <span>{fmtDate(exp.expense_date)}</span>
                      {exp.category && <span>{exp.category}</span>}
                      {exp.invoice_number && <span className="font-mono">#{exp.invoice_number}</span>}
                    </div>
                    {isLinkedElsewhere && otherReq && (
                      <p className="text-xs text-amber-600 mt-0.5">Linked to: {otherReq.title}</p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
          <div className="border-t pt-3 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {selectedExpenseIds.size} selected · {fmt(expenses.filter(e => selectedExpenseIds.has(e.id)).reduce((s, e) => s + parseFloat(e.amount || 0), 0))} total
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLinkExpensesOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveLinks} disabled={savingLinks}>{savingLinks ? 'Saving…' : 'Save Links'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Link Payment Dialog ═══════════════════════════════════════════════ */}
      <Dialog open={linkPaymentOpen} onOpenChange={setLinkPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Payment</DialogTitle>
            <DialogDescription>Select the payment associated with this request. Multiple requests can share a single payment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Received</Label>
              <Select value={selectedPaymentId} onValueChange={setSelectedPaymentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {payments.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {fmtDate(p.received_date)} · {fmt(parseFloat(p.amount) || 0)}
                      {p.funding_source ? ` · ${p.funding_source}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {payments.length === 0 && <p className="text-xs text-slate-400">No payments recorded yet. Add payments on the Payments tab first.</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setLinkPaymentOpen(false)}>Cancel</Button>
              <Button onClick={handleSavePayment} disabled={savingPayment}>{savingPayment ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Delete Confirm ════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.title}</strong>.
              Linked expenses and payments will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
