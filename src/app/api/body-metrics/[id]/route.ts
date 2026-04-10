/**
 * Body Metrics Single Entry API Route
 * 
 * Handles operations for individual body metric entries.
 * Supports GET (single), PUT (update), DELETE operations.
 * 
 * @module api/body-metrics/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import {
  getBodyMetricById,
  updateBodyMetricServer,
  deleteBodyMetricServer,
  METRIC_TYPES,
  type BodyMetricUpdate,
} from '@/lib/data/body-metrics'
import {
  getOrCreateRequestId,
  getRequestIdHeaders,
  createRequestContext,
  withRequestId,
} from '@/lib/request-id'
import { logger } from '@/lib/logger'

// ═══════════════════════════════════════════════════════════════
// GET /api/body-metrics/[id]
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
      // ─── Authentication ─────────────────────────────────────────
      const user = await requireAuth()
      
      // ─── Get Metric ID ──────────────────────────────────────────
      const { id } = await params
      
      if (!id) {
        return NextResponse.json(
          {
            success: false,
            error: 'Metric ID is required',
            requestId,
          },
          { 
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      logger.debug('Fetching body metric by ID', {
        requestId,
        context: { userId: user.id, metricId: id },
      })
      
      // ─── Fetch Metric ───────────────────────────────────────────
      const metric = await getBodyMetricById(user.id, id)
      
      if (!metric) {
        return NextResponse.json(
          {
            success: false,
            error: 'Metric not found or access denied',
            code: 'NOT_FOUND',
            requestId,
          },
          { 
            status: 404,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      logger.performance('get_metric_by_id', Date.now() - startTime)
      
      return NextResponse.json({
        success: true,
        data: metric,
        requestId,
      }, {
        headers: getRequestIdHeaders(requestId),
      })
      
    } catch (error) {
      // ─── Handle Authentication Error ─────────────────────────────
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        logger.warn('Unauthorized access attempt to body metric', {
          requestId,
        })
        
        return NextResponse.json(
          {
            success: false,
            error: 'Authentication required',
            code: 'UNAUTHORIZED',
            requestId,
          },
          { 
            status: 401,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      // ─── Handle Other Errors ─────────────────────────────────────
      logger.error('Failed to fetch body metric', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })
      
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch body metric',
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

// ═══════════════════════════════════════════════════════════════
// PUT /api/body-metrics/[id]
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
      // ─── Authentication ─────────────────────────────────────────
      const user = await requireAuth()
      
      // ─── Get Metric ID ──────────────────────────────────────────
      const { id } = await params
      
      if (!id) {
        return NextResponse.json(
          {
            success: false,
            error: 'Metric ID is required',
            requestId,
          },
          { 
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      // ─── Parse and Strictly Validate Request Body ──────────────
      let body: any
      try {
        body = await request.json()
      } catch (e) {
        return NextResponse.json({ success: false, error: 'Invalid JSON body', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      const { BodyMetricUpdateSchema } = await import('@/lib/validation')
      const parseResult = BodyMetricUpdateSchema.safeParse(body)
      if (!parseResult.success) {
        return NextResponse.json({
          success: false,
          error: 'Invalid input',
          details: parseResult.error.flatten(),
          requestId
        }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      body = parseResult.data
      // Extra: sanitize all strings (trim)
      for (const k of Object.keys(body)) {
        if (typeof body[k] === 'string') body[k] = body[k].trim()
      }
      const { metric_type, value, unit, source, confidence, captured_at, notes } = body
      
      // ─── Check if metric exists ─────────────────────────────────
      const existingMetric = await getBodyMetricById(user.id, id)
      
      if (!existingMetric) {
        return NextResponse.json(
          {
            success: false,
            error: 'Metric not found or access denied',
            code: 'NOT_FOUND',
            requestId,
          },
          { 
            status: 404,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      // ─── Build Update Object ────────────────────────────────────
      const updates: BodyMetricUpdate = {}
      
      if (metric_type !== undefined) updates.metric_type = metric_type
      if (value !== undefined) updates.value = value
      if (unit !== undefined) updates.unit = unit
      if (source !== undefined) updates.source = source
      if (confidence !== undefined) updates.confidence = confidence
      if (captured_at !== undefined) updates.captured_at = captured_at
      if (notes !== undefined) updates.notes = notes
      
      // Check if there's anything to update
      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No valid update fields provided',
            requestId,
          },
          { 
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      // ─── Update Metric ──────────────────────────────────────────
      const updatedMetric = await updateBodyMetricServer(user.id, id, updates)
      
      logger.info('Body metric updated', {
        requestId,
        context: {
          userId: user.id,
          metricId: id,
          updatedFields: Object.keys(updates),
          duration: Date.now() - startTime,
        },
      })
      
      return NextResponse.json({
        success: true,
        data: updatedMetric,
        message: 'Body metric updated successfully',
        requestId,
      }, {
        headers: getRequestIdHeaders(requestId),
      })
      
    } catch (error) {
      // ─── Handle Authentication Error ─────────────────────────────
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        logger.warn('Unauthorized access attempt to update body metric', {
          requestId,
        })
        
        return NextResponse.json(
          {
            success: false,
            error: 'Authentication required',
            code: 'UNAUTHORIZED',
            requestId,
          },
          { 
            status: 401,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      // ─── Handle Other Errors ─────────────────────────────────────
      logger.error('Failed to update body metric', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })
      
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update body metric',
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

// ═══════════════════════════════════════════════════════════════
// DELETE /api/body-metrics/[id]
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
      // ─── Authentication ─────────────────────────────────────────
      const user = await requireAuth()
      
      // ─── Get Metric ID ──────────────────────────────────────────
      const { id } = await params
      
      if (!id) {
        return NextResponse.json(
          {
            success: false,
            error: 'Metric ID is required',
            requestId,
          },
          { 
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      logger.debug('Deleting body metric', {
        requestId,
        context: { userId: user.id, metricId: id },
      })
      
      // ─── Check if metric exists ─────────────────────────────────
      const existingMetric = await getBodyMetricById(user.id, id)
      
      if (!existingMetric) {
        return NextResponse.json(
          {
            success: false,
            error: 'Metric not found or access denied',
            code: 'NOT_FOUND',
            requestId,
          },
          { 
            status: 404,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      // ─── Delete Metric ──────────────────────────────────────────
      await deleteBodyMetricServer(user.id, id)
      
      logger.info('Body metric deleted', {
        requestId,
        context: {
          userId: user.id,
          metricId: id,
          metricType: existingMetric.metric_type,
          duration: Date.now() - startTime,
        },
      })
      
      return NextResponse.json({
        success: true,
        message: 'Body metric deleted successfully',
        requestId,
      }, {
        headers: getRequestIdHeaders(requestId),
      })
      
    } catch (error) {
      // ─── Handle Authentication Error ─────────────────────────────
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        logger.warn('Unauthorized access attempt to delete body metric', {
          requestId,
        })
        
        return NextResponse.json(
          {
            success: false,
            error: 'Authentication required',
            code: 'UNAUTHORIZED',
            requestId,
          },
          { 
            status: 401,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      // ─── Handle Other Errors ─────────────────────────────────────
      logger.error('Failed to delete body metric', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })
      
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to delete body metric',
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
