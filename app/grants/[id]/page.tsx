'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AppLayout } from '@/components/app-layout'
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
import { EditGrantDialog } from '@/components/edit-grant-dialog'
import { AddExpenseChoiceDialog } from '@/components/add-expense-choice-dialog'
import { ExpenseDetailDialog } from '@/components/expense-detail-dialog'
import { AddRequirementDialog } from '@/components/add-requirement-dialog'
import { RequirementDetailDialog } from '@/components/requirement-detail-dialog'
import { AddPaymentDialog } from '@/components/add-payment-dialog'
import { AddNoteDialog } from '@/components/add-note-dialog'
import { AddReplyDialog } from '@/components/add-reply-dialog'
import { PaymentDetailDialog } from '@/components/payment-detail-dialog'
import { Pencil, Trash2, CheckCircle2, Clock, AlertCircle, Sparkles } from 'lucide-react'
import { useOrganization } from '@/contexts/organization-context'
import { BudgetTab } from '@/components/budget-tab'

interface Grant {
  id: string
  grant_name: string
  funding_agency: string
  program_type: string | null
  award_number: string | null
  award_amount: number | null
  period_start: string | null
  period_end: string | null
  status: string
  created_at: string
  updated_at: string
  award_letter_url: string | null
  award_letter_name: string | null
}

export default function GrantDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeOrg } = useOrganization()
  const [grant, setGrant] = useState<Grant | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [userRole, setUserRole] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [expenses, setExpenses] = useState<any[]>([])
  const [selectedExpense, setSelectedExpense] = useState<any>(null)
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [requirements, setRequirements] = useState<any[]>([])
  const [generatingRequirements, setGeneratingRequirements] = useState(false)
  const [specialConditions, setSpecialConditions] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [selectedPayment, setSelectedPayment] = useState<any>(null)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedRequirement, setSelectedRequirement] = useState<any>(null)
  const [requirementDialogOpen, setRequirementDialogOpen] = useState(false)
  const [notes, setNotes] = useState<any[]>([])
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  
  const defaultTab = searchParams?.get('tab') || 'summary'

  const totalExpenses = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0)
  const remainingBudget = (grant?.award_amount || 0) - totalExpenses

  const totalNotesCount = notes.reduce((sum, note) => {
    return sum + 1 + (note.replies?.length || 0)
  }, 0)

  const loadGrant = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      const currentPath = window.location.pathname + window.location.search
      router.push(`/login?redirect=${encodeURIComponent(currentPath)}`)
      return
    }

    // Set role from activeOrg
    if (activeOrg) {
      setIsAdmin(activeOrg.role === 'admin')
      setUserRole(activeOrg.role)
    }

    const { data, error } = await supabase
      .from('grants')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Error loading grant:', error.message, error.code, error.details)
      setLoading(false)
    } else {
      setGrant(data)
      setLoading(false)
    }
  }

  const loadExpenses = async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        *,
        expense_documents (count)
      `)
      .eq('grant_id', params.id)
      .order('expense_date', { ascending: false })

    if (error) {
      console.error('Error loading expenses:', error.message, error.code, error.details)
    } else {
      setExpenses(data || [])
    }
  }

  const loadRequirements = async () => {
    const { data, error } = await supabase
      .from('compliance_requirements')
      .select('*')
      .eq('grant_id', params.id)
      .order('due_date', { ascending: true })

    if (error) {
      console.error('Error loading requirements:', error.message, error.code, error.details)
    } else {
      const updated = (data || []).map(req => {
        if (req.status !== 'completed' && req.due_date) {
          const dueDate = new Date(req.due_date)
          const today = new Date()
          if (dueDate < today) {
            return { ...req, status: 'overdue' }
          }
        }
        return req
      })
      setRequirements(updated)
    }
  }

  const loadSpecialConditions = async () => {
    const { data, error } = await supabase
      .from('special_conditions')
      .select('*')
      .eq('grant_id', params.id)
      .order('risk_level', { ascending: false })

    if (error) {
      console.error('Error loading special conditions:', error.message, error.code, error.details)
    } else {
      setSpecialConditions(data || [])
    }
  }
  
  const loadPayments = async () => {
    const { data, error } = await supabase
      .from('payments_received')
      .select('*')
      .eq('grant_id', params.id)
      .order('received_date', { ascending: false })

    if (error) {
      console.error('Error loading payments:', error.message, error.code, error.details)
    } else {
      setPayments(data || [])
    }
  }

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('grant_notes')
        .select('*')
        .eq('grant_id', params.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading notes:', error.message, error.code, error.details)
        setNotes([])
        return
      }

      if (!data || data.length === 0) {
        setNotes([])
        return
      }

      const notesWithDetails = await Promise.all(
        data.map(async (note) => {
          const { data: author } = await supabase
            .from('user_profiles')
            .select('first_name, last_name')
            .eq('id', note.created_by_user_id)
            .single()

          const { data: recipients } = await supabase
            .from('note_recipients')
            .select('*, recipient:user_profiles!note_recipients_user_id_fkey(first_name, last_name)')
            .eq('note_id', note.id)

          const { data: repliesData } = await supabase
            .from('grant_note_replies')
            .select('*')
            .eq('note_id', note.id)
            .order('created_at', { ascending: true })

          const repliesWithAuthors = await Promise.all(
            (repliesData || []).map(async (reply) => {
              const { data: replyAuthor } = await supabase
                .from('user_profiles')
                .select('first_name, last_name')
                .eq('id', reply.created_by_user_id)
                .single()

              return {
                ...reply,
                created_by: replyAuthor || { first_name: 'Unknown', last_name: 'User' }
              }
            })
          )

          return {
            ...note,
            created_by: author || { first_name: 'Unknown', last_name: 'User' },
            recipients: recipients || [],
            replies: repliesWithAuthors || []
          }
        })
      )

      setNotes(notesWithDetails)
    } catch (err) {
      console.error('Exception loading notes:', err)
      setNotes([])
    }
  }

  const loadTeamMembers = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !activeOrg) return

    const { data, error } = await supabase
      .from('user_organization_memberships')
      .select('user_id')
      .eq('organization_id', activeOrg.id)

    if (error) {
      console.error('Error loading memberships:', error)
      return
    }

    const userIds = data.map(m => m.user_id)

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name, email')
      .in('id', userIds)
      .order('first_name')

    setTeamMembers(profiles || [])
  }

  const handleGenerateRequirements = async () => {
    if (!grant?.award_letter_url) return
    
    setGeneratingRequirements(true)
    
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('award-letters')
        .download(grant.award_letter_url)
      
      if (downloadError) {
        alert('Error downloading award letter: ' + downloadError.message)
        setGeneratingRequirements(false)
        return
      }
      
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(fileData)
      })
      
      const mediaType = grant.award_letter_name?.endsWith('.pdf') 
        ? 'application/pdf' 
        : 'image/jpeg'
      
      const response = await fetch('/api/analyze-award-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_data: base64,
          media_type: mediaType,
          grant_info: {
            grant_name: grant.grant_name,
            funding_agency: grant.funding_agency,
            award_amount: grant.award_amount,
            period_start: grant.period_start,
            period_end: grant.period_end
          }
        })
      })
      
      const data = await response.json()
      
      if (data.content && data.content[0]?.text) {
        const jsonText = data.content[0].text.trim()
        const cleanJson = jsonText.replace(/```json\n?|\n?```/g, '').trim()
        const extracted = JSON.parse(cleanJson)
        
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        
        let reqCount = 0
        let condCount = 0
        
        if (extracted.requirements && extracted.requirements.length > 0) {
          const requirementsToInsert = extracted.requirements.map((req: any) => ({
            grant_id: grant.id,
            created_by_user_id: user.id,
            title: req.title,
            description: req.description || null,
            due_date: req.due_date || null,
            priority: req.priority || 'medium',
            status: 'open',
            policy_source: req.policy_source || null,
            policy_citation: req.policy_citation || null
          }))
          
          const { error: reqError } = await supabase
            .from('compliance_requirements')
            .insert(requirementsToInsert)
          
          if (!reqError) {
            reqCount = requirementsToInsert.length
          }
        }
        
        if (extracted.special_conditions && extracted.special_conditions.length > 0) {
          const conditionsToInsert = extracted.special_conditions.map((cond: any) => ({
            grant_id: grant.id,
            title: cond.title,
            description: cond.description,
            risk_level: cond.risk_level || 'medium',
            applies_to: cond.applies_to || 'all',
            restriction_type: cond.restriction_type || 'requirement',
            ai_generated: true
          }))
          
          const { error: condError } = await supabase
            .from('special_conditions')
            .insert(conditionsToInsert)
          
          if (!condError) {
            condCount = conditionsToInsert.length
          }
        }
        
        alert(`✨ Generated ${reqCount} compliance requirements and ${condCount} special conditions from your award letter!`)
        loadRequirements()
        loadSpecialConditions()
        loadGrant()
      }
    } catch (error) {
      console.error('Generation error:', error)
      alert('Could not generate requirements. Please try adding them manually.')
    } finally {
      setGeneratingRequirements(false)
    }
  }

  useEffect(() => {
    loadGrant()
    loadExpenses()
    loadRequirements()
    loadSpecialConditions()
    loadPayments()
    loadNotes()
    loadTeamMembers()
  }, [params.id, activeOrg])

  const handleDelete = async () => {
    setDeleting(true)

    const { error } = await supabase
      .from('grants')
      .delete()
      .eq('id', params.id)

    if (error) {
      alert('Error deleting grant: ' + error.message)
      setDeleting(false)
    } else {
      router.push('/grants')
    }
  }

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (date: string | null) => {
    if (!date) return 'Not specified'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'in_progress':
        return 'bg-blue-100 text-blue-800'
      case 'overdue':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-slate-100 text-slate-800'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800'
      case 'high':
        return 'bg-orange-100 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-slate-100 text-slate-800'
    }
  }

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300'
    }
  }

  const getRestrictionIcon = (restrictionType: string) => {
    switch (restrictionType) {
      case 'prohibition':
        return '🚫'
      case 'limitation':
        return '⚠️'
      case 'approval_needed':
        return '✋'
      default:
        return '📋'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  if (!grant) {
    return null
  }

  const openRequirements = requirements.filter(r => r.status === 'open' || r.status === 'in_progress')
  const overdueRequirements = requirements.filter(r => r.status === 'overdue')
  const completedRequirements = requirements.filter(r => r.status === 'completed')
  const totalPayments = payments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0)

  return (
    <AppLayout
      title={grant.grant_name}
      subtitle={grant.funding_agency}
      showBackButton={true}
      backUrl="/dashboard"
      showSettings={isAdmin}
    >
      <Tabs defaultValue={defaultTab} className="w-full">
        <div className="mb-6 overflow-x-auto overflow-y-hidden border-b border-slate-300 pb-3">
            <TabsList className="inline-flex w-full min-w-max lg:grid lg:grid-cols-7 lg:w-full h-auto p-0 bg-transparent gap-0">
              <TabsTrigger 
                value="summary" 
                className="flex-1 whitespace-nowrap border border-slate-300 border-r-0 px-2 py-3 rounded-none text-xs xl:text-sm font-medium transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white hover:bg-slate-900 hover:text-white"
              >
                Summary
              </TabsTrigger>
              <TabsTrigger 
                value="special-conditions" 
                className="flex-1 whitespace-nowrap border border-slate-300 border-r-0 px-2 py-3 rounded-none text-xs xl:text-sm font-medium transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white hover:bg-slate-900 hover:text-white"
              >
                <span className="hidden xl:inline">Special Conditions</span>
                <span className="xl:hidden">Conditions</span>
                {specialConditions.length > 0 && (
                  <Badge variant="destructive" className="ml-1 xl:ml-2 text-xs">{specialConditions.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="requirements" 
                className="flex-1 whitespace-nowrap border border-slate-300 border-r-0 px-2 py-3 rounded-none text-xs xl:text-sm font-medium transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white hover:bg-slate-900 hover:text-white"
              >
                <span className="hidden xl:inline">Requirements</span>
                <span className="xl:hidden">Req's</span>
                {overdueRequirements.length > 0 && (
                  <Badge variant="destructive" className="ml-1 xl:ml-2 text-xs">{overdueRequirements.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="expenses" 
                className="flex-1 whitespace-nowrap border border-slate-300 border-r-0 px-2 py-3 rounded-none text-xs xl:text-sm font-medium transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white hover:bg-slate-900 hover:text-white"
              >
                Expenses
                <Badge variant="secondary" className="ml-1 xl:ml-2 text-xs">{expenses.length}</Badge>
              </TabsTrigger>
              <TabsTrigger
                value="budget"
                className="flex-1 whitespace-nowrap border border-slate-300 border-r-0 px-2 py-3 rounded-none text-xs xl:text-sm font-medium transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white hover:bg-slate-900 hover:text-white"
              >
                Budget
              </TabsTrigger>
              <TabsTrigger
                value="payments"
                className="flex-1 whitespace-nowrap border border-slate-300 border-r-0 px-2 py-3 rounded-none text-xs xl:text-sm font-medium transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white hover:bg-slate-900 hover:text-white"
              >
                Payments
                <Badge variant="secondary" className="ml-1 xl:ml-2 text-xs">{payments.length}</Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="notes" 
                className="flex-1 whitespace-nowrap border border-slate-300 px-2 py-3 rounded-none text-xs xl:text-sm font-medium transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white hover:bg-slate-900 hover:text-white"
              >
                Notes
                {totalNotesCount > 0 && (
                  <Badge variant="secondary" className="ml-1 xl:ml-2 text-xs">{totalNotesCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Grant Overview</CardTitle>
                  {userRole !== 'viewer' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditOpen(true)}
                      className="flex items-center gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Grant
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-slate-600">Status</p>
                  <Badge className={`mt-1 ${
                    grant.status === 'active' 
                      ? 'bg-green-100 text-green-800 hover:bg-green-100' 
                      : grant.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-100'
                  }`}>
                    {grant.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Award Amount</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(grant.award_amount)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Program Type</p>
                  <p className="text-lg text-slate-900 mt-1">{grant.program_type || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Award Number</p>
                  <p className="text-lg text-slate-900 mt-1">{grant.award_number || 'Not specified'}</p>
                </div>
                {grant.award_letter_url && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-slate-600 mb-2">Award Letter</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-sm font-medium text-slate-900">📄 {grant.award_letter_name || 'Award Letter'}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { data, error } = await supabase.storage
                            .from('award-letters')
                            .download(grant.award_letter_url!)
                          
                          if (error) {
                            alert('Error downloading file')
                            return
                          }
                          
                          const url = URL.createObjectURL(data)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = grant.award_letter_name || 'award-letter.pdf'
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        }}
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Period</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-slate-600">Start Date</p>
                  <p className="text-lg text-slate-900 mt-1">{formatDate(grant.period_start)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">End Date</p>
                  <p className="text-lg text-slate-900 mt-1">{formatDate(grant.period_end)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Financial Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Top Row - 4 Key Metrics */}
                <div className="grid grid-cols-4 gap-4 text-center pb-6 border-b">
                  <div>
                    <p className="text-sm text-slate-600">Award Amount</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">
                      {formatCurrency(grant.award_amount || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Payments Received</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                      {formatCurrency(totalPayments)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Total Expenses</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">
                      {formatCurrency(totalExpenses)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Budget Remaining</p>
                    <p className={`text-2xl font-bold mt-1 ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(remainingBudget)}
                    </p>
                  </div>
                </div>

                {/* Visual Trackers */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Award vs Expenses */}
                  <div>
                    <h4 className="font-medium text-slate-900 mb-3">Award Utilization</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Expended</span>
                        <span className="font-medium">{formatCurrency(totalExpenses)}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-4">
                        <div 
                          className={`h-4 rounded-full transition-all ${
                            totalExpenses > (grant.award_amount || 0) ? 'bg-red-500' : 'bg-blue-500'
                          }`}
                          style={{ 
                            width: `${Math.min(100, ((totalExpenses / (grant.award_amount || 1)) * 100))}%` 
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Remaining</span>
                        <span className={`font-medium ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(remainingBudget)}
                        </span>
                      </div>
                      <div className="text-center pt-2">
                        <p className="text-xs text-slate-500">
                          {((totalExpenses / (grant.award_amount || 1)) * 100).toFixed(1)}% utilized
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Expenses vs Payments */}
                  <div>
                    <h4 className="font-medium text-slate-900 mb-3">Reimbursement Status</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Reimbursed</span>
                        <span className="font-medium">{formatCurrency(totalPayments)}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-4">
                        <div 
                          className="bg-green-500 h-4 rounded-full transition-all"
                          style={{ 
                            width: `${Math.min(100, ((totalPayments / (totalExpenses || 1)) * 100))}%` 
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Awaiting Reimbursement</span>
                        <span className={`font-medium ${
                          totalExpenses - totalPayments > 0 ? 'text-orange-600' : 'text-slate-600'
                        }`}>
                          {formatCurrency(totalExpenses - totalPayments)}
                        </span>
                      </div>
                      <div className="text-center pt-2">
                        <p className="text-xs text-slate-500">
                          {totalExpenses > 0 ? ((totalPayments / totalExpenses) * 100).toFixed(1) : 0}% reimbursed
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Special Conditions Tab */}
          <TabsContent value="special-conditions">
            {specialConditions.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12 text-slate-500">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                  <p className="text-lg font-medium">No Special Conditions</p>
                  <p className="text-sm mt-2">
                    {grant.award_letter_url 
                      ? 'Generate requirements from your award letter to identify special conditions.'
                      : 'Upload an award letter to automatically identify special conditions.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {specialConditions.map((condition) => (
                  <div
                    key={condition.id}
                    className={`p-4 border-2 rounded-lg ${getRiskLevelColor(condition.risk_level)}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{getRestrictionIcon(condition.restriction_type)}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{condition.title}</h4>
                          <Badge variant="outline" className="text-xs">
                            {condition.risk_level}
                          </Badge>
                          {condition.restriction_type && (
                            <Badge variant="outline" className="text-xs">
                              {condition.restriction_type.replace('_', ' ')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mb-2">{condition.description}</p>
                        {condition.applies_to && (
                          <p className="text-xs font-medium">
                            Applies to: <span className="font-normal">{condition.applies_to}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Requirements Tab */}
          <TabsContent value="requirements">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Compliance Requirements</CardTitle>
                    <CardDescription>
                      {openRequirements.length} open • {overdueRequirements.length} overdue • {completedRequirements.length} completed
                    </CardDescription>
                  </div>
                  {userRole !== 'viewer' && (
                    <div className="flex gap-2">
                      {grant.award_letter_url && requirements.length === 0 && (
                        <Button 
                          variant="default"
                          onClick={handleGenerateRequirements}
                          disabled={generatingRequirements}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          {generatingRequirements ? 'Analyzing Award Letter...' : 'Generate from Award Letter'}
                        </Button>
                      )}
                      <AddRequirementDialog grantId={params.id as string} onRequirementAdded={loadRequirements} />
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {requirements.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <p>No compliance requirements tracked yet.</p>
                    {userRole !== 'viewer' && (
                      <p className="text-sm mt-2">
                        {grant.award_letter_url 
                          ? 'Click "Generate from Award Letter" to automatically identify requirements!'
                          : 'Click "Add Requirement" to get started!'}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requirements.map((req) => (
                      <div
                        key={req.id}
                        className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          setSelectedRequirement(req)
                          setRequirementDialogOpen(true)
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-slate-900">{req.title}</h4>
                              <Badge className={getStatusColor(req.status)}>
                                {req.status === 'in_progress' ? 'In Progress' : req.status}
                              </Badge>
                              <Badge className={getPriorityColor(req.priority)}>
                                {req.priority}
                              </Badge>
                            </div>
                            {req.description && (
                              <p className="text-sm text-slate-600 mb-2">{req.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              {req.due_date && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Due: {formatDate(req.due_date)}
                                </span>
                              )}
                              {req.policy_source && (
                                <span>📋 {req.policy_source}</span>
                              )}
                              {req.policy_citation && (
                                <span>{req.policy_citation}</span>
                              )}
                              {req.policy_url && (
                                <a 
                                  href={req.policy_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View Policy →
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Expenses Tab */}
          <TabsContent value="expenses">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Expenses</CardTitle>
                    <CardDescription>
                      {expenses.length} expense{expenses.length === 1 ? '' : 's'} • {formatCurrency(totalExpenses)} spent
                    </CardDescription>
                  </div>
                  {userRole !== 'viewer' && (
                    <AddExpenseChoiceDialog grantId={params.id as string} onExpenseAdded={loadExpenses} />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-sm text-slate-600">Award Amount</p>
                      <p className="text-xl font-bold text-slate-900">
                        {formatCurrency(grant.award_amount || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Total Expenses</p>
                      <p className="text-xl font-bold text-blue-600">
                        {formatCurrency(totalExpenses)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Remaining</p>
                      <p className={`text-xl font-bold ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(remainingBudget)}
                      </p>
                    </div>
                  </div>
                </div>

                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <p>No expenses recorded yet.</p>
                    {userRole !== 'viewer' && (
                      <p className="text-sm mt-2">Click "Add Expense" to get started!</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        onClick={async () => {
                          setSelectedExpense(expense)
                          setExpenseDialogOpen(true)
                        }}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <p className="font-medium text-slate-900">{expense.vendor}</p>
                            {expense.category && (
                              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded">
                                {expense.category}
                              </span>
                            )}
                            {expense.expense_documents && expense.expense_documents[0]?.count > 0 && (
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                                📎 {expense.expense_documents[0].count} document{expense.expense_documents[0].count === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                          {expense.description && (
                            <p className="text-sm text-slate-600 mt-1">{expense.description}</p>
                          )}
                          <p className="text-xs text-slate-500 mt-1">
                            {formatDate(expense.expense_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-slate-900">
                            {formatCurrency(expense.amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Budget Tab */}
          <TabsContent value="budget">
            <Card>
              <CardContent className="pt-6">
                <BudgetTab
                  grantId={params.id as string}
                  expenses={expenses}
                  awardAmount={grant?.award_amount ?? null}
                  canEdit={userRole !== 'viewer'}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Payments Received</CardTitle>
                    <CardDescription>
                      {payments.length} payment{payments.length === 1 ? '' : 's'} • {formatCurrency(totalPayments)} received
                    </CardDescription>
                  </div>
                  {userRole !== 'viewer' && (
                    <AddPaymentDialog grantId={params.id as string} onPaymentAdded={loadPayments} />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* Financial Summary */}
                <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-sm text-slate-600">Total Expenses</p>
                      <p className="text-xl font-bold text-blue-600">
                        {formatCurrency(totalExpenses)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Total Payments</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatCurrency(totalPayments)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Awaiting Reimbursement</p>
                      <p className={`text-xl font-bold ${
                        totalExpenses - totalPayments > 0 ? 'text-orange-600' : 'text-slate-600'
                      }`}>
                        {formatCurrency(totalExpenses - totalPayments)}
                      </p>
                    </div>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <p>No payments recorded yet.</p>
                    {userRole !== 'viewer' && (
                      <p className="text-sm mt-2">Click "Add Payment" to record a payment received!</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        onClick={async () => {
                          setSelectedPayment(payment)
                          setPaymentDialogOpen(true)
                        }}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <p className="font-medium text-slate-900">{payment.funding_source}</p>
                            {payment.reference_number && (
                              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded">
                                Ref: {payment.reference_number}
                              </span>
                            )}
                          </div>
                          {payment.notes && (
                            <p className="text-sm text-slate-600 mt-1">{payment.notes}</p>
                          )}
                          <p className="text-xs text-slate-500 mt-1">
                            Received: {formatDate(payment.received_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-green-600">
                            {formatCurrency(payment.amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Notes & Discussion</CardTitle>
                    <CardDescription>
                      {notes.length} note{notes.length === 1 ? '' : 's'}
                    </CardDescription>
                  </div>
                  {userRole !== 'viewer' && (
                    <AddNoteDialog 
                      grantId={params.id as string} 
                      teamMembers={teamMembers}
                      onNoteAdded={loadNotes} 
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {notes.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-lg font-medium">No notes yet</p>
                    <p className="text-sm mt-2">
                      Start a conversation about this grant
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className="p-4 border border-slate-200 rounded-lg bg-white"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium text-slate-900">
                              {note.created_by?.first_name} {note.created_by?.last_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(note.created_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                              {note.is_edited && ' (edited)'}
                            </p>
                          </div>
                        </div>
                        <p className="text-slate-700 whitespace-pre-wrap">{note.content}</p>
                        
                        {/* Recipients */}
                        {note.recipients && note.recipients.length > 0 && (
                          <div className="mt-2 text-xs text-slate-500">
                            To: {note.recipients.map((r: any) => 
                              `${r.recipient?.first_name} ${r.recipient?.last_name}`
                            ).join(', ')}
                          </div>
                        )}

                        {/* Replies */}
                        {note.replies && note.replies.length > 0 && (
                          <div className="mt-4 ml-6 space-y-3 border-l-2 border-slate-200 pl-4">
                            {note.replies.map((reply: any) => (
                              <div key={reply.id}>
                                <div className="flex items-start justify-between mb-1">
                                  <p className="font-medium text-sm text-slate-900">
                                    {reply.created_by?.first_name} {reply.created_by?.last_name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {new Date(reply.created_at).toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{reply.content}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply button */}
                        {userRole !== 'viewer' && (
                          <AddReplyDialog 
                            noteId={note.id} 
                            onReplyAdded={loadNotes}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      {/* Keep all your existing dialogs at the bottom */}
      {selectedExpense && (
        <ExpenseDetailDialog
          expense={selectedExpense}
          open={expenseDialogOpen}
          onOpenChange={setExpenseDialogOpen}
          onExpenseUpdated={async () => {
            await loadExpenses()
            const { data: updated } = await supabase
              .from('expenses')
              .select('*, expense_documents(count)')
              .eq('id', selectedExpense.id)
              .single()
            if (updated) {
              setSelectedExpense(updated)
            }
            loadGrant()
          }}
          userRole={userRole}
        />
      )}

      {grant && (
        <EditGrantDialog
          grant={grant}
          open={editOpen}
          onOpenChange={setEditOpen}
          onGrantUpdated={loadGrant}
        />
      )}

      {selectedPayment && (
        <PaymentDetailDialog
          payment={selectedPayment}
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          onPaymentUpdated={async () => {
            await loadPayments()
            const { data: updated } = await supabase
              .from('payments_received')
              .select('*')
              .eq('id', selectedPayment.id)
              .single()
            if (updated) {
              setSelectedPayment(updated)
            }
            loadGrant()
          }}
          userRole={userRole}
        />
      )}

      {selectedRequirement && (
        <RequirementDetailDialog
          requirement={selectedRequirement}
          open={requirementDialogOpen}
          onOpenChange={setRequirementDialogOpen}
          onRequirementUpdated={async () => {
            await loadRequirements()
            const { data: updated } = await supabase
              .from('compliance_requirements')
              .select('*')
              .eq('id', selectedRequirement.id)
              .single()
            if (updated) {
              setSelectedRequirement(updated)
            }
            loadGrant()
          }}
          userRole={userRole}
        />
      )}
    </AppLayout>
  )
}