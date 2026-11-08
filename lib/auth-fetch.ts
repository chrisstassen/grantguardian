import { supabase } from '@/lib/supabase'

// fetch() for the app's own API routes that adds the signed-in user's access
// token, so the route can verify who is calling. Use it instead of fetch()
// for any call to /api/*.
export async function authFetch(input: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(input, { ...init, headers })
}
