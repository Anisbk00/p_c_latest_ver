/**
 * Supabase Data Service
 * 
 * Provides direct database operations with Supabase.
 * This replaces Prisma for all user data operations.
 * 
 * @module lib/supabase/data-service
 */

import { createClient } from './server'
import type { Database, Tables, InsertTables, UpdateTables } from './database.types'
import type { User } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type { Database, Tables, InsertTables, UpdateTables }

export type Profile = Tables<'profiles'>
export type UserSettings = Tables<'user_settings'>
export type BodyMetric = Tables<'body_metrics'>
export type Food = Tables<'foods'>
export type FoodLog = Tables<'food_logs'>
export type Workout = Tables<'workouts'>
export type SleepLog = Tables<'sleep_logs'>
export type AIInsight = Tables<'ai_insights'>
export type Goal = Tables<'goals'>
export type UserFile = Tables<'user_files'>

// ═══════════════════════════════════════════════════════════════
// Profile Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Get a user's profile from Supabase
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient()
  
  // Use maybeSingle() to gracefully handle missing profiles
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  
  if (error) {
    console.error('[Supabase] Error fetching profile:', error.message)
    return null
  }
  
  return data
}

/**
 * Get or create a user's profile
 * Ensures profile exists in Supabase
 */
export async function getOrCreateProfile(user: User): Promise<Profile> {
  const supabase = await createClient()
  
  // Try to get existing profile - use maybeSingle() to handle missing profiles
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  
  if (existing) {
    return existing
  }
  
  // Check for fetch error (not just no data)
  if (fetchError) {
    console.error('[Supabase] Error checking profile:', fetchError.message)
  }
  
  // Create new profile
  // Create profile for new user
  
  const newProfile: InsertTables<'profiles'> = {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.name || null,
    avatar_url: user.user_metadata?.avatar_url || null,
  }
  
  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert(newProfile)
    .select()
    .maybeSingle()
  
  if (createError || !created) {
    console.error('[Supabase] Error creating profile:', createError?.message)
    // Return a default profile object
    return {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
      timezone: 'UTC',
      locale: 'en',
      coaching_tone: 'balanced',
      privacy_mode: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }
  
  return created
}

/**
 * Update a user's profile
 */
export async function updateProfile(
  userId: string, 
  updates: UpdateTables<'profiles'>
): Promise<Profile | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error updating profile:', error.message)
    return null
  }
  
  return data
}

// ═══════════════════════════════════════════════════════════════
// Body Metrics Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Get body metrics for a user
 */
export async function getBodyMetrics(
  userId: string,
  metricType?: string,
  options?: { days?: number; date?: string; limit?: number }
): Promise<BodyMetric[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
  
  if (metricType) {
    query = query.eq('metric_type', metricType)
  }
  
  if (options?.date) {
    const date = new Date(options.date)
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)
    
    query = query.gte('captured_at', startOfDay.toISOString())
      .lte('captured_at', endOfDay.toISOString())
  } else if (options?.days) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - options.days)
    query = query.gte('captured_at', startDate.toISOString())
  }
  
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('[Supabase] Error fetching body metrics:', error.message)
    return []
  }
  
  return data || []
}

/**
 * Add a body metric
 */
export async function addBodyMetric(
  userId: string,
  metric: Omit<InsertTables<'body_metrics'>, 'user_id'>
): Promise<BodyMetric | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .insert({ ...metric, user_id: userId })
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error adding body metric:', error.message)
    return null
  }
  
  return data
}

/**
 * Delete a body metric
 */
export async function deleteBodyMetric(
  userId: string,
  metricId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('body_metrics')
    .delete()
    .eq('id', metricId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('[Supabase] Error deleting body metric:', error.message)
    return false
  }
  
  return true
}

/**
 * Delete all body metrics of a type for a date
 */
export async function deleteBodyMetricsByDate(
  userId: string,
  metricType: string,
  date: string
): Promise<number> {
  const supabase = await createClient()
  
  const targetDate = new Date(date)
  const startOfDay = new Date(targetDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(targetDate)
  endOfDay.setHours(23, 59, 59, 999)
  
  const { data, error } = await supabase
    .from('body_metrics')
    .delete()
    .eq('user_id', userId)
    .eq('metric_type', metricType)
    .gte('captured_at', startOfDay.toISOString())
    .lte('captured_at', endOfDay.toISOString())
    .select('id')
  
  if (error) {
    console.error('[Supabase] Error deleting body metrics:', error.message)
    return 0
  }
  
  return data?.length || 0
}

// ═══════════════════════════════════════════════════════════════
// Food Log Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Get food log entries for a user
 */
export async function getFoodLogs(
  userId: string,
  date?: string
): Promise<FoodLog[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
  
  if (date) {
    const targetDate = new Date(date)
    const startOfDay = new Date(targetDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(targetDate)
    endOfDay.setHours(23, 59, 59, 999)
    
    query = query.gte('logged_at', startOfDay.toISOString())
      .lte('logged_at', endOfDay.toISOString())
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('[Supabase] Error fetching food logs:', error.message)
    return []
  }
  
  return data || []
}

/**
 * Add a food log entry
 */
export async function addFoodLog(
  userId: string,
  entry: Omit<InsertTables<'food_logs'>, 'user_id'>
): Promise<FoodLog | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('food_logs')
    .insert({ ...entry, user_id: userId })
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error adding food log:', error.message)
    return null
  }
  
  return data
}

/**
 * Update a food log entry
 */
export async function updateFoodLog(
  userId: string,
  entryId: string,
  updates: UpdateTables<'food_logs'>
): Promise<FoodLog | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('food_logs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error updating food log:', error.message)
    return null
  }
  
  return data
}

/**
 * Delete a food log entry
 */
export async function deleteFoodLog(
  userId: string,
  entryId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('food_logs')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('[Supabase] Error deleting food log:', error.message)
    return false
  }
  
  return true
}

/**
 * Calculate nutrition totals for a date
 */
export async function getNutritionTotals(
  userId: string,
  date: string
): Promise<{ calories: number; protein: number; carbs: number; fat: number }> {
  const entries = await getFoodLogs(userId, date)
  
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + (entry.calories || 0),
      protein: totals.protein + (entry.protein || 0),
      carbs: totals.carbs + (entry.carbs || 0),
      fat: totals.fat + (entry.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

// ═══════════════════════════════════════════════════════════════
// Workout Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Get workouts for a user
 */
export async function getWorkouts(
  userId: string,
  options?: { startDate?: string; endDate?: string; limit?: number }
): Promise<Workout[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
  
  if (options?.startDate) {
    query = query.gte('started_at', options.startDate)
  }
  
  if (options?.endDate) {
    query = query.lte('started_at', options.endDate)
  }
  
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('[Supabase] Error fetching workouts:', error.message)
    return []
  }
  
  return data || []
}

/**
 * Get today's workout summary
 */
export async function getTodayWorkoutSummary(
  userId: string
): Promise<{
  totalCalories: number;
  totalDistance: number;
  totalDuration: number;
  trainingLoad: number;
  recoveryImpact: number;
  workoutCount: number;
} | null> {
  const today = new Date().toISOString().split('T')[0]
  const startOfDay = new Date(today)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(today)
  endOfDay.setHours(23, 59, 59, 999)
  
  const workouts = await getWorkouts(userId, {
    startDate: startOfDay.toISOString(),
    endDate: endOfDay.toISOString(),
  })
  
  if (workouts.length === 0) {
    return null
  }
  
  return {
    totalCalories: workouts.reduce((sum, w) => sum + (w.calories_burned || 0), 0),
    totalDistance: workouts.reduce((sum, w) => sum + ((w.distance_meters || 0) / 1000), 0),
    totalDuration: workouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0),
    trainingLoad: workouts.reduce((sum, w) => sum + (w.training_load || 0), 0),
    recoveryImpact: workouts.reduce((sum, w) => sum + (w.recovery_impact || 0), 0),
    workoutCount: workouts.length,
  }
}

/**
 * Add a workout
 */
export async function addWorkout(
  userId: string,
  workout: Omit<InsertTables<'workouts'>, 'user_id'>
): Promise<Workout | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .insert({ ...workout, user_id: userId })
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error adding workout:', error.message)
    return null
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
): Promise<Workout | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('workouts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', workoutId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error updating workout:', error.message)
    return null
  }
  
  return data
}

/**
 * Delete a workout
 */
export async function deleteWorkout(
  userId: string,
  workoutId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workoutId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('[Supabase] Error deleting workout:', error.message)
    return false
  }
  
  return true
}

// ═══════════════════════════════════════════════════════════════
// User Settings Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Get user settings
 */
export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error) {
    console.error('[Supabase] Error fetching user settings:', error.message)
    return null
  }
  
  return data
}

/**
 * Get or create user settings
 */
export async function getOrCreateUserSettings(userId: string): Promise<UserSettings> {
  const supabase = await createClient()
  
  // Try to get existing settings
  const { data: existing, error: fetchError } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (existing) {
    return existing
  }
  
  // Create new settings
  // Create settings for new user
  
  const { data: created, error: createError } = await supabase
    .from('user_settings')
    .insert({ user_id: userId })
    .select()
    .single()
  
  if (createError) {
    console.error('[Supabase] Error creating user settings:', createError.message)
    // Return defaults
    return {
      id: 'default',
      user_id: userId,
      theme: 'system',
      notifications_enabled: true,
      email_notifications: true,
      push_notifications: false,
      language: 'en',
      units: 'metric',
      setup_completed: false,
      setup_completed_at: null,
      setup_skipped: false,
      last_suggestion_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }
  
  return created
}

/**
 * Update user settings
 */
export async function updateUserSettings(
  userId: string,
  updates: UpdateTables<'user_settings'>
): Promise<UserSettings | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('user_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error updating user settings:', error.message)
    return null
  }
  
  return data
}

// ═══════════════════════════════════════════════════════════════
// Goals Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Get user goals
 */
export async function getGoals(
  userId: string,
  status?: string
): Promise<Goal[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (status) {
    query = query.eq('status', status)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('[Supabase] Error fetching goals:', error.message)
    return []
  }
  
  return data || []
}

/**
 * Add a goal
 */
export async function addGoal(
  userId: string,
  goal: Omit<InsertTables<'goals'>, 'user_id'>
): Promise<Goal | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('goals')
    .insert({ ...goal, user_id: userId })
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error adding goal:', error.message)
    return null
  }
  
  return data
}

/**
 * Update a goal
 */
export async function updateGoal(
  userId: string,
  goalId: string,
  updates: UpdateTables<'goals'>
): Promise<Goal | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('goals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', goalId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error updating goal:', error.message)
    return null
  }
  
  return data
}

/**
 * Delete a goal (P1 FIX: Add missing delete operation)
 */
export async function deleteGoal(
  userId: string,
  goalId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('[Supabase] Error deleting goal:', error.message)
    return false
  }
  
  return true
}

// ═══════════════════════════════════════════════════════════════
// Supplement Operations
// ═══════════════════════════════════════════════════════════════

export type Supplement = Tables<'supplements'>
export type SupplementLog = Tables<'supplement_logs'>

export async function getSupplements(
  userId: string,
  options?: { category?: string; limit?: number; offset?: number; q?: string }
): Promise<Supplement[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('supplements')
    .select('*')
    .order('name', { ascending: true })
  
  if (options?.category) {
    query = query.eq('category', options.category)
  }
  
  if (options?.q && options.q.trim() !== '') {
    const safeQuery = options.q.replace(/[,%]/g, ' ').trim()
    const contains = `%${safeQuery}%`
    query = query.or([
      `name.ilike.${contains}`,
      `brand.ilike.${contains}`,
      `barcode.ilike.${contains}`,
      `category.ilike.${contains}`,
    ].join(','))
  }
  
  if (options?.offset !== undefined && options?.limit) {
    query = query.range(options.offset, options.offset + options.limit - 1)
  } else if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('[Supabase] Error fetching supplements:', error.message)
    return []
  }
  
  return data || []
}

/**
 * Get a single supplement by ID
 */
export async function getSupplement(
  userId: string,
  supplementId: string
): Promise<Supplement | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('supplements')
    .select('*')
    .eq('id', supplementId)
    .maybeSingle()
  
  if (error) {
    console.error('[Supabase] Error fetching supplement:', error.message)
    return null
  }
  
  return data
}

/**
 * Add a supplement
 */
export async function addSupplement(
  userId: string,
  supplement: InsertTables<'supplements'>
): Promise<Supplement | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('supplements')
    .insert(supplement)
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error adding supplement:', error.message)
    return null
  }
  
  return data
}

/**
 * Update a supplement
 */
export async function updateSupplement(
  userId: string,
  supplementId: string,
  updates: UpdateTables<'supplements'>
): Promise<Supplement | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('supplements')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', supplementId)
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error updating supplement:', error.message)
    return null
  }
  
  return data
}

/**
 * Delete a supplement
 */
export async function deleteSupplement(
  userId: string,
  supplementId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('supplements')
    .delete()
    .eq('id', supplementId)
  
  if (error) {
    console.error('[Supabase] Error deleting supplement:', error.message)
    return false
  }
  
  return true
}

// ═══════════════════════════════════════════════════════════════
// Supplement Log Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Get supplement logs for a user
 */
export async function getSupplementLogs(
  userId: string,
  date?: string,
  startDate?: string,
  endDate?: string
): Promise<SupplementLog[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('supplement_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
  
  if (startDate && endDate) {
    // Date range query
    query = query.gte('logged_at', `${startDate}T00:00:00.000Z`)
      .lte('logged_at', `${endDate}T23:59:59.999Z`)
  } else if (date) {
    const targetDate = new Date(date)
    const startOfDay = new Date(targetDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(targetDate)
    endOfDay.setHours(23, 59, 59, 999)
    
    query = query.gte('logged_at', startOfDay.toISOString())
      .lte('logged_at', endOfDay.toISOString())
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('[Supabase] Error fetching supplement logs:', error.message)
    return []
  }
  
  return data || []
}

/**
 * Add a supplement log entry
 */
export async function addSupplementLog(
  userId: string,
  entry: Omit<InsertTables<'supplement_logs'>, 'user_id'>
): Promise<SupplementLog | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('supplement_logs')
    .insert({ ...entry, user_id: userId })
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error adding supplement log:', error.message)
    return null
  }
  
  return data
}

/**
 * Update a supplement log entry
 */
export async function updateSupplementLog(
  userId: string,
  entryId: string,
  updates: UpdateTables<'supplement_logs'>
): Promise<SupplementLog | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('supplement_logs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('[Supabase] Error updating supplement log:', error.message)
    return null
  }
  
  return data
}

/**
 * Delete a supplement log entry
 */
export async function deleteSupplementLog(
  userId: string,
  entryId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('supplement_logs')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('[Supabase] Error deleting supplement log:', error.message)
    return false
  }
  
  return true
}

/**
 * Calculate supplement nutrition totals for a date
 */
export async function getSupplementNutritionTotals(
  userId: string,
  date: string
): Promise<{ calories: number; protein: number; carbs: number; fat: number }> {
  const entries = await getSupplementLogs(userId, date)
  
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + (entry.calories || 0),
      protein: totals.protein + (entry.protein || 0),
      carbs: totals.carbs + (entry.carbs || 0),
      fat: totals.fat + (entry.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}
