/**
 * Body Metrics Data Access Module
 * 
 * Handles all body metrics operations using Supabase.
 * All queries are filtered by user_id for security.
 * 
 * @module lib/data/body-metrics
 */

import { getClient } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import type {
  BodyMetric,
  InsertTables,
  UpdateTables,
} from '@/lib/supabase/database.types'

// ─── Metric Types ───────────────────────────────────────────────────

export const METRIC_TYPES = {
  WEIGHT: 'weight',
  BODY_FAT: 'body_fat',
  MUSCLE_MASS: 'muscle_mass',
  BMI: 'bmi',
  WAIST: 'waist',
  CHEST: 'chest',
  HIPS: 'hips',
  BICEPS: 'biceps',
  THIGH: 'thigh',
  NECK: 'neck',
  RESTING_HEART_RATE: 'resting_heart_rate',
  BLOOD_PRESSURE_SYSTOLIC: 'blood_pressure_systolic',
  BLOOD_PRESSURE_DIASTOLIC: 'blood_pressure_diastolic',
} as const

export type MetricType = typeof METRIC_TYPES[keyof typeof METRIC_TYPES]

// ─── Client-side Operations ─────────────────────────────────────────

/**
 * Get all body metrics for a user
 */
export async function getBodyMetrics(userId: string): Promise<BodyMetric[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching body metrics:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get body metrics by type
 */
export async function getBodyMetricsByType(
  userId: string,
  metricType: string
): Promise<BodyMetric[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .eq('metric_type', metricType)
    .order('captured_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching body metrics by type:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get the latest metric of a specific type
 */
export async function getLatestMetric(
  userId: string,
  metricType: string
): Promise<BodyMetric | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .eq('metric_type', metricType)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching latest metric:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get latest metrics for all types
 */
export async function getLatestMetrics(
  userId: string
): Promise<Record<string, BodyMetric>> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching latest metrics:', error.message)
    throw error
  }
  
  const latestByType: Record<string, BodyMetric> = {}
  data.forEach(metric => {
    if (!latestByType[metric.metric_type]) {
      latestByType[metric.metric_type] = metric
    }
  })
  
  return latestByType
}

/**
 * Get metrics by date range
 */
export async function getBodyMetricsByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<BodyMetric[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .gte('captured_at', startDate)
    .lte('captured_at', endDate)
    .order('captured_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching body metrics by date range:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get metrics for a specific date
 */
export async function getBodyMetricsByDate(
  userId: string,
  date: string
): Promise<BodyMetric[]> {
  const supabase = getClient()
  
  const startOfDay = `${date}T00:00:00.000Z`
  const endOfDay = `${date}T23:59:59.999Z`
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .gte('captured_at', startOfDay)
    .lte('captured_at', endOfDay)
    .order('captured_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching body metrics by date:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get a single body metric by ID
 */
export async function getBodyMetricById(
  userId: string,
  metricId: string
): Promise<BodyMetric | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('id', metricId)
    .eq('user_id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching body metric:', error.message)
    throw error
  }
  
  return data
}

/**
 * Create a new body metric
 */
export async function createBodyMetric(
  userId: string,
  metric: Omit<InsertTables<'body_metrics'>, 'user_id'>
): Promise<BodyMetric> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .insert({
      ...metric,
      user_id: userId,
      captured_at: metric.captured_at || new Date().toISOString(),
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating body metric:', error.message)
    throw error
  }
  
  return data
}

/**
 * Create multiple body metrics at once (for batch uploads)
 */
export async function createBodyMetricsBatch(
  userId: string,
  metrics: Array<Omit<InsertTables<'body_metrics'>, 'user_id'>>
): Promise<BodyMetric[]> {
  const supabase = getClient()
  
  const metricsWithUserId = metrics.map(m => ({
    ...m,
    user_id: userId,
    captured_at: m.captured_at || new Date().toISOString(),
  }))
  
  const { data, error } = await supabase
    .from('body_metrics')
    .insert(metricsWithUserId)
    .select()
  
  if (error) {
    console.error('Error creating body metrics batch:', error.message)
    throw error
  }
  
  return data
}

/**
 * Update a body metric
 */
export async function updateBodyMetric(
  userId: string,
  metricId: string,
  updates: UpdateTables<'body_metrics'>
): Promise<BodyMetric> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', metricId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating body metric:', error.message)
    throw error
  }
  
  return data
}

/**
 * Delete a body metric
 */
export async function deleteBodyMetric(
  userId: string,
  metricId: string
): Promise<void> {
  const supabase = getClient()
  
  const { error } = await supabase
    .from('body_metrics')
    .delete()
    .eq('id', metricId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error deleting body metric:', error.message)
    throw error
  }
}

/**
 * Get metric history for charting
 * Returns the last N entries for a specific metric type
 */
export async function getMetricHistory(
  userId: string,
  metricType: string,
  limit: number = 30
): Promise<BodyMetric[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .eq('metric_type', metricType)
    .order('captured_at', { ascending: true })
    .limit(limit)
  
  if (error) {
    console.error('Error fetching metric history:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get weight trend (last N entries with change calculations)
 */
export async function getWeightTrend(
  userId: string,
  days: number = 30
): Promise<{
  current: BodyMetric | null
  previous: BodyMetric | null
  change: number | null
  trend: 'up' | 'down' | 'stable' | null
  history: BodyMetric[]
}> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  const history = await getBodyMetricsByDateRange(
    userId,
    startDate.toISOString(),
    new Date().toISOString()
  )
  
  const weightHistory = history
    .filter(m => m.metric_type === METRIC_TYPES.WEIGHT)
    .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())
  
  const current = weightHistory[0] || null
  const previous = weightHistory[1] || null
  
  let change: number | null = null
  let trend: 'up' | 'down' | 'stable' | null = null
  
  if (current && previous) {
    change = current.value - previous.value
    if (Math.abs(change) < 0.1) {
      trend = 'stable'
    } else {
      trend = change > 0 ? 'up' : 'down'
    }
  }
  
  return {
    current,
    previous,
    change,
    trend,
    history: weightHistory.reverse(), // Return in chronological order for charts
  }
}

// ─── Server-side Operations ─────────────────────────────────────────

/**
 * Server-side: Get all body metrics for a user with pagination
 * PAGINATION FIX: Added limit and offset parameters
 */
export async function getBodyMetricsServer(
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<BodyMetric[]> {
  const supabase = await createClient()
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .range(offset, offset + limit - 1)
  
  if (error) {
    console.error('Error fetching body metrics (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Get latest metric of a specific type
 */
export async function getLatestMetricServer(
  userId: string,
  metricType: string
): Promise<BodyMetric | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .eq('metric_type', metricType)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching latest metric (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Create body metric
 */
export async function createBodyMetricServer(
  userId: string,
  metric: Omit<InsertTables<'body_metrics'>, 'user_id'>
): Promise<BodyMetric> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .insert({
      ...metric,
      user_id: userId,
      captured_at: metric.captured_at || new Date().toISOString(),
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating body metric (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Update body metric
 */
export async function updateBodyMetricServer(
  userId: string,
  metricId: string,
  updates: UpdateTables<'body_metrics'>
): Promise<BodyMetric> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', metricId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating body metric (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Delete body metric
 */
export async function deleteBodyMetricServer(
  userId: string,
  metricId: string
): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('body_metrics')
    .delete()
    .eq('id', metricId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error deleting body metric (server):', error.message)
    throw error
  }
}

/**
 * Server-side: Get body metrics by date range
 */
export async function getBodyMetricsByDateRangeServer(
  userId: string,
  startDate: string,
  endDate: string
): Promise<BodyMetric[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .gte('captured_at', startDate)
    .lte('captured_at', endDate)
    .order('captured_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching body metrics by date range (server):', error.message)
    throw error
  }
  
  return data
}

// ─── Types ─────────────────────────────────────────────────────────

export type BodyMetricInsert = InsertTables<'body_metrics'>
export type BodyMetricUpdate = UpdateTables<'body_metrics'>
export type WeightTrend = {
  current: BodyMetric | null
  previous: BodyMetric | null
  change: number | null
  trend: 'up' | 'down' | 'stable' | null
  history: BodyMetric[]
}
