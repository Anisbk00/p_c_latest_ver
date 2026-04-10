/**
 * Targets/Goals API — Individual goal operations
 * DELETE /api/targets/[id] — delete a goal
 * PATCH  /api/targets/[id] — update a goal
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Goal ID required' }, { status: 400 })
    }

    // Ensure user can only delete their own goals
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true, deleted: id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to delete goal', details: msg },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const { id } = await params
    const body = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Goal ID required' }, { status: 400 })
    }

    // Build update payload - only include provided fields
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.goalType !== undefined || body.goal_type !== undefined) {
      updatePayload.goal_type = body.goalType ?? body.goal_type
    }
    if (body.targetValue !== undefined || body.target_value !== undefined) {
      updatePayload.target_value = body.targetValue ?? body.target_value
    }
    if (body.currentValue !== undefined || body.current_value !== undefined) {
      updatePayload.current_value = body.currentValue ?? body.current_value
    }
    if (body.unit !== undefined) {
      updatePayload.unit = body.unit
    }
    if (body.status !== undefined) {
      updatePayload.status = body.status
    }
    if (body.targetDate !== undefined || body.target_date !== undefined || body.deadline !== undefined) {
      updatePayload.deadline = body.targetDate ?? body.target_date ?? body.deadline
    }

    // Ensure user can only update their own goals
    const { data, error } = await supabase
      .from('goals')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ target: data, goal: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to update goal', details: msg },
      { status: 500 }
    )
  }
}
