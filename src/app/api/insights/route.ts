/**
 * Insights API — Supabase-native
 * GET  /api/insights
 * POST /api/insights
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

const InsightCreateSchema = z.object({
  insight_type: z.string().max(50).optional().default('general'),
  content: z.string().max(5000).min(1),
  confidence: z.number().min(0).max(1).optional().nullable(),
  source: z.string().max(50).optional(),
  model_version: z.string().max(50).optional(),
})

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    const { data, error } = await supabase
      .from('ai_insights')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    // BUG-H003 FIX: Include provenance so Home can display model_version and confidence
    return NextResponse.json({
      insights: data ?? [],
      provenance: {
        modelVersion: 'internal-v1',
        generatedAt: new Date().toISOString(),
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch insights', details: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const body = await request.json()

    // SECURITY: Validate input with Zod
    const parsed = InsightCreateSchema.safeParse({
      insight_type: body.insightType ?? body.insight_type,
      content: body.content ?? body.message,
      confidence: body.confidence,
      source: body.source,
      model_version: body.modelVersion ?? body.model_version,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }
    const validated = parsed.data

    const { data, error } = await (supabase.from('ai_insights') as any).insert({
      user_id: user.id,
      insight_type: validated.insight_type,
      content: validated.content,
      confidence: validated.confidence,
      source: validated.source ?? 'system',
      // BUG-H003 FIX: Store model_version for provenance tracking
      model_version: validated.model_version ?? 'internal-v1',
    }).select().single()

    if (error) throw error

    return NextResponse.json({ insight: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to save insight', details: msg }, { status: 500 })
  }
}
