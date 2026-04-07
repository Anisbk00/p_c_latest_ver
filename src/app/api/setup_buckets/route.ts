/**
 * Storage Bucket Setup API Route
 * 
 * Creates and configures Supabase storage buckets.
 * 
 * SECURITY: This endpoint requires authentication.
 * Only ADMIN users can trigger bucket setup.
 * Admin emails are defined in ADMIN_EMAILS environment variable.
 * 
 * @module api/setup_buckets
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';

// Admin emails for privileged operations - loaded from environment
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '').split(',').map(e => e.toLowerCase().trim()).filter(Boolean)
);

// ═══════════════════════════════════════════════════════════════
// GET /api/setup_buckets
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // ─── Authentication Check ─────────────────────────────────
    let user;
    try {
      user = await requireAuth(request);
    } catch {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // SECURITY FIX: Verify admin role before allowing bucket modifications
    const userEmail = user.email?.toLowerCase();
    if (!userEmail || !ADMIN_EMAILS.has(userEmail)) {
      console.warn(`[setup_buckets] Unauthorized access attempt by: ${userEmail}`);
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // ─── Setup Storage Buckets ─────────────────────────────────
    const supabase = createAdminClient();
    const buckets = ['progress-photos', 'food-images', 'workout-media', 'avatars'];
    const results: string[] = [];

    for (const bucket of buckets) {
      const { data: bData, error: bError } = await supabase.storage.getBucket(bucket);
      
      if (bError && bError.message.includes('not found')) {
        const { error } = await supabase.storage.createBucket(bucket, { public: true });
        results.push(error ? `Error creating ${bucket}: ${error.message}` : `Created public ${bucket}`);
      } else if (bError) {
        results.push(`Error checking ${bucket}: ${bError.message}`);
      } else {
        // Force update to public
        const { error: updateErr } = await supabase.storage.updateBucket(bucket, {
          public: true,
          allowedMimeTypes: null,
          fileSizeLimit: null
        });
        results.push(updateErr ? `Error making ${bucket} public: ${updateErr.message}` : `Set ${bucket} to public`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      results,
      triggeredBy: user.id 
    });
  } catch (error) {
    console.error('[setup_buckets] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to setup buckets' },
      { status: 500 }
    );
  }
}
