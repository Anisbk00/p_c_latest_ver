/**
 * Body Composition API — Supabase-native
 * GET  /api/body-composition
 * POST /api/body-composition
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') ?? '30', 10)

    const { data, error } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .in('metric_type', ['weight', 'body_fat', 'muscle_mass', 'bmi'])
      .order('captured_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return NextResponse.json({ metrics: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch body composition', details: msg }, { status: 500 })
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
    const { BodyCompositionCreateSchema } = await import('@/lib/validation')
    const parseResult = BodyCompositionCreateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten()
      }, { status: 400 })
    }
    body = parseResult.data
    // Sanitize all strings (trim)
    function sanitizeMetric(m: any) {
      for (const k of Object.keys(m)) {
        if (typeof m[k] === 'string') m[k] = m[k].trim()
      }
      return m
    }
    const rows = Array.isArray(body.metrics)
      ? body.metrics.map(sanitizeMetric)
      : [sanitizeMetric(body)]

    const inserts = rows.map((m: Record<string, unknown>) => ({
      user_id: user.id,
      metric_type: m.metricType ?? m.metric_type ?? 'weight',
      value: m.value,
      unit: m.unit ?? 'kg',
      source: m.source ?? 'manual',
      captured_at: m.capturedAt ?? m.captured_at ?? new Date().toISOString(),
    }))

    const { data, error } = await supabase.from('body_metrics').insert(inserts).select()
    if (error) throw error

    return NextResponse.json({ metrics: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to save body composition', details: msg }, { status: 500 })
  }
}
