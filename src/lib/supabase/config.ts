/**
 * Supabase Configuration Constants
 * 
 * Reads from environment variables - never hardcoded.
 * Configured via .env file (gitignored for security).
 * 
 * @module lib/supabase/config
 */

// ═══════════════════════════════════════════════════════════════
// SUPABASE CONFIGURATION - Environment Variables Only
// ═══════════════════════════════════════════════════════════════

/**
 * Supabase project URL
 * Trim whitespace/newlines — Vercel env vars sometimes carry trailing \n
 */
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();

/**
 * Supabase anonymous key (safe for client-side use)
 * Trim whitespace/newlines — a trailing newline breaks WebSocket auth (%0A in URL)
 */
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

/**
 * Validate that required Supabase credentials are configured
 */
export function validateSupabaseConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!SUPABASE_URL) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  
  if (!SUPABASE_ANON_KEY) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
