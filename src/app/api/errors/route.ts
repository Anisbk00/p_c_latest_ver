/**
 * Errors API — lightweight client-side error reporting
 * POST /api/errors — log a client error
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function POST(request: NextRequest) {
  try {
    // Strict schema: only allow safe fields
    const ErrorReportSchema = z.object({
      message: z.string().max(1024),
      stack: z.string().max(4096).optional(),
      url: z.string().url().max(2048).optional(),
      userAgent: z.string().max(512).optional(),
      timestamp: z.string().max(32).optional(),
      extra: z.record(z.string(), z.any()).optional()
    }).strict()

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ logged: false, error: 'Invalid JSON body' }, { status: 400 })
    }
    const parseResult = ErrorReportSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ logged: false, error: 'Invalid input', details: parseResult.error.flatten() }, { status: 400 })
    }
    // Sanitize all strings (trim)
    const safe = parseResult.data
    for (const k of Object.keys(safe)) {
      if (typeof safe[k] === 'string') safe[k] = safe[k].trim()
    }
    import('@/lib/logger').then(({ logger }) => {
      logger.error('Client error reported', null, { safe });
    });
    import('@/lib/error-monitoring').then(({ captureError }) => {
      captureError(new Error('Client error reported'), {
        category: 'client',
        additionalData: safe,
      });
    });
    return NextResponse.json({ logged: true })
  } catch {
    return NextResponse.json({ logged: false }, { status: 500 })
  }
}
