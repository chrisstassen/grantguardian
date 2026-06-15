'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sparkles, CheckCircle2, X, Rocket } from 'lucide-react'

interface ComingSoonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ComingSoonDialog({ open, onOpenChange }: ComingSoonDialogProps) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    org_name: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'ALREADY_SIGNED_UP') {
          setError("You're already on the list! We'll be in touch soon.")
        } else {
          setError(data.message || data.error || 'Something went wrong. Please try again.')
        }
        setLoading(false)
        return
      }

      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset after close animation
    setTimeout(() => {
      setSubmitted(false)
      setForm({ first_name: '', last_name: '', email: '', org_name: '' })
      setError('')
    }, 300)
  }

  const isValid = form.first_name && form.last_name && form.email && form.org_name

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        {/* Top gradient bar */}
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-violet-500 to-indigo-600" />

        {submitted ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center text-center px-8 py-10">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">You're on the list!</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              Thanks, <strong>{form.first_name}</strong>! We'll reach out to{' '}
              <strong>{form.email}</strong> when GrantGuardian launches — and
              you'll be first in line for our pre-launch discount.
            </p>
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            {/* Header */}
            <div className="px-7 pt-7 pb-0">
              <div className="flex items-start justify-between mb-4">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                  <Rocket className="h-5 w-5 text-white" />
                </div>
                <button
                  onClick={handleClose}
                  className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <h2 className="text-xl font-bold text-slate-900 mb-2">
                GrantGuardian is almost here
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                We're gearing up to launch. Subscribe below to be the first to
                know when we go live — and get exclusive access to pre-launch
                sign-up discounts.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-7 py-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="first_name">First name</Label>
                  <Input
                    id="first_name"
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    placeholder="Jane"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input
                    id="last_name"
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    placeholder="Smith"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="jane@nonprofit.org"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="org_name">Organization name</Label>
                <Input
                  id="org_name"
                  name="org_name"
                  value={form.org_name}
                  onChange={handleChange}
                  placeholder="United Way of Central Texas"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading || !isValid}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white"
              >
                {loading ? (
                  'Submitting…'
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Notify me at launch
                  </>
                )}
              </Button>

              <p className="text-xs text-slate-400 text-center">
                No spam, ever. Unsubscribe any time.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
