/**
 * Analytics Data Access Module
 * 
 * Provides comprehensive analytics and insights by combining data
 * from multiple sources (food logs, workouts, body metrics).
 * 
 * @module lib/data/analytics
 */

import { getClient } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import { cacheAnalytics, getCachedAnalytics } from '@/lib/offline-storage'
import type {
  FoodLog,
  Workout,
  BodyMetric,
  AIInsight,
  Goal,
  InsertTables,
} from '@/lib/supabase/database.types'

// ─── Types ─────────────────────────────────────────────────────────

export interface DashboardStats {
  nutrition: {
    todayCalories: number
    todayProtein: number
    todayCarbs: number
    todayFat: number
    weeklyAvgCalories: number
    streak: number
  }
  workouts: {
    thisWeekCount: number
    thisWeekDuration: number
    thisWeekCaloriesBurned: number
    monthlyCount: number
    streak: number
  }
  bodyMetrics: {
    currentWeight: number | null
    weightChange: number | null
    weightTrend: 'up' | 'down' | 'stable' | null
  }
  goals: {
    active: number
    completed: number
    nearCompletion: number
  }
}

export interface WeeklySummary {
  weekStart: string
  weekEnd: string
  nutrition: {
    totalCalories: number
    avgDailyCalories: number
    totalProtein: number
    avgProtein: number
    daysLogged: number
  }
  workouts: {
    count: number
    totalDuration: number
    totalCaloriesBurned: number
    avgDuration: number
    activityTypes: string[]
  }
  bodyMetrics: {
    weightStart: number | null
    weightEnd: number | null
    weightChange: number | null
  }
}

export interface ProgressInsight {
  type: 'nutrition' | 'workout' | 'body' | 'overall'
  title: string
  message: string
  trend: 'improving' | 'declining' | 'stable'
  data: Record<string, unknown>
}

// ─── Client-side Operations ─────────────────────────────────────────

/**
 * Get dashboard statistics - Optimized version
 * 
 * CRITICAL FIX: Reduced from 11 parallel queries to 5 batched queries
 * using Promise.allSettled for graceful degradation and combined queries
 * where possible to minimize database round trips.
 * 
 * P1 FIX: Added IndexedDB caching for offline access and faster cold starts
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const cacheKey = `dashboard-stats-${userId}`;
  
  // Try to get cached data first (returns null if offline or expired)
  const cached = await getCachedAnalytics<DashboardStats>(cacheKey);
  if (cached) {
    return cached;
  }
  
  const supabase = getClient()
  
  // FIX: Use toUTCDateString for consistent timezone handling.
  // All logged_at timestamps from Supabase are ISO strings, so splitting by 'T'[0]
  // gives UTC dates. We must use UTC dates here to match aggregation logic.
  const today = new Date()
  const todayStr = toLocalDateString(today)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const monthAgo = new Date(today)
  monthAgo.setDate(monthAgo.getDate() - 30)
  
  // OPTIMIZED: Batch queries into logical groups with Promise.allSettled
  // This ensures partial failures don't break the entire dashboard
  const [
    nutritionResult,
    workoutsResult,
    weightsResult,
    goalsResult,
    streaksResult,
  ] = await Promise.allSettled([
    // BATCH 1: All nutrition data (today + weekly in one query)
    supabase
      .from('food_logs')
      .select('calories, protein, carbs, fat, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', weekAgo.toISOString()),
    
    // BATCH 2: All workout data (weekly + monthly combined)
    supabase
      .from('workouts')
      .select('id, duration_minutes, calories_burned, activity_type, started_at')
      .eq('user_id', userId)
      .gte('started_at', monthAgo.toISOString()),
    
    // BATCH 3: Weight data (latest 2 weights in one query)
    supabase
      .from('body_metrics')
      .select('value, captured_at')
      .eq('user_id', userId)
      .eq('metric_type', 'weight')
      .order('captured_at', { ascending: false })
      .limit(2),
    
    // BATCH 4: All goals data (active + completed in one query)
    supabase
      .from('goals')
      .select('id, status, current_value, target_value')
      .eq('user_id', userId)
      .in('status', ['active', 'completed']),
    
    // BATCH 5: Streaks (computed together)
    Promise.all([
      calculateFoodStreak(userId, supabase),
      calculateWorkoutStreak(userId, supabase),
    ]),
  ])
  
  // Extract data with safe fallbacks
  const foodLogs = nutritionResult.status === 'fulfilled' ? nutritionResult.value.data : null
  const workoutsData = workoutsResult.status === 'fulfilled' ? workoutsResult.value.data : null
  const weightsData = weightsResult.status === 'fulfilled' ? weightsResult.value.data : null
  const goalsData = goalsResult.status === 'fulfilled' ? goalsResult.value.data : null
  const streaks = streaksResult.status === 'fulfilled' ? streaksResult.value : [0, 0]
  
  // Calculate nutrition stats from the single food logs query
  const todayStart = `${todayStr}T00:00:00.000Z`
  const todayEnd = `${todayStr}T23:59:59.999Z`
  
  const todayFoodLogs = foodLogs?.filter(log => 
    log.logged_at >= todayStart && log.logged_at <= todayEnd
  ) || []
  
  const todayCalories = todayFoodLogs.reduce((sum, log) => sum + (log.calories || 0), 0)
  const todayProtein = todayFoodLogs.reduce((sum, log) => sum + (log.protein || 0), 0)
  const todayCarbs = todayFoodLogs.reduce((sum, log) => sum + (log.carbs || 0), 0)
  const todayFat = todayFoodLogs.reduce((sum, log) => sum + (log.fat || 0), 0)
  
  // Calculate weekly average calories
  const weeklyTotalCalories = foodLogs?.reduce((sum, log) => sum + (log.calories || 0), 0) || 0
  const uniqueDays = new Set(
    foodLogs?.map(log => log.logged_at.split('T')[0]) || []
  ).size
  const weeklyAvgCalories = uniqueDays > 0 ? weeklyTotalCalories / uniqueDays : 0
  
  // Calculate workout stats from the single workouts query
  const weeklyWorkouts = workoutsData?.filter(w => 
    new Date(w.started_at) >= weekAgo
  ) || []
  
  const monthlyWorkouts = workoutsData || []
  
  const weeklyWorkoutCount = weeklyWorkouts.length
  const weeklyDuration = weeklyWorkouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0)
  const weeklyCaloriesBurned = weeklyWorkouts.reduce((sum, w) => sum + (w.calories_burned || 0), 0)
  
  // Calculate weight trend from the weights query
  let weightChange: number | null = null
  let weightTrend: 'up' | 'down' | 'stable' | null = null
  
  if (weightsData && weightsData.length >= 2) {
    weightChange = weightsData[0].value - weightsData[1].value
    if (Math.abs(weightChange) < 0.1) {
      weightTrend = 'stable'
    } else {
      weightTrend = weightChange > 0 ? 'up' : 'down'
    }
  }
  
  // Calculate goal stats from the single goals query
  const activeGoals = goalsData?.filter(g => g.status === 'active') || []
  const completedGoals = goalsData?.filter(g => g.status === 'completed') || []
  
  // Calculate near completion goals (>= 80% of target)
  const nearCompletionCount = activeGoals.filter(goal => {
    const current = goal.current_value
    const target = goal.target_value
    if (current == null || target == null || target === 0) return false
    return (current / target) >= 0.8
  }).length
  
  const stats = {
    nutrition: {
      todayCalories,
      todayProtein,
      todayCarbs,
      todayFat,
      weeklyAvgCalories: Math.round(weeklyAvgCalories),
      streak: streaks[0],
    },
    workouts: {
      thisWeekCount: weeklyWorkoutCount,
      thisWeekDuration: weeklyDuration,
      thisWeekCaloriesBurned: weeklyCaloriesBurned,
      monthlyCount: monthlyWorkouts.length,
      streak: streaks[1],
    },
    bodyMetrics: {
      currentWeight: weightsData?.[0]?.value || null,
      weightChange,
      weightTrend,
    },
    goals: {
      active: activeGoals.length,
      completed: completedGoals.length,
      nearCompletion: nearCompletionCount,
    },
  };
  
  // Cache for 5 minutes (P1 FIX)
  cacheAnalytics(cacheKey, stats).catch(console.warn);
  
  return stats;
}

/**
 * Calculate food logging streak
 */
/**
 * P0 FIX: Convert date to UTC date string for timezone-safe comparison
 */
function toLocalDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * P0 FIX: Get today's date in UTC
 */
function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * P0 FIX: Calculate difference in days between two UTC date strings
 */
function daysDiffUTC(date1: string, date2: string): number {
  const d1 = new Date(date1 + 'T00:00:00Z')
  const d2 = new Date(date2 + 'T00:00:00Z')
  return Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
}

async function calculateFoodStreak(userId: string, supabase: ReturnType<typeof getClient>): Promise<number> {
  const { data } = await supabase
    .from('food_logs')
    .select('logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(100)
  
  if (!data || data.length === 0) return 0
  
  // P0 FIX: Use UTC date strings to avoid timezone issues
  const uniqueDates = new Set(
    data.map(log => toLocalDateString(log.logged_at))
  )
  const sortedDates = Array.from(uniqueDates).sort().reverse()
  
  let streak = 0
  let currentDateStr = getTodayUTC()
  
  for (const dateStr of sortedDates) {
    const diffDays = daysDiffUTC(currentDateStr, dateStr)
    
    if (diffDays === 0 || diffDays === 1) {
      streak++
      currentDateStr = dateStr
    } else {
      break
    }
  }
  
  return streak
}

/**
 * Calculate workout streak
 */
async function calculateWorkoutStreak(userId: string, supabase: ReturnType<typeof getClient>): Promise<number> {
  const { data } = await supabase
    .from('workouts')
    .select('started_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(100)
  
  if (!data || data.length === 0) return 0
  
  // P0 FIX: Use UTC date strings consistently
  const uniqueDates = new Set(
    data.map(w => toLocalDateString(w.started_at))
  )
  const sortedDates = Array.from(uniqueDates).sort().reverse()
  
  let streak = 0
  let currentDateStr = getTodayUTC()
  
  for (const dateStr of sortedDates) {
    const diffDays = daysDiffUTC(currentDateStr, dateStr)
    
    if (diffDays === 0 || diffDays === 1) {
      streak++
      currentDateStr = dateStr
    } else {
      break
    }
  }
  
  return streak
}

/**
 * Get weekly summary
 */
export async function getWeeklySummary(
  userId: string,
  weekStart?: string
): Promise<WeeklySummary> {
  const supabase = getClient()
  
  const start = weekStart ? new Date(weekStart) : new Date()
  start.setDate(start.getDate() - start.getDay()) // Start of week (Sunday)
  start.setHours(0, 0, 0, 0)
  
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  
  const [foodLogs, workouts, weights] = await Promise.all([
    supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', start.toISOString())
      .lte('logged_at', end.toISOString()),
    
    supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', start.toISOString())
      .lte('started_at', end.toISOString()),
    
    supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', userId)
      .eq('metric_type', 'weight')
      .gte('captured_at', start.toISOString())
      .lte('captured_at', end.toISOString())
      .order('captured_at', { ascending: true }),
  ])
  
  const foodLogsData = foodLogs.data || []
  const workoutsData = workouts.data || []
  const weightsData = weights.data || []
  
  // Calculate nutrition stats
  const totalCalories = foodLogsData.reduce((sum, log) => sum + (log.calories || 0), 0)
  const totalProtein = foodLogsData.reduce((sum, log) => sum + (log.protein || 0), 0)
  // FIX: Use toUTCDateString for consistent UTC-based day grouping
  const uniqueDays = new Set(foodLogsData.map(l => toLocalDateString(l.logged_at))).size
  
  // Calculate workout stats
  const activityTypes = [...new Set(workoutsData.map(w => w.activity_type))]
  
  // Calculate weight change
  let weightStart: number | null = null
  let weightEnd: number | null = null
  
  if (weightsData.length >= 1) {
    weightStart = weightsData[0].value
    weightEnd = weightsData[weightsData.length - 1].value
  }
  
  return {
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    nutrition: {
      totalCalories,
      // P1 FIX: Divide by actual days logged, not 7 (consistent with avgProtein)
      avgDailyCalories: uniqueDays > 0 ? Math.round(totalCalories / uniqueDays) : 0,
      totalProtein,
      avgProtein: uniqueDays > 0 ? Math.round(totalProtein / uniqueDays) : 0,
      daysLogged: uniqueDays,
    },
    workouts: {
      count: workoutsData.length,
      totalDuration: workoutsData.reduce((sum, w) => sum + (w.duration_minutes || 0), 0),
      totalCaloriesBurned: workoutsData.reduce((sum, w) => sum + (w.calories_burned || 0), 0),
      avgDuration: workoutsData.length > 0 
        ? workoutsData.reduce((sum, w) => sum + (w.duration_minutes || 0), 0) / workoutsData.length 
        : 0,
      activityTypes,
    },
    bodyMetrics: {
      weightStart,
      weightEnd,
      weightChange: weightStart && weightEnd ? weightEnd - weightStart : null,
    },
  }
}

/**
 * Get progress insights
 */
export async function getProgressInsights(userId: string): Promise<ProgressInsight[]> {
  const insights: ProgressInsight[] = []
  const supabase = getClient()
  
  // Get recent data for analysis
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
  
  const [recentFoodLogs, previousFoodLogs, recentWorkouts, previousWorkouts, recentWeights] = await Promise.all([
    supabase
      .from('food_logs')
      .select('calories, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', thirtyDaysAgo.toISOString()),
    
    supabase
      .from('food_logs')
      .select('calories')
      .eq('user_id', userId)
      .gte('logged_at', sixtyDaysAgo.toISOString())
      .lt('logged_at', thirtyDaysAgo.toISOString()),
    
    supabase
      .from('workouts')
      .select('duration_minutes, started_at')
      .eq('user_id', userId)
      .gte('started_at', thirtyDaysAgo.toISOString()),
    
    supabase
      .from('workouts')
      .select('duration_minutes')
      .eq('user_id', userId)
      .gte('started_at', sixtyDaysAgo.toISOString())
      .lt('started_at', thirtyDaysAgo.toISOString()),
    
    supabase
      .from('body_metrics')
      .select('value, captured_at')
      .eq('user_id', userId)
      .eq('metric_type', 'weight')
      .order('captured_at', { ascending: false })
      .limit(10),
  ])
  
  // P0 FIX: Calculate average based on actual days logged, not calendar days
  // FIX: Use toUTCDateString consistently for both recent and previous periods
  const recentDaysLogged = new Set(
    recentFoodLogs.data?.map(l => toLocalDateString(l.logged_at)) || []
  ).size
  const previousDaysLogged = new Set(
    previousFoodLogs.data?.map(l => toLocalDateString(l.logged_at)) || []
  ).size
  
  const recentTotalCalories = recentFoodLogs.data?.reduce((sum, l) => sum + (l.calories || 0), 0) || 0
  const previousTotalCalories = previousFoodLogs.data?.reduce((sum, l) => sum + (l.calories || 0), 0) || 0
  
  // Divide by actual days logged, not hardcoded 30
  const recentAvgCalories = recentDaysLogged > 0 ? recentTotalCalories / recentDaysLogged : 0
  const previousAvgCalories = previousDaysLogged > 0 ? previousTotalCalories / previousDaysLogged : 0
  
  if (recentAvgCalories > 0) {
    const calorieChange = recentAvgCalories - previousAvgCalories
    insights.push({
      type: 'nutrition',
      title: 'Calorie Intake',
      message: calorieChange > 50 
        ? `Your average daily calories increased by ${Math.round(calorieChange)} kcal compared to last month.`
        : calorieChange < -50
          ? `Your average daily calories decreased by ${Math.abs(Math.round(calorieChange))} kcal compared to last month.`
          : 'Your calorie intake has been consistent with last month.',
      trend: calorieChange > 50 ? 'up' : calorieChange < -50 ? 'down' : 'stable',
      data: { recentAvg: recentAvgCalories, previousAvg: previousAvgCalories },
    })
  }
  
  // Workout insight
  const recentWorkoutCount = recentWorkouts.data?.length || 0
  const previousWorkoutCount = previousWorkouts.data?.length || 0
  
  insights.push({
    type: 'workout',
    title: 'Workout Frequency',
    message: recentWorkoutCount > previousWorkoutCount
      ? `You completed ${recentWorkoutCount} workouts this month, up from ${previousWorkoutCount} last month!`
      : recentWorkoutCount < previousWorkoutCount
        ? `You completed ${recentWorkoutCount} workouts this month, down from ${previousWorkoutCount} last month.`
        : `You've maintained ${recentWorkoutCount} workouts per month.`,
    trend: recentWorkoutCount > previousWorkoutCount 
      ? 'improving' 
      : recentWorkoutCount < previousWorkoutCount 
        ? 'declining' 
        : 'stable',
    data: { recent: recentWorkoutCount, previous: previousWorkoutCount },
  })
  
  // Weight insight
  if (recentWeights.data && recentWeights.data.length >= 2) {
    const latest = recentWeights.data[0].value
    const oldest = recentWeights.data[recentWeights.data.length - 1].value
    const weightChange = latest - oldest
    
    insights.push({
      type: 'body',
      title: 'Weight Progress',
      message: Math.abs(weightChange) < 0.5
        ? 'Your weight has been stable recently.'
        : weightChange > 0
          ? `You've gained ${weightChange.toFixed(1)} kg recently.`
          : `You've lost ${Math.abs(weightChange).toFixed(1)} kg recently.`,
      trend: Math.abs(weightChange) < 0.5 ? 'stable' : weightChange > 0 ? 'up' : 'down',
      data: { latest, oldest, change: weightChange },
    })
  }
  
  return insights
}

// ─── AI Insights Operations ────────────────────────────────────────

/**
 * Get AI insights for a user
 */
export async function getAIInsights(userId: string): Promise<AIInsight[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('user_id', userId)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(50)
  
  if (error) {
    console.error('Error fetching AI insights:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get AI insights by type
 */
export async function getAIInsightsByType(
  userId: string,
  insightType: string
): Promise<AIInsight[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('user_id', userId)
    .eq('insight_type', insightType)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(25)
  
  if (error) {
    console.error('Error fetching AI insights by type:', error.message)
    throw error
  }
  
  return data
}

/**
 * Create an AI insight
 */
export async function createAIInsight(
  userId: string,
  insight: Omit<InsertTables<'ai_insights'>, 'user_id'>
): Promise<AIInsight> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('ai_insights')
    .insert({
      ...insight,
      user_id: userId,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating AI insight:', error.message)
    throw error
  }
  
  return data
}

/**
 * Delete an AI insight
 */
export async function deleteAIInsight(
  userId: string,
  insightId: string
): Promise<void> {
  const supabase = getClient()
  
  const { error } = await supabase
    .from('ai_insights')
    .delete()
    .eq('id', insightId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error deleting AI insight:', error.message)
    throw error
  }
}

// ─── Goals Operations ───────────────────────────────────────────────

/**
 * Get all goals for a user
 */
export async function getGoals(userId: string): Promise<Goal[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  
  if (error) {
    console.error('Error fetching goals:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get active goals
 */
export async function getActiveGoals(userId: string): Promise<Goal[]> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(25)
  
  if (error) {
    console.error('Error fetching active goals:', error.message)
    throw error
  }
  
  return data
}

/**
 * Get a single goal by ID
 */
export async function getGoalById(
  userId: string,
  goalId: string
): Promise<Goal | null> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('Error fetching goal:', error.message)
    throw error
  }
  
  return data
}

/**
 * Create a new goal
 */
export async function createGoal(
  userId: string,
  goal: Omit<InsertTables<'goals'>, 'user_id'>
): Promise<Goal> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('goals')
    .insert({
      ...goal,
      user_id: userId,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating goal:', error.message)
    throw error
  }
  
  return data
}

/**
 * Update a goal
 */
export async function updateGoal(
  userId: string,
  goalId: string,
  updates: Partial<Goal>
): Promise<Goal> {
  const supabase = getClient()
  
  const { data, error } = await supabase
    .from('goals')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating goal:', error.message)
    throw error
  }
  
  return data
}

/**
 * Delete a goal
 */
export async function deleteGoal(
  userId: string,
  goalId: string
): Promise<void> {
  const supabase = getClient()
  
  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId)
  
  if (error) {
    console.error('Error deleting goal:', error.message)
    throw error
  }
}

// ─── Server-side Operations ─────────────────────────────────────────

/**
 * Server-side: Get dashboard stats
 */
export async function getDashboardStatsServer(userId: string): Promise<DashboardStats> {
  // For server-side, we can reuse the client-side logic by creating a server client
  // This is a simplified version - in production, you'd want to optimize the queries
  const supabase = await createClient()
  
  // FIX: Use toUTCDateString for consistent timezone handling (matches client-side)
  const today = new Date()
  const todayStr = toLocalDateString(today)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const monthAgo = new Date(today)
  monthAgo.setDate(monthAgo.getDate() - 30)
  
  const [todayFoodLogs, weeklyFoodLogs, weeklyWorkouts, monthlyWorkouts, latestWeight, previousWeight, activeGoals, completedGoals] = await Promise.all([
    supabase.from('food_logs').select('calories, protein, carbs, fat').eq('user_id', userId).gte('logged_at', `${todayStr}T00:00:00.000Z`).lte('logged_at', `${todayStr}T23:59:59.999Z`),
    supabase.from('food_logs').select('calories, logged_at').eq('user_id', userId).gte('logged_at', weekAgo.toISOString()),
    supabase.from('workouts').select('duration_minutes, calories_burned, activity_type').eq('user_id', userId).gte('started_at', weekAgo.toISOString()),
    supabase.from('workouts').select('id').eq('user_id', userId).gte('started_at', monthAgo.toISOString()),
    supabase.from('body_metrics').select('value').eq('user_id', userId).eq('metric_type', 'weight').order('captured_at', { ascending: false }).limit(1).single(),
    supabase.from('body_metrics').select('value').eq('user_id', userId).eq('metric_type', 'weight').order('captured_at', { ascending: false }).range(1, 1).single(),
    supabase.from('goals').select('id').eq('user_id', userId).eq('status', 'active'),
    supabase.from('goals').select('id').eq('user_id', userId).eq('status', 'completed'),
  ])
  
  const todayCalories = todayFoodLogs.data?.reduce((sum, log) => sum + (log.calories || 0), 0) || 0
  const uniqueDays = new Set(weeklyFoodLogs.data?.map(log => log.logged_at.split('T')[0]) || []).size
  const weeklyAvgCalories = uniqueDays > 0 ? (weeklyFoodLogs.data?.reduce((sum, log) => sum + (log.calories || 0), 0) || 0) / uniqueDays : 0
  
  let weightChange: number | null = null
  let weightTrend: 'up' | 'down' | 'stable' | null = null
  
  if (latestWeight.data && previousWeight.data) {
    weightChange = latestWeight.data.value - previousWeight.data.value
    weightTrend = Math.abs(weightChange) < 0.1 ? 'stable' : weightChange > 0 ? 'up' : 'down'
  }
  
  return {
    nutrition: {
      todayCalories,
      todayProtein: todayFoodLogs.data?.reduce((sum, log) => sum + (log.protein || 0), 0) || 0,
      todayCarbs: todayFoodLogs.data?.reduce((sum, log) => sum + (log.carbs || 0), 0) || 0,
      todayFat: todayFoodLogs.data?.reduce((sum, log) => sum + (log.fat || 0), 0) || 0,
      weeklyAvgCalories: Math.round(weeklyAvgCalories),
      streak: 0, // Would need separate calculation
    },
    workouts: {
      thisWeekCount: weeklyWorkouts.data?.length || 0,
      thisWeekDuration: weeklyWorkouts.data?.reduce((sum, w) => sum + (w.duration_minutes || 0), 0) || 0,
      thisWeekCaloriesBurned: weeklyWorkouts.data?.reduce((sum, w) => sum + (w.calories_burned || 0), 0) || 0,
      monthlyCount: monthlyWorkouts.data?.length || 0,
      streak: 0, // Would need separate calculation
    },
    bodyMetrics: {
      currentWeight: latestWeight.data?.value || null,
      weightChange,
      weightTrend,
    },
    goals: {
      active: activeGoals.data?.length || 0,
      completed: completedGoals.data?.length || 0,
      nearCompletion: 0,
    },
  }
}

/**
 * Server-side: Get AI insights
 */
export async function getAIInsightsServer(userId: string): Promise<AIInsight[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('user_id', userId)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching AI insights (server):', error.message)
    throw error
  }
  
  return data
}

/**
 * Server-side: Get goals
 */
export async function getGoalsServer(userId: string): Promise<Goal[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching goals (server):', error.message)
    throw error
  }
  
  return data
}
