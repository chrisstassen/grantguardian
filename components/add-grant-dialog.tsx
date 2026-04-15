'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useOrganization } from '@/contexts/organization-context'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText, Sparkles, Upload, CheckCircle2, AlertCircle, Plus } from 'lucide-react'

interface AddGrantDialogProps {
  onGrantAdded: () => void
}

const emptyForm = {
  grant_name: '',
  funding_agency: '',
  program_type: '',
  award_number: '',
  award_amount: '',
  period_start: '',
  period_end: '',
  status: 'active',
  special_conditions: ''
}

type Mode = 'choice' | 'ai-upload' | 'form'

export function AddGrantDialog({ onGrantAdded }: AddGrantDialogProps) {
  const { activeOrg } = useOrganization()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('choice')
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [formData, setFormData] = useState({ ...emptyForm })
  const [awardLetterFile, setAwardLetterFile] = useState<File | null>(null)
  const [extractedRequirements, setExtractedRequirements] = useState<any[]>([])
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleReset = () => {
    setMode('choice')
    setFormData({ ...emptyForm })
    setAwardLetterFile(null)
    setExtractedRequirements([])
    setExtractionError(null)
  }

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (!val) handleReset()
  }

  // ── File handling ──────────────────────────────────────────────────────

  const processFile = (file: File) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setExtractionError('Please upload a PDF or image file (JPG, PNG, WebP).')
      return
    }
    setAwardLetterFile(file)
    setExtractionError(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  // ── AI extraction ──────────────────────────────────────────────────────

  const handleExtract = async () => {
    if (!awardLetterFile) return
    setExtracting(true)
    setExtractionError(null)

    try {
      const reader = new FileReader()
      reader.readAsDataURL(awardLetterFile)
      reader.onload = async () => {
        const dataUrl = reader.result as string
        const base64 = dataUrl.split(',')[1]
        const mediaType = awardLetterFile.type

        const res = await fetch('/api/extract-grant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_data: base64, media_type: mediaType })
        })

        const data = await res.json()

        if (!res.ok || data.error) {
          setExtractionError(data.error || 'Extraction failed. You can enter details manually.')
          setExtracting(false)
          return
        }

        const ext = data.extracted
        setFormData({
          grant_name: ext.grant_name || '',
          funding_agency: ext.funding_agency || '',
          program_type: ext.program_type || '',
          award_number: ext.award_number || '',
          award_amount: ext.award_amount != null ? String(ext.award_amount) : '',
          period_start: ext.period_start || '',
          period_end: ext.period_end || '',
          status: 'active',
          special_conditions: ext.special_conditions || ''
        })
        setExtractedRequirements(ext.requirements || [])
        setMode('form')
        setExtracting(false)
      }
      reader.onerror = () => {
        setExtractionError('Failed to read file. Please try again.')
        setExtracting(false)
      }
    } catch (err: any) {
      setExtractionError(err.message || 'Extraction failed.')
      setExtracting(false)
    }
  }

  // ── Save grant ─────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeOrg) { alert('You must be part of an organization to add grants'); return }
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { alert('You must be logged in'); setLoading(false); return }

    // Upload award letter if present
    let awardLetterUrl = null
    let awardLetterName = null

    if (awardLetterFile) {
      const fileName = awardLetterFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filePath = `${activeOrg.id}/${Date.now()}_${fileName}`
      const { error: uploadError } = await supabase.storage
        .from('award-letters')
        .upload(filePath, awardLetterFile)
      if (!uploadError) {
        awardLetterUrl = filePath
        awardLetterName = awardLetterFile.name
      }
    }

    // Insert grant via API route (bypasses RLS)
    const res = await fetch('/api/user/grants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        organization_id: activeOrg.id,
        grant_name: formData.grant_name,
        funding_agency: formData.funding_agency,
        program_type: formData.program_type || null,
        award_number: formData.award_number || null,
        award_amount: formData.award_amount ? parseFloat(formData.award_amount) : null,
        period_start: formData.period_start || null,
        period_end: formData.period_end || null,
        status: formData.status,
        award_letter_url: awardLetterUrl,
        award_letter_name: awardLetterName,
      })
    })

    const grantData = await res.json()

    if (!res.ok) {
      alert('Error adding grant: ' + (grantData.error || 'Unknown error'))
      setLoading(false)
      return
    }

    // Save extracted requirements if any
    if (extractedRequirements.length > 0 && grantData.grant?.id) {
      const reqs = extractedRequirements.map((r: any) => ({
        grant_id: grantData.grant.id,
        title: r.title,
        description: r.description || null,
        due_date: r.due_date || null,
        priority: r.priority || 'medium',
        status: 'open'
      }))
      await supabase.from('compliance_requirements').insert(reqs)
    }

    // Save extracted special conditions note if any
    if (formData.special_conditions && grantData.grant?.id) {
      await supabase.from('special_conditions').insert([{
        grant_id: grantData.grant.id,
        title: 'AI Extracted Conditions',
        description: formData.special_conditions,
        risk_level: 'medium',
        applies_to: 'all',
        restriction_type: 'requirement',
        ai_generated: true
      }])
    }

    setLoading(false)
    setOpen(false)
    handleReset()
    onGrantAdded()
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> Add Grant</Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* ── Choice screen ─────────────────────────────────── */}
        {mode === 'choice' && (
          <>
            <DialogHeader>
              <DialogTitle>Add New Grant</DialogTitle>
              <DialogDescription>How would you like to add this grant?</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                onClick={() => setMode('form')}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-slate-600 group-hover:text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-center">Manual Entry</p>
                  <p className="text-xs text-slate-500 text-center mt-1">Fill in grant details yourself</p>
                </div>
              </button>

              <button
                onClick={() => setMode('ai-upload')}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-purple-100 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-slate-600 group-hover:text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-center">AI Extraction</p>
                  <p className="text-xs text-slate-500 text-center mt-1">Upload award letter — AI fills the form</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── AI upload screen ───────────────────────────────── */}
        {mode === 'ai-upload' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                AI Grant Extraction
              </DialogTitle>
              <DialogDescription>
                Upload your award letter and AI will extract the grant details automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors
                  ${dragOver ? 'border-purple-400 bg-purple-50' : awardLetterFile ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:border-purple-300 hover:bg-purple-50/50'}`}
              >
                {awardLetterFile ? (
                  <>
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                    <p className="font-medium text-green-800">{awardLetterFile.name}</p>
                    <p className="text-xs text-green-600">Ready to extract</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-slate-400" />
                    <p className="font-medium text-slate-700">Drop your award letter here</p>
                    <p className="text-xs text-slate-500">or click to browse · PDF, JPG, PNG, WebP</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {extractionError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {extractionError}
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <Button variant="outline" onClick={handleReset}>Back</Button>
                <div className="flex gap-2">
                  {awardLetterFile && (
                    <Button variant="ghost" size="sm" onClick={() => { setAwardLetterFile(null); setExtractionError(null) }}>
                      Clear file
                    </Button>
                  )}
                  <Button
                    onClick={handleExtract}
                    disabled={!awardLetterFile || extracting}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {extracting ? (
                      <><Sparkles className="h-4 w-4 mr-2 animate-pulse" />Extracting…</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" />Extract with AI</>
                    )}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-slate-400 text-center pb-1">
                AI extraction uses Claude to read the document. Always review extracted data before saving.
              </p>
            </div>
          </>
        )}

        {/* ── Grant form (manual or post-extraction) ─────────── */}
        {mode === 'form' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {awardLetterFile ? (
                  <><Sparkles className="h-5 w-5 text-purple-600" />Review Extracted Details</>
                ) : (
                  'Add New Grant'
                )}
              </DialogTitle>
              <DialogDescription>
                {awardLetterFile
                  ? 'AI has pre-filled the form below. Review and edit before saving.'
                  : 'Enter the details of your grant award.'}
              </DialogDescription>
            </DialogHeader>

            {awardLetterFile && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200 text-sm text-purple-700">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <span>Extracted from <strong>{awardLetterFile.name}</strong></span>
              </div>
            )}

            {extractedRequirements.length > 0 && (
              <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
                <span className="font-medium">{extractedRequirements.length} compliance requirement{extractedRequirements.length !== 1 ? 's' : ''} found</span>
                <span className="text-blue-600"> — will be added automatically when you save.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="grant_name">Grant Name *</Label>
                <Input
                  id="grant_name"
                  value={formData.grant_name}
                  onChange={(e) => setFormData({ ...formData, grant_name: e.target.value })}
                  placeholder="e.g., Emergency Food & Shelter Program"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="funding_agency">Funding Agency *</Label>
                <Input
                  id="funding_agency"
                  value={formData.funding_agency}
                  onChange={(e) => setFormData({ ...formData, funding_agency: e.target.value })}
                  placeholder="e.g., FEMA, HHS, DHS"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="program_type">Program Type</Label>
                  <Input
                    id="program_type"
                    value={formData.program_type}
                    onChange={(e) => setFormData({ ...formData, program_type: e.target.value })}
                    placeholder="e.g., EFSP, VOCA, NSGP"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="award_number">Award Number</Label>
                  <Input
                    id="award_number"
                    value={formData.award_number}
                    onChange={(e) => setFormData({ ...formData, award_number: e.target.value })}
                    placeholder="e.g., EMW-2024-FP-12345"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="award_amount">Award Amount ($)</Label>
                <Input
                  id="award_amount"
                  type="number"
                  step="0.01"
                  value={formData.award_amount}
                  onChange={(e) => setFormData({ ...formData, award_amount: e.target.value })}
                  placeholder="e.g., 250000"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="period_start">Period Start</Label>
                  <Input
                    id="period_start"
                    type="date"
                    value={formData.period_start}
                    onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="period_end">Period End</Label>
                  <Input
                    id="period_end"
                    type="date"
                    value={formData.period_end}
                    onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.special_conditions && (
                <div className="space-y-2">
                  <Label htmlFor="special_conditions">Special Conditions</Label>
                  <Textarea
                    id="special_conditions"
                    value={formData.special_conditions}
                    onChange={(e) => setFormData({ ...formData, special_conditions: e.target.value })}
                    rows={3}
                    className="text-sm"
                  />
                </div>
              )}

              {!awardLetterFile && (
                <div className="space-y-2">
                  <Label htmlFor="award_letter">Award Letter (Optional)</Label>
                  <Input
                    id="award_letter"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setAwardLetterFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-slate-500">Upload to store the official award document.</p>
                </div>
              )}

              <div className="flex justify-between items-center pt-4">
                <Button type="button" variant="outline" onClick={awardLetterFile ? () => setMode('ai-upload') : handleReset}>
                  Back
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Saving…' : 'Save Grant'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
