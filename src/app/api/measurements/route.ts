/**
 * Measurements API — Supabase-native
 * GET  /api/measurements  — list measurements
 * POST /api/measurements  — log a measurement
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)

    let query = supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('captured_at', { ascending: false })
      .limit(limit)

    if (type) query = query.eq('metric_type', type)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ measurements: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch measurements', details: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // Strict Zod validation
    const { MeasurementCreateSchema } = await import('@/lib/validation')
    const parseResult = MeasurementCreateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      }, { status: 400 })
    }
    body = parseResult.data
    // Extra: sanitize all strings (trim)
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }
    const { data, error } = await supabase.from('body_metrics').insert({
      user_id: user.id,
      metric_type: body.type ?? body.measurementType ?? body.metric_type,
      value: body.value,
      unit: body.unit ?? 'kg',
      source: body.source ?? 'manual',
      confidence: body.confidence ?? 1.0,
      captured_at: body.capturedAt ?? body.captured_at ?? new Date().toISOString(),
      notes: body.notes ?? null,
    }).select().single()
    if (error) throw error
    return NextResponse.json({ measurement: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to save measurement', details: msg }, { status: 500 })
  }
}
