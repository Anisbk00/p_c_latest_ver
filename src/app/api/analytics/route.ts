/**
 * Analytics API — Supabase-native
 * GET /api/analytics
 * 
 * HARDENED: Fixed avgDailyCalories to divide by unique days logged,
 * not by total log entries. Added uniqueDays to response.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { requireAuth } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // Support both cookie and Bearer token authentication like food-logs
    let user, supabase;
    
    try {
      const result = await getSupabaseUser();
      user = result.user;
      supabase = result.supabase;
    } catch (error) {
      // Fallback to requireAuth for Bearer token support (QA testing compatibility)
      user = await requireAuth(request);
      const { getSupabase } = await import('@/lib/supabase/supabase-data');
      supabase = await getSupabase();
    }
    const { searchParams } = new URL(request.url)
    const period = parseInt(searchParams.get('period') ?? '30', 10)

    const since = new Date()
    since.setDate(since.getDate() - period)
    const sinceISO = since.toISOString()

    const [{ data: workouts }, { data: weights }, { data: foodLogs }] = await Promise.all([
      supabase.from('workouts').select('id, started_at, duration_minutes, calories_burned, activity_type').eq('user_id', user.id).gte('started_at', sinceISO),
      supabase.from('body_metrics').select('value, captured_at').eq('user_id', user.id).eq('metric_type', 'weight').gte('captured_at', sinceISO).order('captured_at', { ascending: true }),
      supabase.from('food_logs').select('calories, protein, carbs, fat, logged_at').eq('user_id', user.id).gte('logged_at', sinceISO),
    ])

    const totalWorkouts = workouts?.length ?? 0
    const totalCaloriesBurned = workouts?.reduce((sum, w) => sum + (w.calories_burned ?? 0), 0) ?? 0
    const avgDuration = totalWorkouts > 0 ? (workouts?.reduce((sum, w) => sum + (w.duration_minutes ?? 0), 0) ?? 0) / totalWorkouts : 0
    const weightTrend = weights ?? []

    // FIX: Calculate unique days with food logs for accurate daily average
    const uniqueDays = foodLogs
      ? new Set(foodLogs.map(f => f.logged_at?.split('T')[0]).filter(Boolean)).size
      : 0
    const totalCaloriesIn = foodLogs?.reduce((sum, f) => sum + (f.calories ?? 0), 0) ?? 0
    const avgCaloriesIn = uniqueDays > 0 ? totalCaloriesIn / uniqueDays : 0

    return NextResponse.json({
      period,
      workouts: { total: totalWorkouts, totalCaloriesBurned, avgDurationMinutes: Math.round(avgDuration) },
      weight: { trend: weightTrend, entries: weightTrend.length },
      nutrition: { avgDailyCalories: Math.round(avgCaloriesIn), loggedDays: uniqueDays, totalEntries: foodLogs?.length ?? 0 },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch analytics', details: msg }, { status: 500 })
  }
}
