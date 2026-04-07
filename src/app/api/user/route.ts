/**
 * User API — Supabase-native
 * GET  /api/user  — get current user
 * PATCH /api/user — update user
 * 
 * P0 FIX: Added Zod validation to PATCH endpoint
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { z } from 'zod'

// P0 FIX: Strict validation schema for user updates
const UserPatchSchema = z.object({
  name: z.string().min(1).max(64).trim().optional(),
  coachingTone: z.enum(['encouraging', 'direct', 'balanced', 'strict']).optional(),
  privacyMode: z.boolean().optional(),
  timezone: z.string().max(50).regex(/^[A-Za-z_\/]+$/).optional(), // e.g. "America/New_York"
  locale: z.enum(['en', 'fr', 'ar']).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
}).strict() // Reject unknown fields

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    // Try to get from profiles table first
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) {
      // Lazy create
      const { data: newProfile } = await supabase.from('profiles').insert({
        id: user.id,
        email: user.email ?? '',
        name: user.user_metadata?.name ?? null,
      }).select().single()

      return NextResponse.json({ user: formatUser(user, newProfile) })
    }

    const { data: userProfile } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle()
    const { data: settings } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()

    return NextResponse.json({
      user: {
        ...formatUser(user, profile),
        UserProfile: userProfile ? {
          userId: user.id,
          birthDate: userProfile.birth_date ?? null,
          biologicalSex: userProfile.biological_sex ?? null,
          heightCm: userProfile.height_cm ?? null,
          targetWeightKg: userProfile.target_weight_kg ?? null,
          activityLevel: userProfile.activity_level ?? 'moderate',
          fitnessLevel: userProfile.fitness_level ?? 'beginner',
          primaryGoal: userProfile.primary_goal ?? null,
          targetDate: userProfile.target_date ?? null,
        } : null,
        UserSettings: settings ? {
          id: settings.id,
          userId: user.id,
          theme: settings.theme ?? 'system',
          notificationsEnabled: settings.notifications_enabled ?? true,
          emailNotifications: settings.email_notifications ?? true,
          pushNotifications: settings.push_notifications ?? true,
          language: settings.language ?? 'en',
          units: settings.units ?? 'metric',
          setupCompleted: settings.setup_completed ?? false,
        } : null,
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[user GET]', err)
    return NextResponse.json({ error: 'Failed to fetch user', details: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    
    // P0 FIX: Parse and validate body with Zod
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    
    const parseResult = UserPatchSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten()
      }, { status: 400 })
    }
    
    const validatedBody = parseResult.data

    // Build updates from validated data only
    const updates: Record<string, unknown> = {}
    if (validatedBody.name !== undefined) updates.name = validatedBody.name
    if (validatedBody.coachingTone !== undefined) updates.coaching_tone = validatedBody.coachingTone
    if (validatedBody.privacyMode !== undefined) updates.privacy_mode = validatedBody.privacyMode
    if (validatedBody.timezone !== undefined) updates.timezone = validatedBody.timezone
    if (validatedBody.locale !== undefined) updates.locale = validatedBody.locale
    if (validatedBody.avatarUrl !== undefined) updates.avatar_url = validatedBody.avatarUrl

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    
    if (updateError) {
      console.error('[user PATCH] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    return NextResponse.json({ user: formatUser(user, updated) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to update user', details: msg }, { status: 500 })
  }
}

function formatUser(user: { id: string; email?: string }, profile: Record<string, unknown> | null) {
  return {
    id: user.id,
    email: profile?.email ?? user.email ?? '',
    name: profile?.name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    timezone: profile?.timezone ?? 'UTC',
    locale: profile?.locale ?? 'en',
    coachingTone: profile?.coaching_tone ?? 'encouraging',
    privacyMode: profile?.privacy_mode ?? false,
    createdAt: profile?.created_at ?? new Date().toISOString(),
    updatedAt: profile?.updated_at ?? new Date().toISOString(),
  }
}
