/**
 * Supabase Browser Client (Singleton)
 * 
 * Creates a singleton Supabase client for use in browser.
 * Uses @supabase/supabase-js directly for Turbopack compatibility.
 * 
 * @module lib/supabase/client
 */

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'
import { clearCachedAuth } from '@/lib/offline-auth'
import { apiFetch } from '@/lib/mobile-api'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Check if Supabase is properly configured
 * Always true — credentials are hardcoded in config.ts
 */
export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY)
}

/**
 * Get the Supabase browser client (singleton pattern)
 * Ensures only one client instance exists throughout the app.
 * Credentials are guaranteed via hardcoded fallbacks in config.ts.
 */
export function getClient() {
  if (client) {
    return client
  }

  // Use @supabase/ssr to ensure cookies are set for server-side auth
  client = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)

  return client
}

/**
 * Get the current authenticated user
 * Returns null if not authenticated
 */
export async function getCurrentUser() {
  try {
    const supabase = getClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      if (!isLockError(error)) {
        console.error('Error getting user:', error.message)
      }
      return null
    }
    
    return user
  } catch (error) {
    if (!isLockError(error)) {
      console.error('Error getting user:', error)
    }
    return null
  }
}

/**
 * Get the current session
 * Returns null if no session exists
 */
export async function getSession() {
  try {
    const supabase = getClient()
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      if (!isLockError(error)) {
        console.error('Error getting session:', error.message)
      }
      return null
    }
    
    return session
  } catch (error) {
    if (!isLockError(error)) {
      console.error('Error getting session:', error)
    }
    return null
  }
}

/**
 * Subscribe to auth state changes
 * Returns unsubscribe function for cleanup
 */
export function onAuthStateChange(
  callback: (event: string, session: unknown) => void
) {
  const supabase = getClient()
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
  
  return () => {
    subscription.unsubscribe()
  }
}

/**
 * Check if the current user has a specific role.
 *
 * @deprecated **NOT secure for server-side authorization.** This function reads
 * `user.user_metadata.role`, which is a client-side claim that can be modified by
 * the user (e.g. via the Supabase dashboard or by intercepting API calls).
 *
 * For server-side authorization checks, use Row-Level Security (RLS) policies
 * or query a server-controlled `roles` / `profiles` table instead.
 *
 * Acceptable uses (client-side only):
 *   • Conditionally rendering UI elements (show/hide admin menu, etc.)
 *   • Optimistic pre-checks before calling a secure endpoint
 *
 * @param role - The role name to check (e.g. 'admin')
 * @returns `true` if the user's metadata claims the given role
 */
export async function hasRole(role: string): Promise<boolean> {
  const supabase = getClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return false

  const userRole = user.user_metadata?.role
  return userRole === role
}

/**
 * Sign out the current user with full cleanup
 * 
 * This function performs a complete sign-out:
 * 1. Calls server-side revocation endpoint (revokes all sessions)
 * 2. Calls Supabase client signOut
 * 3. Clears all local storage and cookies
 * 
 * @returns Promise with error status
 */
export async function signOut(): Promise<{ error: string | null }> {
  // SECURITY FIX: Revoke server-side FIRST, then clear local storage
  // This ensures tokens are invalidated before local state is cleared
  // If network fails, we still clear local storage as fallback
  
  let revokeSucceeded = false;
  
  try {
    // ─── Step 1: Server-side Session Revocation FIRST ───────────
    // This ensures all sessions are invalidated server-side
    // Use AbortController with timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    try {
      const response = await apiFetch('/api/auth/revoke', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      revokeSucceeded = response.ok;
      
      if (!response.ok) {
        console.warn('[SignOut] Server revocation failed:', response.status);
      }
    } catch (revokeError) {
      clearTimeout(timeoutId)
      console.warn('[SignOut] Server revocation error:', revokeError);
      // Continue with local cleanup
    }
    
    // ─── Step 2: Client-side Supabase Sign Out ─────────────────
    const supabase = getClient()
    try {
      await supabase.auth.signOut()
    } catch (signOutError) {
      // Lock errors are expected in React Strict Mode - ignore them
      if (!isLockError(signOutError)) {
        console.warn('[SignOut] Supabase signOut error:', signOutError);
      }
    }
    
  } catch (error) {
    // Log but continue with local cleanup
    if (!isLockError(error)) {
      console.warn('[SignOut] Error during server/client signout:', error);
    }
  }
  
  // ─── Step 3: Clear Local Storage (always execute) ───────────────
  // This ensures we have a clean state even if network operations failed
  clearAuthStorage()
  clearSessionStorage()
  clearAllCookies()
  
  // ─── Step 4: Clear Offline Auth Cache ───────────────────────────
  // CRITICAL: Clear the IndexedDB offline auth cache to prevent
  // offline login after logout
  try {
    await clearCachedAuth()
  } catch {
    // Ignore errors - cache might not exist
  }
  
  return { error: revokeSucceeded ? null : 'Sign out may not have completed fully' }
}

/**
 * Clear all auth-related storage
 */
function clearAuthStorage() {
  if (typeof window === 'undefined') return
  
  try {
    // Clear localStorage
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      // Clear all Supabase-related keys and app data
      if (key && (
        key.startsWith('sb-') || 
        key.includes('supabase') ||
        key.includes('auth') ||
        key.includes('user') ||
        key.includes('session') ||
        key.includes('token')
      )) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch {
    // Storage might be blocked
  }
}

/**
 * Clear session storage
 */
function clearSessionStorage() {
  if (typeof window === 'undefined') return
  
  try {
    sessionStorage.clear()
  } catch {
    // Storage might be blocked
  }
}

/**
 * Clear all cookies related to auth
 */
function clearAllCookies() {
  if (typeof window === 'undefined') return
  
  try {
    const cookiesToClear = [
      'sb-',
      'supabase',
      'auth',
      'session',
      'token',
    ]
    
    document.cookie.split(';').forEach(cookie => {
      const [name] = cookie.trim().split('=')
      if (name) {
        const shouldClear = cookiesToClear.some(prefix => 
          name.toLowerCase().startsWith(prefix.toLowerCase()) ||
          name.toLowerCase().includes(prefix.toLowerCase())
        )
        
        if (shouldClear) {
          // Clear for all common paths and domains
          const paths = ['/', '/api']
          paths.forEach(path => {
            document.cookie = `${name}=; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
            document.cookie = `${name}=; path=${path}; domain=${window.location.hostname}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
          })
        }
      }
    })
  } catch {
    // Cookies might be blocked
  }
}

/**
 * Check if an error indicates a lock/abort error
 * These are transient errors from IndexedDB in React Strict Mode
 */
export function isLockError(error: unknown): boolean {
  if (!error) return false
  
  const message = typeof error === 'string' 
    ? error 
    : error instanceof Error 
      ? error.message 
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)
  
  const lowerMessage = message.toLowerCase()
  return (
    lowerMessage.includes('lock') ||
    lowerMessage.includes('steal') ||
    lowerMessage.includes('abort') ||
    lowerMessage.includes('another request') ||
    lowerMessage.includes('indexeddb') ||
    lowerMessage.includes('transaction')
  )
}

// Re-export Database type
export type { Database }
