'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import ReactMarkdown from 'react-markdown'
import { CreateSupportTicketDialog } from './create-support-ticket-dialog'
import { useOrganization } from '@/contexts/organization-context'
import {
  MessageCircleQuestion,
  X,
  Send,
  Sparkles,
  Lock,
  ArrowRight,
} from 'lucide-react'
import { usePathname } from 'next/navigation'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function HelpChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const [showTicketDialog, setShowTicketDialog] = useState(false)
  const { activeOrg } = useOrganization()

  // Compute hidden state — used to guard effects and the render (never used for early return)
  const hiddenPaths = ['/', '/login', '/signup', '/onboarding', '/reset-password', '/update-password']
  const isHiddenPage = hiddenPaths.includes(pathname)
  const isPro = activeOrg?.plan === 'pro'

  // Auto-scroll to bottom when new messages arrive
  // All hooks must be declared before any conditional return (Rules of Hooks)
  useEffect(() => {
    if (isHiddenPage) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isHiddenPage])

  // Load conversation history
  useEffect(() => {
    if (isHiddenPage) return
    if (isOpen && !conversationId) {
      loadOrCreateConversation()
    }
  }, [isOpen, isHiddenPage])

  const loadOrCreateConversation = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Try to find most recent active conversation
    const { data: conversations } = await supabase
      .from('help_conversations')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (conversations && conversations.length > 0) {
      setConversationId(conversations[0].id)
      await loadMessages(conversations[0].id)
    } else {
      // Start fresh - conversation will be created on first message
      setMessages([{
        role: 'assistant',
        content: "👋 Hi! I'm your GrantGuardian AI assistant. I can help you with:\n\n**Product Help** - How to use GrantGuardian features\n**Grant Expertise** - Compliance, policies, eligibility questions\n\nWhat can I help you with today?"
      }])
    }
  }

  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from('help_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    if (data && data.length > 0) {
      setMessages(data as Message[])
    } else {
      // Show welcome message
      setMessages([{
        role: 'assistant',
        content: "👋 Welcome back! How can I help you today?"
      }])
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setLoading(true)

    // Add user message to UI
    const newMessages = [...messages, { role: 'user' as const, content: userMessage }]
    setMessages(newMessages)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Create conversation if needed
      let convId = conversationId
      if (!convId) {
        const { data: newConv } = await supabase
          .from('help_conversations')
          .insert([{
            user_id: user.id,
            title: userMessage.substring(0, 100), // Use first message as title
            category: 'general'
          }])
          .select('id')
          .single()

        if (newConv) {
          convId = newConv.id
          setConversationId(convId)
        }
      }

      // Save user message
      if (convId) {
        await supabase
          .from('help_messages')
          .insert([{
            conversation_id: convId,
            role: 'user',
            content: userMessage
          }])
      }

      // Call Claude API (send auth token for plan check)
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/help-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          messages: newMessages,
          currentPage: pathname,
          category: 'general'
        })
      })

      const data = await response.json()

      if (data.message) {
        const assistantMessage = { role: 'assistant' as const, content: data.message }
        setMessages([...newMessages, assistantMessage])

        // Save assistant message
        if (convId) {
          await supabase
            .from('help_messages')
            .insert([{
              conversation_id: convId,
              role: 'assistant',
              content: data.message
            }])
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages([...newMessages, {
        role: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again or create a support ticket if the issue persists."
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Don't render on marketing / auth pages — placed after all hooks
  if (isHiddenPage) return null

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl z-50"
          size="icon"
        >
          <MessageCircleQuestion className="h-6 w-6" />
        </Button>
      )}

      {/* Chat window */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 w-[400px] h-[600px] shadow-2xl z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <div>
                <h3 className="font-semibold">AI Assistant</h3>
                <p className="text-xs opacity-90">Powered by Claude</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Pro upgrade gate */}
          {!isPro && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="h-14 w-14 rounded-full bg-violet-100 flex items-center justify-center mb-4">
                <Lock className="h-6 w-6 text-violet-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">AI Assistant is a Pro feature</h3>
              <p className="text-sm text-slate-500 mb-5">
                Upgrade to Pro to unlock the AI assistant for instant answers on grant compliance, GrantGuardian features, and more.
              </p>
              <Button
                onClick={() => window.open('/#pricing', '_blank')}
                className="bg-violet-600 hover:bg-violet-500 text-white w-full"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Upgrade to Pro
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <p className="text-xs text-slate-400 mt-4">
                Need help right now?{' '}
                <button onClick={() => setShowTicketDialog(true)} className="text-blue-600 hover:underline">
                  Create a support ticket
                </button>
              </p>
            </div>
          )}

          {/* Messages */}
          {isPro && <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                    >
                    <div className="text-sm prose prose-sm max-w-none prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                        <ReactMarkdown
                        components={{
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-4 space-y-1">{children}</ul>,
                            li: ({ children }) => <li>{children}</li>,
                        }}
                        >
                        {msg.content}
                        </ReactMarkdown>
                    </div>
                    </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-lg px-4 py-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>}

          {/* Input — Pro only */}
          {isPro && <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything..."
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={loading || !input.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
                Need more help? <button 
                    onClick={() => setShowTicketDialog(true)} 
                    className="text-blue-600 hover:underline"
                >
                    Create support ticket
                </button>
            </p>
          </div>}
        </Card>
      )}

            {/* Support Ticket Dialog */}
      <CreateSupportTicketDialog
        open={showTicketDialog}
        onOpenChange={setShowTicketDialog}
        conversationId={conversationId}
      />
    </>
  )
}