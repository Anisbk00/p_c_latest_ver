/**
 * Body Metrics API Route
 * 
 * Handles CRUD operations for body metrics using Supabase.
 * Supports filtering by metric_type (weight, body_fat, etc.)
 * 
 * @module api/body-metrics
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import {
  getBodyMetricsServer,
  getBodyMetricsByDateRangeServer,
  createBodyMetricServer,
  getLatestMetricServer,
  getLatestMetrics,
  METRIC_TYPES,
  type BodyMetricInsert,
} from '@/lib/data/body-metrics'
import {
  getOrCreateRequestId,
  getRequestIdHeaders,
  createRequestContext,
  withRequestId,
} from '@/lib/request-id'
import { logger } from '@/lib/logger'

// ═══════════════════════════════════════════════════════════════
// GET /api/body-metrics
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)
  
  return withRequestId(requestId, async () => {
    const startTime = Date.now()
    
    try {
      // ─── Authentication ─────────────────────────────────────────
      const user = await requireAuth()
      
      logger.debug('Fetching body metrics', {
        requestId,
        context: { userId: user.id },
      })
      
      // ─── Parse Query Parameters ──────────────────────────────────
      const { searchParams } = new URL(request.url)
      
      const metricType = searchParams.get('metric_type') || searchParams.get('metricType')
      const startDate = searchParams.get('startDate') || searchParams.get('start_date')
      const endDate = searchParams.get('endDate') || searchParams.get('end_date')
      const latest = searchParams.get('latest') === 'true'
      
      // PAGINATION FIX: Add limit and offset with sensible defaults
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 1), 200)
      const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0)
      
      // ─── Validate metric_type if provided ─────────────────────────
      const validMetricTypes = Object.values(METRIC_TYPES)
      if (metricType && !validMetricTypes.includes(metricType as typeof METRIC_TYPES[keyof typeof METRIC_TYPES])) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid metric_type. Valid types: ${validMetricTypes.join(', ')}`,
            requestId,
          },
          { 
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }
      
      // ─── Get Latest Single Metric ────────────────────────────────
      if (latest && metricType) {
        const metric = await getLatestMetricServer(user.id, metricType)
        
        logger.performance('get_latest_metric', Date.now() - startTime)
        
        return NextResponse.json({
          success: true,
          data: metric,
          requestId,
        }, {
          headers: getRequestIdHeaders(requestId),
        })
      }
      
      // ─── Get Latest for All Types ────────────────────────────────
      if (latest && !metricType) {
        const metrics = await getLatestMetrics(user.id)
        
        logger.performance('get_latest_metrics', Date.now() - startTime)
        
        return NextResponse.json({
          success: true,
          data: metrics,
          requestId,
        }, {
          headers: getRequestIdHeaders(requestId),
        })
      }
      
      // ─── Get by Date Range ───────────────────────────────────────
      if (startDate && endDate) {
        const metrics = await getBodyMetricsByDateRangeServer(user.id, startDate, endDate)
        
        // Filter by metric_type if provided
        const filteredMetrics = metricType 
          ? metrics.filter(m => m.metric_type === metricType)
          : metrics
        
        logger.performance('get_metrics_by_date_range', Date.now() - startTime)
        
        return NextResponse.json({
          success: true,
          data: filteredMetrics,
          count: filteredMetrics.length,
          requestId,
        }, {
          headers: getRequestIdHeaders(requestId),
        })
      }
      
      // ─── Get All Metrics (optionally filtered by type) ───────────
      const allMetrics = await getBodyMetricsServer(user.id, { limit, offset })
      
      // Filter by metric_type if provided
      let result = metricType 
        ? allMetrics.filter(m => m.metric_type === metricType)
        : allMetrics
      
      logger.performance('get_all_metrics', Date.now() - startTime)
      
      return NextResponse.json({
        success: true,
        data: result,
        count: result.length,
        pagination: {
          limit,
          offset,
          hasMore: result.length === limit
        },
        requestId,
      }, {
        headers: getRequestIdHeaders(requestId),
      })
      
    } catch (error) {
      // ─── Handle Authentication Error ─────────────────────────────
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        logger.warn('Unauthorized access attempt to body metrics', {
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
      logger.error('Failed to fetch body metrics', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })
      
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch body metrics',
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
// POST /api/body-metrics
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)
  
  return withRequestId(requestId, async () => {
    const startTime = Date.now()
    
    try {
      // ─── Authentication ─────────────────────────────────────────
      const user = await requireAuth()
      

      // ─── Parse and Strictly Validate Request Body ──────────────
      let body: any
      try {
        body = await request.json()
      } catch (e) {
        return NextResponse.json({ success: false, error: 'Invalid JSON body', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      const { BodyMetricCreateSchema } = await import('@/lib/validation')
      const parseResult = BodyMetricCreateSchema.safeParse(body)
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
      // ─── Create Metric ──────────────────────────────────────────
      const metricData: Omit<BodyMetricInsert, 'user_id'> = {
        metric_type: body.metric_type,
        value: body.value,
        unit: body.unit || getDefaultUnit(body.metric_type),
        source: body.source || 'manual',
        confidence: body.confidence ?? 1.0,
        captured_at: body.captured_at || new Date().toISOString(),
        notes: body.notes || null,
      }
      
      const metric = await createBodyMetricServer(user.id, metricData)
      
      // Emit profile event for cross-component updates
      const { emitProfileEvent } = await import('@/lib/profile-events')
      emitProfileEvent('measurement_added', user.id, {
        metricType: body.metric_type,
        value: body.value,
        unit: metricData.unit,
      })
      
      logger.info('Body metric created', {
        requestId,
        context: {
          userId: user.id,
          metricType: body.metric_type,
          value: body.value,
          duration: Date.now() - startTime,
        },
      })
      
      return NextResponse.json({
        success: true,
        data: metric,
        message: 'Body metric created successfully',
        requestId,
      }, {
        status: 201,
        headers: getRequestIdHeaders(requestId),
      })
      
    } catch (error) {
      // ─── Handle Authentication Error ─────────────────────────────
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        logger.warn('Unauthorized access attempt to create body metric', {
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
      logger.error('Failed to create body metric', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })
      
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create body metric',
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
// Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Get default unit for a metric type
 */
function getDefaultUnit(metricType: string): string {
  const units: Record<string, string> = {
    [METRIC_TYPES.WEIGHT]: 'kg',
    [METRIC_TYPES.BODY_FAT]: '%',
    [METRIC_TYPES.MUSCLE_MASS]: 'kg',
    [METRIC_TYPES.BMI]: 'index',
    [METRIC_TYPES.WAIST]: 'cm',
    [METRIC_TYPES.CHEST]: 'cm',
    [METRIC_TYPES.HIPS]: 'cm',
    [METRIC_TYPES.BICEPS]: 'cm',
    [METRIC_TYPES.THIGH]: 'cm',
    [METRIC_TYPES.NECK]: 'cm',
    [METRIC_TYPES.RESTING_HEART_RATE]: 'bpm',
    [METRIC_TYPES.BLOOD_PRESSURE_SYSTOLIC]: 'mmHg',
    [METRIC_TYPES.BLOOD_PRESSURE_DIASTOLIC]: 'mmHg',
  }
  
  return units[metricType] || 'units'
}
