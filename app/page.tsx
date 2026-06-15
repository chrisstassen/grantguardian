'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ComingSoonDialog } from '@/components/coming-soon-dialog'
import {
  ShieldCheck,
  LayoutDashboard,
  CalendarDays,
  Users,
  Sparkles,
  FileText,
  CheckCircle2,
  ChevronRight,
  Menu,
  X,
  ArrowRight,
  BarChart3,
  ClipboardList,
  MessageSquare,
  Zap,
  Star,
  Lock,
} from 'lucide-react'

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav({ onSignUp }: { onSignUp: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-slate-900/95 backdrop-blur-sm shadow-lg' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <ShieldCheck className="h-4.5 w-4.5 text-white" style={{ height: '18px', width: '18px' }} />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">GrantGuardian</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-slate-300 hover:text-white text-sm font-medium transition-colors">Features</a>
          <a href="#how-it-works" className="text-slate-300 hover:text-white text-sm font-medium transition-colors">How it works</a>
          <a href="#pricing" className="text-slate-300 hover:text-white text-sm font-medium transition-colors">Pricing</a>
        </nav>

        {/* CTA buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="text-slate-300 hover:text-white text-sm font-medium transition-colors px-4 py-2"
          >
            Log in
          </Link>
          <button
            onClick={onSignUp}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            Get started free
          </button>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-slate-300 hover:text-white"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-slate-900 border-t border-slate-800 px-6 py-4 space-y-4">
          <a href="#features" className="block text-slate-300 hover:text-white text-sm font-medium" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#how-it-works" className="block text-slate-300 hover:text-white text-sm font-medium" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#pricing" className="block text-slate-300 hover:text-white text-sm font-medium" onClick={() => setMenuOpen(false)}>Pricing</a>
          <div className="pt-2 flex flex-col gap-2 border-t border-slate-800">
            <Link href="/login" className="block text-slate-300 hover:text-white text-sm font-medium py-2">Log in</Link>
            <button onClick={onSignUp} className="block w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg text-center transition-colors">Get started free</button>
          </div>
        </div>
      )}
    </header>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section className="relative min-h-screen flex items-center bg-slate-900 overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-24 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold px-4 py-2 rounded-full mb-8">
          <Sparkles className="h-3.5 w-3.5" />
          AI-powered grant compliance for nonprofits
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-extrabold text-white leading-[1.08] tracking-tight mb-6 max-w-4xl mx-auto">
          Manage grants.{' '}
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            Stay compliant.
          </span>{' '}
          Close out with confidence.
        </h1>

        {/* Subheadline */}
        <p className="text-slate-400 text-xl leading-relaxed max-w-2xl mx-auto mb-10">
          GrantGuardian gives nonprofit teams a single source of truth for every grant —
          from award to closeout. AI-powered compliance tracking, deadline management,
          and team collaboration built for the way you work.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onSignUp}
            className="group flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
          >
            Get notified at launch
            <ArrowRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <a
            href="#how-it-works"
            className="flex items-center gap-2 text-slate-300 hover:text-white font-medium px-8 py-4 rounded-xl border border-slate-700 hover:border-slate-500 transition-all text-lg"
          >
            See how it works
          </a>
        </div>

        {/* Social proof */}
        <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-8 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            No credit card required
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Free plan available
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Set up in minutes
          </div>
        </div>

        {/* App preview card */}
        <div className="mt-20 max-w-5xl mx-auto">
          <div className="relative bg-slate-800/60 backdrop-blur border border-slate-700/60 rounded-2xl p-6 shadow-2xl shadow-black/40">
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 bg-slate-700/50 rounded-md h-6 mx-4 flex items-center px-3">
                <span className="text-slate-500 text-xs">app.grantguardian.io/dashboard</span>
              </div>
            </div>

            {/* Dashboard preview */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: 'Active Grants', value: '12', color: 'text-blue-400' },
                { label: 'Total Awarded', value: '$2.4M', color: 'text-violet-400' },
                { label: 'Compliance Score', value: '94%', color: 'text-green-400' },
              ].map((stat) => (
                <div key={stat.label} className="bg-slate-900/60 rounded-xl p-4 text-left">
                  <p className="text-slate-500 text-xs mb-1">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {[
                { name: 'EPA Community Grant', agency: 'Environmental Protection Agency', status: 'Active', pct: 68, color: 'bg-blue-500' },
                { name: 'Housing First Initiative', agency: 'HUD', status: 'Active', pct: 42, color: 'bg-violet-500' },
                { name: 'Youth Employment Program', agency: 'Dept. of Labor', status: 'Closeout', pct: 95, color: 'bg-green-500' },
              ].map((grant) => (
                <div key={grant.name} className="bg-slate-900/60 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 text-left">
                    <p className="text-slate-200 text-sm font-medium">{grant.name}</p>
                    <p className="text-slate-500 text-xs">{grant.agency}</p>
                  </div>
                  <div className="w-32 hidden sm:block">
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full ${grant.color} rounded-full`} style={{ width: `${grant.pct}%` }} />
                    </div>
                    <p className="text-slate-500 text-xs mt-1 text-right">{grant.pct}% expended</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    grant.status === 'Active' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'
                  }`}>{grant.status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none rounded-b-2xl" />
        </div>
      </div>
    </section>
  )
}

// ─── Features ─────────────────────────────────────────────────────────────────

const features = [
  {
    icon: <LayoutDashboard className="h-6 w-6 text-blue-400" />,
    title: 'Grant Portfolio Dashboard',
    description: 'See all your grants at a glance — award amounts, spending, balance, and performance periods in one unified view.',
    color: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-green-400" />,
    title: 'Compliance Tracking',
    description: 'Never miss a reporting deadline. Track requirements across all grants with automatic status updates and overdue alerts.',
    color: 'bg-green-500/10 border-green-500/20',
  },
  {
    icon: <Sparkles className="h-6 w-6 text-violet-400" />,
    title: 'AI-Powered Assistance',
    description: 'Built-in Claude AI assistant answers questions about GrantGuardian features, grant policy, allowable costs, and compliance requirements.',
    color: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: <CalendarDays className="h-6 w-6 text-orange-400" />,
    title: 'Deadline Calendar',
    description: 'A consolidated calendar of every grant deadline, payment schedule, and reporting date across your entire portfolio.',
    color: 'bg-orange-500/10 border-orange-500/20',
  },
  {
    icon: <ClipboardList className="h-6 w-6 text-cyan-400" />,
    title: 'Grant Closeout Checklist',
    description: 'AI-generated closeout checklists tailored to each grant. Track financial reconciliation, final reports, and documentation — nothing gets missed.',
    color: 'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-pink-400" />,
    title: 'Expense & Budget Tracking',
    description: 'Log expenses by category, track against budget lines, and generate financial reports with a single click.',
    color: 'bg-pink-500/10 border-pink-500/20',
  },
  {
    icon: <MessageSquare className="h-6 w-6 text-yellow-400" />,
    title: 'Team Collaboration',
    description: 'Grant notes with @mentions, threaded replies, and real-time notifications keep your whole team aligned without leaving the platform.',
    color: 'bg-yellow-500/10 border-yellow-500/20',
  },
  {
    icon: <FileText className="h-6 w-6 text-slate-400" />,
    title: 'Document Management',
    description: 'Attach grant agreements, reports, receipts, and correspondence directly to each grant. Everything in one place.',
    color: 'bg-slate-500/10 border-slate-500/20',
  },
  {
    icon: <Users className="h-6 w-6 text-blue-400" />,
    title: 'Role-Based Access',
    description: 'Invite your full team with the right level of access — Admins, Members, and read-only Viewers. Perfect for auditors and board members.',
    color: 'bg-blue-500/10 border-blue-500/20',
  },
]

function Features() {
  return (
    <section id="features" className="bg-slate-950 py-28">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Everything you need</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
            Built for the full grant lifecycle
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            From the moment a grant is awarded to the final closeout report, GrantGuardian
            keeps your team compliant, organized, and confident.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className={`border rounded-2xl p-6 transition-all hover:border-opacity-60 hover:-translate-y-0.5 ${f.color}`}
            >
              <div className="mb-4">{f.icon}</div>
              <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── How it works ─────────────────────────────────────────────────────────────

const steps = [
  {
    number: '01',
    title: 'Add your grants',
    description: 'Create a grant record in minutes — funding agency, award amount, performance period, and scope of work. Import your existing portfolio quickly.',
    icon: <FileText className="h-8 w-8 text-blue-400" />,
  },
  {
    number: '02',
    title: 'Track compliance in real time',
    description: 'Set up requirements, deliverables, and deadlines. GrantGuardian flags overdue items and surfaces what needs your attention across all grants.',
    icon: <ShieldCheck className="h-8 w-8 text-green-400" />,
  },
  {
    number: '03',
    title: 'Close out with confidence',
    description: 'When a grant period ends, the AI-generated closeout checklist guides your team through every step — financial reconciliation, final reports, and documentation.',
    icon: <CheckCircle2 className="h-8 w-8 text-violet-400" />,
  },
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-slate-900 py-28">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-violet-400 text-sm font-semibold uppercase tracking-widest mb-3">Simple by design</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
            Up and running in minutes
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            No complex onboarding. No lengthy training. GrantGuardian is designed for
            nonprofits, not enterprise IT departments.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={step.number} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-full w-full h-px bg-gradient-to-r from-slate-600 to-transparent -z-10 translate-x-[-50%]" />
              )}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 hover:border-slate-600 transition-all">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-14 w-14 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center flex-shrink-0">
                    {step.icon}
                  </div>
                  <span className="text-4xl font-black text-slate-700">{step.number}</span>
                </div>
                <h3 className="text-white font-bold text-xl mb-3">{step.title}</h3>
                <p className="text-slate-400 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const plans = [
  {
    name: 'Starter',
    price: '$49',
    period: '/month',
    description: 'Perfect for small nonprofits managing a handful of grants.',
    highlight: false,
    features: [
      'Up to 5 active grants',
      'Up to 5 team members',
      'Compliance tracking & calendar',
      'Expense & payment tracking',
      'Deliverables management',
      'Document attachments',
      'Team notes & @mentions',
      'CSV data exports',
      'Email support',
    ],
    cta: 'Get early access',
  },
  {
    name: 'Pro',
    price: '$129',
    period: '/month',
    description: 'For growing organizations managing a full grant portfolio.',
    highlight: true,
    features: [
      'Unlimited grants',
      'Unlimited team members',
      'Everything in Starter',
      'AI-powered closeout checklists',
      'AI compliance assistant',
      'Grant closeout workflows',
      'Advanced reporting & exports',
      'Role-based access control',
      'Priority email & chat support',
    ],
    cta: 'Get early access',
  },
]

function Pricing({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section id="pricing" className="bg-slate-950 py-28">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Transparent pricing</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
            Simple plans, no surprises
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Start free. Upgrade when you're ready. Cancel any time — no contracts, no setup fees.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 flex flex-col ${
                plan.highlight
                  ? 'bg-gradient-to-b from-blue-600/20 to-violet-600/10 border-2 border-blue-500/50'
                  : 'bg-slate-800/50 border border-slate-700/50'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-blue-500 to-violet-500 text-white text-xs font-bold px-4 py-1.5 rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-white font-bold text-2xl mb-1">{plan.name}</h3>
                <p className="text-slate-400 text-sm mb-4">{plan.description}</p>
                <div className="flex items-end gap-1">
                  <span className="text-white text-5xl font-extrabold">{plan.price}</span>
                  <span className="text-slate-400 text-lg mb-1">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 className={`h-4 w-4 mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-blue-400' : 'text-green-500'}`} />
                    <span className="text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={onSignUp}
                className={`block w-full text-center font-semibold py-3.5 rounded-xl transition-all ${
                  plan.highlight
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                    : 'bg-slate-700 hover:bg-slate-600 text-white'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-slate-500 text-sm mt-8">
          Need a custom plan for a large organization?{' '}
          <a href="mailto:hello@grantguardian.io" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
            Contact us
          </a>
        </p>
      </div>
    </section>
  )
}

// ─── Final CTA ────────────────────────────────────────────────────────────────

function FinalCTA({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section className="bg-slate-900 py-28">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <div className="relative bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-blue-500/20 rounded-3xl px-8 py-16 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="flex items-center justify-center gap-2 text-blue-400 text-sm font-semibold mb-4">
              <Zap className="h-4 w-4" />
              Start managing grants smarter today
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
              Ready to take control of your grant portfolio?
            </h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto mb-10">
              Join nonprofits using GrantGuardian to stay compliant, hit deadlines, and close out grants without the last-minute scramble.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onSignUp}
                className="group flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all shadow-lg shadow-blue-500/25"
              >
                Get notified at launch
                <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <Link
                href="/login"
                className="text-slate-300 hover:text-white font-medium px-6 py-4 transition-colors text-lg"
              >
                Already have an account? Log in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <ShieldCheck className="text-white" style={{ height: '14px', width: '14px' }} />
            </div>
            <span className="text-white font-bold text-lg">GrantGuardian</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#features" className="hover:text-slate-300 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-slate-300 transition-colors">Pricing</a>
            <a href="mailto:hello@grantguardian.io" className="hover:text-slate-300 transition-colors">Contact</a>
            <Link href="/login" className="hover:text-slate-300 transition-colors">Log in</Link>
          </div>

          <div className="flex items-center gap-2 text-slate-600 text-sm">
            <Lock className="h-3.5 w-3.5" />
            <span>© {new Date().getFullYear()} GrantGuardian. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const openDialog = useCallback(() => setDialogOpen(true), [])

  return (
    <div className="min-h-screen">
      <Nav onSignUp={openDialog} />
      <Hero onSignUp={openDialog} />
      <Features />
      <HowItWorks />
      <Pricing onSignUp={openDialog} />
      <FinalCTA onSignUp={openDialog} />
      <Footer />
      <ComingSoonDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
