/**
 * Supabase Auth Helpers for API Routes
 *
 * Use these functions to get the authenticated user in API routes.
 * All data provisioning is handled by Supabase SQL triggers (on_auth_user_created).
 *
 * @module lib/supabase/auth-helpers
 */

import { createClient } from './server'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface AuthenticatedUser {
  id: string
  email: string
  name?: string | null
  avatarUrl?: string | null
}

// ═══════════════════════════════════════════════════════════════
// Auth Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Get the current authenticated user from Supabase session.
 * Returns null if not authenticated.
 */
export async function getSupabaseUser(): Promise<AuthenticatedUser | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    return {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name || null,
      avatarUrl: user.user_metadata?.avatar_url || null,
    }
  } catch (error) {
    console.error('[Auth Helper] Error getting Supabase user:', error)
    return null
  }
}

/**
 * Require authentication - throws error if not authenticated.
 * Use this in API routes that require authentication.
 */
export async function requireSupabaseAuth(): Promise<AuthenticatedUser> {
  const user = await getSupabaseUser()

  if (!user) {
    throw new Error('UNAUTHORIZED')
  }

  return user
}

/**
 * Get the authenticated user.
 * User data is provisioned by the SQL trigger `on_auth_user_created`.
 * No Prisma or manual user creation needed.
 */
export async function getAuthenticatedUser() {
  const authUser = await requireSupabaseAuth()

  return {
    auth: authUser,
    // Expose id directly for convenience
    id: authUser.id,
    email: authUser.email,
  }
}
