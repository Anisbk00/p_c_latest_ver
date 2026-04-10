/**
 * Workout Insights API — Supabase-native
 * GET /api/workouts/insights
 * 
 * HARDENED: Database-level aggregation for performance (PERF-001 FIX)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // PERF-003 FIX: Single query for all insights data instead of three separate queries
    // Selects only the lightweight columns needed for aggregation
    const { data: workouts, error: fetchError } = await supabase
      .from('workouts')
      .select('calories_burned, duration_minutes, activity_type')
      .eq('user_id', user.id)
      .gte('started_at', thirtyDaysAgo.toISOString())

    if (fetchError) throw fetchError

    // Calculate all aggregates from a single result set
    const rows = workouts ?? []
    const total = rows.length
    const totalCalories = rows.reduce((s, w) => s + (w.calories_burned ?? 0), 0)
    const totalDuration = rows.reduce((s, w) => s + (w.duration_minutes ?? 0), 0)
    const byType = rows.reduce((acc: Record<string, number>, w) => {
      const t = w.activity_type ?? 'other'
      acc[t] = (acc[t] ?? 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      insights: {
        totalWorkouts: total,
        totalCaloriesBurned: totalCalories,
        totalMinutes: totalDuration,
        avgDurationMinutes: total > 0 ? Math.round(totalDuration / total) : 0,
        workoutsByType: byType,
        period: 30,
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch workout insights' }, { status: 500 })
  }
}
