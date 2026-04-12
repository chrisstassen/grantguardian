'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/contexts/organization-context'
import { AppLayout } from '@/components/app-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Clock,
  TrendingDown,
  CalendarX,
  DollarSign
} from 'lucide-react'

interface ComplianceIssue {
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  link: string
  aiGenerated?: boolean
}

interface GrantHealth {
  id: string
  grant_name: string
  funding_agency: string
  period_end: string | null
  status: string
  healthScore: number
  healthStatus: 'good' | 'warning' | 'critical'
  issues: ComplianceIssue[]
  issueCount: number
  criticalCount: number
  highCount: number
  mediumCount: number
}

interface ScanResult {
  overallScore: number
  overallStatus: 'good' | 'warning' | 'critical'
  grants: GrantHealth[]
  totalIssues: number
  criticalIssues: number
  highIssues: number
  scannedAt: string
}

export default function CompliancePage() {
  const router = useRouter()
  const { activeOrg, loading: orgLoading } = useOrganization()
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runScan = useCallback(async () => {
    if (!activeOrg) return
    setScanning(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const res = await fetch(`/api/compliance/scan?orgId=${activeOrg.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Scan failed')
      }

      const data = await res.json()
      setScanResult(data)
    } catch (err: any) {
      setError(err.message || 'An error occurred during the scan')
    } finally {
      setScanning(false)
    }
  }, [activeOrg, router])

  useEffect(() => {
    if (!orgLoading && activeOrg) {
      runScan()
    }
  }, [orgLoading, activeOrg])

  const getScoreColor = (status: string) => {
    if (status === 'good') return 'text-green-600'
    if (status === 'warning') return 'text-amber-500'
    return 'text-red-600'
  }

  const getScoreBg = (status: string) => {
    if (status === 'good') return 'bg-green-50 border-green-200'
    if (status === 'warning') return 'bg-amber-50 border-amber-200'
    return 'bg-red-50 border-red-200'
  }

  const getScoreIcon = (status: string) => {
    if (status === 'good') return <CheckCircle2 className="h-6 w-6 text-green-600" />
    if (status === 'warning') return <AlertTriangle className="h-6 w-6 text-amber-500" />
    return <AlertCircle className="h-6 w-6 text-red-600" />
  }

  const getSeverityBadge = (severity: string) => {
    const styles: Record<string, string> = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      medium: 'bg-amber-100 text-amber-800 border-amber-200',
      low: 'bg-slate-100 text-slate-600 border-slate-200'
    }
    return styles[severity] || styles.low
  }

  const getIssueIcon = (type: string) => {
    if (type === 'overdue_requirement') return <CalendarX className="h-4 w-4 flex-shrink-0" />
    if (type === 'due_soon' || type === 'due_soon_critical') return <Clock className="h-4 w-4 flex-shrink-0" />
    if (type === 'budget_overrun') return <DollarSign className="h-4 w-4 flex-shrink-0" />
    if (type === 'underspend_risk' || type === 'slow_burn_rate') return <TrendingDown className="h-4 w-4 flex-shrink-0" />
    if (type === 'grant_ending') return <Clock className="h-4 w-4 flex-shrink-0" />
    if (type === 'ai_expense_flag') return <Sparkles className="h-4 w-4 flex-shrink-0" />
    return <AlertCircle className="h-4 w-4 flex-shrink-0" />
  }

  const formatScannedAt = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    })
  }

  if (orgLoading || (scanning && !scanResult)) {
    return (
      <AppLayout title="Compliance Health">
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <RefreshCw className="h-8 w-8 text-slate-400 animate-spin" />
          <p className="text-slate-500">Running compliance scan across your grants...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Compliance Health">
      <div className="space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-sm">
              {scanResult
                ? `Last scanned ${formatScannedAt(scanResult.scannedAt)}`
                : 'Scan your grants for compliance issues'}
            </p>
          </div>
          <Button
            onClick={runScan}
            disabled={scanning}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Refresh Scan'}
          </Button>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <p>{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {scanResult && (
          <>
            {/* Overall score cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className={`border ${getScoreBg(scanResult.overallStatus)}`}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Overall Health</p>
                      <p className={`text-4xl font-bold mt-1 ${getScoreColor(scanResult.overallStatus)}`}>
                        {scanResult.overallScore}
                        <span className="text-xl font-normal">/100</span>
                      </p>
                    </div>
                    {getScoreIcon(scanResult.overallStatus)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-slate-500 font-medium">Total Issues</p>
                  <p className="text-4xl font-bold mt-1 text-slate-800">{scanResult.totalIssues}</p>
                </CardContent>
              </Card>

              <Card className={scanResult.criticalIssues > 0 ? 'border-red-200 bg-red-50' : ''}>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-slate-500 font-medium">Critical Issues</p>
                  <p className={`text-4xl font-bold mt-1 ${scanResult.criticalIssues > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {scanResult.criticalIssues}
                  </p>
                </CardContent>
              </Card>

              <Card className={scanResult.highIssues > 0 ? 'border-orange-200 bg-orange-50' : ''}>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-slate-500 font-medium">High Priority Issues</p>
                  <p className={`text-4xl font-bold mt-1 ${scanResult.highIssues > 0 ? 'text-orange-600' : 'text-slate-800'}`}>
                    {scanResult.highIssues}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* All clear state */}
            {scanResult.totalIssues === 0 && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="py-12">
                  <div className="flex flex-col items-center gap-3 text-green-700">
                    <ShieldCheck className="h-12 w-12" />
                    <p className="text-xl font-semibold">All grants are in good standing</p>
                    <p className="text-sm text-green-600">No compliance issues detected across {scanResult.grants.length} active grant{scanResult.grants.length === 1 ? '' : 's'}.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No active grants */}
            {scanResult.grants.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-slate-500">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p>No active grants to scan. Add a grant to get started.</p>
                </CardContent>
              </Card>
            )}

            {/* Per-grant breakdown */}
            {scanResult.grants.map(grant => (
              <Card key={grant.id} className={grant.healthStatus === 'critical' ? 'border-red-200' : grant.healthStatus === 'warning' ? 'border-amber-200' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {/* Score circle */}
                      <div className={`flex-shrink-0 w-14 h-14 rounded-full border-2 flex items-center justify-center font-bold text-lg
                        ${grant.healthStatus === 'good' ? 'border-green-400 bg-green-50 text-green-700' :
                          grant.healthStatus === 'warning' ? 'border-amber-400 bg-amber-50 text-amber-700' :
                          'border-red-400 bg-red-50 text-red-700'}`}>
                        {grant.healthScore}
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          <a
                            href={`/grants/${grant.id}`}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {grant.grant_name}
                          </a>
                        </CardTitle>
                        <CardDescription>{grant.funding_agency}</CardDescription>
                        {grant.period_end && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            Period ends {new Date(grant.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {grant.criticalCount > 0 && (
                        <Badge className="bg-red-100 text-red-800 border-red-200">
                          {grant.criticalCount} critical
                        </Badge>
                      )}
                      {grant.highCount > 0 && (
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                          {grant.highCount} high
                        </Badge>
                      )}
                      {grant.issueCount === 0 && (
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          No issues
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {grant.issues.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {grant.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            issue.severity === 'critical' ? 'bg-red-50 border-red-100' :
                            issue.severity === 'high' ? 'bg-orange-50 border-orange-100' :
                            issue.severity === 'medium' ? 'bg-amber-50 border-amber-100' :
                            'bg-slate-50 border-slate-100'
                          }`}
                        >
                          <div className={`mt-0.5 ${
                            issue.severity === 'critical' ? 'text-red-600' :
                            issue.severity === 'high' ? 'text-orange-600' :
                            issue.severity === 'medium' ? 'text-amber-600' :
                            'text-slate-500'
                          }`}>
                            {getIssueIcon(issue.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-slate-900 text-sm">{issue.title}</p>
                              <Badge className={`text-xs border ${getSeverityBadge(issue.severity)}`}>
                                {issue.severity}
                              </Badge>
                              {issue.aiGenerated && (
                                <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200 flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" />
                                  AI detected
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 mt-0.5">{issue.description}</p>
                          </div>
                          <a
                            href={issue.link}
                            className="flex-shrink-0 text-slate-400 hover:text-blue-600 mt-0.5"
                            title="View details"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}

            {/* AI disclosure */}
            {scanResult.grants.some(g => g.issues.some(i => i.aiGenerated)) && (
              <p className="text-xs text-slate-400 text-center pb-2">
                <Sparkles className="h-3 w-3 inline mr-1" />
                AI-detected issues are generated by Claude and should be reviewed by a qualified grants professional before taking action.
              </p>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
