/**
 * Body Composition Compare — Supabase-native
 * GET /api/body-composition/compare
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    const { data, error } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .in('metric_type', ['weight', 'body_fat', 'muscle_mass'])
      .order('captured_at', { ascending: true })
      .limit(100)

    if (error) throw error

    // Group by metric type for comparison
    const byType: Record<string, unknown[]> = {}
    for (const row of data ?? []) {
      const type = row.metric_type as string
      byType[type] = byType[type] ?? []
      byType[type].push(row)
    }

    const first = (arr: unknown[]) => arr[0] as Record<string, unknown> | undefined
    const last = (arr: unknown[]) => arr[arr.length - 1] as Record<string, unknown> | undefined

    const compare = (type: string) => {
      const rows = byType[type] ?? []
      const f = first(rows), l = last(rows)
      return {
        first: f ? { value: f.value, capturedAt: f.captured_at } : null,
        latest: l ? { value: l.value, capturedAt: l.captured_at } : null,
        change: f && l && f !== l ? Number(l.value) - Number(f.value) : null,
        dataPoints: rows.length,
      }
    }

    return NextResponse.json({
      weight: compare('weight'),
      bodyFat: compare('body_fat'),
      muscleMass: compare('muscle_mass'),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to compare body composition', details: msg }, { status: 500 })
  }
}
