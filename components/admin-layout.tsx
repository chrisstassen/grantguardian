'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { NotificationsDropdown } from '@/components/notifications-dropdown'
import { ArrowLeft } from 'lucide-react'

interface AdminLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
  showBackButton?: boolean
  backUrl?: string
}

export function AdminLayout({ 
  children, 
  title, 
  subtitle,
  showBackButton = false,
  backUrl = '/admin'
}: AdminLayoutProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Main Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">GrantGuardian Admin</h1>
            <p className="text-sm text-slate-600">System Administration</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
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
              Back to Admin Dashboard
            </Button>
          )}
          <h2 className="text-3xl font-bold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="text-slate-600 mt-2">{subtitle}</p>
          )}
        </div>

        {/* Page-specific content */}
        {children}
      </main>
    </div>
  )
}