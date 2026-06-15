import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const { first_name, last_name, email, org_name } = await request.json()

    if (!first_name || !last_name || !email || !org_name) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('waitlist_signups')
      .insert([{ first_name, last_name, email: email.toLowerCase().trim(), org_name }])

    if (error) {
      // Unique constraint = already signed up
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'ALREADY_SIGNED_UP', message: "You're already on the list!" },
          { status: 409 }
        )
      }
      console.error('Waitlist insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Waitlist error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
