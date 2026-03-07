'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { ArrowLeft, Pencil, Trash2, CheckCircle2, Clock, AlertCircle, Sparkles } from 'lucide-react'

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
  const [grant, setGrant] = useState<Grant | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [userRole, setUserRole] = useState<string>('')
  const [expenses, setExpenses] = useState<any[]>([])
  const [selectedExpense, setSelectedExpense] = useState<any>(null)
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [requirements, setRequirements] = useState<any[]>([])
  const [generatingRequirements, setGeneratingRequirements] = useState(false)
  const [generatedRequirements, setGeneratedRequirements] = useState<any[]>([])

  const totalExpenses = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0)
  const remainingBudget = (grant?.award_amount || 0) - totalExpenses

  const loadGrant = async () => {
    // Get user's role
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      
      if (profile) {
        setUserRole(profile.role)
      }
    }

    const { data, error } = await supabase
      .from('grants')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Error loading grant:', error)
      router.push('/dashboard')
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
      console.error('Error loading expenses:', error)
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
      console.error('Error loading requirements:', error)
    } else {
      // Update status based on due date
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

  const handleGenerateRequirements = async () => {
  if (!grant?.award_letter_url) return
  
  setGeneratingRequirements(true)
  
  try {
    // Download the award letter
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('award-letters')
      .download(grant.award_letter_url)
    
    if (downloadError) {
      alert('Error downloading award letter: ' + downloadError.message)
      setGeneratingRequirements(false)
      return
    }
    
    // Convert to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(fileData)
    })
    
    // Determine media type
    const mediaType = grant.award_letter_name?.endsWith('.pdf') 
      ? 'application/pdf' 
      : 'image/jpeg'
    
    // Call AI analysis API
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
      
      setGeneratedRequirements(extracted)
      
      // Auto-save the requirements
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const requirementsToInsert = extracted.map((req: any) => ({
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
      
      const { error: insertError } = await supabase
        .from('compliance_requirements')
        .insert(requirementsToInsert)
      
      if (insertError) {
        alert('Error saving requirements: ' + insertError.message)
      } else {
        alert(`✨ Generated ${extracted.length} compliance requirements from your award letter!`)
        loadRequirements()
      }
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
  }, [params.id])

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
      router.push('/dashboard')
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/dashboard')}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{grant.grant_name}</h1>
              <p className="text-slate-600 mt-1">{grant.funding_agency}</p>
            </div>
            {userRole !== 'viewer' && (
              <div className="flex gap-2">
                <Button onClick={() => setEditOpen(true)} variant="outline">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this grant and all associated data. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDelete}
                        disabled={deleting}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deleting ? 'Deleting...' : 'Delete Grant'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Grant Overview</CardTitle>
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

          {/* Compliance Requirements */}
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
                    <p className="text-sm mt-2">Click "Add Requirement" to get started!</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {requirements.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
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
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expenses */}
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
                      onClick={() => {
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
        </div>
      </main>

      {selectedExpense && (
        <ExpenseDetailDialog
          expense={selectedExpense}
          open={expenseDialogOpen}
          onOpenChange={setExpenseDialogOpen}
          onExpenseUpdated={() => {
            loadExpenses()
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
    </div>
  )
}