'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOrganization } from '@/contexts/organization-context'
import { Upload, X } from 'lucide-react'

interface CreateSupportTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId?: string | null
}

export function CreateSupportTicketDialog({ 
  open, 
  onOpenChange,
  conversationId 
}: CreateSupportTicketDialogProps) {
  const { activeOrg } = useOrganization()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    ticket_type: 'general_help',
    priority: 'normal'
  })
  const [attachments, setAttachments] = useState<File[]>([])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments([...attachments, ...Array.from(e.target.files)])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      if (!activeOrg) throw new Error('No active organization')

      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert([{
          user_id: user.id,
          organization_id: activeOrg.id,
          conversation_id: conversationId,
          subject: formData.subject,
          description: formData.description,
          ticket_type: formData.ticket_type,
          priority: formData.priority,
          category: formData.ticket_type,
          status: 'open'
        }])
        .select()
        .single()

      if (ticketError) throw ticketError

      // Upload attachments if any
        console.log('Uploading attachments:', attachments.length, 'files')
        if (attachments.length > 0 && ticket) {
        console.log('Ticket ID:', ticket.id)
        for (const file of attachments) {
            console.log('Uploading file:', file.name, file.size, 'bytes')
            // Sanitize filename - remove spaces and special characters
            const sanitizedName = file.name
            .replace(/\s+/g, '_')  // Replace spaces with underscores
            .replace(/[^\w\.-]/g, '')  // Remove special characters except . - _
            const fileName = `${ticket.id}/${Date.now()}_${sanitizedName}`
            
            console.log('Storage path:', fileName)
            const { error: uploadError } = await supabase.storage
            .from('support-attachments')
            .upload(fileName, file)

            console.log('Upload result:', { uploadError })

          if (!uploadError) {
            await supabase
              .from('support_ticket_attachments')
              .insert([{
                ticket_id: ticket.id,
                uploaded_by_user_id: user.id,
                file_name: file.name,
                file_url: fileName,
                file_size: file.size,
                file_type: file.type
              }])
          }
        }
      }

      // Send notification to org admins
      const { data: admins } = await supabase
        .from('user_organization_memberships')
        .select('user_id, user_profiles(email, first_name, last_name)')
        .eq('organization_id', activeOrg.id)
        .eq('role', 'admin')

      if (admins) {
        for (const admin of admins) {
          await supabase
            .from('notifications')
            .insert([{
              user_id: admin.user_id,
              title: 'New Support Ticket',
              message: `${formData.subject}`,
              type: 'support_ticket',
              link: `/support/tickets/${ticket.id}`
            }])

          // Send email notification
          await fetch('/api/send-notification-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: (admin.user_profiles as any).email,
              subject: 'New Support Ticket - ' + formData.subject,
              title: 'New Support Ticket',
              message: `A new support ticket has been submitted:\n\n${formData.description}`,
              actionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/support/tickets/${ticket.id}`,
              actionText: 'View Ticket'
            })
          })
        }
      }

      alert('Support ticket created successfully!')
      onOpenChange(false)
      
      // Reset form
      setFormData({
        subject: '',
        description: '',
        ticket_type: 'general_help',
        priority: 'normal'
      })
      setAttachments([])

    } catch (error: any) {
      console.error('Error creating ticket:', error)
      alert('Error creating ticket: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Support Ticket</DialogTitle>
          <DialogDescription>
            Submit a support request to your organization admins
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="Brief description of the issue"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket_type">Type *</Label>
            <Select
              value={formData.ticket_type}
              onValueChange={(value) => setFormData({ ...formData, ticket_type: value })}
              required
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system_bug">System Bug</SelectItem>
                <SelectItem value="general_help">General Help</SelectItem>
                <SelectItem value="enhancement_request">Enhancement Request</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => setFormData({ ...formData, priority: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Provide detailed information about your request..."
              rows={6}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachments">Attachments (Optional)</Label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-4">
              <input
                type="file"
                id="attachments"
                onChange={handleFileChange}
                multiple
                className="hidden"
              />
              <label
                htmlFor="attachments"
                className="flex flex-col items-center gap-2 cursor-pointer"
              >
                <Upload className="h-8 w-8 text-slate-400" />
                <p className="text-sm text-slate-600">
                  Click to upload screenshots or documents
                </p>
                <p className="text-xs text-slate-500">
                  PNG, JPG, PDF up to 10MB each
                </p>
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-2 mt-2">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-slate-50 rounded"
                  >
                    <span className="text-sm truncate">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Ticket'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}