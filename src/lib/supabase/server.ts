/**
 * Supabase Server Client
 * 
 * Used for server-side operations with elevated privileges.
 * NEVER import this in client-side code.
 * 
 * @module lib/supabase/server
 */

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'
import { getServiceRoleKey } from './server-config'

// ═══════════════════════════════════════════════════════════════
// SECURITY: Test mode removed - all auth goes through Supabase
// ═══════════════════════════════════════════════════════════════

/**
 * Create a Supabase client for server-side operations
 * Uses cookie-based auth for user context
 */
export async function createServerClient() {
  const cookieStore = await cookies()

  return createSupabaseServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

// Backward compatibility alias
export const createClient = createServerClient;

/**
 * Create a Supabase admin client with service role privileges
 */
export function createAdminClient() {
  const serviceRoleKey = getServiceRoleKey();
  if (!SUPABASE_URL || !serviceRoleKey) {
    throw new Error('Missing Supabase URL or Service Role Key for admin client')
  }
  
  return createSupabaseClient(SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Get the current authenticated user on the server
 */
export async function getServerUser() {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error) {
    return null
  }
  
  return user
}

/**
 * Require authentication - supports both cookies and Authorization headers
 * Throws if not authenticated
 * 
 * @param request - Optional Request object to check Authorization header
 */
export async function requireAuth(request?: Request) {
  // Try Authorization header first (for API testing and external clients)
  if (request) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        // Reuse a shared client for token verification (no need for separate client)
        const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
        const tokenVerifyClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: { user }, error } = await tokenVerifyClient.auth.getUser(token);
        
        if (user && !error) {
          return user;
        }
      } catch (error) {
        // Fall through to cookie-based auth
      }
    }
  }
  
  // Fallback to cookie-based auth for web clients
  const user = await getServerUser()
  
  if (!user) {
    throw new Error('UNAUTHORIZED')
  }
  
  return user
}
