/**
 * Setup Complete API — Supabase-native
 *
 * POST  /api/setup/complete — save setup choices and mark done
 * PATCH /api/setup/complete — skip setup
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const adminClient = createAdminClient()
    const body = await request.json()
    const { primaryGoal, activityLevel, coachingTone, timezone, unitSystem, biologicalSex, birthDate, heightCm, targetWeightKg, fitnessLevel, currentWeight, weightUnit } = body

    const parsedCurrentWeight = Number(currentWeight)
    if (!Number.isFinite(parsedCurrentWeight) || parsedCurrentWeight <= 0) {
      return NextResponse.json(
        {
          error: 'Current weight is required',
          details: 'Insert a valid current weight to finish setup.',
        },
        { status: 400 }
      )
    }

    // Update profile (main identity)
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email ?? '',
      timezone: timezone ?? 'UTC',
      locale: unitSystem === 'imperial' ? 'en-US' : 'en-GB',
      coaching_tone: coachingTone ?? 'encouraging',
    }, { onConflict: 'id' })

    // Upsert user_profiles
    const profilePayload: Record<string, unknown> = {
      user_id: user.id,
      primary_goal: primaryGoal,
      activity_level: activityLevel ?? 'moderate',
    }
    if (biologicalSex) profilePayload.biological_sex = biologicalSex
    if (birthDate) profilePayload.birth_date = birthDate
    if (heightCm) profilePayload.height_cm = parseFloat(heightCm)
    if (targetWeightKg) profilePayload.target_weight_kg = parseFloat(targetWeightKg)
    if (fitnessLevel) profilePayload.fitness_level = fitnessLevel
    await supabase.from('user_profiles').upsert(profilePayload, { onConflict: 'user_id' })

    // Store initial current weight measurement - use admin client to bypass RLS
    const { error: weightInsertError } = await adminClient.from('body_metrics').insert({
      user_id: user.id,
      metric_type: 'weight',
      value: parsedCurrentWeight,
      unit: weightUnit === 'lb' || weightUnit === 'lbs' ? 'lb' : 'kg',
      source: 'manual',
      confidence: 1,
      captured_at: new Date().toISOString(),
    })
    
    if (weightInsertError) {
      console.error('[setup/complete] Failed to insert weight measurement:', weightInsertError)
      // Continue anyway - weight insert failure shouldn't block setup completion
    }

    // Mark setup complete in user_settings
    await supabase.from('user_settings').upsert({
      user_id: user.id,
      setup_completed: true,
      setup_completed_at: new Date().toISOString(),
      setup_skipped: false,
      units: unitSystem ?? 'metric',
    }, { onConflict: 'user_id' })

    // Upsert active goal
    if (primaryGoal) {
      const { data: existingGoal } = await supabase
        .from('goals').select('id').eq('user_id', user.id).eq('status', 'active').maybeSingle()
      if (existingGoal) {
        const goalUpdates: Record<string, unknown> = { goal_type: primaryGoal }
        if (targetWeightKg !== undefined && targetWeightKg !== null && `${targetWeightKg}` !== '') {
          goalUpdates.target_value = parseFloat(targetWeightKg)
        }
        await supabase.from('goals').update(goalUpdates).eq('id', existingGoal.id)
      } else {
        await supabase.from('goals').insert({
          user_id: user.id,
          goal_type: primaryGoal,
          status: 'active',
          unit: 'kg',
          target_value: targetWeightKg !== undefined && targetWeightKg !== null && `${targetWeightKg}` !== ''
            ? parseFloat(targetWeightKg)
            : null,
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        profile: { primaryGoal, activityLevel, timezone, coachingTone, unitSystem, biologicalSex, birthDate, heightCm, targetWeightKg, fitnessLevel, currentWeight: parsedCurrentWeight },
        settings: { setupCompleted: true, setupCompletedAt: new Date().toISOString() },
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[setup/complete POST]', err)
    return NextResponse.json({ error: 'Failed to complete setup', details: msg }, { status: 500 })
  }
}

export async function PATCH() {
  try {
    const { supabase, user } = await getSupabaseUser()
    await supabase.from('user_settings').upsert({ user_id: user.id, setup_skipped: true }, { onConflict: 'user_id' })
    return NextResponse.json({ success: true, message: 'Setup skipped' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to skip setup' }, { status: 500 })
  }
}
