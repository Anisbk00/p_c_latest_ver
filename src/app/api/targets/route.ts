/**
 * Targets API — Supabase-native
 * GET  /api/targets  — get active goals
 * POST /api/targets  — create/update goal
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

const GoalCreateSchema = z.object({
  goal_type: z.string().max(50),
  target_value: z.number().optional().nullable(),
  current_value: z.number().optional().nullable(),
  unit: z.string().max(20).optional().default('kg'),
  target_date: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  status: z.enum(['active', 'achieved', 'paused', 'abandoned']).optional().default('active'),
})

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

    // SECURITY: Validate input with Zod
    const parsed = GoalCreateSchema.safeParse({
      goal_type: body.goalType ?? body.goal_type,
      target_value: body.targetValue ?? body.target_value,
      current_value: body.currentValue ?? body.current_value,
      unit: body.unit,
      target_date: body.targetDate ?? body.target_date,
      deadline: body.deadline,
      status: body.status,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }
    const validated = parsed.data

    // P0 FIX: Use correct field name 'deadline' (not 'target_date') to match DB schema
    const goalPayload = {
      user_id: user.id,
      goal_type: validated.goal_type,
      target_value: validated.target_value,
      current_value: validated.current_value,
      unit: validated.unit,
      status: validated.status,
      deadline: validated.deadline ?? validated.target_date,
    }

    // NOTE: goals table requires UNIQUE INDEX on (user_id, goal_type) for clean upsert.
    // Run: CREATE UNIQUE INDEX IF NOT EXISTS goals_user_id_goal_type_key ON goals(user_id, goal_type);
    // Fallback to plain insert if constraint is missing.
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
