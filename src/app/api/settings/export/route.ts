import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { withDistributedRateLimit, DISTRIBUTED_RATE_LIMITS } from '@/lib/distributed-rate-limit';

export async function POST(request: NextRequest) {
  // Rate limit: export is a potentially expensive operation
  const rateCheck = await withDistributedRateLimit(request, DISTRIBUTED_RATE_LIMITS.API_READ);
  if (!rateCheck.allowed) return rateCheck.response;

  try {
    const { user } = await getSupabaseUser();
    
    // STUB: This endpoint currently does not perform an actual export.
    // In a production implementation, this would:
    //   1. Enqueue a background job to collect all user data
    //   2. Generate a downloadable archive (CSV/JSON)
    //   3. Send a notification with a download link
    // For now, it simply acknowledges the request.
    
    console.log(`[Export] User ${user.id} requested data export.`);
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return NextResponse.json({ 
        status: 'queued',
        message: 'Your data export is being prepared. You will receive an email when it is ready.',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
