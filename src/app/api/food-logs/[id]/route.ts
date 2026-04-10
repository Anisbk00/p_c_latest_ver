/**
 * Food Log Entry API Route
 *
 * Handles individual food log entry operations (GET, PUT, DELETE).
 * All operations require authentication and verify ownership.
 *
 * @module api/food-logs/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import {
  getFoodLogById,
  updateFoodLogServer,
  deleteFoodLogServer,
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
import type { UpdateTables } from '@/lib/supabase/database.types'

// ═══════════════════════════════════════════════════════════════
// Validation Helpers
// ═══════════════════════════════════════════════════════════════

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const

function isValidMealType(type: string | null): type is typeof MEAL_TYPES[number] {
  return type !== null && MEAL_TYPES.includes(type as typeof MEAL_TYPES[number])
}

// ═══════════════════════════════════════════════════════════════
// GET /api/food-logs/[id] - Get single food log entry
// ═══════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)

  return withRequestId(requestId, async () => {
    const startTime = Date.now()

    try {
      // ─── Rate Limiting ─────────────────────────────────────────
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_READ)

      if (!rateLimitResult.success) {
        logger.warn('Food log GET rate limit exceeded', {
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
        user = await requireAuth()
      } catch {
        return NextResponse.json(
          { error: 'Authentication required', requestId },
          {
            status: 401,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Get ID from params ─────────────────────────────────────────
      const { id } = await params

      if (!id) {
        return NextResponse.json(
          { error: 'Food log ID is required', requestId },
          {
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Fetch Entry ─────────────────────────────────────────
      const log = await getFoodLogById(user.id, id)

      if (!log) {
        return NextResponse.json(
          { error: 'Food log entry not found', requestId },
          {
            status: 404,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      logger.api('GET', `/api/food-logs/${id}`, {
        statusCode: 200,
        duration: Date.now() - startTime,
        context: { userId: user.id },
      })

      // ─── Return Response ─────────────────────────────────────────
      return NextResponse.json(
        {
          success: true,
          requestId,
          data: log,
        },
        {
          headers: {
            ...getRateLimitHeaders(rateLimitResult),
            ...getRequestIdHeaders(requestId),
          },
        }
      )

    } catch (error) {
      logger.error('Error fetching food log entry', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })

      return NextResponse.json(
        { error: 'Failed to fetch food log entry', requestId },
        {
          status: 500,
          headers: getRequestIdHeaders(requestId),
        }
      )
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// PUT /api/food-logs/[id] - Update food log entry
// ═══════════════════════════════════════════════════════════════

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)

  return withRequestId(requestId, async () => {
    const startTime = Date.now()

    try {
      // ─── Rate Limiting ─────────────────────────────────────────
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_STANDARD)

      if (!rateLimitResult.success) {
        logger.warn('Food log PUT rate limit exceeded', {
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
      let user
      try {
        user = await requireAuth()
      } catch {
        return NextResponse.json(
          { error: 'Authentication required', requestId },
          {
            status: 401,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Get ID from params ─────────────────────────────────────────
      const { id } = await params

      if (!id) {
        return NextResponse.json(
          { error: 'Food log ID is required', requestId },
          {
            status: 400,
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

      // ─── Build Update Object ─────────────────────────────────────────
      const updates: UpdateTables<'food_logs'> = {}

      // Only include fields that are provided
      if (body.food_id !== undefined) updates.food_id = body.food_id
      if (body.food_name !== undefined) updates.food_name = body.food_name
      if (body.quantity !== undefined) updates.quantity = Number(body.quantity)
      if (body.unit !== undefined) updates.unit = body.unit
      if (body.calories !== undefined) updates.calories = Number(body.calories)
      if (body.protein !== undefined) updates.protein = Number(body.protein)
      if (body.carbs !== undefined) updates.carbs = Number(body.carbs)
      if (body.fat !== undefined) updates.fat = Number(body.fat)
      if (body.meal_type !== undefined) updates.meal_type = body.meal_type
      if (body.source !== undefined) updates.source = body.source
      if (body.photo_url !== undefined) updates.photo_url = body.photo_url
      if (body.logged_at !== undefined) updates.logged_at = body.logged_at
      if (body.notes !== undefined) updates.notes = body.notes

      // Check if there's anything to update
      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          { error: 'No fields provided for update', requestId },
          {
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Update Entry ─────────────────────────────────────────
      const updatedLog = await updateFoodLogServer(user.id, id, updates)

      logger.api('PUT', `/api/food-logs/${id}`, {
        statusCode: 200,
        duration: Date.now() - startTime,
        context: { userId: user.id, logId: id },
      })

      // ─── Return Response ─────────────────────────────────────────
      return NextResponse.json(
        {
          success: true,
          requestId,
          data: updatedLog,
        },
        {
          headers: {
            ...getRateLimitHeaders(rateLimitResult),
            ...getRequestIdHeaders(requestId),
          },
        }
      )

    } catch (error) {
      logger.error('Error updating food log entry', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })

      // Handle Supabase "not found" error
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('No rows found') || errorMessage.includes('PGRST116')) {
        return NextResponse.json(
          { error: 'Food log entry not found', requestId },
          {
            status: 404,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      return NextResponse.json(
        { error: 'Failed to update food log entry', requestId },
        {
          status: 500,
          headers: getRequestIdHeaders(requestId),
        }
      )
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// DELETE /api/food-logs/[id] - Delete food log entry
// ═══════════════════════════════════════════════════════════════

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)

  return withRequestId(requestId, async () => {
    const startTime = Date.now()

    try {
      // ─── Rate Limiting ─────────────────────────────────────────
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.API_STANDARD)

      if (!rateLimitResult.success) {
        logger.warn('Food log DELETE rate limit exceeded', {
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
      let user
      try {
        user = await requireAuth()
      } catch {
        return NextResponse.json(
          { error: 'Authentication required', requestId },
          {
            status: 401,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Get ID from params ─────────────────────────────────────────
      const { id } = await params

      if (!id) {
        return NextResponse.json(
          { error: 'Food log ID is required', requestId },
          {
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Delete Entry ─────────────────────────────────────────
      await deleteFoodLogServer(user.id, id)

      logger.api('DELETE', `/api/food-logs/${id}`, {
        statusCode: 200,
        duration: Date.now() - startTime,
        context: { userId: user.id, logId: id },
      })

      // ─── Return Response ─────────────────────────────────────────
      return NextResponse.json(
        {
          success: true,
          requestId,
          message: 'Food log entry deleted successfully',
        },
        {
          headers: {
            ...getRateLimitHeaders(rateLimitResult),
            ...getRequestIdHeaders(requestId),
          },
        }
      )

    } catch (error) {
      logger.error('Error deleting food log entry', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })

      return NextResponse.json(
        { error: 'Failed to delete food log entry', requestId },
        {
          status: 500,
          headers: getRequestIdHeaders(requestId),
        }
      )
    }
  })
}
