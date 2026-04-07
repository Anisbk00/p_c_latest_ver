import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Food Dispute / Moderation API - Reports a food as incorrect
 * POST /api/foods/dispute
 */
export async function POST(request: NextRequest) {

  try {
    const { supabase, user } = await getSupabaseUser();
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // Strict Zod validation
    const { FoodDisputeSchema } = await import('@/lib/validation')
    const parseResult = FoodDisputeSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      }, { status: 400 })
    }
    body = parseResult.data
    // Extra: sanitize all strings (trim)
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }
    const { foodId, isGlobal, reason } = body;

    // Insert dispute record
    const { data: dispute, error: disputeError } = await supabase
      .from('food_disputes')
      .insert({
        food_id: foodId,
        is_global: Boolean(isGlobal),
        user_id: user.id,
        reason: reason,
        status: 'pending'
      })
      .select()
      .single();

    if (disputeError) throw disputeError;

    // Use admin client to change status of food to 'under_review'
    // since user may not have UPDATE RLS on global_foods or other users' foods
    const adminClient = createAdminClient();
    const targetTable = isGlobal ? 'global_foods' : 'foods';
    
    const { error: updateError } = await adminClient
      .from(targetTable)
      .update({ status: 'under_review' })
      .eq('id', foodId);

    if (updateError) {
      console.warn(`Dispute created but failed to update status of ${targetTable} item ${foodId}`);
    }

    return NextResponse.json({ success: true, dispute });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[POST /api/foods/dispute]', err);
    return NextResponse.json({ error: 'Failed to create dispute', details: msg }, { status: 500 });
  }
}
