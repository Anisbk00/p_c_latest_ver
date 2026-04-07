/**
 * Setup Status API — Supabase-native
 * GET /api/setup/status
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    const { data: settings } = await supabase
      .from('user_settings')
      .select('setup_completed, setup_completed_at, setup_skipped')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!settings) {
      return NextResponse.json({
        needsSetup: true,
        setupCompleted: false,
        setupSkipped: false,
      })
    }

    return NextResponse.json({
      needsSetup: !settings.setup_completed && !settings.setup_skipped,
      setupCompleted: settings.setup_completed,
      setupCompletedAt: settings.setup_completed_at ?? null,
      setupSkipped: settings.setup_skipped,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[setup/status]', err)
    return NextResponse.json({ error: 'Failed to check setup status', details: msg }, { status: 500 })
  }
}
