/**
 * Workout Sync API — Supabase-native
 * POST /api/workouts/sync — bulk upsert offline workouts
 * 
 * SECURITY: Added Zod validation (DATA-001 FIX)
 * HARDENED: Conflict resolution with timestamp checking (DATA-002 FIX)
 * HARDENED: Server-side timestamp validation (DATA-003 FIX)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { z } from 'zod'

// Maximum allowed time difference between client and server (5 minutes)
const MAX_TIME_SKEW_MS = 5 * 60 * 1000

// INTG-009 FIX: Proper type for upsert rows (replaces @ts-ignore + as any[])
interface WorkoutRow {
  id?: string
  user_id: string
  activity_type: string
  workout_type: string
  name: string | null
  started_at: string
  completed_at: string | null
  duration_minutes: number | null
  distance_meters: number | null
  calories_burned: number | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  avg_pace: number | null
  avg_speed: number | null
  max_speed: number | null
  elevation_gain: number | null
  elevation_loss: number | null
  route_data: unknown
  splits: string | null
  notes: string | null
  source: string
  gpx_file_url: string | null
  offline_mode: boolean
  client_timestamp: string | null
  version: number
}

// RACE-004 FIX: Batch size for concurrent storage uploads
const UPLOAD_BATCH_SIZE = 5

// Zod schema for bulk sync validation (DATA-001 FIX)
const workoutSyncItemSchema = z.object({
  id: z.string().optional(),
  tempId: z.string().optional(),
  activityType: z.string().default('other'),
  workoutType: z.enum(['cardio', 'strength', 'flexibility', 'sports', 'other']).default('cardio'),
  name: z.string().max(200).optional().nullable(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  distanceMeters: z.number().positive().optional().nullable(),
  caloriesBurned: z.number().positive().optional().nullable(),
  avgHeartRate: z.number().int().positive().optional().nullable(),
  maxHeartRate: z.number().int().positive().optional().nullable(),
  avgPace: z.number().positive().optional().nullable(),
  avgSpeed: z.number().positive().optional().nullable(),
  maxSpeed: z.number().positive().optional().nullable(),
  elevationGain: z.number().optional().nullable(),
  elevationLoss: z.number().optional().nullable(),
  routeData: z.unknown().optional().nullable(),
  routeDataUrl: z.string().optional().nullable(),
  splits: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  source: z.string().default('offline_sync'),
  offlineMode: z.boolean().optional(),
  clientTimestamp: z.string().datetime().optional().nullable(),
  // Version for optimistic locking
  version: z.number().int().positive().optional(),
  // Legacy field aliases (for backward compatibility)
  activity_type: z.string().optional(),
  workout_type: z.string().optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional().nullable(),
  duration_minutes: z.number().int().positive().optional().nullable(),
  distance_meters: z.number().positive().optional().nullable(),
  calories_burned: z.number().positive().optional().nullable(),
  avg_heart_rate: z.number().int().positive().optional().nullable(),
  max_heart_rate: z.number().int().positive().optional().nullable(),
  avg_pace: z.number().positive().optional().nullable(),
  avg_speed: z.number().positive().optional().nullable(),
  max_speed: z.number().positive().optional().nullable(),
  elevation_gain: z.number().optional().nullable(),
  elevation_loss: z.number().optional().nullable(),
  route_data: z.unknown().optional().nullable(),
  route_data_url: z.string().optional().nullable(),
  offline_mode: z.boolean().optional(),
  client_timestamp: z.string().datetime().optional().nullable(),
})

const workoutSyncRequestSchema = z.object({
  workouts: z.array(workoutSyncItemSchema).max(50, 'Maximum 50 workouts per sync batch'),
}).passthrough() // Allow additional fields for single workout sync

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const rawBody = await request.json()
    
    // Validate input with Zod (DATA-001 FIX)
    const parseResult = workoutSyncRequestSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }
    
    const body = parseResult.data
    const workouts = Array.isArray(body.workouts) ? body.workouts : [body]
    const serverNow = Date.now()

    // DATA-003 FIX: Validate client timestamps to prevent future timestamp manipulation
    for (const w of workouts) {
      const clientTs = w.clientTimestamp ?? w.client_timestamp
      if (clientTs) {
        const clientTime = new Date(clientTs).getTime()
        if (!isNaN(clientTime) && clientTime > serverNow + MAX_TIME_SKEW_MS) {
          console.warn(`[Sync API] Rejected workout with future timestamp: ${clientTs}`)
          return NextResponse.json(
            { error: 'Invalid timestamp', details: 'Client timestamp is in the future' },
            { status: 400 }
          )
        }
      }
    }

    // DATA-002 FIX: Fetch existing workouts for conflict resolution
    const workoutIds = workouts.filter(w => w.id).map(w => w.id as string)
    let existingWorkouts: Record<string, { updated_at: string; version: number | null }> = {}
    
    if (workoutIds.length > 0) {
      const { data: existing, error: fetchError } = await supabase
        .from('workouts')
        .select('id, updated_at, version')
        .eq('user_id', user.id)
        .in('id', workoutIds)
      
      if (fetchError) {
        console.error('[Sync API] Error fetching existing workouts:', fetchError)
      } else if (existing) {
        existingWorkouts = Object.fromEntries(existing.map(w => [w.id, w]))
      }
    }

    // Process workouts with conflict detection
    const conflicts: { id: string; reason: string }[] = []
    const validWorkouts = workouts.filter(w => {
      if (!w.id) return true // New workout, no conflict
      
      const existing = existingWorkouts[w.id]
      if (!existing) return true // New to server, no conflict
      
      // DATA-002 FIX: Check version for optimistic locking
      const clientVersion = w.version
      const serverVersion = existing.version
      
      if (clientVersion && serverVersion && clientVersion < serverVersion) {
        conflicts.push({ id: w.id, reason: 'Server has newer version' })
        return false
      }
      
      // Check updated_at timestamp
      const clientTs = w.clientTimestamp ?? w.client_timestamp
      if (clientTs) {
        const clientTime = new Date(clientTs).getTime()
        const serverTime = new Date(existing.updated_at).getTime()
        
        // Skip if server is newer (client data is stale)
        if (!isNaN(clientTime) && !isNaN(serverTime) && clientTime < serverTime - MAX_TIME_SKEW_MS) {
          conflicts.push({ id: w.id, reason: 'Server has newer data' })
          return false
        }
      }
      
      return true
    })

    // RACE-004 FIX: Process uploads in batches to prevent resource exhaustion
    const rows: WorkoutRow[] = []
    for (let i = 0; i < validWorkouts.length; i += UPLOAD_BATCH_SIZE) {
      const batch = validWorkouts.slice(i, i + UPLOAD_BATCH_SIZE)
      const batchRows = await Promise.all(batch.map(async (w): Promise<WorkoutRow> => {
        let routeDataUrl = w.routeDataUrl ?? w.route_data_url ?? null;
        const routeData = w.routeData ?? w.route_data;

        if (routeData && !routeDataUrl) {
          const routeDataStr = typeof routeData === 'string' ? routeData : JSON.stringify(routeData);
          const fileId = w.id || crypto.randomUUID();
          const fileName = `${user.id}/${fileId}_route.json`;

          const { error: uploadError } = await supabase.storage
            .from('gpx-files')
            .upload(fileName, routeDataStr, {
              contentType: 'application/json',
              upsert: true,
            });

          if (!uploadError) {
            routeDataUrl = fileName;
          } else {
            console.warn(`Failed to upload route data for workout ${fileId}:`, uploadError);
          }
        }

        return {
          ...(w.id ? { id: w.id as string } : {}),
          user_id: user.id,
          activity_type: w.activityType ?? w.activity_type ?? 'other',
          workout_type: w.workoutType ?? w.workout_type ?? 'cardio',
          name: w.name ?? null,
          started_at: w.startedAt ?? w.started_at ?? new Date().toISOString(),
          completed_at: w.completedAt ?? w.completed_at ?? null,
          duration_minutes: w.durationMinutes ?? w.duration_minutes ?? null,
          distance_meters: w.distanceMeters ?? w.distance_meters ?? null,
          calories_burned: w.caloriesBurned ?? w.calories_burned ?? null,
          avg_heart_rate: w.avgHeartRate ?? w.avg_heart_rate ?? null,
          max_heart_rate: w.maxHeartRate ?? w.max_heart_rate ?? null,
          avg_pace: w.avgPace ?? w.avg_pace ?? null,
          avg_speed: w.avgSpeed ?? w.avg_speed ?? null,
          max_speed: w.maxSpeed ?? w.max_speed ?? null,
          elevation_gain: w.elevationGain ?? w.elevation_gain ?? null,
          elevation_loss: w.elevationLoss ?? w.elevation_loss ?? null,
          // INTG-007 FIX: Safe JSON.parse — skip bad records instead of failing the batch
          route_data: (() => {
            try {
              const raw = w.routeData ?? w.route_data
              return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
            } catch {
              console.warn(`Failed to parse route_data for workout ${w.id ?? 'unknown'}, skipping`)
              return null
            }
          })(),
          splits: w.splits ?? null,
          notes: w.notes ?? null,
          source: w.source ?? 'offline_sync',
          gpx_file_url: routeDataUrl,
          offline_mode: w.offlineMode ?? w.offline_mode ?? true,
          client_timestamp: w.clientTimestamp ?? w.client_timestamp ?? null,
          // Increment version on update
          version: (w.version ?? 0) + 1,
        }
      }));
      rows.push(...batchRows);
    }

    // INTG-009 FIX: Properly typed upsert (no @ts-ignore or as any[])
    const { data, error } = await supabase.from('workouts').upsert(rows, { onConflict: 'id' }).select()
    if (error) throw error

    return NextResponse.json({ 
      synced: data?.length ?? 0, 
      workouts: data,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err))
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to sync workouts' }, { status: 500 })
  }
}
