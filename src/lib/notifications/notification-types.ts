/**
 * Notification Types and Interfaces
 * 
 * Type definitions for the Behavioral Notification Engine
 * 
 * @module lib/notifications/types
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════════════════════════════════

export type NotificationType =
  | 'workout_reminder'
  | 'meal_reminder'
  | 'streak_protection'
  | 'achievement'
  | 'goal_progress'
  | 'coach_insight'
  | 'habit_reinforcement'
  | 'daily_summary'
  | 'hydration_reminder'
  | 'motivational';

export type NotificationStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'actioned'
  | 'dismissed'
  | 'failed';

export type DeviceType = 'ios' | 'android' | 'web';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export type Locale = 'en' | 'fr' | 'ar';

// ═══════════════════════════════════════════════════════════════════════════════
// User Behavior Profile
// ═══════════════════════════════════════════════════════════════════════════════

export interface UserBehaviorProfile {
  id: string;
  user_id: string;
  
  // Preferred activity times
  preferred_workout_time: string | null;
  preferred_meal_time: string | null;
  preferred_app_open_time: string | null;
  
  // Activity patterns
  workout_hour_distribution: Record<string, number>;
  meal_hour_distribution: Record<string, number>;
  app_open_hour_distribution: Record<string, number>;
  
  // Engagement metrics
  engagement_score: number;
  avg_response_time_seconds: number | null;
  notification_open_rate: number;
  
  // Prediction
  prediction_confidence: number;
  last_prediction_update: string | null;
  
  // Sleep window
  sleep_start_time: string;
  sleep_end_time: string;
  timezone: string;
  
  // Computed optimal times
  best_morning_notification_time: string;
  best_afternoon_notification_time: string;
  best_evening_notification_time: string;
  
  // Streak data
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification
// ═══════════════════════════════════════════════════════════════════════════════

export interface Notification {
  id: string;
  user_id: string;
  
  // Content
  type: NotificationType;
  title: string;
  body: string;
  
  // Multilingual
  title_translations: Record<Locale, string>;
  body_translations: Record<Locale, string>;
  
  // AI metadata
  generated_by_ai: boolean;
  ai_prompt_used: string | null;
  ai_cache_key: string | null;
  
  // Scheduling
  scheduled_for: string;
  sent_at: string | null;
  opened_at: string | null;
  actioned_at: string | null;
  
  // Delivery
  status: NotificationStatus;
  delivery_status: string | null;
  
  // Analytics
  prediction_score: number | null;
  actual_engagement: boolean | null;
  
  // Deep linking
  deep_link: string | null;
  action_data: Record<string, unknown>;
  
  // Throttle
  throttle_key: string | null;
  
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Preferences
// ═══════════════════════════════════════════════════════════════════════════════

export interface NotificationPreferences {
  id: string;
  user_id: string;
  
  // Global
  notifications_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  
  // Per-type
  workout_reminders_enabled: boolean;
  meal_reminders_enabled: boolean;
  streak_protection_enabled: boolean;
  achievements_enabled: boolean;
  coach_insights_enabled: boolean;
  daily_summary_enabled: boolean;
  hydration_reminders_enabled: boolean;
  motivational_enabled: boolean;
  
  // Frequency
  max_notifications_per_day: number;
  min_time_between_notifications_minutes: number;
  
  // User-configured times
  preferred_morning_time: string | null;
  preferred_afternoon_time: string | null;
  preferred_evening_time: string | null;
  
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// User Device
// ═══════════════════════════════════════════════════════════════════════════════

export interface UserDevice {
  id: string;
  user_id: string;
  device_token: string;
  device_type: DeviceType;
  device_name: string | null;
  device_id: string | null;
  push_enabled: boolean;
  sound_enabled: boolean;
  badge_enabled: boolean;
  last_used_at: string;
  registered_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context for Notification Generation
// ═══════════════════════════════════════════════════════════════════════════════

export interface NotificationContext {
  // User info
  userId: string;
  userName: string;
  locale: Locale;
  
  // Goals
  primaryGoal: string;
  targetCalories: number;
  targetProtein: number;
  
  // Today's progress
  caloriesConsumed: number;
  proteinConsumed: number;
  caloriesBurned: number;
  hydrationCurrent: number;
  hydrationTarget: number;
  stepsCurrent: number;
  stepsTarget: number;
  
  // Workout data
  hasWorkoutToday: boolean;
  workoutCount: number;
  lastWorkoutDate: string | null;
  lastWorkoutType: string | null;
  
  // Streak
  currentStreak: number;
  streakAtRisk: boolean;  // True if streak would break without activity today
  
  // Timing
  timeOfDay: TimeOfDay;
  dayOfWeek: number;  // 0-6
  
  // Behavior profile
  behaviorProfile: UserBehaviorProfile | null;
  
  // Recent notifications (for deduplication)
  recentNotificationTypes: NotificationType[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Generated Notification
// ═══════════════════════════════════════════════════════════════════════════════

export interface GeneratedNotification {
  type: NotificationType;
  title: string;
  body: string;
  titleTranslations: Record<Locale, string>;
  bodyTranslations: Record<Locale, string>;
  deepLink: string;
  actionData: Record<string, unknown>;
  throttleKey: string;
  scheduledFor: Date;
  predictionScore: number;
  generatedByAI: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Template
// ═══════════════════════════════════════════════════════════════════════════════

export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  trigger_condition: string;
  title_template: string;
  body_template: string;
  title_translations: Record<Locale, string>;
  body_translations: Record<Locale, string>;
  variables: string[];
  times_used: number;
  avg_engagement_rate: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Response Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface NotificationListResponse {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
}

export interface NotificationPreferencesUpdate {
  notifications_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  timezone?: string;
  workout_reminders_enabled?: boolean;
  meal_reminders_enabled?: boolean;
  streak_protection_enabled?: boolean;
  achievements_enabled?: boolean;
  coach_insights_enabled?: boolean;
  daily_summary_enabled?: boolean;
  hydration_reminders_enabled?: boolean;
  motivational_enabled?: boolean;
  max_notifications_per_day?: number;
  preferred_morning_time?: string;
  preferred_afternoon_time?: string;
  preferred_evening_time?: string;
}
