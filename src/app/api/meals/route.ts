/**
 * Meals API — Supabase-native
 * GET  /api/meals   — fetch meals (food_logs grouped by meal_type)
 * POST /api/meals   — create a meal entry (alias for food-logs)
 * 
 * SECURITY: Requires authentication, rate limiting, Zod validation.
 * 
 * @deprecated POST: Use /api/food-logs instead for new code.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getRateLimitHeaders, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { getOrCreateRequestId, getRequestIdHeaders, createRequestContext, withRequestId } from '@/lib/request-id'
import { logger } from '@/lib/logger'
import { validateMacroCalorieBalance } from '@/lib/nutrition-calculations'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const

function isValidMealType(type: string | null): type is typeof MEAL_TYPES[number] {
  return type !== null && MEAL_TYPES.includes(type as typeof MEAL_TYPES[number])
}

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)

  return withRequestId(requestId, async () => {
    try {
      // ─── Rate Limiting ─────────────────────────────────────────
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_READ)

      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: RATE_LIMITS.API_READ.message, requestId },
          { status: 429, headers: { ...getRateLimitHeaders(rateLimitResult), ...getRequestIdHeaders(requestId) } }
        )
      }

      // ─── Authentication ─────────────────────────────────────────
      let user
      try {
        user = await requireAuth(request)
      } catch {
        return NextResponse.json({ error: 'Authentication required', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }

      const supabase = await createClient()
      const { searchParams } = new URL(request.url)
      const date = searchParams.get('date')

      // Validate date format
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }

      let query = supabase
        .from('food_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(100)

      if (date) {
        const start = new Date(date); start.setHours(0, 0, 0, 0)
        const end = new Date(date); end.setHours(23, 59, 59, 999)
        query = query.gte('logged_at', start.toISOString()).lte('logged_at', end.toISOString())
      }

      const { data, error } = await query
      if (error) throw error

      return NextResponse.json({ meals: data ?? [] })
    } catch (err) {
      logger.error('Error fetching meals', err, { requestId })
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }
      return NextResponse.json({ error: 'Failed to fetch meals', requestId }, { status: 500, headers: getRequestIdHeaders(requestId) })
    }
  })
}

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)

  return withRequestId(requestId, async () => {
    try {
      // ─── Rate Limiting ─────────────────────────────────────────
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_STANDARD)

      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: RATE_LIMITS.API_STANDARD.message, requestId },
          { status: 429, headers: { ...getRateLimitHeaders(rateLimitResult), ...getRequestIdHeaders(requestId) } }
        )
      }

      // ─── Authentication ─────────────────────────────────────────
      let user
      try {
        user = await requireAuth(request)
      } catch {
        return NextResponse.json({ error: 'Authentication required', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }

      // ─── Parse and Validate Body ────────────────────────────────
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

      const supabase = await createClient()

      // Validate meal_type
      const mealType = body.mealType ?? body.meal_type ?? 'snack'
      if (!isValidMealType(mealType)) {
        return NextResponse.json({ error: `Invalid meal_type. Must be one of: ${MEAL_TYPES.join(', ')}`, requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }

      // Clamp macro values
      const calories = Math.max(0, Math.min(Number(body.calories) || 0, 100000))
      const protein = Math.max(0, Math.min(Number(body.protein) || 0, 10000))
      const carbs = Math.max(0, Math.min(Number(body.carbs) || 0, 10000))
      const fat = Math.max(0, Math.min(Number(body.fat ?? body.fats) || 0, 10000))

      const { data, error } = await supabase.from('food_logs').insert({
        user_id: user.id,
        food_name: body.foodName ?? body.food_name ?? body.name ?? 'Meal',
        quantity: Math.max(0, Math.min(Number(body.quantity) || 1, 100000)),
        unit: (body.unit ?? 'serving').slice(0, 16),
        calories,
        protein,
        carbs,
        fat,
        meal_type: mealType,
        logged_at: body.loggedAt ?? body.logged_at ?? new Date().toISOString(),
        source: body.source ?? 'manual',
      }).select().single()

      if (error) throw error

      logger.api('POST', '/api/meals', { statusCode: 201, context: { userId: user.id } })

      return NextResponse.json({ meal: data }, { status: 201 })
    } catch (err) {
      logger.error('Error saving meal', err, { requestId })
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401, headers: getRequestIdHeaders(requestId) })
      }
      return NextResponse.json({ error: 'Failed to save meal', requestId }, { status: 500, headers: getRequestIdHeaders(requestId) })
    }
  })
}
