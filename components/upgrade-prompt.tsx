'use client'

import { Sparkles, ArrowRight, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface UpgradePromptProps {
  /** Short reason why they're seeing this — shown in the headline */
  reason: string
  /** Optional extra context shown below the reason */
  description?: string
  /** Visual style */
  variant?: 'banner' | 'card' | 'inline'
}

export function UpgradePrompt({
  reason,
  description,
  variant = 'card',
}: UpgradePromptProps) {
  const handleUpgrade = () => {
    window.open('/#pricing', '_blank')
  }

  if (variant === 'banner') {
    return (
      <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-violet-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-violet-900">{reason}</p>
            {description && <p className="text-xs text-violet-600 mt-0.5">{description}</p>}
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleUpgrade}
          className="bg-violet-600 hover:bg-violet-500 text-white flex-shrink-0"
        >
          Upgrade to Pro
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Lock className="h-4 w-4 text-violet-400" />
        <span>{reason}</span>
        <button
          onClick={handleUpgrade}
          className="text-violet-600 hover:text-violet-500 font-medium underline underline-offset-2"
        >
          Upgrade to Pro
        </button>
      </div>
    )
  }

  // Default: card
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-6 bg-gradient-to-b from-violet-50 to-white border border-violet-100 rounded-xl">
      <div className="h-12 w-12 rounded-full bg-violet-100 flex items-center justify-center mb-4">
        <Sparkles className="h-6 w-6 text-violet-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-1">{reason}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-xs mb-4">{description}</p>
      )}
      <Button
        onClick={handleUpgrade}
        className="bg-violet-600 hover:bg-violet-500 text-white"
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Upgrade to Pro
      </Button>
      <p className="text-xs text-slate-400 mt-3">Unlimited grants · Unlimited members · AI features</p>
    </div>
  )
}
