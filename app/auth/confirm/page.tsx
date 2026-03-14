'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthConfirmPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Processing email confirmation...')

  useEffect(() => {
    const handleEmailConfirm = async () => {
      // Supabase puts the token in the URL hash
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')

      console.log('Hash params:', { accessToken: !!accessToken, refreshToken: !!refreshToken, type })

      if (type === 'email_change' && accessToken && refreshToken) {
        // Set the session with the tokens from the email link
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })

        if (error) {
          console.error('Error setting session:', error)
          setMessage('Error confirming email change: ' + error.message)
          return
        }

        console.log('Session set successfully:', data)

        // Get the updated user
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError || !user) {
          setMessage('Error getting user after confirmation')
          return
        }

        console.log('User email after confirmation:', user.email)

        // Update user_profiles to match
        await supabase
          .from('user_profiles')
          .update({ email: user.email })
          .eq('id', user.id)

        setMessage('Email confirmed and updated successfully! Redirecting...')
        
        setTimeout(() => {
          router.push('/profile')
        }, 2000)
      } else {
        // Check for errors in the hash
        const error = hashParams.get('error')
        const errorDescription = hashParams.get('error_description')

        if (error) {
          setMessage(`Error: ${errorDescription || error}`)
          console.error('Confirmation error:', error, errorDescription)
        } else {
          setMessage('Invalid confirmation link. Please try again or check the console for details.')
        }
      }
    }

    handleEmailConfirm()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-md mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Email Confirmation</h1>
        <p className="text-slate-600">{message}</p>
      </div>
    </div>
  )
}