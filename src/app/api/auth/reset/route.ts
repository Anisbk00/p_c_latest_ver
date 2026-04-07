/**
 * Reset App API Route
 * 
 * Clears all user data from Supabase for a fresh start.
 * 
 * @module api/auth/reset
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withDistributedRateLimit, DISTRIBUTED_RATE_LIMITS } from '@/lib/distributed-rate-limit'

// ═══════════════════════════════════════════════════════════════
// POST /api/auth/reset - Reset all user data
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  // Rate limit: destructive operation — allow only 3 resets per hour
  const rateCheck = await withDistributedRateLimit(request, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
    maxFailedAttempts: 3,
    lockoutDurationMs: 24 * 60 * 60 * 1000, // 24 hour lockout
    message: 'Too many reset requests. Please try again later.',
    prefix: 'reset',
  })
  if (!rateCheck.allowed) return rateCheck.response

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const userId = user.id
    const errors: string[] = []

    // Delete all user data from Supabase tables
    // Order matters due to foreign key constraints
    
    // Delete food logs
    const { error: foodLogError } = await supabase
      .from('food_logs')
      .delete()
      .eq('user_id', userId)
    if (foodLogError) errors.push(`food_logs: ${foodLogError.message}`)

    // Delete workouts
    const { error: workoutError } = await supabase
      .from('workouts')
      .delete()
      .eq('user_id', userId)
    if (workoutError) errors.push(`workouts: ${workoutError.message}`)

    // Delete body metrics
    const { error: metricsError } = await supabase
      .from('body_metrics')
      .delete()
      .eq('user_id', userId)
    if (metricsError) errors.push(`body_metrics: ${metricsError.message}`)

    // Delete goals
    const { error: goalsError } = await supabase
      .from('goals')
      .delete()
      .eq('user_id', userId)
    if (goalsError) errors.push(`goals: ${goalsError.message}`)

    // Delete user settings
    const { error: settingsError } = await supabase
      .from('user_settings')
      .delete()
      .eq('user_id', userId)
    if (settingsError) errors.push(`user_settings: ${settingsError.message}`)

    // Delete user files
    const { error: filesError } = await supabase
      .from('user_files')
      .delete()
      .eq('user_id', userId)
    if (filesError) errors.push(`user_files: ${filesError.message}`)

    // Delete sleep logs
    const { error: sleepError } = await supabase
      .from('sleep_logs')
      .delete()
      .eq('user_id', userId)
    if (sleepError) errors.push(`sleep_logs: ${sleepError.message}`)

    // Delete AI insights
    const { error: insightsError } = await supabase
      .from('ai_insights')
      .delete()
      .eq('user_id', userId)
    if (insightsError) errors.push(`ai_insights: ${insightsError.message}`)

    // Delete user profiles
    const { error: profilesError } = await supabase
      .from('user_profiles')
      .delete()
      .eq('user_id', userId)
    if (profilesError) errors.push(`user_profiles: ${profilesError.message}`)

    // Delete notification preferences
    const { error: notifPrefsError } = await supabase
      .from('notification_preferences')
      .delete()
      .eq('user_id', userId)
    if (notifPrefsError) errors.push(`notification_preferences: ${notifPrefsError.message}`)

    // Delete settings audit log
    const { error: auditError } = await supabase
      .from('settings_audit')
      .delete()
      .eq('user_id', userId)
    if (auditError) errors.push(`settings_audit: ${auditError.message}`)

    // Log any errors but don't fail
    if (errors.length > 0) {
      console.warn('[Reset] Some data could not be deleted:', errors)
    }

    return NextResponse.json({ 
      success: true, 
      message: 'User data reset successfully',
      warnings: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Reset error:', error)
    return NextResponse.json(
      { error: 'Failed to reset user data' },
      { status: 500 }
    )
  }
}
