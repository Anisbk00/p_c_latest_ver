/**
 * Supabase Auth Context Provider
 * 
 * Provides authentication state and methods to the entire app.
 * Robust error handling and timeout protection.
 * Updated: 2024 - Auth fix for Supabase consistency
 * 
 * @module lib/supabase/auth-context
 */

'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { getClient, onAuthStateChange, isLockError, signOut as supabaseSignOut } from './client'
import { useRouter } from 'next/navigation'
import type { Database } from './database.types'
import { initDeviceId } from '@/lib/unified-data-service'
import { clearAllLocalData } from '@/lib/offline-storage'
import { clearCachedAuth } from '@/lib/offline-auth'

type Profile = Database['public']['Tables']['profiles']['Row']

// ═══════════════════════════════════════════════════════════════
// SECURITY: Test mode and auto sign-in removed for production safety
// Authentication is always handled via Supabase Auth
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const AUTH_TIMEOUT = 30000 // 30 seconds timeout for auth operations
const PROFILE_RETRIES = 5
const PROFILE_RETRY_DELAY = 500

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface AuthState {
  user: User | null
  profile: Profile | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
}

interface SignUpResult {
  error: string | null
  needsEmailConfirmation?: boolean
}

interface AuthContextType extends AuthState {
  signUp: (email: string, password: string, name?: string) => Promise<SignUpResult>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
  refreshProfile: () => Promise<void>
  clearError: () => void
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ])
}

// ═══════════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════════

const AuthContext = createContext<AuthContextType | null>(null)

// ═══════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  })
  
  // Track if we're in the middle of a sign-in attempt to prevent SIGNED_OUT from clearing errors
  // Using timestamp approach for more reliable protection
  const lastSignInAttemptRef = useRef(0)
  const SIGN_IN_COOLDOWN = 3000 // 3 seconds cooldown after sign-in attempt
  


  // ─── Fetch User Profile (via API — lazy-creates if missing) ─────────
  // IMPORTANT: Always call /api/profile rather than querying Supabase directly.
  // The API route lazy-creates the profile row with name from user_metadata on
  // first login — a direct Supabase query would silently return null, breaking
  // the greeting and downstream profile-dependent UI.
  // 
  // MOBILE MODE: Uses apiFetch to route to deployed backend OR falls back
  // to direct Supabase query if no API server is configured.
  //
  // DELETED USER HANDLING: Returns { deleted: true } if user was deleted.
  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null | { deleted: true }> => {
    // Check if we're in Capacitor mobile mode
    const isCapacitor = typeof window !== 'undefined' && 
      // @ts-expect-error - Capacitor global
      window.Capacitor?.isNativePlatform?.();
    
    // Check if API URL is configured for mobile
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const hasApiServer = apiUrl && !apiUrl.includes('your-api-server');
    
    // Mobile without API server: query Supabase directly
    if (isCapacitor && !hasApiServer) {
      try {
        const supabase = getClient();
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (error) {
          // Profile might not exist yet - try to create it
          if (error.code === 'PGRST116') {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Use RPC or raw insert to bypass strict typing
              const profileData = {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              };
              const { data: newProfile, error: insertError } = await supabase
                .from('profiles')
                .insert(profileData as never)
                .select()
                .single();
              
              if (!insertError && newProfile) {
                return newProfile as Profile;
              }
            }
          }
          console.warn('[Auth] Direct Supabase profile fetch error:', error.message);
          return null;
        }
        
        return data as Profile;
      } catch (err) {
        if (isLockError(err)) return null;
        console.warn('[Auth] Direct Supabase profile exception:', err);
        return null;
      }
    }
    
    // Web or mobile with API server: use API route
    try {
      const baseUrl = isCapacitor && hasApiServer ? apiUrl : '';
      
      // SECURITY FIX: Add 10s timeout to prevent hanging on profile fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${baseUrl}/api/profile`, { 
        credentials: 'include',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // P0 FIX: Handle deleted user (410 Gone) - must sign out
      if (response.status === 410) {
        console.log('[Auth] Account has been deleted (410 response)')
        return { deleted: true }
      }
      
      if (!response.ok) {
        // P0 FIX: 401 means session is invalid - should trigger sign out
        if (response.status === 401) {
          console.log('[Auth] Session invalid (401 response)')
          return { deleted: true }
        }
        console.warn('[Auth] fetchProfile API error:', response.status)
        return null
      }
      const data = await response.json()
      
      // P0 FIX: Check for deleted account flag in response
      if (data.code === 'ACCOUNT_DELETED' || data.deleted) {
        return { deleted: true }
      }
      
      // The profile object returned by /api/profile matches the Profile shape
      return data.profile ?? null
    } catch (err) {
      if (isLockError(err)) return null
      // Handle timeout specifically
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn('[Auth] fetchProfile timeout after 10s')
        return null
      }
      console.warn('[Auth] fetchProfile exception:', err)
      return null
    }
  }, [])

  // ─── Proactive Token Refresh Timer ────────────────────────────
  // Refreshes the access_token 60 seconds BEFORE it expires.
  // Prevents 401 errors on API calls during the gap between
  // token expiry and Supabase's auto-refresh trigger.
  useEffect(() => {
    if (!state.session || !state.isAuthenticated) return

    const REFRESH_BUFFER_MS = 60_000 // Refresh 60s before expiry

    function scheduleRefresh() {
      const expiresAt = state.session?.expires_at
      if (!expiresAt) return

      const expiresMs = expiresAt * 1000
      const nowMs = Date.now()
      const timeUntilRefresh = expiresMs - nowMs - REFRESH_BUFFER_MS

      // If token expires within buffer (or already expired), refresh immediately
      if (timeUntilRefresh <= 0) {
        const supabase = getClient()
        supabase.auth.refreshSession().catch(() => {
          // Silently fail — Supabase auto-refresh or TOKEN_REFRESHED event handles this
        })
        return
      }

      // Schedule refresh
      const timerId = setTimeout(() => {
        const supabase = getClient()
        supabase.auth.refreshSession().catch(() => {
          // Silently fail — Supabase auto-refresh or TOKEN_REFRESHED event handles this
        })
      }, timeUntilRefresh)

      return timerId
    }

    const timerId = scheduleRefresh()
    return () => {
      if (timerId) clearTimeout(timerId)
    }
  }, [state.session?.expires_at, state.isAuthenticated])

  // ─── Initialize Auth State ─────────────────────────────────────
  useEffect(() => {
    let mounted = true
    let retryCount = 0
    const MAX_RETRIES = 3
    let safetyTimeout: ReturnType<typeof setTimeout> | null = null

    async function initializeAuth() {
      // Production authentication flow
      
      // Initialize device ID early (uses IndexedDB backup for persistence)
      await initDeviceId()
      
      try {
        const supabase = getClient()
        
        // Get session without timeout - let it take as long as needed
        const { data: { session }, error } = await supabase.auth.getSession()

        if (!mounted) return

        // Handle the Supabase lock error - this is a known React Strict Mode issue
        // The error "Lock broken by another request with the 'steal' option" happens
        // when Strict Mode double-renders and the lock is stolen
        if (error) {
          if (isLockError(error) && retryCount < MAX_RETRIES) {
            retryCount++
            console.log(`[Auth] Lock error, retrying (${retryCount}/${MAX_RETRIES})...`)
            // Wait a bit and retry
            await new Promise(resolve => setTimeout(resolve, 500))
            if (mounted) {
              initializeAuth()
            }
            return
          }
          
          // Only log non-lock errors
          if (!isLockError(error)) {
            console.error('[Auth] Session error:', error.message)
          }
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: null, // Don't show lock errors to user
          }))
          return
        }

        if (session?.user) {
          // P1 FIX: Check for soft-deleted accounts before loading profile
          if (session.user.user_metadata?.soft_deleted === true) {
            console.log('[Auth] Account is soft-deleted, clearing all data and signing out')
            // Clear ALL local data first
            await clearAllLocalData()
            await clearCachedAuth()
            await supabase.auth.signOut()
            setState({
              user: null,
              profile: null,
              session: null,
              isLoading: false,
              isAuthenticated: false,
              error: 'Your account has been deleted',
            })
            return
          }
          
          const profileResult = await fetchProfile(session.user.id)
          if (!mounted) return
          
          // P0 FIX: Handle deleted user - sign out immediately
          if (profileResult && 'deleted' in profileResult && profileResult.deleted) {
            console.log('[Auth] User account deleted, clearing all data and signing out')
            // Clear ALL local data first
            await clearAllLocalData()
            await clearCachedAuth()
            await supabase.auth.signOut()
            setState({
              user: null,
              profile: null,
              session: null,
              isLoading: false,
              isAuthenticated: false,
              error: 'Your account has been deleted',
            })
            return
          }
          
          const profile = profileResult as Profile | null
          
          setState({
            user: session.user,
            profile,
            session,
            isLoading: false,
            isAuthenticated: true,
            error: null,
          })
        } else {
          setState(prev => ({
            ...prev,
            isLoading: false,
          }))
        }
      } catch (error) {
        if (!mounted) return
        
        // Check if this is a lock/abort error
        if (isLockError(error) && retryCount < MAX_RETRIES) {
          retryCount++
          console.log(`[Auth] Lock error caught, retrying (${retryCount}/${MAX_RETRIES})...`)
          await new Promise(resolve => setTimeout(resolve, 500))
          if (mounted) {
            initializeAuth()
          }
          return
        }
        
        // Only log non-lock errors
        if (!isLockError(error)) {
          console.error('[Auth] Init error:', error)
        }
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: null, // Don't show lock errors
        }))
      }
    }

    // Safety timeout - ensure we don't hang forever
    safetyTimeout = setTimeout(() => {
      if (mounted) {
        console.log('[Auth] Safety timeout reached, setting loading to false')
        setState(prev => ({
          ...prev,
          isLoading: false,
        }))
      }
    }, 5000)

    initializeAuth().finally(() => {
      if (safetyTimeout) {
        clearTimeout(safetyTimeout)
      }
    })
    
    // Subscribe to auth changes
    const unsubscribe = onAuthStateChange(async (event: string, session: unknown) => {
    if (!mounted) return

    const authSession = session as Session | null

    if (event === 'SIGNED_IN' && authSession?.user) {
      try {
        // Set authenticated state immediately so the UI can transition
        if (mounted) {
          setState(prev => ({
            ...prev,
            user: authSession.user,
            session: authSession,
            isLoading: false,
            isAuthenticated: true,
            error: null,
          }))
        }
        // Small delay to let session cookies propagate before server call
        await new Promise(r => setTimeout(r, 300))
        if (!mounted) return
        const profileResult = await fetchProfile(authSession.user.id)
        if (!mounted) return
        
        // P0 FIX: Handle deleted user - sign out immediately
        if (profileResult && 'deleted' in profileResult && profileResult.deleted) {
          console.log('[Auth] User account deleted (in SIGNED_IN), clearing all data and signing out')
          // Clear ALL local data first
          await clearAllLocalData()
          await clearCachedAuth()
          const supabase = getClient()
          await supabase.auth.signOut()
          setState({
            user: null,
            profile: null,
            session: null,
            isLoading: false,
            isAuthenticated: false,
            error: 'Your account has been deleted',
          })
          return
        }
        
        const profile = profileResult as Profile | null
        if (profile) {
          setState(prev => ({ ...prev, profile }))
        }
      } catch (err) {
        // Handle lock errors gracefully - don't log them
        if (!isLockError(err)) {
          console.error('[Auth] Error in SIGNED_IN handler:', err)
        }
        
        // Still set the user as authenticated even if profile fetch fails
        if (mounted) {
          setState({
            user: authSession.user,
            profile: null,
            session: authSession,
            isLoading: false,
            isAuthenticated: true,
            error: null,
          })
        }
      }
    } else if (event === 'SIGNED_OUT') {
      // Don't clear state if we recently attempted a sign-in
      // This prevents the SIGNED_OUT event from clearing error state after failed login
      const timeSinceSignInAttempt = Date.now() - lastSignInAttemptRef.current
      if (timeSinceSignInAttempt > SIGN_IN_COOLDOWN) {
        setState(prev => ({
          user: null,
          profile: null,
          session: null,
          isLoading: false,
          isAuthenticated: false,
          error: null,
        }))
      } else {
        // Within cooldown - preserve any existing error, just update auth state
        setState(prev => ({
          ...prev,
          user: null,
          profile: null,
          session: null,
          isAuthenticated: false,
          // Don't clear error or isLoading - those are managed by signIn/signUp functions
        }))
      }
    } else if (event === 'TOKEN_REFRESHED') {
      // Handle token refresh result
      if (authSession?.user) {
        setState(prev => ({
          ...prev,
          session: authSession,
          user: authSession.user,
          error: null,
        }))
      } else {
        // Token refresh failed — refresh token is expired or invalid
        // Only retry if still mounted to prevent state updates on unmounted components
        if (!mounted) return

        console.warn('[Auth] Token refresh failed — signing out');
        // Clear offline cache to prevent stale offline login after token expiry
        try { await clearCachedAuth() } catch { /* ignore */ }
        setState(prev => ({
          ...prev,
          error: 'Your session has expired. Please sign in again.',
          isAuthenticated: false,
          user: null,
          session: null,
          profile: null,
        }));
      }
    }
  })

    return () => {
      mounted = false
      if (safetyTimeout) {
        clearTimeout(safetyTimeout)
      }
      unsubscribe()
    }
  }, [fetchProfile, router])

  // ─── Sign Up ───────────────────────────────────────────────────
  const signUp = useCallback(async (email: string, password: string, name?: string): Promise<{ error: string | null; needsEmailConfirmation?: boolean }> => {
    try {
      const supabase = getClient()
      
      console.debug('[Auth] Attempting sign up')
      
      // Get the base URL for email redirects
      // Priority: 1. NEXT_PUBLIC_APP_URL env var, 2. window.location.origin
      // For mobile apps, NEXT_PUBLIC_APP_URL should be set to the production domain
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      const redirectUrl = `${baseUrl}/auth/callback`
      
      console.debug('[Auth] Using redirect URL:', redirectUrl)
      
      // Direct call without timeout wrapper
      const result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || null,
          },
          emailRedirectTo: redirectUrl,
        },
      })

      console.debug('[Auth] Sign up result:', { hasError: !!result.error, hasUser: !!result.data?.user, hasSession: !!result.data?.session })

      if (result.error) {
        return { error: result.error.message }
      }

      // Handle user creation
      if (result.data.user) {
        // Check if email confirmation is required
        if (!result.data.session) {
          return { error: null, needsEmailConfirmation: true }
        }

        // Set state immediately so UI can transition
        setState({
          user: result.data.user,
          profile: null,
          session: result.data.session,
          isLoading: false,
          isAuthenticated: true,
          error: null,
        })

        // Wait for cookies to propagate before server-side profile fetch
        await new Promise(r => setTimeout(r, 500))

        // Fetch profile via API — this lazy-creates the profile row atomically
        // with the name provided during sign-up, avoiding a polling loop.
        const profile = await fetchProfile(result.data.user.id)
        if (profile) {
          setState(prev => ({ ...prev, profile }))
        }
      }

      return { error: null }
    } catch (error) {
      console.error('[Auth] Sign up exception:', error)
      const errorMessage = error instanceof Error ? error.message : 'Sign up failed'
      return { error: errorMessage }
    }
  }, [fetchProfile])

  // ─── Sign In ───────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    // Record the time of sign-in attempt for SIGNED_OUT protection
    lastSignInAttemptRef.current = Date.now()
    
    try {
      const supabase = getClient()
      
      console.debug('[Auth] Attempting sign in')
      
      // Add timeout to prevent hanging (30 seconds for slow connections)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Sign in timed out. Please check your connection and try again.')), 30000)
      })
      
      console.debug('[Auth] Calling signInWithPassword...')
      
      // Race between sign in and timeout
      const result = await Promise.race([
        supabase.auth.signInWithPassword({
          email,
          password,
        }).then(res => {
          console.debug('[Auth] signInWithPassword completed')
          return res
        }).catch(err => {
          console.log('[Auth] signInWithPassword error:', err)
          throw err
        }),
        timeoutPromise
      ])

      console.debug('[Auth] Sign in result:', { hasError: !!result.error, hasUser: !!result.data?.user })

      if (result.error) {
        console.error('[Auth] Sign in error:', result.error)
        return { error: result.error.message }
      }

      if (result.data.user) {
        console.debug('[Auth] Sign in successful, fetching profile...')
        const profileResult = await fetchProfile(result.data.user.id)
        
        // P0 FIX: Handle deleted user - sign out immediately
        if (profileResult && 'deleted' in profileResult && profileResult.deleted) {
          console.log('[Auth] User account deleted (in signIn), clearing all data and signing out')
          // Clear ALL local data first
          await clearAllLocalData()
          await clearCachedAuth()
          await supabaseSignOut()
          return { error: 'Your account has been deleted' }
        }
        
        const profile = profileResult as Profile | null
        console.debug('[Auth] Profile fetched, updating state...')
        setState({
          user: result.data.user,
          profile,
          session: result.data.session,
          isLoading: false,
          isAuthenticated: true,
          error: null,
        })
        console.debug('[Auth] State updated, isAuthenticated should be true')
      }

      return { error: null }
    } catch (error) {
      console.error('[Auth] Sign in exception:', error)
      const errorMessage = error instanceof Error ? error.message : 'Sign in failed'
      return { error: errorMessage }
    }
  }, [fetchProfile])

  // ─── Sign Out ───────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      // Clear ALL local data first (P0 FIX for deleted users)
      await clearAllLocalData()
      await clearCachedAuth()
      
      // Use the signOut from client.ts which handles lock errors
      const result = await supabaseSignOut()
      
      // Clear state regardless of error
      setState({
        user: null,
        profile: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      })
      
      // Only log non-lock errors
      if (result.error && !isLockError(result.error)) {
        console.error('Sign out error:', result.error)
      }
      
      router.push('/')
    } catch (error) {
      // Clear state even on error
      setState({
        user: null,
        profile: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      })
      
      // Only log non-lock errors
      if (!isLockError(error)) {
        console.error('Sign out exception:', error)
      }
      
      router.push('/')
    }
  }, [router])

  // ─── Reset Password ─────────────────────────────────────────────
  const resetPassword = useCallback(async (email: string) => {
    try {
      const supabase = getClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        return { error: error.message }
      }

      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Password reset failed' }
    }
  }, [])

  // ─── Update Password ────────────────────────────────────────────
  const updatePassword = useCallback(async (password: string) => {
    try {
      const supabase = getClient()
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        return { error: error.message }
      }

      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Password update failed' }
    }
  }, [])

  // ─── Refresh Profile ────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (state.user) {
      const profile = await fetchProfile(state.user.id)
      setState(prev => ({ ...prev, profile }))
    }
  }, [state.user, fetchProfile])

  // ─── Clear Error ────────────────────────────────────────────────
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  // ─── Context Value ──────────────────────────────────────────────
  const value: AuthContextType = {
    ...state,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    refreshProfile,
    clearError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

export function useSupabaseAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useSupabaseAuth must be used within SupabaseAuthProvider')
  }
  return context
}

// Legacy compatibility hook
export const useAuth = useSupabaseAuth
