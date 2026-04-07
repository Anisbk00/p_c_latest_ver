/**
 * Food Log Data Access Module
 * 
 * Handles all food log CRUD operations using Supabase.
 * All queries are filtered by user_id for security.
 * 
 * @module lib/data/food-logs
 */

import { getClient } from '@/lib/supabase/client'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type {
  FoodLog,
  Food,
  InsertTables,
  UpdateTables,
} from '@/lib/supabase/database.types'

// ─── Client-side Operations ─────────────────────────────────────────

/**
 * Get all food logs for a user
 * P1 FIX: Added optional date filtering to prevent fetching all logs
 * @param userId - User ID
 * @param date - Optional ISO date string (YYYY-MM-DD) to filter by specific date
 * @param dateRange - Optional date range {start, end} (ISO strings)
 * @param limit - Optional limit (default: 100 for unbounded queries)
 */
export async function getFoodLogs(
  userId: string,
  options?: {
    date?: string;
    dateRange?: { start: string; end: string };
    limit?: number;
  }
): Promise<FoodLog[]> {
  const supabase = getClient()
  
  let query = supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
  
  // Apply date filter if provided
  if (options?.date) {
    const startOfDay = `${options.date}T00:00:00.000Z`
    const endOfDay = `${options.date}T23:59:59.999Z`
    query = query.gte('logged_at', startOfDay).lte('logged_at', endOfDay)
  } else if (options?.dateRange) {
    query = query
      .gte('logged_at', options.dateRange.start)
      .lte('logged_at', options.dateRange.end)
  } else {
    // Default: limit to last 100 logs to prevent fetching everything
    query = query.limit(options?.limit || 100)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching food logs:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get food logs for a specific date
 */
export async function getFoodLogsByDate(
  userId: string,
  date: string // ISO date string (YYYY-MM-DD)
): Promise<FoodLog[]> {
  const supabase = getClient()
  
  const startOfDay = `${date}T00:00:00.000Z`
  const endOfDay = `${date}T23:59:59.999Z`
  
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', startOfDay)
    .lte('logged_at', endOfDay)
    .order('logged_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching food logs by date:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get food logs for a date range
 */
export async function getFoodLogsByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<FoodLog[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', startDate)
    .lte('logged_at', endDate)
    .order('logged_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching food logs by date range:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get a single food log by ID
 */
export async function getFoodLogById(
  userId: string,
  logId: string
): Promise<FoodLog | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('id', logId)
    .eq('user_id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching food log:', error.message)
    throw error
  }
  
  return data
}

/**
 * Create a new food log entry
 */
export async function createFoodLog(
  userId: string,
  entry: Omit<InsertTables<'food_logs'>, 'user_id'>
): Promise<FoodLog> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('food_logs')
    .insert({
      ...entry,
      user_id: userId,
      logged_at: entry.logged_at || new Date().toISOString(),
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating food log:', error.message)
    throw error
  }
  
  return data
}

/**
 * Update a food log entry
 */
export async function updateFoodLog(
  userId: string,
  logId: string,
  updates: UpdateTables<'food_logs'>
): Promise<FoodLog> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('food_logs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', logId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating food log:', error.message)
    throw error
  }
  
  return data
}

/**
 * Delete a food log entry
 */
export async function deleteFoodLog(
  userId: string,
  logId: string
): Promise<void> {
  const supabase = getClient()
  
  const { error } = await supabase
    .from('food_logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error deleting food log:', error.message)
    throw error
  }
}

/**
 * Get food logs by meal type
 */
export async function getFoodLogsByMealType(
  userId: string,
  mealType: string,
  date?: string
): Promise<FoodLog[]> {
  const supabase = getClient()
  
  let query = supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('meal_type', mealType)
  
  if (date) {
    const startOfDay = `${date}T00:00:00.000Z`
    const endOfDay = `${date}T23:59:59.999Z`
    query = query
      .gte('logged_at', startOfDay)
      .lte('logged_at', endOfDay)
  }
  
  const { data, error } = await query.order('logged_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching food logs by meal type:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get daily nutrition summary
 */
export async function getDailyNutritionSummary(
  userId: string,
  date: string
): Promise<{
  calories: number
  protein: number
  carbs: number
  fat: number
  entries: FoodLog[]
}> {
  const entries = await getFoodLogsByDate(userId, date)
  
  return {
    calories: entries.reduce((sum, e) => sum + (e.calories || 0), 0),
    protein: entries.reduce((sum, e) => sum + (e.protein || 0), 0),
    carbs: entries.reduce((sum, e) => sum + (e.carbs || 0), 0),
    fat: entries.reduce((sum, e) => sum + (e.fat || 0), 0),
    entries,
  }
}

// ─── Food Library Operations ────────────────────────────────────────

/**
 * Get all foods for a user (their food library)
 */
export async function getFoods(userId: string): Promise<Food[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true })
  
  if (error) {
    console.error('Error fetching foods:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get food by ID
 */
export async function getFoodById(
  userId: string,
  foodId: string
): Promise<Food | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .eq('id', foodId)
    .eq('user_id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching food:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get food by barcode
 */
export async function getFoodByBarcode(
  barcode: string
): Promise<Food | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .eq('barcode', barcode)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching food by barcode:', error.message)
    throw error
  }
  
  return data
}

/**
 * Create a new food item
 */
export async function createFood(
  userId: string,
  food: Omit<InsertTables<'foods'>, 'user_id'>
): Promise<Food> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('foods')
    .insert({
      ...food,
      user_id: userId,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating food:', error.message)
    throw error
  }
  
  return data
}

/**
 * Update a food item
 */
export async function updateFood(
  userId: string,
  foodId: string,
  updates: UpdateTables<'foods'>
): Promise<Food> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('foods')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', foodId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating food:', error.message)
    throw error
  }
  
  return data
}

/**
 * Delete a food item
 */
export async function deleteFood(
  userId: string,
  foodId: string
): Promise<void> {
  const supabase = getClient()
  
  const { error } = await supabase
    .from('foods')
    .delete()
    .eq('id', foodId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error deleting food:', error.message)
    throw error
  }
}

/**
 * Search foods by name
 */
export async function searchFoods(
  userId: string,
  query: string
): Promise<Food[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(20)
  
  if (error) {
    console.error('Error searching foods:', error.message)
    throw error
  }
  
  return data
}

// ─── Server-side Operations ─────────────────────────────────────────

/**
 * Server-side: Get food logs for a user with pagination
 * PAGINATION FIX: Added limit and offset parameters
 */
export async function getFoodLogsServer(
  userId: string, 
  options?: { limit?: number; offset?: number }
): Promise<FoodLog[]> {
  const supabase = await createClient()
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0
  
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .range(offset, offset + limit - 1)
  
  if (error) {
    console.error('Error fetching food logs (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Get food logs by date
 */
export async function getFoodLogsByDateServer(
  userId: string,
  date: string
): Promise<FoodLog[]> {
  const supabase = await createClient()
  
  const startOfDay = `${date}T00:00:00.000Z`
  const endOfDay = `${date}T23:59:59.999Z`
  
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', startOfDay)
    .lte('logged_at', endOfDay)
    .order('logged_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching food logs by date (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Create food log
 */
export async function createFoodLogServer(
  userId: string,
  entry: Omit<InsertTables<'food_logs'>, 'user_id'>
): Promise<FoodLog> {
  // Use admin client to bypass RLS since we already validated user in API layer
  const supabase = createAdminClient();
  
  // Resolve food name if missing or unknown
  let resolvedName = entry.food_name;
  if ((!resolvedName || resolvedName === 'Unknown' || resolvedName === 'Unknown Food') && entry.food_id) {
    // Try user foods first
    const { data: userFood } = await supabase
      .from('foods')
      .select('name')
      .eq('id', entry.food_id)
      .eq('user_id', userId)
      .single();
      
    if (userFood) {
      resolvedName = userFood.name;
    } else {
      // Try global foods
      const { data: globalFood } = await supabase
        .from('global_foods')
        .select('name')
        .eq('id', entry.food_id)
        .single();
        
      if (globalFood) {
        resolvedName = globalFood.name;
      }
    }
  }

  // Ensure all required fields have proper values
  const insertData = {
    ...entry,
    user_id: userId,
    food_name: resolvedName,
    logged_at: entry.logged_at || new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // Ensure numeric fields are properly typed
    quantity: Number(entry.quantity),
    calories: Number(entry.calories),
    protein: Number(entry.protein || 0),
    carbs: Number(entry.carbs || 0),
    fat: Number(entry.fat || 0),
    // Ensure defaults for optional fields
    unit: entry.unit || 'g',
    source: entry.source || 'manual',
  };
  
  const { data, error } = await supabase
    .from('food_logs')
    .insert(insertData)
    .select()
    .single()
  
  if (error) {
    console.error('Database error creating food log:', {
      error: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      insertData
    });
    throw new Error(`Database error: ${error.message} (Code: ${error.code})`);
  }
  
  return data
}

/**
 * Server-side: Update food log
 */
export async function updateFoodLogServer(
  userId: string,
  logId: string,
  updates: UpdateTables<'food_logs'>
): Promise<FoodLog> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('food_logs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', logId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating food log (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Delete food log
 */
export async function deleteFoodLogServer(
  userId: string,
  logId: string
): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('food_logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error deleting food log (server):', error.message)
    throw error
  }
}

// ─── Types ─────────────────────────────────────────────────────────

export type FoodLogInsert = InsertTables<'food_logs'>
export type FoodLogUpdate = UpdateTables<'food_logs'>
export type FoodInsert = InsertTables<'foods'>
export type FoodUpdate = UpdateTables<'foods'>
export type DailyNutrition = {
  calories: number
  protein: number
  carbs: number
  fat: number
}
