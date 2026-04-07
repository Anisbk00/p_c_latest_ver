/**
 * Database Migration API
 * 
 * Checks and applies pending migrations to the Supabase database.
 * SECURITY: Requires admin authentication
 * 
 * GET /api/admin/migrate - Check migration status
 * POST /api/admin/migrate - Apply migrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';

// Admin emails are defined in ADMIN_EMAILS environment variable.
// Format: ADMIN_EMAILS=email1@example.com,email2@example.com
// SECURITY: This must be configured in production. Empty set = no admin access.
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.toLowerCase().trim())
    .filter(Boolean)
);

/**
 * Check if authenticated user has admin privileges
 */
async function requireAdmin(request: NextRequest) {
  try {
    // Warn if ADMIN_EMAILS not configured in production
    if (ADMIN_EMAILS.size === 0 && process.env.NODE_ENV === 'production') {
      console.error('[SECURITY] ADMIN_EMAILS environment variable not configured! No admin access possible.');
    }
    
    const user = await requireAuth(request);
    
    // Check if user email is in admin whitelist
    const email = user.email?.toLowerCase();
    if (!email || !ADMIN_EMAILS.has(email)) {
      return { authorized: false, error: 'Admin access required' };
    }
    
    return { authorized: true, user };
  } catch (error) {
    return { 
      authorized: false, 
      error: error instanceof Error ? error.message : 'Authentication required' 
    };
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  
  try {
    const adminClient = createAdminClient();
    
    // Check if setup columns exist by trying to select
    const { data, error } = await adminClient
      .from('user_settings')
      .select('setup_completed, setup_completed_at, setup_skipped, last_suggestion_at')
      .limit(1);
    
    if (error) {
      return NextResponse.json({
        migrated: false,
        error: error.message,
        migrationSql: `
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS setup_skipped BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_suggestion_at TIMESTAMPTZ;
        `.trim(),
      });
    }
    
    return NextResponse.json({
      migrated: true,
      message: 'Setup tracking fields exist',
    });
  } catch (error) {
    return NextResponse.json({
      migrated: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
