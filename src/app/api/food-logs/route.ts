/**
 * Food Logs API Route
 *
 * Handles food log entries for authenticated users.
 * Supports date and meal_type filtering for GET requests.
 *
 * @module api/food-logs
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import {
  getFoodLogsServer,
  getFoodLogsByDateServer,
  getFoodLogsByMealType,
  getDailyNutritionSummary,
  createFoodLogServer,
  getFoodLogsByDateRange,
} from '@/lib/data/food-logs'
import {
  checkRateLimit,
  getRateLimitHeaders,
  createRateLimitKey,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import {
  getOrCreateRequestId,
  getRequestIdHeaders,
  createRequestContext,
  withRequestId,
} from '@/lib/request-id'
import { logger } from '@/lib/logger'
import { XPService, isCompleteMealLog } from '@/lib/xp-service'
import type { InsertTables } from '@/lib/supabase/database.types'
import { validateMacroCalorieBalance } from '@/lib/nutrition-calculations'
// ═══════════════════════════════════════════════════════════════
// Validation Helpers
// ═══════════════════════════════════════════════════════════════

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const

function isValidMealType(type: string | null): type is typeof MEAL_TYPES[number] {
  return type !== null && MEAL_TYPES.includes(type as typeof MEAL_TYPES[number])
}

function isValidDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
}

// ═══════════════════════════════════════════════════════════════
// GET /api/food-logs - Get food logs with filtering
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)

  return withRequestId(requestId, async () => {
    const startTime = Date.now()

    try {
      // ─── Rate Limiting ─────────────────────────────────────────
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_READ)

      if (!rateLimitResult.success) {
        logger.warn('Food logs GET rate limit exceeded', {
          requestId,
          context: { ip: requestContext.ip },
        })

        return NextResponse.json(
          {
            error: RATE_LIMITS.API_READ.message,
            requestId,
            retryAfter: rateLimitResult.retryAfter,
          },
          {
            status: 429,
            headers: {
              ...getRateLimitHeaders(rateLimitResult),
              ...getRequestIdHeaders(requestId),
            },
          }
        )
      }

      // ─── Authentication ─────────────────────────────────────────
      let user
      try {
        user = await requireAuth(request)
      } catch {
        return NextResponse.json(
          { error: 'Authentication required', requestId },
          {
            status: 401,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Parse Query Parameters ─────────────────────────────────
      const { searchParams } = new URL(request.url)
      const date = searchParams.get('date')
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')
      const mealType = searchParams.get('meal_type')
      const includeSummary = searchParams.get('summary') === 'true'
      
      // PAGINATION FIX: Add limit and offset with sensible defaults
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200)
      const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

      // Validate date formats
      if (date && !isValidDateFormat(date)) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD', requestId },
          {
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      if (startDate && !isValidDateFormat(startDate)) {
        return NextResponse.json(
          { error: 'Invalid startDate format. Use YYYY-MM-DD', requestId },
          {
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      if (endDate && !isValidDateFormat(endDate)) {
        return NextResponse.json(
          { error: 'Invalid endDate format. Use YYYY-MM-DD', requestId },
          {
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      if (mealType && !isValidMealType(mealType)) {
        return NextResponse.json(
          { error: `Invalid meal_type. Must be one of: ${MEAL_TYPES.join(', ')}`, requestId },
          {
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Fetch Data ─────────────────────────────────────────
      let logs
      let summary = null

      if (startDate && endDate) {
        // Date range query
        const rangeStart = `${startDate}T00:00:00.000Z`
        const rangeEnd = `${endDate}T23:59:59.999Z`
        logs = await getFoodLogsByDateRange(user.id, rangeStart, rangeEnd)
      } else if (mealType) {
        // Meal type filter (optional date)
        logs = await getFoodLogsByMealType(user.id, mealType, date || undefined)
      } else if (date) {
        // Single date query
        logs = await getFoodLogsByDateServer(user.id, date)

        // P1 FIX: Calculate summary from already-fetched logs to avoid race condition
        // Previously called getDailyNutritionSummary which re-fetched the data
        if (includeSummary) {
          summary = {
            calories: logs.reduce((sum, e) => sum + (e.calories || 0), 0),
            protein: logs.reduce((sum, e) => sum + (e.protein || 0), 0),
            carbs: logs.reduce((sum, e) => sum + (e.carbs || 0), 0),
            fat: logs.reduce((sum, e) => sum + (e.fat || 0), 0),
            entries: logs,
          }
        }
      } else {
        // Get all logs with pagination
        logs = await getFoodLogsServer(user.id, { limit, offset })
      }

      logger.api('GET', '/api/food-logs', {
        statusCode: 200,
        duration: Date.now() - startTime,
        context: { userId: user.id, count: logs.length },
      })

      // ─── Return Response ─────────────────────────────────────────
      const response: Record<string, unknown> = {
        success: true,
        requestId,
        data: logs,
        count: logs.length,
        pagination: {
          limit,
          offset,
          hasMore: logs.length === limit
        }
      }

      if (summary) {
        response.summary = {
          calories: summary.calories,
          protein: summary.protein,
          carbs: summary.carbs,
          fat: summary.fat,
        }
      }

      return NextResponse.json(response, {
        headers: {
          ...getRateLimitHeaders(rateLimitResult),
          ...getRequestIdHeaders(requestId),
        },
      })

    } catch (error) {
      logger.error('Error fetching food logs', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })

      return NextResponse.json(
        { error: 'Failed to fetch food logs', requestId },
        {
          status: 500,
          headers: getRequestIdHeaders(requestId),
        }
      )
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// POST /api/food-logs - Create new food log entry
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)

  return withRequestId(requestId, async () => {
    const startTime = Date.now()

    // Declare outside try so it's accessible in catch
    let user: Awaited<ReturnType<typeof requireAuth>> | undefined

    try {
      // ─── Rate Limiting ─────────────────────────────────────────
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_STANDARD)

      if (!rateLimitResult.success) {
        logger.warn('Food logs POST rate limit exceeded', {
          requestId,
          context: { ip: requestContext.ip },
        })

        return NextResponse.json(
          {
            error: RATE_LIMITS.API_STANDARD.message,
            requestId,
            retryAfter: rateLimitResult.retryAfter,
          },
          {
            status: 429,
            headers: {
              ...getRateLimitHeaders(rateLimitResult),
              ...getRequestIdHeaders(requestId),
            },
          }
        )
      }

      // ─── Authentication ─────────────────────────────────────────
      try {
        user = await requireAuth(request)
      } catch {
        return NextResponse.json(
          { error: 'Authentication required', requestId },
          {
            status: 401,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }


      // ─── Parse and Strictly Validate Body ───────────────────────────────
      let body: any
      try {
        body = await request.json()
      } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON body', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      // Strict Zod validation
      const { FoodLogUpdateSchema } = await import('@/lib/validation')
      const parseResult = FoodLogUpdateSchema.safeParse(body)
      if (!parseResult.success) {
        return NextResponse.json({
          error: 'Invalid input',
          details: parseResult.error.flatten(),
          requestId
        }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      // Only allow validated, sanitized fields
      body = parseResult.data
      // Extra: sanitize all strings (trim)
      for (const k of Object.keys(body)) {
        if (typeof body[k] === 'string') body[k] = body[k].trim()
      }

      // ─── Idempotency Check ───────────────────────────────────────
      // P0 FIX: Persistent idempotency using client-provided key or content hash
      const idempotencyKey = request.headers.get('x-idempotency-key') || 
        request.headers.get('idempotency-key')
      
      // Generate content hash for duplicate detection if no idempotency key provided
      const contentHash = !idempotencyKey ? 
        `${body.food_name || ''}-${body.calories || 0}-${body.logged_at || ''}-${body.meal_type || ''}` : null
      
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      
      // Check for existing entry using idempotency key OR content hash within 24 hours
      // This handles both:
      // 1. Explicit idempotency keys (offline retry scenarios)
      // 2. Implicit duplicate detection (same food logged twice)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      
      let existingQuery = supabase
        .from('food_logs')
        .select('id, created_at')
        .eq('user_id', user.id)
        .gte('created_at', twentyFourHoursAgo)
        .limit(1)
      
      if (idempotencyKey) {
        // If client provided idempotency key, check device_id field (repurposed for idem key)
        existingQuery = existingQuery.eq('device_id', `idem:${idempotencyKey}`)
      } else if (contentHash) {
        // Content-based duplicate detection (within 5 minutes to avoid false positives)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        existingQuery = existingQuery
          .eq('food_name', body.food_name || null)
          .eq('meal_type', body.meal_type || null)
          .eq('calories', Number(body.calories))
          .gte('logged_at', fiveMinutesAgo)
      }
      
      const { data: existingEntry } = await existingQuery.maybeSingle()
      
      if (existingEntry) {
        logger.info('Duplicate food log prevented via idempotency check', {
          requestId,
          context: { userId: user.id, existingId: existingEntry.id },
        })
        
        return NextResponse.json(
          {
            success: true,
            requestId,
            data: { id: existingEntry.id, ...body, duplicate: true },
            message: 'Duplicate entry prevented',
          },
          {
            status: 200, // Return 200 for idempotent success
            headers: {
              ...getRateLimitHeaders(rateLimitResult),
              ...getRequestIdHeaders(requestId),
            },
          }
        )
      }

      // ─── P2 FIX: Macro Balance Validation (warning only) ─────────────
      const calories = Number(body.calories) || 0
      const protein = Number(body.protein) || 0
      const carbs = Number(body.carbs) || 0
      const fat = Number(body.fat) || 0
      
      // Use centralized macro validation
      const validation = validateMacroCalorieBalance(calories, protein, carbs, fat)
      
      let macroWarning: string | null = null
      if (calories > 0 && !validation.isValid) {
        macroWarning = `Macro imbalance detected: ${calories} cal reported vs ${validation.expectedCalories} cal from macros (${Math.round(validation.difference)} diff)`
        logger.warn('Food log macro imbalance', {
          requestId,
          context: { 
            reported: calories, 
            expected: validation.expectedCalories, 
            diff: validation.difference,
            diffPercent: validation.differencePercent,
            protein, carbs, fat,
          },
        })
      }

      // ─── Create Entry ─────────────────────────────────────────
      const entry: Omit<InsertTables<'food_logs'>, 'user_id'> = {
        food_id: body.food_id || null,
        food_name: body.food_name || null,
        quantity: Number(body.quantity),
        unit: body.unit || 'serving',
        calories,
        protein,
        carbs,
        fat,
        meal_type: body.meal_type || null,
        source: body.source || 'manual',
        photo_url: body.photo_url || null,
        logged_at: body.logged_at || new Date().toISOString(),
        notes: body.notes || null,
        // P0 FIX: Store idempotency key for future duplicate checks
        device_id: idempotencyKey ? `idem:${idempotencyKey}` : (body.device_id || null),
      }

      const newLog = await createFoodLogServer(user.id, entry)

      // Award XP for food logging using production-ready service
      let xpResult = null;
      try {
        const supabase = await createClient();
        const xpService = new XPService(supabase);
        
        // Determine if this is a complete meal (all macros logged)
        const protein = entry.protein || 0;
        const carbs = entry.carbs || 0;
        const fat = entry.fat || 0;
        const isComplete = isCompleteMealLog(protein, carbs, fat);
        
        const xpAction = isComplete ? 'food_log_complete_meal' : 'food_log';
        
        const result = await xpService.awardXP({
          userId: user.id,
          action: xpAction,
          referenceId: newLog.id,
          description: `Logged ${entry.food_name || 'food'}${isComplete ? ' (complete meal)' : ''}`,
          metadata: {
            food_log_id: newLog.id,
            food_name: entry.food_name,
            meal_type: entry.meal_type,
            calories: entry.calories,
            has_complete_macros: isComplete,
          },
        });
        
        if (result.success) {
          xpResult = {
            awarded: result.awarded,
            newXp: result.xp,
            newLevel: result.level,
            leveledUp: result.leveledUp,
          };
          console.log(`[Food Logs API] ✓ Awarded ${result.awarded} XP for ${xpAction}`);
        } else {
          console.error(`[Food Logs API] ✗ Failed to award XP: ${result.error}`);
        }
        
        // Check if daily activities are complete
        xpService.checkDailyComplete(user.id).catch(() => {});
      } catch (e) {
        console.error('[Food Logs API] XP service error:', e);
      }

      logger.api('POST', '/api/food-logs', {
        statusCode: 201,
        duration: Date.now() - startTime,
        context: { userId: user.id, logId: newLog.id },
      })

      // ─── Return Response ─────────────────────────────────────────
      return NextResponse.json(
        {
          success: true,
          requestId,
          data: newLog,
          xp: xpResult,
          ...(macroWarning ? { warning: macroWarning } : {}),
        },
        {
          status: 201,
          headers: {
            ...getRateLimitHeaders(rateLimitResult),
            ...getRequestIdHeaders(requestId),
          },
        }
      )

    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        userId: user?.id ?? 'unknown',
      };
      
      logger.error('Error creating food log', errorDetails, {
        requestId,
        context: { duration: Date.now() - startTime },
      });

      return NextResponse.json(
        { 
          error: 'Failed to create food log', 
          requestId,
        },
        {
          status: 500,
          headers: getRequestIdHeaders(requestId),
        }
      )
    }
  })
}
