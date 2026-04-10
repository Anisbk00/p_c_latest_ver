/**
 * Workout Data Access Module
 * 
 * Handles all workout CRUD operations using Supabase.
 * All queries are filtered by user_id for security.
 * 
 * @module lib/data/workouts
 */

import { getClient } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import type {
  Workout,
  InsertTables,
  UpdateTables,
} from '@/lib/supabase/database.types'

// ─── Performance Optimization ─────────────────────────────────────────
// PERF-FIX: Define commonly used select columns to avoid over-fetching
// route_data can be 100KB+ for GPS workouts, only fetch when needed
const WORKOUT_LIST_COLUMNS = 'id, user_id, activity_type, workout_type, name, started_at, completed_at, duration_minutes, distance_meters, calories_burned, avg_heart_rate, max_heart_rate, avg_pace, avg_speed, max_speed, elevation_gain, elevation_loss, splits, notes, source, gpx_file_url, is_pr, created_at, updated_at'

// ─── Client-side Operations ─────────────────────────────────────────

/**
 * Get all workouts for a user
 */
export async function getWorkouts(userId: string): Promise<Workout[]> {
  const supabase = getClient()
  
  // PERF-FIX: Use specific columns instead of SELECT *
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_LIST_COLUMNS)
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching workouts:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get workouts with pagination
 */
export async function getWorkoutsPaginated(
  userId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{ workouts: Workout[]; total: number }> {
  const supabase = getClient()
  
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  
  // PERF-FIX: Use specific columns instead of SELECT *
  const { data, error, count } = await supabase
    .from('workouts')
    .select(WORKOUT_LIST_COLUMNS, { count: 'exact' })
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .range(from, to)
  
  if (error) {
    console.error('Error fetching paginated workouts:', error.message)
    throw error
  }
  
  return {
    workouts: data,
    total: count ?? 0,
  }
}

/**
 * Get a single workout by ID
 */
export async function getWorkoutById(
  userId: string,
  workoutId: string
): Promise<Workout | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('id', workoutId)
    .eq('user_id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching workout:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get workouts by date range
 */
export async function getWorkoutsByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Workout[]> {
  const supabase = getClient()
  
  // PERF-FIX: Use specific columns instead of SELECT *
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_LIST_COLUMNS)
    .eq('user_id', userId)
    .gte('started_at', startDate)
    .lte('started_at', endDate)
    .order('started_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching workouts by date range:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get workouts for a specific date
 */
export async function getWorkoutsByDate(
  userId: string,
  date: string
): Promise<Workout[]> {
  const supabase = getClient()
  
  const startOfDay = `${date}T00:00:00.000Z`
  const endOfDay = `${date}T23:59:59.999Z`
  
  // PERF-FIX: Use specific columns instead of SELECT *
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_LIST_COLUMNS)
    .eq('user_id', userId)
    .gte('started_at', startOfDay)
    .lte('started_at', endOfDay)
    .order('started_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching workouts by date:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get workouts by activity type
 */
export async function getWorkoutsByActivityType(
  userId: string,
  activityType: string
): Promise<Workout[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .eq('activity_type', activityType)
    .order('started_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching workouts by activity type:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get recent workouts (last N days)
 */
export async function getRecentWorkouts(
  userId: string,
  days: number = 7
): Promise<Workout[]> {
  const supabase = getClient()
  
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  // PERF-FIX: Use specific columns instead of SELECT *
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_LIST_COLUMNS)
    .eq('user_id', userId)
    .gte('started_at', startDate.toISOString())
    .order('started_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching recent workouts:', error.message)
    throw error
  }
  
  return data
}

/**
 * Create a new workout
 */
export async function createWorkout(
  userId: string,
  workout: Omit<InsertTables<'workouts'>, 'user_id'>
): Promise<Workout> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .insert({
      ...workout,
      user_id: userId,
      started_at: workout.started_at || new Date().toISOString(),
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating workout:', error.message)
    throw error
  }
  
  return data
}

/**
 * Update a workout
 */
export async function updateWorkout(
  userId: string,
  workoutId: string,
  updates: UpdateTables<'workouts'>
): Promise<Workout> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workoutId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating workout:', error.message)
    throw error
  }
  
  return data
}

/**
 * Delete a workout
 */
export async function deleteWorkout(
  userId: string,
  workoutId: string
): Promise<void> {
  const supabase = getClient()
  
  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workoutId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error deleting workout:', error.message)
    throw error
  }
}

/**
 * Get personal records (PRs)
 */
export async function getPersonalRecords(userId: string): Promise<Workout[]> {
  const supabase = getClient()
  
  // PERF-FIX: Use specific columns instead of SELECT *
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_LIST_COLUMNS)
    .eq('user_id', userId)
    .eq('is_pr', true)
    .order('started_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching personal records:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get workout statistics summary
 */
export async function getWorkoutStats(
  userId: string,
  days: number = 30
): Promise<{
  totalWorkouts: number
  totalDuration: number
  totalCalories: number
  totalDistance: number
  avgDuration: number
  avgCalories: number
  activityBreakdown: Record<string, number>
}> {
  const workouts = await getRecentWorkouts(userId, days)
  
  const totalDuration = workouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0)
  const totalCalories = workouts.reduce((sum, w) => sum + (w.calories_burned || 0), 0)
  const totalDistance = workouts.reduce((sum, w) => sum + (w.distance_meters || 0), 0)
  
  const activityBreakdown: Record<string, number> = {}
  workouts.forEach(w => {
    activityBreakdown[w.activity_type] = (activityBreakdown[w.activity_type] || 0) + 1
  })
  
  return {
    totalWorkouts: workouts.length,
    totalDuration,
    totalCalories,
    totalDistance,
    avgDuration: workouts.length ? totalDuration / workouts.length : 0,
    avgCalories: workouts.length ? totalCalories / workouts.length : 0,
    activityBreakdown,
  }
}

/**
 * Get longest workout for each activity type
 */
export async function getLongestWorkouts(
  userId: string
): Promise<Record<string, Workout>> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .not('duration_minutes', 'is', null)
    .order('duration_minutes', { ascending: false })
  
  if (error) {
    console.error('Error fetching longest workouts:', error.message)
    throw error
  }
  
  const longestByType: Record<string, Workout> = {}
  data.forEach(workout => {
    if (!longestByType[workout.activity_type]) {
      longestByType[workout.activity_type] = workout
    }
  })
  
  return longestByType
}

// ─── Server-side Operations ─────────────────────────────────────────

/**
 * Server-side: Get all workouts for a user
 */
export async function getWorkoutsServer(userId: string): Promise<Workout[]> {
  const supabase = await createClient()
  
  // PERF-FIX: Use specific columns instead of SELECT *
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_LIST_COLUMNS)
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching workouts (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Get workout by ID
 */
export async function getWorkoutByIdServer(
  userId: string,
  workoutId: string
): Promise<Workout | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('id', workoutId)
    .eq('user_id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching workout (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Create workout
 */
export async function createWorkoutServer(
  userId: string,
  workout: Omit<InsertTables<'workouts'>, 'user_id'>
): Promise<Workout> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .insert({
      ...workout,
      user_id: userId,
      started_at: workout.started_at || new Date().toISOString(),
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating workout (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Update workout
 */
export async function updateWorkoutServer(
  userId: string,
  workoutId: string,
  updates: UpdateTables<'workouts'>
): Promise<Workout> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workoutId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating workout (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Delete workout
 */
export async function deleteWorkoutServer(
  userId: string,
  workoutId: string
): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workoutId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error deleting workout (server):', error.message)
    throw error
  }
}

/**
 * Server-side: Get workouts by date range
 */
export async function getWorkoutsByDateRangeServer(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Workout[]> {
  const supabase = await createClient()
  
  // PERF-FIX: Use specific columns instead of SELECT *
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_LIST_COLUMNS)
    .eq('user_id', userId)
    .gte('started_at', startDate)
    .lte('started_at', endDate)
    .order('started_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching workouts by date range (server):', error.message)
    throw error
  }
  
  return data
}

// ─── Types ─────────────────────────────────────────────────────────

export type WorkoutInsert = InsertTables<'workouts'>
export type WorkoutUpdate = UpdateTables<'workouts'>
export type WorkoutStats = {
  totalWorkouts: number
  totalDuration: number
  totalCalories: number
  totalDistance: number
  avgDuration: number
  avgCalories: number
  activityBreakdown: Record<string, number>
}
