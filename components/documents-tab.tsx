'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Upload,
  Download,
  Trash2,
  Search,
  Loader2,
  Award,
  Receipt,
  ClipboardList,
  FolderOpen,
  ArchiveIcon,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

type DocumentSource = 'award_letter' | 'general' | 'expense' | 'request'

interface UnifiedDocument {
  id: string
  file_name: string
  file_type: string
  file_size: number | null
  source: DocumentSource
  source_label: string
  download_url: string | null
  created_at: string
  can_delete: boolean
  grant_document_id?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return ''
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function FileIcon({ fileType, className }: { fileType: string; className?: string }) {
  if (fileType.includes('pdf'))                             return <FileText className={className} />
  if (fileType.startsWith('image/'))                        return <FileImage className={className} />
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv'))
    return <FileSpreadsheet className={className} />
  return <File className={className} />
}

const SOURCE_CONFIG: Record<DocumentSource, {
  label: string
  badgeClass: string
  icon: React.ComponentType<{ className?: string }>
}> = {
  award_letter: {
    label: 'Award Letter',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: Award,
  },
  general: {
    label: 'General',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: FolderOpen,
  },
  expense: {
    label: 'Expense Doc',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: Receipt,
  },
  request: {
    label: 'Request',
    badgeClass: 'bg-green-100 text-green-800 border-green-200',
    icon: ClipboardList,
  },
}

type FilterType = 'all' | DocumentSource

// ── Component ──────────────────────────────────────────────────────────────────

interface DocumentsTabProps {
  grantId: string
  userRole: string
}

export function DocumentsTab({ grantId, userRole }: DocumentsTabProps) {
  const [documents, setDocuments] = useState<UnifiedDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canEdit = userRole !== 'viewer'

  const baseUrl = `/api/user/grants/${grantId}/documents`

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function load() {
    setLoading(true)
    const token = await getToken()
    if (!token) { setLoading(false); return }

    try {
      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [grantId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    const token = await getToken()
    if (!token) return

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(baseUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          console.error('Upload failed:', err)
        }
      }
      await load()
    } finally {
      setUploading(false)
      // Reset file input so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(doc: UnifiedDocument) {
    if (!doc.grant_document_id) return
    const token = await getToken()
    if (!token) return

    setDeleting(doc.id)
    try {
      const res = await fetch(`${baseUrl}?documentId=${doc.grant_document_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Delete failed: ' + (err.error || 'Unknown error'))
      }
    } finally {
      setDeleting(null)
    }
  }

  function handleDownload(doc: UnifiedDocument) {
    if (!doc.download_url) return
    const a = document.createElement('a')
    a.href = doc.download_url
    a.download = doc.file_name
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleDownloadAll() {
    const token = await getToken()
    if (!token) return
    setDownloadingAll(true)
    try {
      const res = await fetch(`${baseUrl}/download-all`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('Download failed: ' + (err.error || res.statusText))
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      // derive zip name from Content-Disposition if present, else fallback
      const cd   = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="([^"]+)"/)
      a.href     = url
      a.download = match?.[1] || 'grant-documents.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingAll(false)
    }
  }

  // Determine which filter pills to show (only sources that exist in the list)
  const availableSources = new Set(documents.map((d) => d.source))

  const filtered = documents.filter((doc) => {
    const matchesFilter = filterType === 'all' || doc.source === filterType
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      doc.file_name.toLowerCase().includes(q) ||
      doc.source_label.toLowerCase().includes(q) ||
      SOURCE_CONFIG[doc.source].label.toLowerCase().includes(q)
    return matchesFilter && matchesSearch
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Document Repository</CardTitle>
            <CardDescription>
              All documents associated with this grant — {documents.length} total
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadAll}
              disabled={downloadingAll || documents.length === 0}
              className="flex items-center gap-1.5"
            >
              {downloadingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArchiveIcon className="h-4 w-4" />
              )}
              {downloadingAll ? 'Zipping…' : 'Download All'}
            </Button>
            {canEdit && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                />
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? 'Uploading…' : 'Upload Document'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Filter pills + Search */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center mt-2">
          {/* Filter pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterType === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
              }`}
            >
              All ({documents.length})
            </button>
            {(['award_letter', 'general', 'expense', 'request'] as DocumentSource[])
              .filter((s) => availableSources.has(s))
              .map((s) => {
                const count = documents.filter((d) => d.source === s).length
                const cfg = SOURCE_CONFIG[s]
                return (
                  <button
                    key={s}
                    onClick={() => setFilterType(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterType === s
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {cfg.label} ({count})
                  </button>
                )
              })}
          </div>

          {/* Search */}
          <div className="relative sm:ml-auto sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading documents…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            {documents.length === 0 ? (
              <>
                <FolderOpen className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="text-base font-medium">No documents yet</p>
                <p className="text-sm mt-1">
                  {canEdit
                    ? 'Upload a document using the button above, or add supporting documents to expenses and requests.'
                    : 'No documents have been uploaded to this grant yet.'}
                </p>
              </>
            ) : (
              <>
                <Search className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                <p className="text-base font-medium">No documents match your filters</p>
                <p className="text-sm mt-1">Try adjusting your search or filter.</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((doc) => {
              const cfg = SOURCE_CONFIG[doc.source]
              const SourceIcon = cfg.icon
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 py-3 px-1 hover:bg-slate-50 rounded-md transition-colors group"
                >
                  {/* File icon */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    <FileIcon
                      fileType={doc.file_type}
                      className="h-5 w-5 text-slate-500"
                    />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {doc.file_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {/* Source badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${cfg.badgeClass}`}
                      >
                        <SourceIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                      {/* Source detail */}
                      {doc.source_label && doc.source_label !== cfg.label && (
                        <span className="text-xs text-slate-500 truncate max-w-[200px]">
                          {doc.source_label}
                        </span>
                      )}
                      {/* Size + date */}
                      {doc.file_size != null && (
                        <span className="text-xs text-slate-400">
                          {formatBytes(doc.file_size)}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {formatDate(doc.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                      disabled={!doc.download_url}
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </Button>

                    {canEdit && doc.can_delete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deleting === doc.id}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete"
                          >
                            {deleting === doc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete document?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{doc.file_name}" will be permanently deleted. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(doc)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
