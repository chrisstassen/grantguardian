'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Paperclip, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { useOrganization } from '@/contexts/organization-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

export default function TicketDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { activeOrg } = useOrganization()
  const [loading, setLoading] = useState(true)
  const [ticket, setTicket] = useState<any>(null)
  const [attachments, setAttachments] = useState<any[]>([])
  const [isOrgAdmin, setIsOrgAdmin] = useState(false)
  const [isSystemAdmin, setIsSystemAdmin] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    loadTicket()
  }, [params.id])

  const loadTicket = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    setCurrentUserId(user.id)

    // Check if user is system admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_system_admin')
      .eq('id', user.id)
      .single()

    setIsSystemAdmin(profile?.is_system_admin || false)

    // Load ticket
    const { data: ticketData, error: ticketError } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', params.id)
        .single()

        console.log('Ticket query result:', { ticketData, ticketError, userId: user.id, ticketId: params.id })

        if (ticketError || !ticketData) {
        console.error('Ticket access denied:', ticketError)
        alert('Ticket not found or access denied')
        router.push('/profile')
        return
        }

        // Load related data separately
        const { data: submitter } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, email')
        .eq('id', ticketData.user_id)
        .single()

        const { data: organization } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', ticketData.organization_id)
        .single()

        let escalatedBy = null
        if (ticketData.escalated_by_user_id) {
        const { data } = await supabase
            .from('user_profiles')
            .select('first_name, last_name')
            .eq('id', ticketData.escalated_by_user_id)
            .single()
        escalatedBy = data
        }

        // Combine the data
        ticketData.user_profiles = submitter
        ticketData.organizations = organization
        ticketData.escalated_by = escalatedBy

        // Combine the data
        ticketData.user_profiles = submitter
        ticketData.organizations = organization
        ticketData.escalated_by = escalatedBy

        // Check if user is org admin - need to check the ticket's org, not active org
        const { data: membership } = await supabase
        .from('user_organization_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', ticketData.organization_id)
        .single()

        setIsOrgAdmin(membership?.role === 'admin')

        setTicket(ticketData)

    setTicket(ticketData)

    // Load attachments
    const { data: attachmentData, error: attachmentError } = await supabase
    .from('support_ticket_attachments')
    .select('*')
    .eq('ticket_id', params.id)

    console.log('Attachments query:', { attachmentData, attachmentError, ticketId: params.id })

    // Load uploader profiles separately if we have attachments
    if (attachmentData && attachmentData.length > 0) {
    const uploaderIds = [...new Set(attachmentData.map(a => a.uploaded_by_user_id))]
    const { data: uploaderProfiles } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name')
        .in('id', uploaderIds)

    console.log('Uploader profiles:', uploaderProfiles)

    // Attach profiles to attachments
    const attachmentsWithProfiles = attachmentData.map(att => ({
        ...att,
        user_profiles: uploaderProfiles?.find(p => p.id === att.uploaded_by_user_id) || null
    }))

    console.log('Attachments with profiles:', attachmentsWithProfiles)
    setAttachments(attachmentsWithProfiles)
    } else {
    console.log('No attachments found')
    setAttachments([])
    }

        setLoading(false)
    }

  const handleEscalate = async () => {
    setUpdating(true)

    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({
          status: 'submitted_to_grantguardian',
          escalated_by_user_id: currentUserId,
          escalated_at: new Date().toISOString()
        })
        .eq('id', params.id)

      if (error) throw error

      // Notify system admins
      const { data: systemAdmins } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name')
        .eq('is_system_admin', true)

      if (systemAdmins) {
        for (const admin of systemAdmins) {
          await supabase
            .from('notifications')
            .insert([{
              user_id: admin.id,
              title: 'Support Ticket Escalated',
              message: `Ticket: ${ticket.subject}`,
              type: 'support_ticket',
              link: `/support/tickets/${params.id}`
            }])

          // Send email
          await fetch('/api/send-notification-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: admin.email,
              subject: 'Support Ticket Escalated - ' + ticket.subject,
              title: 'Support Ticket Escalated',
              message: `A support ticket has been escalated to GrantGuardian Support:\n\n${ticket.description}`,
              actionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/support/tickets/${params.id}`,
              actionText: 'View Ticket'
            })
          })
        }
      }

      alert('Ticket escalated to GrantGuardian Support Team')
      await loadTicket()
    } catch (error: any) {
      alert('Error escalating ticket: ' + error.message)
    } finally {
      setUpdating(false)
    }
  }

  const handleClose = async () => {
    setUpdating(true)

    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          closed_by_user_id: currentUserId
        })
        .eq('id', params.id)

      if (error) throw error

      alert('Ticket closed successfully')
      await loadTicket()
    } catch (error: any) {
      alert('Error closing ticket: ' + error.message)
    } finally {
      setUpdating(false)
    }
  }

  const handleGrantGuardianStatusChange = async (newStatus: string) => {
    setUpdating(true)

    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({
          grantguardian_status: newStatus,
          ...(newStatus === 'complete' && {
            status: 'grantguardian_processing_complete'
          })
        })
        .eq('id', params.id)

      if (error) throw error

      // Notify the person who escalated
      if (ticket.escalated_by_user_id) {
        await supabase
          .from('notifications')
          .insert([{
            user_id: ticket.escalated_by_user_id,
            title: 'Support Ticket Status Updated',
            message: `Status: ${newStatus.replace(/_/g, ' ')}`,
            type: 'support_ticket',
            link: `/support/tickets/${params.id}`
          }])
      }

      await loadTicket()
    } catch (error: any) {
      alert('Error updating status: ' + error.message)
    } finally {
      setUpdating(false)
    }
  }

  const downloadAttachment = async (fileUrl: string, fileName: string) => {
    const { data, error } = await supabase.storage
      .from('support-attachments')
      .download(fileUrl)

    if (error) {
      alert('Error downloading file: ' + error.message)
      return
    }

    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      open: 'bg-blue-100 text-blue-800',
      submitted_to_grantguardian: 'bg-purple-100 text-purple-800',
      grantguardian_processing_complete: 'bg-green-100 text-green-800',
      closed: 'bg-slate-100 text-slate-800'
    }
    return styles[status as keyof typeof styles] || 'bg-slate-100 text-slate-800'
  }

  const getPriorityBadge = (priority: string) => {
    const styles = {
      urgent: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      normal: 'bg-slate-100 text-slate-600',
      low: 'bg-slate-100 text-slate-500'
    }
    return styles[priority as keyof typeof styles] || 'bg-slate-100 text-slate-600'
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button 
            variant="ghost" 
            onClick={() => router.back()}
            className="mb-2"
        >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
        </Button>
          <h1 className="text-3xl font-bold text-slate-900">Support Ticket</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Ticket Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl">{ticket.subject}</CardTitle>
                <CardDescription className="mt-2">
                  Submitted by {(ticket.user_profiles as any).first_name} {(ticket.user_profiles as any).last_name} on{' '}
                  {new Date(ticket.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <Badge className={getStatusBadge(ticket.status)}>
                  {ticket.status.replace(/_/g, ' ')}
                </Badge>
                <Badge className={getPriorityBadge(ticket.priority)}>
                  {ticket.priority}
                </Badge>
                <Badge variant="outline">
                  {ticket.ticket_type.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Description</h3>
              <p className="text-slate-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Organization</h3>
              <p className="text-slate-700">{(ticket.organizations as any).name}</p>
            </div>

            {ticket.escalated_at && (
              <div className="pt-4 border-t">
                <div className="flex items-center gap-2 text-purple-700">
                  <AlertCircle className="h-5 w-5" />
                  <p className="font-medium">
                    Escalated to GrantGuardian Support on{' '}
                    {new Date(ticket.escalated_at).toLocaleDateString()}
                    {ticket.escalated_by && ` by ${(ticket.escalated_by as any).first_name} ${(ticket.escalated_by as any).last_name}`}
                  </p>
                </div>
              </div>
            )}

            {/* GrantGuardian Status (visible after escalation) */}
            {ticket.status === 'submitted_to_grantguardian' || ticket.status === 'grantguardian_processing_complete' ? (
              <div className="pt-4 border-t">
                <h3 className="font-semibold text-slate-900 mb-2">GrantGuardian Status</h3>
                {isSystemAdmin ? (
                  <Select
                    value={ticket.grantguardian_status}
                    onValueChange={handleGrantGuardianStatusChange}
                    disabled={updating}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="under_development">Under Development</SelectItem>
                      <SelectItem value="testing">Testing</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="complete">Complete</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="text-sm">
                    {ticket.grantguardian_status.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Attachments */}
        {attachments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <Paperclip className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="font-medium text-slate-900">{attachment.file_name}</p>
                        <p className="text-xs text-slate-500">
                          Uploaded by {(attachment.user_profiles as any).first_name}{' '}
                          {(attachment.user_profiles as any).last_name}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadAttachment(attachment.file_url, attachment.file_name)}
                    >
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {ticket.status !== 'closed' && (
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {/* Org Admin can escalate */}
                {isOrgAdmin && ticket.status === 'open' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="default" disabled={updating}>
                        Escalate to GrantGuardian Support
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Escalate Ticket?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will forward the ticket to the GrantGuardian support team for assistance.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleEscalate}>
                          Escalate Ticket
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* User or Admin can close */}
                {(currentUserId === ticket.user_id || isOrgAdmin) && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" disabled={updating}>
                        Close Ticket
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Close Ticket?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will mark the ticket as closed. Once closed, it cannot be reopened.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleClose}
                          className="bg-slate-600 hover:bg-slate-700"
                        >
                          Close Ticket
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}