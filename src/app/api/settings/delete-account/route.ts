import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { withDistributedRateLimit } from '@/lib/distributed-rate-limit';

export async function POST(request: NextRequest) {
  // SECURITY: Rate limit to prevent abuse
  const rateCheck = await withDistributedRateLimit(request, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    blockDurationMs: 60 * 60 * 1000,
    message: 'Too many requests. Please try again later.',
    prefix: 'delete-account',
  });
  if (!rateCheck.allowed) return rateCheck.response;

  try {
    const { supabase, user } = await getSupabaseUser();
    
    // Soft delete logic:
    // 1. Mark auth.users as inactive? Supabase auth doesn't support custom fields easily on auth.users unless using user_metadata.
    // 2. Mark profile as deleted.
    // 3. Clear sessions.
    
    console.log(`[Delete Account] User ${user.id} requested deletion.`);
    
    // Update user_metadata to soft_deleted: true
    const { error: updateError } = await supabase.auth.updateUser({
      data: { soft_deleted: true, deleted_at: new Date().toISOString() }
    });
    
    if (updateError) throw updateError;
    
    // Clear sessions (signs user out immediately)
    await supabase.auth.signOut();
    
    return NextResponse.json({ success: true, message: 'Account scheduled for deletion.' });

  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete account error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
