/**
 * Data Access Layer - Central Export
 * 
 * This module exports all data access functions for the fitness app.
 * Each module handles a specific domain:
 * 
 * - users: User profile and settings operations
 * - food-logs: Food log and food library CRUD operations
 * - workouts: Workout CRUD operations and statistics
 * - body-metrics: Body metrics tracking and trends
 * - analytics: Dashboard stats, insights, and goals
 * 
 * @module lib/data
 */

// ─── User Profile Operations ────────────────────────────────────────

export {
  // Client-side
  getProfile,
  updateProfile,
  createProfile,
  getUserSettings,
  updateUserSettings,
  createUserSettings,
  getProfileWithSettings,
  // Server-side
  getProfileServer,
  updateProfileServer,
  getUserSettingsServer,
  updateUserSettingsServer,
  // Types
  type ProfileUpdate,
  type UserSettingsUpdate,
  type ProfileInsert,
  type UserSettingsInsert,
} from './users'

// ─── Food Log Operations ────────────────────────────────────────────

export {
  // Client-side - Food Logs
  getFoodLogs,
  getFoodLogsByDate,
  getFoodLogsByDateRange,
  getFoodLogById,
  createFoodLog,
  updateFoodLog,
  deleteFoodLog,
  getFoodLogsByMealType,
  getDailyNutritionSummary,
  // Client-side - Food Library
  getFoods,
  getFoodById,
  getFoodByBarcode,
  createFood,
  updateFood,
  deleteFood,
  searchFoods,
  // Server-side
  getFoodLogsServer,
  getFoodLogsByDateServer,
  createFoodLogServer,
  updateFoodLogServer,
  deleteFoodLogServer,
  // Types
  type FoodLogInsert,
  type FoodLogUpdate,
  type FoodInsert,
  type FoodUpdate,
  type DailyNutrition,
} from './food-logs'

// ─── Workout Operations ─────────────────────────────────────────────

export {
  // Client-side
  getWorkouts,
  getWorkoutsPaginated,
  getWorkoutById,
  getWorkoutsByDateRange,
  getWorkoutsByDate,
  getWorkoutsByActivityType,
  getRecentWorkouts,
  createWorkout,
  updateWorkout,
  deleteWorkout,
  getPersonalRecords,
  getWorkoutStats,
  getLongestWorkouts,
  // Server-side
  getWorkoutsServer,
  getWorkoutByIdServer,
  createWorkoutServer,
  updateWorkoutServer,
  deleteWorkoutServer,
  getWorkoutsByDateRangeServer,
  // Types
  type WorkoutInsert,
  type WorkoutUpdate,
  type WorkoutStats,
} from './workouts'

// ─── Body Metrics Operations ────────────────────────────────────────

export {
  // Constants
  METRIC_TYPES,
  type MetricType,
  // Client-side
  getBodyMetrics,
  getBodyMetricsByType,
  getLatestMetric,
  getLatestMetrics,
  getBodyMetricsByDateRange,
  getBodyMetricsByDate,
  getBodyMetricById,
  createBodyMetric,
  createBodyMetricsBatch,
  updateBodyMetric,
  deleteBodyMetric,
  getMetricHistory,
  getWeightTrend,
  // Server-side
  getBodyMetricsServer,
  getLatestMetricServer,
  createBodyMetricServer,
  updateBodyMetricServer,
  deleteBodyMetricServer,
  getBodyMetricsByDateRangeServer,
  // Types
  type BodyMetricInsert,
  type BodyMetricUpdate,
  type WeightTrend,
} from './body-metrics'

// ─── Analytics Operations ───────────────────────────────────────────

export {
  // Dashboard & Stats
  getDashboardStats,
  getWeeklySummary,
  getProgressInsights,
  // AI Insights
  getAIInsights,
  getAIInsightsByType,
  createAIInsight,
  deleteAIInsight,
  // Goals
  getGoals,
  getActiveGoals,
  getGoalById,
  createGoal,
  updateGoal,
  deleteGoal,
  // Server-side
  getDashboardStatsServer,
  getAIInsightsServer,
  getGoalsServer,
  // Types
  type DashboardStats,
  type WeeklySummary,
  type ProgressInsight,
} from './analytics'

// ─── Re-export Types from Database ──────────────────────────────────

export type {
  Profile,
  UserSettings,
  BodyMetric,
  Food,
  FoodLog,
  Workout,
  SleepLog,
  AIInsight,
  Goal,
  UserFile,
  Database,
  Tables,
  InsertTables,
  UpdateTables,
} from '@/lib/supabase/database.types'
