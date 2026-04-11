/**
 * Profile API Route — Supabase-native with Optimistic Locking
 *
 * GET  /api/profile  — fetch full profile
 * PUT  /api/profile  — replace profile fields (atomic with optimistic locking)
 * PATCH /api/profile — partial profile update (atomic with optimistic locking)
 *
 * Security Features:
 * - Optimistic locking via version/timestamp checks
 * - Distributed rate limiting (persists across restarts)
 * - Atomic updates via Supabase RPC function
 *
 * All data lives in Supabase: profiles, user_profiles, user_settings, goals, body_metrics, workouts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { createAdminClient } from '@/lib/supabase/server'
import { calculatePersonalizedTargets, type UserProfileInput } from '@/lib/personalized-targets'
import { UserProfileUpdateSchema } from '@/lib/validation'
import {
  withDistributedRateLimit,
  DISTRIBUTED_RATE_LIMITS,
  recordDistributedFailedAttempt,
  resetDistributedFailedAttempts,
} from '@/lib/distributed-rate-limit'
import {
  getVersionFromHeaders,
  parseVersion,
  OptimisticLockError,
  getVersionHeaders,
} from '@/lib/optimistic-locking'

// ───────────────────────────────────────────────────────────────
// GET /api/profile
// ───────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Apply distributed rate limiting
  const rateCheck = await withDistributedRateLimit(request, DISTRIBUTED_RATE_LIMITS.API_READ)
  if (!rateCheck.allowed) {
    return rateCheck.response
  }

  try {
    const { supabase, user } = await getSupabaseUser()

    // ═══════════════════════════════════════════════════════════════
    // SECURITY: Check for soft-deleted accounts
    // Users with soft_deleted metadata should not get new profiles
    // ═══════════════════════════════════════════════════════════════
    if (user.user_metadata?.soft_deleted === true) {
      const deletedAt = user.user_metadata?.deleted_at;
      console.warn(`[profile GET] Blocked soft-deleted user: ${user.id}, deleted at: ${deletedAt}`);
      
      return NextResponse.json(
        { 
          error: 'Account has been deleted',
          code: 'ACCOUNT_DELETED',
          deletedAt: deletedAt,
          message: 'This account has been marked for deletion. Please contact support if this is an error.'
        },
        { status: 410 } // Gone
      );
    }

    // Fetch profile row (main identity table)
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    // Lazy-create profile if missing (first sign-in)
    if (!profile) {
      const { data: newProfile, error: insertErr } = await (supabase
        .from('profiles') as any)
        .insert({
          id: user.id,
          email: user.email ?? '',
          name: user.user_metadata?.name ?? null,
          timezone: 'UTC',
          locale: 'en',
          coaching_tone: 'encouraging',
          privacy_mode: false,
        })
        .select()
        .single()

      if (insertErr) {
        console.error('[profile] lazy-create error:', insertErr)
        return NextResponse.json({ error: 'Failed to initialize profile', details: insertErr.message }, { status: 500 })
      }

      // Also create user_settings
      await (supabase.from('user_settings') as any).upsert({ user_id: user.id }, { onConflict: 'user_id' })

      const response = NextResponse.json(buildResponse(user, newProfile, null, null, [], [], null, 0, 0, 0, [], 0, 1, 0, 0, null))
      // Add version headers for optimistic locking
      Object.entries(getVersionHeaders(newProfile)).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
      return response
    }

    // Fetch related data in parallel
    const [
      { data: userProfile },
      { data: settings },
      { data: goals },
      { data: latestWeight },
      { data: recentWorkouts },
      { data: progressPhotos },
      { data: recentFoodLogs },
      { data: recentMetrics },
      { data: experiments },
      { data: todayFoodLogs },
      { data: latestBodyFat },
      { data: latestMuscleMass },
    ] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('body_metrics').select('*').eq('user_id', user.id).eq('metric_type', 'weight').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
      (supabase.from('workouts') as any).select('id, started_at').eq('user_id', user.id).gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).order('started_at', { ascending: false }),
      supabase.from('user_files').select('*').eq('user_id', user.id).eq('category', 'progress_photo').order('created_at', { ascending: false }).limit(50),
      supabase.from('food_logs').select('logged_at').eq('user_id', user.id).gte('logged_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('body_metrics').select('captured_at').eq('user_id', user.id).gte('captured_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('ai_insights').select('*').eq('user_id', user.id).eq('insight_type', 'experiment').order('created_at', { ascending: false }),
      // Get today's food logs for nutrition score calculation
      supabase.from('food_logs').select('calories, protein, carbs, fat').eq('user_id', user.id).gte('logged_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
      // Body composition data for profile
      supabase.from('body_metrics').select('*').eq('user_id', user.id).eq('metric_type', 'body_fat').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('body_metrics').select('*').eq('user_id', user.id).eq('metric_type', 'muscle_mass').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    // ─── Admin fallback for progressPhotos if RLS blocks SELECT ────
    // If the user client returns empty progressPhotos (RLS may deny SELECT),
    // retry with admin client to ensure photos are visible in the archive.
    let finalProgressPhotos = progressPhotos
    if ((!finalProgressPhotos || finalProgressPhotos.length === 0) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const adminClient = createAdminClient()
        const { data: adminPhotos } = await (adminClient.from('user_files') as any)
          .select('*')
          .eq('user_id', user.id)
          .eq('category', 'progress_photo')
          .order('created_at', { ascending: false })
          .limit(50)
        if (adminPhotos && adminPhotos.length > 0) {
          finalProgressPhotos = adminPhotos
          console.log('[profile] RLS fallback: fetched progressPhotos via admin client')
        }
      } catch (adminErr) {
        console.warn('[profile] Admin client fallback for progressPhotos failed:', adminErr)
      }
    }

    // Helper: format a Date to YYYY-MM-DD using local timezone (not UTC)
    const dateToLocalStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // Streak calculation (consecutive days with activity - workouts OR food logs)
    let currentStreak = 0
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const todayStr = dateToLocalStr(today)
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const dateStr = dateToLocalStr(d)
      
      // Check for workout on this day (using local date comparison)
      const hasWorkout = recentWorkouts?.some(w => {
        const wd = new Date(w.started_at);
        return dateToLocalStr(wd) === dateStr
      }) ?? false
      
      // Check for food log on this day (using local date comparison)
      const hasFoodLog = recentFoodLogs?.some(f => {
        const fd = new Date(f.logged_at);
        return dateToLocalStr(fd) === dateStr
      }) ?? false
      
      if (hasWorkout || hasFoodLog) currentStreak++
      else if (i > 0) break
    }

    // Consistency Score calculation (0-100)
    // Based on how many days in the last 30 days the user tracked something
    let consistencyScore = 0
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const trackedDays = new Set<string>()
    
    // Add days with workouts (using local timezone)
    recentWorkouts?.forEach(w => {
      if (w.started_at) {
        const date = dateToLocalStr(new Date(w.started_at))
        if (new Date(date) >= thirtyDaysAgo) trackedDays.add(date)
      }
    })
    
    // Add days with food logs (using local timezone)
    recentFoodLogs?.forEach(f => {
      if (f.logged_at) {
        const date = dateToLocalStr(new Date(f.logged_at))
        if (new Date(date) >= thirtyDaysAgo) trackedDays.add(date)
      }
    })
    
    // Add days with body metrics (using local timezone)
    recentMetrics?.forEach(m => {
      if (m.captured_at) {
        const date = dateToLocalStr(new Date(m.captured_at))
        if (new Date(date) >= thirtyDaysAgo) trackedDays.add(date)
      }
    })
    
    // Calculate percentage (days tracked / 30)
    consistencyScore = Math.round((trackedDays.size / 30) * 100)

    // Calculate Nutrition Score (0-100) based on today's intake vs goals
    let nutritionScore = 0
    const activeGoal = goals?.[0] as Record<string, unknown> | undefined
    if (todayFoodLogs?.length && activeGoal) {
      const caloriesTarget = Number(activeGoal.calories_target) || 2000
      const proteinTarget = Number(activeGoal.protein_target_g) || 150
      const carbsTarget = Number(activeGoal.carbs_target_g) || 250
      const fatTarget = Number(activeGoal.fat_target_g) || 65
      
      // Sum today's intake
      const todayCalories = todayFoodLogs.reduce((sum, f) => sum + (Number(f.calories) || 0), 0)
      const todayProtein = todayFoodLogs.reduce((sum, f) => sum + (Number(f.protein) || 0), 0)
      const todayCarbs = todayFoodLogs.reduce((sum, f) => sum + (Number(f.carbs) || 0), 0)
      const todayFat = todayFoodLogs.reduce((sum, f) => sum + (Number(f.fat) || 0), 0)
      
      // Calculate adherence for each (0-100, penalize both under and over)
      const calcAdherence = (actual: number, target: number): number => {
        if (target <= 0) return 100
        const ratio = actual / target
        if (ratio >= 0.9 && ratio <= 1.1) return 100 // Within 10% is perfect
        if (ratio < 0.9) return Math.max(0, ratio * 100) // Under: linear scale
        return Math.max(0, 100 - (ratio - 1.1) * 100) // Over: penalize going over
      }
      
      const calorieScore = calcAdherence(todayCalories, caloriesTarget)
      const proteinScore = calcAdherence(todayProtein, proteinTarget)
      const carbsScore = calcAdherence(todayCarbs, carbsTarget)
      const fatScore = calcAdherence(todayFat, fatTarget)
      
      // Weighted average (protein and calories more important)
      nutritionScore = Math.round(
        (calorieScore * 0.35) + (proteinScore * 0.35) + (carbsScore * 0.15) + (fatScore * 0.15)
      )
    }

    // Get XP and level from profile
    const xp = Number(profile?.xp) || 0
    const level = Number(profile?.level) || 1

    // ─── Resolve image URLs for progressPhotos (signed URLs for private buckets) ────
    // Batch signed URLs for all photos at once instead of N individual requests
    const photoPaths = (finalProgressPhotos ?? [])
      .map((p: any) => p.path)
      .filter((path: string) => path && !path.startsWith('data:') && !path.startsWith('http'));
    
    let signedUrlMap = new Map<string, string>();
    if (photoPaths.length > 0) {
      try {
        const { data: signedUrls } = await supabase.storage
          .from('progress-photos')
          .createSignedUrls(photoPaths, 3600);
        if (signedUrls) {
          signedUrls.forEach((item: any) => {
            if (item.signedUrl) signedUrlMap.set(item.path, item.signedUrl);
          });
        }
      } catch {
        // Batch failed, fall through to individual public URLs
      }
    }
    
    const photosWithUrls = (finalProgressPhotos ?? []).map((p: any) => {
      let imageUrl: string | null = null;
      if (p.path) {
        if (p.path.startsWith('data:') || p.path.startsWith('http')) {
          imageUrl = p.path;
        } else {
          imageUrl = signedUrlMap.get(p.path) || getPublicUrl(p.path, 'progress-photos');
        }
      }
      return { ...p, _resolvedImageUrl: imageUrl };
    });

    // Build body composition object from latest metrics
    const bodyCompositionData = latestBodyFat ? {
      id: latestBodyFat.id,
      date: latestBodyFat.captured_at,
      bodyFatMin: Math.max(3, Number(latestBodyFat.value) - 3),
      bodyFatMax: Math.min(55, Number(latestBodyFat.value) + 3),
      muscleTone: latestMuscleMass?.value ? Number(latestMuscleMass.value) : null,
      confidence: Number(latestBodyFat.confidence ?? 0.5),
      photoCount: 0,
      source: (latestBodyFat.source as 'model' | 'device' | 'manual') ?? 'model',
      commentary: `Estimated body fat: ${Math.round(Number(latestBodyFat.value) - 3)}%–${Math.round(Number(latestBodyFat.value) + 3)}%. Source: AI model analysis.`,
    } : null

    const response = NextResponse.json(buildResponse(user, profile, userProfile, settings, goals ?? [], photosWithUrls, latestWeight ?? null, recentWorkouts?.length ?? 0, currentStreak, consistencyScore, experiments ?? [], xp, level, nutritionScore, recentFoodLogs?.length ?? 0, bodyCompositionData))
    // Add version headers for optimistic locking
    Object.entries(getVersionHeaders(profile)).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    return response
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[profile GET]', err)
    return NextResponse.json({ error: 'Failed to fetch profile', details: msg }, { status: 500 })
  }
}

// ───────────────────────────────────────────────────────────────
// PUT /api/profile (Atomic with Optimistic Locking)
// ───────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  // Apply distributed rate limiting
  const rateCheck = await withDistributedRateLimit(request, DISTRIBUTED_RATE_LIMITS.PROFILE_UPDATE)
  if (!rateCheck.allowed) {
    return rateCheck.response
  }

  try {
    const { supabase, user } = await getSupabaseUser()
    const adminClient = createAdminClient()
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // ─────────────────────────────────────────────────────────────
    // STRICT INPUT VALIDATION & SANITIZATION
    // ─────────────────────────────────────────────────────────────
    const parseResult = UserProfileUpdateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten()
      }, { status: 400 })
    }
    // Only allow validated, sanitized fields
    body = parseResult.data
    // Extra: sanitize all strings (trim)
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }
    
    // ─────────────────────────────────────────────────────────────
    // OPTIMISTIC LOCKING: Extract version from headers
    // ─────────────────────────────────────────────────────────────
    const versionHeader = getVersionFromHeaders(request.headers)
    const providedVersion = parseVersion(versionHeader)
    
    const {
      name, avatarUrl, coachingTone, privacyMode, timezone, locale,
      heightCm, biologicalSex, birthDate, activityLevel, fitnessLevel,
      primaryGoal, targetWeightKg, customCalorieTarget,
      customProteinTarget, customCarbsTarget, customFatTarget,
      currentWeight, weightUnit,
    } = body

    const touchesTargetInputs = [
      heightCm,
      biologicalSex,
      birthDate,
      activityLevel,
      fitnessLevel,
      primaryGoal,
      targetWeightKg,
      customCalorieTarget,
    ].some(v => v !== undefined)

    const hasIncomingWeight = currentWeight !== undefined && currentWeight !== null && `${currentWeight}` !== ''
    const parsedIncomingWeight = hasIncomingWeight ? Number(currentWeight) : NaN

    if (hasIncomingWeight && (!Number.isFinite(parsedIncomingWeight) || parsedIncomingWeight <= 0)) {
      return NextResponse.json(
        {
          error: 'Current weight is required',
          details: 'Please provide a valid current weight greater than 0.',
        },
        { status: 400 }
      )
    }

    if (touchesTargetInputs && !hasIncomingWeight) {
      const { data: latestExistingWeight } = await supabase
        .from('body_metrics')
        .select('value')
        .eq('user_id', user.id)
        .eq('metric_type', 'weight')
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const existingWeightValue = Number(latestExistingWeight?.value ?? NaN)
      if (!Number.isFinite(existingWeightValue) || existingWeightValue <= 0) {
        return NextResponse.json(
          {
            error: 'Current weight is required',
            details: 'Insert current weight before updating goals or calorie settings.',
          },
          { status: 400 }
        )
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PREPARE DATA FOR ATOMIC UPDATE
    // ─────────────────────────────────────────────────────────────
    
    const profileData: Record<string, unknown> = {}
    if (name !== undefined) profileData.name = name
    if (avatarUrl !== undefined) profileData.avatar_url = avatarUrl
    if (coachingTone !== undefined) profileData.coaching_tone = coachingTone
    if (privacyMode !== undefined) profileData.privacy_mode = privacyMode
    if (timezone !== undefined) profileData.timezone = timezone
    if (locale !== undefined) profileData.locale = locale

    const userProfileData: Record<string, unknown> = {}
    if (heightCm !== undefined) userProfileData.height_cm = heightCm
    if (biologicalSex !== undefined) userProfileData.biological_sex = biologicalSex
    if (birthDate !== undefined) userProfileData.birth_date = birthDate
    if (activityLevel !== undefined) userProfileData.activity_level = activityLevel
    if (fitnessLevel !== undefined) userProfileData.fitness_level = fitnessLevel
    if (targetWeightKg !== undefined) userProfileData.target_weight_kg = targetWeightKg
    if (primaryGoal !== undefined) userProfileData.primary_goal = primaryGoal

    const bodyMetricData: Record<string, unknown> = {}
    if (hasIncomingWeight) {
      bodyMetricData.metric_type = 'weight'
      bodyMetricData.value = parsedIncomingWeight
      bodyMetricData.unit = weightUnit === 'lb' || weightUnit === 'lbs' ? 'lb' : 'kg'
      bodyMetricData.captured_at = new Date().toISOString()
      bodyMetricData.source = 'manual'
    }

    const settingsData: Record<string, unknown> = {}
    if (customCalorieTarget !== undefined || customProteinTarget !== undefined || customCarbsTarget !== undefined || customFatTarget !== undefined) {
      const parsedCustomCalories = customCalorieTarget === null || customCalorieTarget === ''
        ? null
        : Number(customCalorieTarget)

      const parsedCustomProtein = customProteinTarget === null || customProteinTarget === undefined
        ? null
        : Number(customProteinTarget)

      const parsedCustomCarbs = customCarbsTarget === null || customCarbsTarget === undefined
        ? null
        : Number(customCarbsTarget)

      const parsedCustomFat = customFatTarget === null || customFatTarget === undefined
        ? null
        : Number(customFatTarget)

      settingsData.map_storage = {
        custom_calorie_target: Number.isFinite(parsedCustomCalories) && parsedCustomCalories > 900
          ? Math.round(parsedCustomCalories)
          : null,
        custom_protein_target_g: Number.isFinite(parsedCustomProtein) && parsedCustomProtein > 0
          ? Math.round(parsedCustomProtein)
          : null,
        custom_carbs_target_g: Number.isFinite(parsedCustomCarbs) && parsedCustomCarbs > 0
          ? Math.round(parsedCustomCarbs)
          : null,
        custom_fat_target_g: Number.isFinite(parsedCustomFat) && parsedCustomFat > 0
          ? Math.round(parsedCustomFat)
          : null,
      }
    }

    // ─────────────────────────────────────────────────────────────
    // ATOMIC UPDATE VIA RPC (with fallback to direct queries)
    // ─────────────────────────────────────────────────────────────
    
    const { data: rpcResult, error: rpcError } = await adminClient.rpc('atomic_profile_update', {
      p_user_id: user.id,
      p_profile_data: Object.keys(profileData).length > 0 ? profileData : null,
      p_user_profile_data: Object.keys(userProfileData).length > 0 ? userProfileData : null,
      p_body_metric_data: Object.keys(bodyMetricData).length > 0 ? bodyMetricData : null,
      p_settings_data: Object.keys(settingsData).length > 0 ? settingsData : null,
      p_goal_data: null, // Goals handled separately with target calculation
      p_expected_version: typeof providedVersion === 'number' ? providedVersion : null,
      p_expected_updated_at: typeof providedVersion === 'string' ? providedVersion : null,
    })

    // Fallback to direct queries if RPC doesn't exist
    if (rpcError) {
      console.warn('[profile PUT] RPC failed, using fallback:', rpcError.message)
      
      // Direct fallback updates without RPC (using admin client to bypass RLS)
      const updatedTables: string[] = []
      
      // Update profiles table
      if (Object.keys(profileData).length > 0) {
        const { error: profileErr } = await adminClient
          .from('profiles')
          .update({ ...profileData, updated_at: new Date().toISOString() })
          .eq('id', user.id)
        if (!profileErr) updatedTables.push('profiles')
        else console.error('[profile PUT] Profile update error:', profileErr)
      }
      
      // Upsert user_profiles table
      if (Object.keys(userProfileData).length > 0) {
        const { error: userProfileErr } = await adminClient
          .from('user_profiles')
          .upsert({ user_id: user.id, ...userProfileData, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        if (!userProfileErr) updatedTables.push('user_profiles')
        else console.error('[profile PUT] User profile update error:', userProfileErr)
      }
      
      // Insert body metrics
      if (Object.keys(bodyMetricData).length > 0) {
        const { error: metricErr } = await adminClient
          .from('body_metrics')
          .insert({ user_id: user.id, ...bodyMetricData })
        if (!metricErr) updatedTables.push('body_metrics')
        else console.error('[profile PUT] Body metric insert error:', metricErr)
      }
      
      // Update user settings
      if (Object.keys(settingsData).length > 0) {
        const { data: currentSettings } = await adminClient
          .from('user_settings')
          .select('map_storage')
          .eq('user_id', user.id)
          .maybeSingle()
        
        const mergedMapStorage = {
          ...(currentSettings?.map_storage || {}),
          ...(settingsData.map_storage || {}),
        }
        
        const { error: settingsErr } = await adminClient
          .from('user_settings')
          .update({ map_storage: mergedMapStorage, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
        if (!settingsErr) updatedTables.push('user_settings')
        else console.error('[profile PUT] Settings update error:', settingsErr)
      }
      
      // Success response for fallback
      await resetDistributedFailedAttempts(rateCheck.ip, { prefix: 'profile' })
      
      const response = NextResponse.json({ 
        success: true, 
        updated_tables: updatedTables,
        new_version: null,
        fallback: true,
      })
      return response
    }

    // Check for optimistic lock conflict
    if (rpcResult && !rpcResult.success) {
      if (rpcResult.error === 'VERSION_CONFLICT' || rpcResult.error === 'TIMESTAMP_CONFLICT') {
        // Reset failed attempts on our side since it's a conflict, not a failure
        await resetDistributedFailedAttempts(rateCheck.ip, { prefix: 'profile' })
        
        return NextResponse.json(
          {
            error: 'Profile was modified by another request',
            code: 'CONFLICT',
            currentVersion: rpcResult.current_version || rpcResult.current_updated_at,
            providedVersion: rpcResult.expected_version || rpcResult.expected_updated_at,
          },
          { status: 409 }
        )
      }
      
      return NextResponse.json({ error: rpcResult.message || 'Update failed' }, { status: 500 })
    }

    // ─────────────────────────────────────────────────────────────
    // RECALCULATE TARGETS (If needed)
    // ─────────────────────────────────────────────────────────────
    
    if (touchesTargetInputs || hasIncomingWeight) {
      try {
        const [
          { data: freshUserProfile },
          { data: latestWeight },
          { data: existingGoal },
          { data: latestSettings },
        ] = await Promise.all([
          supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('body_metrics').select('value').eq('user_id', user.id).eq('metric_type', 'weight').order('captured_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
          (supabase.from('user_settings') as any).select('map_storage').eq('user_id', user.id).maybeSingle(),
        ])

        const currentWeight = Number(latestWeight?.value ?? NaN)
        if (Number.isFinite(currentWeight) && currentWeight > 0 && freshUserProfile) {
          const storedCustomCalories = Number((latestSettings?.map_storage as any)?.custom_calorie_target ?? NaN)
          const customCaloriesFromRequest = customCalorieTarget === undefined
            ? NaN
            : Number(customCalorieTarget)
          const resolvedCustomCalories = Number.isFinite(customCaloriesFromRequest) && customCaloriesFromRequest > 900
            ? Math.round(customCaloriesFromRequest)
            : Number.isFinite(storedCustomCalories) && storedCustomCalories > 900
              ? Math.round(storedCustomCalories)
              : null

          // Resolve custom macros from request or stored settings
          const storedCustomProtein = Number((latestSettings?.map_storage as any)?.custom_protein_target_g ?? NaN)
          const storedCustomCarbs = Number((latestSettings?.map_storage as any)?.custom_carbs_target_g ?? NaN)
          const storedCustomFat = Number((latestSettings?.map_storage as any)?.custom_fat_target_g ?? NaN)
          const requestProtein = customProteinTarget === undefined ? NaN : Number(customProteinTarget)
          const requestCarbs = customCarbsTarget === undefined ? NaN : Number(customCarbsTarget)
          const requestFat = customFatTarget === undefined ? NaN : Number(customFatTarget)
          const resolvedCustomProtein = Number.isFinite(requestProtein) && requestProtein > 0
            ? Math.round(requestProtein)
            : Number.isFinite(storedCustomProtein) && storedCustomProtein > 0 ? Math.round(storedCustomProtein) : null
          const resolvedCustomCarbs = Number.isFinite(requestCarbs) && requestCarbs > 0
            ? Math.round(requestCarbs)
            : Number.isFinite(storedCustomCarbs) && storedCustomCarbs > 0 ? Math.round(storedCustomCarbs) : null
          const resolvedCustomFat = Number.isFinite(requestFat) && requestFat > 0
            ? Math.round(requestFat)
            : Number.isFinite(storedCustomFat) && storedCustomFat > 0 ? Math.round(storedCustomFat) : null

          const input: UserProfileInput = {
            weightKg: currentWeight,
            heightCm: freshUserProfile.height_cm,
            birthDate: freshUserProfile.birth_date,
            biologicalSex: freshUserProfile.biological_sex,
            activityLevel: freshUserProfile.activity_level || 'moderate',
            fitnessLevel: freshUserProfile.fitness_level || 'beginner',
            primaryGoal: freshUserProfile.primary_goal || 'maintenance',
            targetWeightKg: freshUserProfile.target_weight_kg,
            targetDate: existingGoal?.target_date || null,
            customCalorieTarget: resolvedCustomCalories,
          }

          const targets = calculatePersonalizedTargets(input)
          const explicitCustomCalories = Number.isFinite(Number(resolvedCustomCalories ?? NaN)) && Number(resolvedCustomCalories) > 900
            ? Math.round(Number(resolvedCustomCalories))
            : null

          // Update goal with calculated targets (custom macros override auto-calculated)
          const goalData = {
            user_id: user.id,
            status: 'active',
            goal_type: input.primaryGoal,
            target_value: input.targetWeightKg || currentWeight,
            calories_target: explicitCustomCalories ?? targets.dailyCalories,
            protein_target_g: resolvedCustomProtein ?? targets.protein,
            carbs_target_g: resolvedCustomCarbs ?? targets.carbs,
            fat_target_g: resolvedCustomFat ?? targets.fat,
            water_target_ml: targets.waterMl,
            steps_target: targets.steps,
            updated_at: new Date().toISOString()
          }

          if (existingGoal?.id) {
            await (supabase.from('goals') as any).update(goalData).eq('id', existingGoal.id)
          } else {
            await (supabase.from('goals') as any).insert(goalData)
          }
        }
      } catch (calcError) {
        console.error('[profile PUT] Target recalc failed:', calcError)
        // Continue - do not fail the request
      }
    }

    // Reset rate limit failed attempts on success
    await resetDistributedFailedAttempts(rateCheck.ip, { prefix: 'profile' })

    const response = NextResponse.json({ 
      success: true, 
      updated_tables: rpcResult?.updated_tables || [],
      new_version: rpcResult?.new_version,
    })
    
    // Add version headers to response
    if (rpcResult?.new_version) {
      response.headers.set('X-Resource-Version', rpcResult.new_version.toString())
      response.headers.set('ETag', `"${rpcResult.new_version}"`)
    }
    
    return response
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[profile PUT]', err)
    return NextResponse.json({ error: 'Failed to update profile', details: msg }, { status: 500 })
  }
}

// ───────────────────────────────────────────────────────────────
// PATCH /api/profile
// ───────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  // PATCH should enforce the same strict validation as PUT
  return PUT(request)
}

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

function getPublicUrl(path: string | null | undefined, bucket: string): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('data:')) return path; // base64 data URL fallback
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return path;
  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${cleanBase}/storage/v1/object/public/${bucket}/${cleanPath}`;
}

function buildResponse(
  user: { id: string; email?: string },
  profile: Record<string, unknown> | null,
  userProfile: Record<string, unknown> | null,
  settings: Record<string, unknown> | null,
  goals: Record<string, unknown>[],
  progressPhotos: Record<string, unknown>[],
  latestWeight: Record<string, unknown> | null,
  totalWorkouts = 0,
  currentStreak = 0,
  consistencyScore = 0,
  experiments: Record<string, unknown>[] = [],
  xp = 0,
  level = 1,
  nutritionScore = 0,
  totalFoodLogs = 0,
  bodyComposition: Record<string, unknown> | null = null,
) {
  // Calculate XP progress within current level
  const xpForCurrentLevel = (level - 1) * 100
  const xpProgress = xp - xpForCurrentLevel
  const xpToNextLevel = 100 // Always 100 XP per level

  return {
    user: {
      id: user.id,
      email: profile?.email ?? user.email,
      name: profile?.name ?? null,
      avatarUrl: profile?.avatar_url ? getPublicUrl(profile.avatar_url as string, 'progress-photos') : null,
      coachingTone: profile?.coaching_tone ?? 'encouraging',
      privacyMode: profile?.privacy_mode ?? false,
      timezone: profile?.timezone ?? 'UTC',
      createdAt: profile?.created_at ?? null,
      updatedAt: profile?.updated_at ?? null,
      version: profile?.version ?? 0,
      // XP and Level data
      xp,
      level,
      xpProgress,
      xpToNextLevel,
    },
    profile: {
      userId: user.id,
      heightCm: userProfile?.height_cm ?? null,
      biologicalSex: userProfile?.biological_sex ?? null,
      birthDate: userProfile?.birth_date ?? null,
      activityLevel: userProfile?.activity_level ?? 'moderate',
      fitnessLevel: userProfile?.fitness_level ?? 'beginner',
      primaryGoal: userProfile?.primary_goal ?? (goals[0] as Record<string, unknown>)?.goal_type ?? null,
      targetWeightKg: userProfile?.target_weight_kg ?? null,
    },
    settings: {
      userId: user.id,
      setupCompleted: settings?.setup_completed ?? false,
      setupSkipped: settings?.setup_skipped ?? false,
      theme: settings?.theme ?? 'system',
      notificationsEnabled: settings?.notifications_enabled ?? true,
      emailNotifications: settings?.email_notifications ?? true,
      pushNotifications: settings?.push_notifications ?? true,
      language: settings?.language ?? 'en',
      units: settings?.units ?? 'metric',
      customCalorieTarget: Number((settings as any)?.map_storage?.custom_calorie_target ?? NaN) > 0
        ? Math.round(Number((settings as any)?.map_storage?.custom_calorie_target))
        : null,
      customProteinTarget: Number((settings as any)?.map_storage?.custom_protein_target_g ?? NaN) > 0
        ? Math.round(Number((settings as any)?.map_storage?.custom_protein_target_g))
        : null,
      customCarbsTarget: Number((settings as any)?.map_storage?.custom_carbs_target_g ?? NaN) > 0
        ? Math.round(Number((settings as any)?.map_storage?.custom_carbs_target_g))
        : null,
      customFatTarget: Number((settings as any)?.map_storage?.custom_fat_target_g ?? NaN) > 0
        ? Math.round(Number((settings as any)?.map_storage?.custom_fat_target_g))
        : null,
    },
    goals: goals.map(g => ({
      id: g.id,
      goalType: g.goal_type,
      targetValue: g.target_value,
      currentValue: g.current_value,
      status: g.status,
      caloriesTarget: (g as any).calories_target ?? null,
      proteinTargetG: (g as any).protein_target_g ?? null,
      carbsTargetG: (g as any).carbs_target_g ?? null,
      fatTargetG: (g as any).fat_target_g ?? null,
      waterTargetMl: (g as any).water_target_ml ?? null,
      stepsTarget: (g as any).steps_target ?? null,
    })),
    badges: [],
    progressPhotos: progressPhotos.map(p => {
      const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
      return {
        id: p.id,
        capturedAt: p.created_at,
        imageUrl: (p as any)._resolvedImageUrl ?? (p.path ? getPublicUrl(p.path as string, 'progress-photos') : null),
        thumbnailUrl: null,
        weight: meta.weight ?? null,
        notes: meta.notes ?? null,
        bodyFat: meta.bodyFat ?? null,
        muscleMass: meta.muscleMass ?? null,
        analysisSource: meta.analysisSource ?? null,
        analysisConfidence: meta.analysisConfidence ?? null,
        changeZones: meta.changeZones ?? null,
      };
    }),
    experiments: experiments.map(e => {
      const content = typeof e.content === 'string' ? JSON.parse(e.content) : e.content || {};
      return {
        id: e.id as string,
        title: content.title || 'Untitled Experiment',
        description: content.description || '',
        duration: content.duration || 14,
        durationWeeks: Math.ceil((content.duration || 14) / 7),
        adherence: content.adherence || 0,
        adherenceScore: content.adherence || 0,
        status: content.status || 'available',
        startedAt: content.startDate || e.created_at,
        expectedOutcome: content.expectedOutcome || '',
        experimentType: content.category || 'habit',
        category: content.category || 'habit',
        dailyActions: content.dailyActions || [],
        whyItWorks: content.whyItWorks || '',
        tipsForSuccess: content.tipsForSuccess || [],
      };
    }),
    stats: {
      totalWorkouts,
      currentStreak,
      consistencyScore,
      nutritionScore,
      totalMeals: totalFoodLogs,
      totalMeasurements: 0,
      totalProgressPhotos: progressPhotos.length,
      totalFoodLogEntries: totalFoodLogs,
      xp,
      level,
    },
    latestWeight: latestWeight ? {
      id: latestWeight.id,
      value: latestWeight.value,
      unit: latestWeight.unit ?? 'kg',
      capturedAt: latestWeight.captured_at,
    } : null,
    bodyComposition: bodyComposition ? {
      id: bodyComposition.id,
      date: bodyComposition.date,
      bodyFatMin: bodyComposition.bodyFatMin,
      bodyFatMax: bodyComposition.bodyFatMax,
      muscleTone: bodyComposition.muscleTone,
      confidence: bodyComposition.confidence,
      photoCount: bodyComposition.photoCount,
      source: bodyComposition.source,
      commentary: bodyComposition.commentary,
    } : null,
  }
}
