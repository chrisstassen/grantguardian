'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/contexts/organization-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck, ChevronRight } from 'lucide-react'

interface GrantHealth {
  id: string
  grant_name: string
  healthScore: number
  healthStatus: 'good' | 'warning' | 'critical'
  issueCount: number
  criticalCount: number
  highCount: number
}

interface ScanSummary {
  overallScore: number
  overallStatus: 'good' | 'warning' | 'critical'
  grants: GrantHealth[]
  totalIssues: number
  criticalIssues: number
  scannedAt: string
}

export function ComplianceHealthPanel() {
  const { activeOrg } = useOrganization()
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [scanning, setScanning] = useState(false)

  const runScan = useCallback(async () => {
    if (!activeOrg) return
    setScanning(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`/api/compliance/scan?orgId=${activeOrg.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })

      if (!res.ok) return
      const data = await res.json()
      setSummary(data)
    } catch (err) {
      console.error('Compliance panel scan error:', err)
    } finally {
      setScanning(false)
    }
  }, [activeOrg])

  useEffect(() => {
    if (activeOrg) runScan()
  }, [activeOrg])

  const getStatusColor = (status: string) => {
    if (status === 'good') return 'text-green-600'
    if (status === 'warning') return 'text-amber-500'
    return 'text-red-600'
  }

  const getStatusIcon = (status: string, size = 'h-5 w-5') => {
    if (status === 'good') return <CheckCircle2 className={`${size} text-green-500`} />
    if (status === 'warning') return <AlertTriangle className={`${size} text-amber-500`} />
    return <AlertCircle className={`${size} text-red-500`} />
  }

  const getScoreDotColor = (status: string) => {
    if (status === 'good') return 'bg-green-500'
    if (status === 'warning') return 'bg-amber-400'
    return 'bg-red-500'
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-slate-500" />
            <CardTitle>Compliance Health</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={runScan}
              disabled={scanning}
              className="h-8 w-8 p-0"
              title="Refresh scan"
            >
              <RefreshCw className={`h-4 w-4 text-slate-400 ${scanning ? 'animate-spin' : ''}`} />
            </Button>
            <a
              href="/compliance"
              className="text-sm text-blue-600 hover:underline flex items-center gap-0.5"
            >
              Full report <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        {summary && !scanning && (
          <CardDescription>
            Last scanned {new Date(summary.scannedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent>
        {scanning && !summary && (
          <div className="flex items-center gap-2 py-4 text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Scanning grants...</span>
          </div>
        )}

        {summary && (
          <div className="space-y-4">
            {/* Overall score */}
            <div className="flex items-center gap-3">
              {getStatusIcon(summary.overallStatus, 'h-7 w-7')}
              <div>
                <p className={`text-2xl font-bold ${getStatusColor(summary.overallStatus)}`}>
                  {summary.overallScore}<span className="text-base font-normal text-slate-400">/100</span>
                </p>
                <p className="text-xs text-slate-500">
                  {summary.totalIssues === 0
                    ? 'No issues detected'
                    : `${summary.totalIssues} issue${summary.totalIssues === 1 ? '' : 's'} found${summary.criticalIssues > 0 ? ` — ${summary.criticalIssues} critical` : ''}`
                  }
                </p>
              </div>
            </div>

            {/* Per-grant rows */}
            {summary.grants.length > 0 && (
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                {summary.grants.map(grant => (
                  <a
                    key={grant.id}
                    href={`/compliance`}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-slate-50 group transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getScoreDotColor(grant.healthStatus)}`} />
                      <span className="text-sm text-slate-700 truncate group-hover:text-blue-600">
                        {grant.grant_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {grant.criticalCount > 0 && (
                        <Badge className="text-xs py-0 bg-red-100 text-red-700 border-red-200">
                          {grant.criticalCount} critical
                        </Badge>
                      )}
                      {grant.criticalCount === 0 && grant.highCount > 0 && (
                        <Badge className="text-xs py-0 bg-orange-100 text-orange-700 border-orange-200">
                          {grant.highCount} high
                        </Badge>
                      )}
                      {grant.issueCount === 0 && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-xs font-medium text-slate-400 w-8 text-right">{grant.healthScore}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {summary.grants.length === 0 && (
              <p className="text-sm text-slate-400 py-1">No active grants to scan.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
