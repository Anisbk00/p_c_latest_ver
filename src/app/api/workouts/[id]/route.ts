/**
 * Workout by ID — Supabase-native
 * GET    /api/workouts/[id]
 * PUT    /api/workouts/[id]
 * DELETE /api/workouts/[id]
 * 
 * SECURITY: Added input validation (DATA-001 FIX)
 * HARDENED: Added optimistic locking (DATA-004 FIX)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { z } from 'zod'

// Validation schema for PUT requests (DATA-001 FIX)
const workoutUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  durationMinutes: z.number().int().positive().optional(),
  duration_minutes: z.number().int().positive().optional(),
  caloriesBurned: z.number().positive().optional(),
  calories_burned: z.number().positive().optional(),
  completedAt: z.string().datetime().optional().nullable(),
  completed_at: z.string().datetime().optional().nullable(),
  distanceMeters: z.number().positive().optional(),
  distance_meters: z.number().positive().optional(),
  avgHeartRate: z.number().int().positive().optional(),
  avg_heart_rate: z.number().int().positive().optional(),
  maxHeartRate: z.number().int().positive().optional(),
  max_heart_rate: z.number().int().positive().optional(),
  avgPace: z.number().positive().optional(),
  avg_pace: z.number().positive().optional(),
  avgSpeed: z.number().positive().optional(),
  avg_speed: z.number().positive().optional(),
  maxSpeed: z.number().positive().optional(),
  max_speed: z.number().positive().optional(),
  elevationGain: z.number().optional(),
  elevation_gain: z.number().optional(),
  elevationLoss: z.number().optional(),
  elevation_loss: z.number().optional(),
  splits: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  activityType: z.string().optional(),
  activity_type: z.string().optional(),
  workoutType: z.enum(['cardio', 'strength', 'flexibility', 'sports', 'other']).optional(),
  workout_type: z.enum(['cardio', 'strength', 'flexibility', 'sports', 'other']).optional(),
  source: z.string().optional(),
  // DATA-004 FIX: Optimistic locking fields
  version: z.number().int().positive().optional(),
  updatedAt: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
}).strict() // Reject unknown fields

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase, user } = await getSupabaseUser()

    const { data, error } = await supabase.from('workouts').select('*').eq('id', id).eq('user_id', user.id).single()
    if (error || !data) return NextResponse.json({ error: 'Workout not found' }, { status: 404 })

    return NextResponse.json({ workout: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Only log detailed error server-side
    if (process.env.NODE_ENV === 'development') {
      console.error('[API] Workout error:', msg);
    }
    return NextResponse.json({ error: 'Failed to fetch workout' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase, user } = await getSupabaseUser()
    const rawBody = await request.json()

    // Validate input with Zod (DATA-001 FIX)
    const parseResult = workoutUpdateSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }
    const body = parseResult.data

    // DATA-004 FIX: Fetch current workout for optimistic locking check
    const { data: currentWorkout, error: fetchError } = await supabase
      .from('workouts')
      .select('id, updated_at, version')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    
    if (fetchError || !currentWorkout) {
      return NextResponse.json({ error: 'Workout not found' }, { status: 404 })
    }

    // DATA-004 FIX: Optimistic locking - check version or updated_at
    const clientVersion = body.version
    const clientUpdatedAt = body.updatedAt ?? body.updated_at
    
    if (clientVersion !== undefined && currentWorkout.version !== null) {
      // Version-based optimistic locking
      if (clientVersion < currentWorkout.version) {
        return NextResponse.json(
          { 
            error: 'Conflict detected', 
            details: 'Workout has been modified by another client',
            currentVersion: currentWorkout.version,
          },
          { status: 409 }
        )
      }
    } else if (clientUpdatedAt) {
      // Timestamp-based optimistic locking (fallback)
      const clientTime = new Date(clientUpdatedAt).getTime()
      const serverTime = new Date(currentWorkout.updated_at).getTime()
      
      // If server is more than 1 second newer, reject
      if (!isNaN(clientTime) && !isNaN(serverTime) && serverTime > clientTime + 1000) {
        return NextResponse.json(
          { 
            error: 'Conflict detected', 
            details: 'Workout has been modified more recently on the server',
            serverUpdatedAt: currentWorkout.updated_at,
          },
          { status: 409 }
        )
      }
    }

    // Build update payload — only include provided fields to allow partial updates
    const updatePayload: Record<string, unknown> = {}
    const fieldMap: Record<string, string> = {
      name: 'name',
      notes: 'notes',
      durationMinutes: 'duration_minutes',
      duration_minutes: 'duration_minutes',
      caloriesBurned: 'calories_burned',
      calories_burned: 'calories_burned',
      completedAt: 'completed_at',
      completed_at: 'completed_at',
      distanceMeters: 'distance_meters',
      distance_meters: 'distance_meters',
      avgHeartRate: 'avg_heart_rate',
      avg_heart_rate: 'avg_heart_rate',
      maxHeartRate: 'max_heart_rate',
      max_heart_rate: 'max_heart_rate',
      avgPace: 'avg_pace',
      avg_pace: 'avg_pace',
      avgSpeed: 'avg_speed',
      avg_speed: 'avg_speed',
      maxSpeed: 'max_speed',
      max_speed: 'max_speed',
      elevationGain: 'elevation_gain',
      elevation_gain: 'elevation_gain',
      elevationLoss: 'elevation_loss',
      elevation_loss: 'elevation_loss',
      splits: 'splits',
      rating: 'rating',
      activityType: 'activity_type',
      activity_type: 'activity_type',
      workoutType: 'workout_type',
      workout_type: 'workout_type',
      source: 'source',
    }
    for (const [clientKey, dbCol] of Object.entries(fieldMap)) {
      if (body[clientKey as keyof typeof body] !== undefined) {
        updatePayload[dbCol] = body[clientKey as keyof typeof body]
      }
    }
    
    // DATA-004 FIX: Increment version on update
    if (currentWorkout.version !== null) {
      updatePayload.version = currentWorkout.version + 1
    }
    
    // Ensure at least one field to update
    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase.from('workouts').update(updatePayload)
      .eq('id', id).eq('user_id', user.id).select().single()

    if (error) throw error

    return NextResponse.json({ workout: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Only log detailed error server-side
    if (process.env.NODE_ENV === 'development') {
      console.error('[API] Workout error:', msg);
    }
    return NextResponse.json({ error: 'Failed to update workout' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabase, user } = await getSupabaseUser()

    // Fetch gpx_file_url before delete for storage cleanup
    const { data: existingWorkout } = await supabase
      .from('workouts')
      .select('gpx_file_url')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    const { data: deletedData, error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')

    if (error) throw error
    if (!deletedData || deletedData.length === 0) {
      return NextResponse.json({ error: 'Workout not found' }, { status: 404 })
    }

    // Clean up storage file (fire-and-forget)
    if (existingWorkout?.gpx_file_url) {
      supabase.storage.from('gpx-files').remove([existingWorkout.gpx_file_url]).catch(() => {});
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Only log detailed error server-side
    if (process.env.NODE_ENV === 'development') {
      console.error('[API] Workout error:', msg);
    }
    return NextResponse.json({ error: 'Failed to delete workout' }, { status: 500 })
  }
}
