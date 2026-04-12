import { createClient } from '@supabase/supabase-js'

// Server-side admin client — bypasses Row Level Security.
// ONLY import this in API routes (app/api/**). Never import in 'use client' components.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
