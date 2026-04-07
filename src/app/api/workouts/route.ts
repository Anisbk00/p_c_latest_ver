/**
 * Workouts API — Supabase-native
 * GET  /api/workouts  — list workouts
 * POST /api/workouts  — create workout
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { workoutCreateSchema } from '@/lib/zod-schemas'
import { checkRateLimit, createRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { XPService, calculateWorkoutXPTier } from '@/lib/xp-service'

// Idempotency cache: prevents duplicate workout creation on retries (5-minute TTL)
const idempotencyCache = new Map<string, { response: NextResponse; expiresAt: number }>()
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const { searchParams } = new URL(request.url)
    
    // PAGINATION FIX: Add limit and offset with sensible defaults
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 1), 200)
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0)
    const includeRouteData = searchParams.get('include_route') === 'true'

    // PERF-FIX: Select only needed columns, exclude large route_data by default
    // route_data can be 100KB+ for GPS workouts, significantly slowing API responses
    const selectColumns = includeRouteData
      ? '*'
      : 'id, user_id, activity_type, workout_type, name, started_at, completed_at, duration_minutes, distance_meters, calories_burned, avg_heart_rate, max_heart_rate, avg_pace, avg_speed, max_speed, elevation_gain, elevation_loss, splits, notes, rating, photo_urls, is_pr, pr_type, source, gpx_file_url, created_at, updated_at'

    const { data, error } = await supabase
      .from('workouts')
      .select(selectColumns)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return NextResponse.json({ 
      workouts: data ?? [],
      pagination: {
        limit,
        offset,
        hasMore: (data?.length ?? 0) === limit
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Only log detailed error server-side
    if (process.env.NODE_ENV === 'development') {
      console.error('[API] Workout error:', msg);
    }
    return NextResponse.json({ error: 'Failed to fetch workouts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // ─── Rate Limiting ─────────────────────────────────────────
    const rateLimitKey = createRateLimitKey(request, 'workout-create')
    const rateLimitResult = checkRateLimit(rateLimitKey, {
      windowMs: 60_000,
      maxRequests: 10,
      blockDurationMs: 60_000,
      message: 'Too many workout creations. Please try again later.',
    })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many workout creations. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      )
    }

    const { supabase, user } = await getSupabaseUser()

    // ─── Idempotency Check ─────────────────────────────────────
    const idempotencyKey = request.headers.get('X-Idempotency-Key')
    if (idempotencyKey) {
      const now = Date.now()
      const cached = idempotencyCache.get(idempotencyKey)
      if (cached && cached.expiresAt > now) {
        // Prune expired entries periodically
        if (idempotencyCache.size > 1000) {
          for (const [k, v] of idempotencyCache) {
            if (v.expiresAt <= now) idempotencyCache.delete(k)
          }
        }
        return cached.response
      }
    }

    const rawBody = await request.json()
    
    // P2 FIX: Validate input with Zod schema
    const parseResult = workoutCreateSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }
    const body = parseResult.data

    let routeDataUrl = null;
    let routeDataForDb = null;
    const routeData = body.routeData;
    
    if (routeData) {
      const routeDataStr = typeof routeData === 'string' ? routeData : JSON.stringify(routeData);
      const fileName = `${user.id}/${crypto.randomUUID()}_route.json`;
      
      // P1 FIX: Always try to store in object storage first (prevents large DB rows)
      const { error: uploadError } = await supabase.storage
        .from('gpx-files')
        .upload(fileName, routeDataStr, {
          contentType: 'application/json',
          upsert: true,
        });

      if (uploadError) {
        console.warn('[Workouts API] Failed to upload route data to storage:', uploadError);
        // P1 FIX: Only fallback to DB storage if route data is under 100KB
        // Larger route data should fail to prevent DB bloat
        if (routeDataStr.length > 100 * 1024) {
          console.error('[Workouts API] Route data too large for fallback storage:', routeDataStr.length);
          // Don't fail the request, just skip route data
          routeDataForDb = null;
        } else {
          // Small enough for DB fallback
          try {
            routeDataForDb = typeof routeData === 'string' ? JSON.parse(routeData) : routeData;
          } catch {
            routeDataForDb = null;
          }
        }
      } else {
        routeDataUrl = fileName;
        // Store route data in DB as well for offline access
        try {
          routeDataForDb = typeof routeData === 'string' ? JSON.parse(routeData) : routeData;
        } catch {
          routeDataForDb = null;
        }
      }
    }

    const { data, error } = await supabase.from('workouts').insert({
      user_id: user.id,
      activity_type: body.activityType,
      workout_type: body.workoutType,
      name: body.name ?? null,
      started_at: body.startedAt ?? new Date().toISOString(),
      completed_at: body.completedAt ?? null,
      duration_minutes: body.durationMinutes ?? null,
      distance_meters: body.distanceMeters ?? null,
      calories_burned: body.caloriesBurned ?? null,
      avg_heart_rate: body.avgHeartRate ?? null,
      max_heart_rate: body.maxHeartRate ?? null,
      avg_pace: body.avgPace ?? null,
      avg_speed: body.avgSpeed ?? null,
      max_speed: body.maxSpeed ?? null,
      elevation_gain: body.elevationGain ?? null,
      elevation_loss: body.elevationLoss ?? null,
      route_data: routeDataForDb,
      splits: body.splits ?? null,
      notes: body.notes ?? null,
      source: body.source,
      gpx_file_url: routeDataUrl,
    }).select().single()

    if (error) {
      // Clean up orphaned storage file
      if (routeDataUrl) {
        await supabase.storage.from('gpx-files').remove([routeDataUrl]).catch(() => {});
      }
      throw error;
    }

    // Fire-and-forget adaptive training signal
    import('@/lib/ai/adaptive-engine').then(({ recordSignal }) => {
      recordSignal({
        userId: user.id,
        signalType: 'workout_completed',
        signalData: {
          workout_id: data.id,
          activity_type: data.activity_type,
          duration_minutes: data.duration_minutes,
          calories_burned: data.calories_burned,
          source: data.source,
        },
        strength: 1.0,
      });
    }).catch(() => undefined);

    // Award XP for workout using production-ready XP service
    const xpService = new XPService(supabase);
    const durationMin = data.duration_minutes ?? 0;
    const caloriesBurned = data.calories_burned ?? 0;
    const avgHeartRate = data.avg_heart_rate ?? undefined;
    const isPR = data.is_pr ?? false;
    
    // Calculate appropriate XP tier based on workout metrics
    const xpAction = calculateWorkoutXPTier(durationMin, caloriesBurned, isPR, avgHeartRate);
    
    // Award XP with proper error handling and logging
    xpService.awardXP({
      userId: user.id,
      action: xpAction,
      referenceId: data.id,
      description: `Completed ${data.activity_type || 'workout'}${durationMin ? ` (${durationMin} min)` : ''}`,
      metadata: {
        workout_id: data.id,
        activity_type: data.activity_type,
        duration_minutes: durationMin,
        calories_burned: caloriesBurned,
        is_pr: isPR,
      },
    }).then(result => {
      if (result.success) {
        console.log(`[Workout API] ✓ Awarded ${result.awarded} XP for ${xpAction}`);
      } else {
        console.error(`[Workout API] ✗ Failed to award XP: ${result.error}`);
      }
    }).catch(err => {
      console.error('[Workout API] XP service error:', err);
    });
    
    // Check for achievements (first workout, etc.)
    xpService.checkAchievements(user.id).catch(() => {});
    
    // Check if daily activities are complete
    xpService.checkDailyComplete(user.id).catch(() => {});

    const response = NextResponse.json({ workout: data }, { status: 201 })

    // Cache successful response for idempotency
    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, {
        response,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      })
    }

    return response
  } catch (err) {
    const msg = err instanceof Error ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err))
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Only log detailed error server-side
    if (process.env.NODE_ENV === 'development') {
      console.error('[API] Workout error:', msg);
    }
    return NextResponse.json({ error: 'Failed to create workout' }, { status: 500 })
  }
}
