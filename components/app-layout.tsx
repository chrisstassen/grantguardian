'use client'

import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { NotificationsDropdown } from '@/components/notifications-dropdown'
import { ArrowLeft, ShieldCheck, LayoutDashboard } from 'lucide-react'
import { useOrganization } from '@/contexts/organization-context'

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  showBackButton?: boolean
  backUrl?: string
  showSettings?: boolean
}

export function AppLayout({ 
  children, 
  title,
  subtitle,
  showBackButton = false,
  backUrl = '/dashboard',
  showSettings = false
}: AppLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { activeOrg } = useOrganization()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Main Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">GrantGuardian</h1>
              <p className="text-sm text-slate-600">{activeOrg?.name}</p>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              <a
                href="/dashboard"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${pathname === '/dashboard' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </a>
              <a
                href="/compliance"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${pathname === '/compliance' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
              >
                <ShieldCheck className="h-4 w-4" />
                Compliance
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            
            {showSettings && (
              <Button onClick={() => router.push('/settings')} variant="outline">
                Settings
              </Button>
            )}
            <Button onClick={() => router.push('/profile')} variant="outline">
              Profile
            </Button>
            <Button onClick={handleSignOut} variant="outline">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Page Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button & Page Title */}
        <div className="mb-8">
            {showBackButton && (
            <Button 
                variant="ghost" 
                onClick={() => router.push(backUrl)}
                className="mb-4"
            >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
            </Button>
            )}
            
            {title && (
            <>
                <h2 className="text-3xl font-bold text-slate-900">{title}</h2>
                {subtitle && (
                <p className="text-slate-600 mt-2">{subtitle}</p>
                )}
            </>
            )}
        </div>

        {/* Page-specific content */}
        {children}
        </main>
    </div>
  )
}