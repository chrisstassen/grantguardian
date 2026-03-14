import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('Service role key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
console.log('Service role key starts with:', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20))


// Create admin client with service role
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: Request) {
  try {
    const { userId, newEmail } = await request.json()

    console.log('Updating email for user:', userId, 'to:', newEmail)

    if (!userId || !newEmail) {
      return NextResponse.json(
        { error: 'Missing userId or newEmail' },
        { status: 400 }
      )
    }

    // Verify the request is from an authenticated user
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('Calling updateUserById with userId:', userId)

    // Update email in auth.users using admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email: newEmail }
    )

    console.log('Update result:', { authData, authError })

    if (authError) {
      console.error('Error updating auth email:', authError)
      return NextResponse.json(
        { error: authError.message },
        { status: 500 }
      )
    }

    // Update email in user_profiles
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({ email: newEmail })
      .eq('id', userId)

    if (profileError) {
      console.error('Error updating profile email:', profileError)
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: 'Email updated successfully in both auth and profile'
    })

  } catch (error: any) {
    console.error('Email update error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}