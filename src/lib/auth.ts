/**
 * Authentication Helper for API Routes
 * 
 * Uses Supabase Auth for consistent authentication across the app.
 * This module provides server-side auth helpers for API routes.
 * 
 * @module lib/auth
 */

import { createClient } from '@/lib/supabase/server';

// ═══════════════════════════════════════════════════════════════
// Authentication Helper for API Routes (Supabase Auth)
// ═══════════════════════════════════════════════════════════════

/**
 * Require authentication in API routes
 * Returns user info if authenticated, throws error otherwise
 */
export async function requireAuth(): Promise<{ userId: string; email: string }> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('UNAUTHORIZED');
  }
  
  return {
    userId: user.id,
    email: user.email ?? '',
  };
}

/**
 * Get optional authentication - returns user if logged in, null otherwise
 * Use this for endpoints that work for both authenticated and anonymous users
 */
export async function getOptionalAuth(): Promise<{ userId: string; email: string } | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    return {
      userId: user.id,
      email: user.email ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * Get authenticated user ID or return null
 * Convenience function for API routes
 */
export async function getAuthUserId(): Promise<string | null> {
  const auth = await getOptionalAuth();
  return auth?.userId ?? null;
}

/**
 * Get the current authenticated user from Supabase
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return null;
  }
  
  return user;
}
