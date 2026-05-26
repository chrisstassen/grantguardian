'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  LayoutDashboard,
  FileText,
  ShieldCheck,
  CalendarDays,
  Users,
  Bell,
  MessageCircleQuestion,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  Eye,
  Settings,
  Receipt,
  ClipboardList,
  MessageSquare,
  BookOpen,
  HelpCircle,
  Star,
} from 'lucide-react'

const TOUR_KEY = 'gg_tour_v1_completed'

type Role = 'admin' | 'staff' | 'viewer'

interface TourStep {
  icon: React.ReactNode
  title: string
  subtitle?: string
  description: React.ReactNode
  tip?: string
  roles?: Role[]   // undefined = show to all roles
}

function roleLabel(role: Role) {
  if (role === 'admin') return 'Organization Admin'
  if (role === 'staff') return 'Team Member'
  return 'Viewer'
}

function roleColor(role: Role) {
  if (role === 'admin') return 'bg-violet-100 text-violet-800 border-violet-200'
  if (role === 'staff') return 'bg-blue-100 text-blue-800 border-blue-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function buildSteps(role: Role, firstName: string): TourStep[] {
  const steps: TourStep[] = [
    // ── Step 1: Welcome ───────────────────────────────────────────────────────
    {
      icon: <Sparkles className="h-10 w-10 text-violet-500" />,
      title: `Welcome${firstName ? `, ${firstName}` : ''}!`,
      subtitle: 'Your grant management journey starts here.',
      description: (
        <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
          {role === 'admin' && (
            <p>
              As an <strong>Organization Admin</strong>, you have full access to manage
              grants, track compliance, invite team members, and configure your organization.
              This quick tour will walk you through the key areas of GrantGuardian.
            </p>
          )}
          {role === 'staff' && (
            <p>
              As a <strong>Team Member</strong>, you can view and update grants, log
              expenses, track compliance requirements, collaborate with colleagues on notes,
              and more. Let's get you oriented.
            </p>
          )}
          {role === 'viewer' && (
            <p>
              As a <strong>Viewer</strong>, you have read-only access to your organization's
              grant portfolio. You can explore grants, review compliance status, and download
              reports without making any changes.
            </p>
          )}
          <p>
            This tour takes about 2 minutes. You can skip or come back to it any
            time using the <strong>Take the tour</strong> link in the top navigation.
          </p>
        </div>
      ),
    },

    // ── Step 2: Dashboard ─────────────────────────────────────────────────────
    {
      icon: <LayoutDashboard className="h-10 w-10 text-blue-500" />,
      title: 'Your Grant Dashboard',
      subtitle: 'The command center for your entire portfolio.',
      description: (
        <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
          <p>
            The <strong>Dashboard</strong> gives you an at-a-glance view of all active
            grants — including award amounts, spending to date, remaining balance, and
            performance period.
          </p>
          <ul className="space-y-2 pl-1">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span><strong>Compliance Health Panel</strong> — surfaces overdue and upcoming requirements across all grants</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span><strong>Grant cards</strong> — click any grant to open its full detail view</span>
            </li>
            {role !== 'viewer' && (
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span><strong>Add Grant</strong> button — create a new grant record in seconds</span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span><strong>Export CSV</strong> — download your full grant portfolio for reporting</span>
            </li>
          </ul>
        </div>
      ),
      tip: 'Find the Dashboard link in the top navigation bar.',
    },

    // ── Step 3: Grant Details ─────────────────────────────────────────────────
    {
      icon: <FileText className="h-10 w-10 text-indigo-500" />,
      title: 'Inside a Grant',
      subtitle: 'Everything about a grant, organized into tabs.',
      description: (
        <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
          <p>
            Clicking any grant opens its detail page — a tabbed workspace with everything
            you need to manage that grant from award to closeout.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {[
              { icon: <Receipt className="h-3.5 w-3.5" />, label: 'Expenses', desc: 'Log and track all expenditures' },
              { icon: <ClipboardList className="h-3.5 w-3.5" />, label: 'Compliance', desc: 'Requirements and deadlines' },
              { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Deliverables', desc: 'Track project milestones' },
              { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: 'Closeout', desc: 'AI-powered checklist' },
              { icon: <MessageSquare className="h-3.5 w-3.5" />, label: 'Notes', desc: 'Collaborate with your team' },
              { icon: <BookOpen className="h-3.5 w-3.5" />, label: 'Documents', desc: 'Attach supporting files' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-2 bg-slate-50 rounded-md p-2 border border-slate-100">
                <span className="text-slate-500 mt-0.5">{item.icon}</span>
                <div>
                  <p className="font-medium text-xs text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {role === 'viewer' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              As a Viewer, you can read all grant data and export reports, but editing is disabled.
            </p>
          )}
        </div>
      ),
      tip: 'The top of the grant page shows a "Closeout Readiness" summary — great for stay on top of grant close-out.',
    },

    // ── Step 4: Compliance & Calendar ─────────────────────────────────────────
    {
      icon: <ShieldCheck className="h-10 w-10 text-green-500" />,
      title: 'Compliance & Calendar',
      subtitle: 'Never miss a deadline.',
      description: (
        <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
          <div className="flex gap-3">
            <div className="flex-1 bg-green-50 border border-green-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                <p className="font-semibold text-green-800 text-xs">Compliance</p>
              </div>
              <p className="text-xs text-green-700">
                A cross-grant view of all compliance requirements — color-coded by
                status (overdue, due soon, on track). Filter by grant or status.
              </p>
            </div>
            <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                <p className="font-semibold text-blue-800 text-xs">Calendar</p>
              </div>
              <p className="text-xs text-blue-700">
                A monthly calendar showing grant deadlines, reporting dates, and
                payment schedules across your entire portfolio.
              </p>
            </div>
          </div>
          <p>
            Both are accessible from the <strong>top navigation bar</strong>. Compliance
            also appears as a quick-scan panel on the Dashboard.
          </p>
        </div>
      ),
      tip: 'Items turning red means they\'re overdue — click any item to jump straight to the requirement.',
    },

    // ── Step 5: Role-specific ─────────────────────────────────────────────────
    ...(role === 'admin' ? [{
      icon: <Users className="h-10 w-10 text-violet-500" />,
      title: 'Managing Your Team',
      subtitle: 'Invite, assign roles, and stay in control.',
      description: (
        <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
          <p>
            As an Admin, you have access to <strong>Settings</strong> — the hub for
            organization management. Look for it in the top-right area of your header.
          </p>
          <ul className="space-y-2 pl-1">
            <li className="flex items-start gap-2">
              <Users className="h-4 w-4 text-violet-500 mt-0.5 flex-shrink-0" />
              <span><strong>Team Members</strong> — invite colleagues via email, set their role (Admin, Member, or Viewer), and remove users if needed</span>
            </li>
            <li className="flex items-start gap-2">
              <Settings className="h-4 w-4 text-violet-500 mt-0.5 flex-shrink-0" />
              <span><strong>Organization Settings</strong> — update your org name, upload a logo, and view your invite code to share with new members</span>
            </li>
            <li className="flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-violet-500 mt-0.5 flex-shrink-0" />
              <span><strong>Support Tickets</strong> — view and respond to support requests submitted by your team</span>
            </li>
          </ul>
          <div className="bg-violet-50 border border-violet-100 rounded-md px-3 py-2 text-xs text-violet-800">
            <strong>Tip:</strong> Share your organization's invite code from Settings so new team members can join instantly.
          </div>
        </div>
      ),
      tip: 'Find Settings in the top-right corner of any page.',
      roles: ['admin'] as Role[],
    }] : []),

    ...(role === 'staff' ? [{
      icon: <MessageSquare className="h-10 w-10 text-blue-500" />,
      title: 'Collaborating with Your Team',
      subtitle: 'Stay connected on every grant.',
      description: (
        <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
          <p>
            The <strong>Notes</strong> tab on every grant is your team's shared workspace
            for that grant. Leave updates, questions, or flag issues.
          </p>
          <ul className="space-y-2 pl-1">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Type <strong>@name</strong> to mention a teammate — they'll get an in-app notification and an email</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Reply to notes to keep discussions threaded and easy to follow</span>
            </li>
            <li className="flex items-start gap-2">
              <Bell className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>The <strong>🔔 bell icon</strong> in the top-right shows all your unread notifications</span>
            </li>
          </ul>
        </div>
      ),
      tip: 'Notifications update in real-time — no page refresh needed.',
      roles: ['staff'] as Role[],
    }] : []),

    ...(role === 'viewer' ? [{
      icon: <Eye className="h-10 w-10 text-slate-500" />,
      title: 'Your Read-Only Access',
      subtitle: 'Full visibility, zero risk of accidental changes.',
      description: (
        <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
          <p>
            As a <strong>Viewer</strong>, you can see everything in your organization's
            grant portfolio — all the data, all the tabs, and all the compliance status —
            without the ability to make edits.
          </p>
          <ul className="space-y-2 pl-1">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Browse grants, expenses, payments, deliverables, and closeout checklists</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Export CSV reports from any grant or the dashboard</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Monitor compliance health and calendar deadlines in real time</span>
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            Need edit access? Contact your organization admin to have your role updated.
          </p>
        </div>
      ),
      tip: 'Export buttons are always available to Viewers — great for pulling reports for leadership.',
      roles: ['viewer'] as Role[],
    }] : []),

    // ── Step 6: Notifications ─────────────────────────────────────────────────
    {
      icon: <Bell className="h-10 w-10 text-amber-500" />,
      title: 'Notifications',
      subtitle: 'Stay in the loop without checking the app constantly.',
      description: (
        <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
          <p>
            The <strong>🔔 bell icon</strong> in the top-right corner of every page shows
            your notifications. The red badge tells you how many are unread.
          </p>
          <ul className="space-y-2 pl-1">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>Get notified when someone <strong>@mentions you</strong> in a grant note</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>Get notified when someone <strong>replies to a note thread</strong> you're part of</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>Click any notification to jump directly to the relevant grant</span>
            </li>
          </ul>
          <p>
            You'll also receive <strong>email notifications</strong> for mentions and
            replies so you never miss an important update.
          </p>
        </div>
      ),
      tip: 'Click "Mark all as read" in the dropdown to clear all notifications at once.',
    },

    // ── Step 7: Help Chat ─────────────────────────────────────────────────────
    {
      icon: <MessageCircleQuestion className="h-10 w-10 text-blue-600" />,
      title: 'Your AI Assistant',
      subtitle: 'Ask anything about GrantGuardian or grant compliance.',
      description: (
        <div className="space-y-3 text-slate-600 text-sm leading-relaxed">
          <p>
            See the <strong>chat bubble button</strong> in the bottom-right corner of
            every page? That's your AI assistant, powered by Claude. It knows
            GrantGuardian inside and out, and it's also an expert on grant policy and
            compliance.
          </p>
          <p className="font-medium text-slate-700">Try asking it things like:</p>
          <div className="space-y-1.5">
            {role === 'admin' && [
              'How do I invite a new team member?',
              'What are the reporting requirements for federal grants?',
              'Can you explain allowable vs. unallowable costs under 2 CFR 200?',
              'How do I export my grant portfolio data?',
            ].map((prompt) => (
              <div
                key={prompt}
                className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-md px-3 py-2"
              >
                <Star className="h-3 w-3 text-blue-400 flex-shrink-0" />
                <span className="text-xs text-blue-800 italic">"{prompt}"</span>
              </div>
            ))}
            {role === 'staff' && [
              'How do I add an expense to a grant?',
              "What's the difference between special conditions and compliance requirements?",
              'How do I @mention a teammate in a note?',
              'What happens during grant closeout?',
            ].map((prompt) => (
              <div
                key={prompt}
                className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-md px-3 py-2"
              >
                <Star className="h-3 w-3 text-blue-400 flex-shrink-0" />
                <span className="text-xs text-blue-800 italic">"{prompt}"</span>
              </div>
            ))}
            {role === 'viewer' && [
              'How do I export grant information as a report?',
              'Where can I see upcoming compliance deadlines?',
              'What does "percent complete" mean on a grant?',
              'How do I read the compliance health panel?',
            ].map((prompt) => (
              <div
                key={prompt}
                className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-md px-3 py-2"
              >
                <Star className="h-3 w-3 text-blue-400 flex-shrink-0" />
                <span className="text-xs text-blue-800 italic">"{prompt}"</span>
              </div>
            ))}
          </div>
        </div>
      ),
      tip: "If the AI can't resolve your issue, it can create a support ticket for the GrantGuardian team directly from the chat.",
    },
  ]

  return steps
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WelcomeTourModalProps {
  /** If true, always show the modal (used for "Take the tour" replay) */
  forceOpen?: boolean
  onClose?: () => void
}

export function WelcomeTourModal({ forceOpen = false, onClose }: WelcomeTourModalProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [role, setRole] = useState<Role>('staff')
  const [firstName, setFirstName] = useState('')
  const [steps, setSteps] = useState<TourStep[]>([])
  const [ready, setReady] = useState(false)
  const pathname = usePathname()

  // Don't show on marketing / auth pages
  const hiddenPaths = ['/', '/login', '/signup', '/onboarding', '/reset-password', '/update-password']
  if (!forceOpen && hiddenPaths.includes(pathname)) return null

  useEffect(() => {
    const init = async () => {
      // Don't show if already completed (unless forced)
      if (!forceOpen && typeof window !== 'undefined') {
        const completed = localStorage.getItem(TOUR_KEY)
        if (completed) return
      }

      // Need a logged-in user with an active org to show the tour
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user name
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name')
        .eq('id', user.id)
        .single()

      const name = profile?.first_name || user.user_metadata?.first_name || ''
      setFirstName(name)

      // Get user's role in their primary org
      const { data: membership } = await supabase
        .from('user_organization_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('is_primary', true)
        .single()

      let userRole: Role = 'staff'
      if (membership?.role === 'admin') userRole = 'admin'
      else if (membership?.role === 'viewer') userRole = 'viewer'
      setRole(userRole)

      const builtSteps = buildSteps(userRole, name)
      setSteps(builtSteps)
      setReady(true)
      setOpen(true)
    }

    init()
  }, [forceOpen])

  const handleClose = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOUR_KEY, 'true')
    }
    setOpen(false)
    onClose?.()
  }

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      handleClose()
    }
  }

  const handlePrev = () => {
    if (step > 0) setStep(step - 1)
  }

  if (!ready || steps.length === 0) return null

  const current = steps[step]
  const isLast = step === steps.length - 1

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
        {/* Top accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-violet-500 to-indigo-600 rounded-t-lg" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${roleColor(role)}`}>
              {roleLabel(role)}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Skip tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step content */}
        <div className="px-6 py-5 min-h-[340px]">
          {/* Icon + title */}
          <div className="flex items-start gap-4 mb-5">
            <div className="flex-shrink-0 h-16 w-16 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center">
              {current.icon}
            </div>
            <div className="pt-1">
              <h2 className="text-xl font-bold text-slate-900">{current.title}</h2>
              {current.subtitle && (
                <p className="text-sm text-slate-500 mt-0.5">{current.subtitle}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mb-4">{current.description}</div>

          {/* Tip */}
          {current.tip && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-800">
              <span className="flex-shrink-0 mt-0.5">💡</span>
              <span>{current.tip}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between border-t border-slate-100 pt-4">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all ${
                  i === step
                    ? 'w-5 h-2 bg-blue-600'
                    : 'w-2 h-2 bg-slate-200 hover:bg-slate-300'
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            {step === 0 && (
              <Button variant="ghost" size="sm" onClick={handleClose} className="text-slate-400">
                Skip tour
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {isLast ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Get started
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Trigger to replay the tour ───────────────────────────────────────────────

export function TakeTourButton() {
  const [show, setShow] = useState(false)

  return (
    <>
      <button
        onClick={() => setShow(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
        title="Replay the onboarding tour"
      >
        <HelpCircle className="h-4 w-4" />
        Take the tour
      </button>
      {show && (
        <WelcomeTourModal forceOpen onClose={() => setShow(false)} />
      )}
    </>
  )
}

// Export the key so other components can clear it if needed
export { TOUR_KEY }
