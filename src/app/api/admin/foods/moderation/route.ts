import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';

/**
 * Admin Moderation Queue for Food Disputes
 * GET /api/admin/foods/moderation
 * POST /api/admin/foods/moderation
 * 
 * SECURITY: Requires authentication and admin role
 */

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
    const { data, error } = await adminClient
      .from('food_disputes')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ disputes: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to fetch moderation queue', details: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const { disputeId, action } = body; // action = "accept" | "reject"
    
    if (!disputeId || !['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Requires disputeId and action="accept"|"reject"' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    
    // 1. Get the dispute
    const { data: dispute, error: fetchError } = await adminClient
      .from('food_disputes')
      .select('*')
      .eq('id', disputeId)
      .single();
      
    if (fetchError || !dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });

    // 2. Mark the dispute resolved
    const { error: markError } = await adminClient
      .from('food_disputes')
      .update({ status: action === 'accept' ? 'accepted' : 'rejected', resolved_at: new Date().toISOString() })
      .eq('id', disputeId);
    
    if (markError) throw markError;

    // 3. Update the underlying food item
    const targetTable = dispute.is_global ? 'global_foods' : 'foods';
    const newStatus = action === 'accept' ? 'rejected_from_db' : 'active'; 
    
    const { error: tableError } = await adminClient
      .from(targetTable)
      .update({ status: newStatus })
      .eq('id', dispute.food_id);

    if (tableError) {
      console.warn(`Moderated dispute, but failed to update ${targetTable}`);
    }

    return NextResponse.json({ success: true, disputeId, result: newStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Failed to process moderation action', details: msg }, { status: 500 });
  }
}
