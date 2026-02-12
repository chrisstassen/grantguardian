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
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'

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
}

export default function GrantDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [grant, setGrant] = useState<Grant | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadGrant = async () => {
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

  useEffect(() => {
    loadGrant()
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
    if (!amount) return 'Not specified'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
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
              <CardTitle>Activity</CardTitle>
              <CardDescription>Coming soon: Expenses, documents, and compliance alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-slate-500">
                <p>No activity yet. This section will show:</p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li>• Expense tracking and allowability checks</li>
                  <li>• Uploaded documents and award letters</li>
                  <li>• Compliance requirements and alerts</li>
                  <li>• AI-powered policy guidance</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

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