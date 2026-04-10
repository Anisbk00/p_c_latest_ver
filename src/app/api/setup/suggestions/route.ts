/**
 * Setup Suggestions API — Supabase-native
 * GET /api/setup/suggestions
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('primary_goal, activity_level, fitness_level')
      .eq('user_id', user.id)
      .maybeSingle()

    // Return suggested experiments based on profile
    const goal = userProfile?.primary_goal ?? 'general_fitness'

    const suggestions = [
      {
        id: 'sug-1',
        title: '7-Day Consistent Workout',
        description: 'Work out for 30+ minutes every day this week.',
        category: 'fitness',
        duration: 7,
        goal,
      },
      {
        id: 'sug-2',
        title: '14-Day Protein Focus',
        description: 'Hit your daily protein goal of 1.6g/kg bodyweight.',
        category: 'nutrition',
        duration: 14,
        goal,
      },
      {
        id: 'sug-3',
        title: 'Daily Step Challenge',
        description: 'Walk 10,000 steps every day for 2 weeks.',
        category: 'activity',
        duration: 14,
        goal,
      },
    ]

    return NextResponse.json({ suggestions })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch suggestions', details: msg }, { status: 500 })
  }
}
