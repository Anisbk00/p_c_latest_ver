/**
 * Supabase Data Helper
 *
 * Provides an authenticated server-side typed Supabase client.
 * Replaces `@/lib/db` (Prisma) across all API routes.
 * 
 * Supports both cookie-based auth (web) and Authorization header auth (mobile).
 *
 * @module lib/supabase/supabase-data
 */

import { createServerClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

export type TypedSupabase = SupabaseClient<Database>

/**
 * Get an authenticated typed Supabase client + current user.
 * Throws 'UNAUTHORIZED' if the user is not signed in.
 * 
 * Supports both cookie-based auth (web) and Bearer token auth (mobile).
 * On mobile, the Authorization header is used since cookies don't work cross-origin.
 */
export async function getSupabaseUser() {
  // First, try to get user from Authorization header (for mobile/API clients)
  try {
    const headersList = await headers()
    const authHeader = headersList.get('Authorization')
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      
      // Create a Supabase client to verify the token
      const authClient = createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
      const { data: { user }, error } = await authClient.auth.getUser(token)
      
      if (user && !error) {
        // Create a client that carries the Bearer token in the Authorization header
        // so that RLS policies see auth.uid() correctly.
        // The cookie-based server client has NO session for Bearer-token requests,
        // which causes "new row violates row-level security policy" on INSERT.
        const tokenClient = createSupabaseClient<Database>(
          SUPABASE_URL,
          SUPABASE_ANON_KEY,
          {
            global: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        )
        return { supabase: tokenClient as TypedSupabase, user }
      }
    }
  } catch (error) {
    // Fall through to cookie-based auth
    console.warn('[getSupabaseUser] Authorization header auth failed, trying cookies:', error)
  }
  
  // Fallback to cookie-based auth (for web clients)
  const supabase = (await createServerClient()) as TypedSupabase
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('UNAUTHORIZED')
  }

  return { supabase, user }
}

/**
 * Get an unauthenticated typed Supabase client.
 * Useful for public data (global_foods, barcode lookups).
 */
export async function getSupabase(): Promise<TypedSupabase> {
  return (await createServerClient()) as TypedSupabase
}
