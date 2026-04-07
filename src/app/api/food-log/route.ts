/**
 * Food Log API — Supabase-native (LEGACY ENDPOINT)
 * 
 * @deprecated Use /api/food-logs instead — this endpoint exists for backward compatibility.
 * All new code should use /api/food-logs which has Zod validation, idempotency, and rate limiting.
 * 
 * SECURITY FIXES: Added rate limiting, Zod validation, input sanitization, macro clamping.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getRateLimitHeaders, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { getOrCreateRequestId, getRequestIdHeaders, createRequestContext, withRequestId } from '@/lib/request-id'
import { logger } from '@/lib/logger'
import { validateMacroCalorieBalance } from '@/lib/nutrition-calculations'

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)

  return withRequestId(requestId, async () => {
    try {
      // Rate limiting
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_READ)
      if (!rateLimitResult.success) {
        return NextResponse.json({ error: RATE_LIMITS.API_READ.message, requestId }, { status: 429, headers: { ...getRateLimitHeaders(rateLimitResult), ...getRequestIdHeaders(requestId) } })
      }

      // Authentication
      let user
      try {
        user = await requireAuth(request)
      } catch {
        return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }

      const supabase = await createClient()
      const { searchParams } = new URL(request.url)
      const date = searchParams.get('date')
      
      // Validate date format
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: 'Invalid date format', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10), 1), 200)

      let query = supabase
        .from('food_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(limit)

      if (date) {
        const start = new Date(date); start.setHours(0, 0, 0, 0)
        const end = new Date(date); end.setHours(23, 59, 59, 999)
        query = query.gte('logged_at', start.toISOString()).lte('logged_at', end.toISOString())
      }

      const { data, error } = await query
      if (error) throw error

      return NextResponse.json({ entries: data ?? [] })
    } catch (err) {
      logger.error('Error fetching food log (legacy)', err, { requestId })
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }
      return NextResponse.json({ error: 'Failed to fetch food log', requestId }, { status: 500, headers: getRequestIdHeaders(requestId) })
    }
  })
}

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)

  return withRequestId(requestId, async () => {
    try {
      // Rate limiting
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_STANDARD)
      if (!rateLimitResult.success) {
        return NextResponse.json({ error: RATE_LIMITS.API_STANDARD.message, requestId }, { status: 429, headers: { ...getRateLimitHeaders(rateLimitResult), ...getRequestIdHeaders(requestId) } })
      }

      // Authentication
      let user
      try {
        user = await requireAuth(request)
      } catch {
        return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }

      // Parse body
      let body: any
      try {
        body = await request.json()
      } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON body', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }

      // Zod validation
      const { FoodLogUpdateSchema } = await import('@/lib/validation')
      const parseResult = FoodLogUpdateSchema.safeParse(body)
      if (!parseResult.success) {
        return NextResponse.json({ error: 'Invalid input', details: parseResult.error.flatten(), requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      body = parseResult.data

      // Sanitize strings
      for (const k of Object.keys(body)) {
        if (typeof body[k] === 'string') body[k] = body[k].trim()
      }

      // Clamp macro values
      const calories = Math.max(0, Math.min(Number(body.calories) || 0, 100000))
      const protein = Math.max(0, Math.min(Number(body.protein) || 0, 10000))
      const carbs = Math.max(0, Math.min(Number(body.carbs) || 0, 10000))
      const fat = Math.max(0, Math.min(Number(body.fat ?? body.fats) || 0, 10000))

      // Idempotency check
      const idempotencyKey = request.headers.get('x-idempotency-key') || request.headers.get('idempotency-key')
      const supabase = await createClient()
      
      if (idempotencyKey) {
        const { data: existingEntry } = await supabase
          .from('food_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('device_id', `idem:${idempotencyKey}`)
          .limit(1)
          .maybeSingle()
        
        if (existingEntry) {
          return NextResponse.json({ entry: existingEntry, duplicate: true, message: 'Duplicate entry prevented' }, { status: 200, headers: getRequestIdHeaders(requestId) })
        }
      }

      // Resolve food name if missing
      let resolvedName = body.foodName ?? body.food_name
      if ((!resolvedName || resolvedName === 'Unknown') && (body.foodId || body.food_id)) {
        const idToLookup = body.foodId || body.food_id
        const { data: userFood } = await supabase
          .from('foods')
          .select('name')
          .eq('id', idToLookup)
          .eq('user_id', user.id)
          .single()

        if (userFood) resolvedName = userFood.name
        else {
          const { data: globalFood } = await supabase
            .from('global_foods')
            .select('name')
            .eq('id', idToLookup)
            .single()
          if (globalFood) resolvedName = globalFood.name
        }
      }

      // Validate meal type
      const validMealTypes = ['breakfast', 'lunch', 'dinner', 'snack']
      const mealType = body.mealType ?? body.meal_type ?? 'snack'
      const safeMealType = validMealTypes.includes(mealType) ? mealType : 'snack'

      const { data, error } = await supabase.from('food_logs').insert({
        user_id: user.id,
        food_name: resolvedName ?? 'Unknown',
        quantity: Math.max(0, Math.min(Number(body.quantity) || 1, 100000)),
        unit: (body.unit ?? 'serving').slice(0, 16),
        calories,
        protein,
        carbs,
        fat,
        meal_type: safeMealType,
        logged_at: body.loggedAt ?? body.logged_at ?? new Date().toISOString(),
        source: body.source ?? 'manual',
        device_id: idempotencyKey ? `idem:${idempotencyKey}` : null,
      }).select().single()

      if (error) throw error

      // Fire-and-forget adaptive training signal
      import('@/lib/ai/adaptive-engine').then(({ recordSignal }) => {
        recordSignal({
          userId: user.id,
          signalType: 'food_logged',
          signalData: {
            food_log_id: data.id,
            meal_type: data.meal_type,
            calories: data.calories,
            protein: data.protein,
          },
          strength: 0.8,
        });
      }).catch(() => undefined)

      // Award XP for food logging
      try {
        const { data: xpData, error: xpError } = await supabase.rpc('award_xp', {
          p_user_id: user.id,
          p_amount: 5,
          p_action_type: 'food_log',
          p_reference_id: data.id,
          p_description: `Logged ${resolvedName || 'food'}`,
        });
        if (!xpError && xpData) {
          // award_xp returns a single JSONB object (not array)
          const xp = typeof xpData === 'object' && !Array.isArray(xpData) ? xpData : xpData?.[0];
          return NextResponse.json({
            entry: data,
            xp: {
              awarded: 5,
              newXp: xp?.new_xp,
              newLevel: xp?.new_level,
              leveledUp: xp?.leveled_up,
            },
          }, { status: 201, headers: getRequestIdHeaders(requestId) })
        }
      } catch (e) {
        // XP award failed silently
      }

      return NextResponse.json({ entry: data }, { status: 201, headers: getRequestIdHeaders(requestId) })
    } catch (err) {
      logger.error('Error logging food (legacy)', err, { requestId })
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }
      return NextResponse.json({ error: 'Failed to log food', requestId }, { status: 500, headers: getRequestIdHeaders(requestId) })
    }
  })
}
