/**
 * Supabase Server-Side Configuration
 *
 * SECURITY: This file should ONLY be imported in server-side code.
 * Contains sensitive credentials that must NEVER be exposed to the client.
 *
 * @module lib/supabase/server-config
 */

// ═══════════════════════════════════════════════════════════════
// SERVER-SIDE ONLY CONFIGURATION
// Hardcoded fallbacks for production deployment
// ═══════════════════════════════════════════════════════════════

/**
 * Check if running on server-side
 */
function isServerSide(): boolean {
  return typeof window === 'undefined';
}

/**
 * Service role key — SERVER-SIDE ONLY.
 * NEVER import this in client components.
 */
let _serviceRoleKey: string | null = null;

export function getServiceRoleKey(): string {
  // Security check - only allow on server
  if (!isServerSide()) {
    throw new Error(
      'SECURITY VIOLATION: SUPABASE_SERVICE_ROLE_KEY cannot be accessed from client-side code.'
    );
  }

  // Return cached value if available
  if (_serviceRoleKey !== null) {
    return _serviceRoleKey;
  }

  // Environment variable only — no hardcoded fallback (security)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      'CRITICAL: SUPABASE_SERVICE_ROLE_KEY environment variable is not set. ' +
      'This key is required for server-side admin operations.'
    );
  }

  _serviceRoleKey = key;
  return _serviceRoleKey;
}

/**
 * Legacy export for backward compatibility
 */
export const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey;

/**
 * Database connection URL — SERVER-SIDE ONLY.
 */
let _databaseUrl: string | null = null;

export function getDatabaseUrl(): string {
  // Security check - only allow on server
  if (!isServerSide()) {
    throw new Error(
      'SECURITY VIOLATION: DATABASE_URL cannot be accessed from client-side code.'
    );
  }

  // Return cached value if available
  if (_databaseUrl !== null) {
    return _databaseUrl;
  }

  // Environment variable only — no hardcoded fallback (security)
  const url = process.env.DATABASE_URL || '';

  if (!url) {
    console.warn(
      '[SUPABASE] DATABASE_URL not set. Direct database connections may not work.'
    );
    _databaseUrl = '';
    return _databaseUrl;
  }

  _databaseUrl = url;
  return _databaseUrl;
}

/**
 * Legacy export for backward compatibility
 */
export const DATABASE_URL = getDatabaseUrl;
