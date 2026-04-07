/**
 * Targets API — Supabase-native
 * GET  /api/targets  — get active goals
 * POST /api/targets  — create/update goal
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()

    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ targets: data ?? [], goals: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch targets', details: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const body = await request.json()

    // P0 FIX: Use correct field name 'deadline' (not 'target_date') to match DB schema
    const goalPayload = {
      user_id: user.id,
      goal_type: body.goalType ?? body.goal_type,
      target_value: body.targetValue ?? body.target_value ?? null,
      current_value: body.currentValue ?? body.current_value ?? null,
      unit: body.unit ?? 'kg',
      status: body.status ?? 'active',
      deadline: body.targetDate ?? body.target_date ?? body.deadline ?? null,
    }

    // BUG-H006 FIX: goals table may be missing the (user_id, goal_type) unique
    // constraint required for onConflict upsert. Fall back to plain insert.
    // TODO DB lead: add UNIQUE INDEX on goals(user_id, goal_type) to enable clean upsert.
    let data: unknown = null
    let error: unknown = null;

    ({ data, error } = await (supabase.from('goals') as any).upsert(goalPayload, { onConflict: 'user_id,goal_type' }).select().single())

    if (error && String(error).includes('unique or exclusion constraint')) {
      // Constraint missing — fall back to simple insert
      ({ data, error } = await (supabase.from('goals') as any).insert(goalPayload).select().single())
    }

    if (error) throw error

    return NextResponse.json({ target: data, goal: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to save target', details: msg }, { status: 500 })
  }
}
