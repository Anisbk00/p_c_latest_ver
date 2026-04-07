/**
 * Notification Service
 * 
 * Client-side service for managing notifications.
 * Works with the web app and provides the same API for mobile integration.
 * 
 * @module lib/notifications/service
 */

import { getClient } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
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

export interface NotificationPreferences {
  notifications_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  workout_reminders_enabled: boolean;
  meal_reminders_enabled: boolean;
  streak_protection_enabled: boolean;
  achievements_enabled: boolean;
  coach_insights_enabled: boolean;
  daily_summary_enabled: boolean;
  hydration_reminders_enabled: boolean;
  motivational_enabled: boolean;
  max_notifications_per_day: number;
  min_time_between_notifications_minutes: number;
  preferred_morning_time: string | null;
  preferred_afternoon_time: string | null;
  preferred_evening_time: string | null;
}

export interface ScheduledNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  scheduled_for: string;
  status: string;
  deep_link: string | null;
  created_at: string;
}

export interface RegisterDeviceParams {
  device_token: string;
  device_type: 'ios' | 'android' | 'web';
  device_name?: string;
  device_id?: string;
}

export interface ScheduleNotificationParams {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  title_translations?: Record<string, string>;
  body_translations?: Record<string, string>;
  scheduled_for?: string;
  deep_link?: string;
  action_data?: Record<string, unknown>;
  throttle_key?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Service Class
// ═══════════════════════════════════════════════════════════════════════════════

class NotificationService {
  private supabase = getClient();
  private realtimeChannel: ReturnType<typeof this.supabase.channel> | null = null;

  /**
   * Register a device for push notifications
   */
  async registerDevice(params: RegisterDeviceParams): Promise<{
    success: boolean;
    action?: 'registered' | 'updated';
    device_id?: string;
    token_type?: string;
    error?: string;
  }> {
    try {
      const response = await fetch('/api/notifications/register-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      return await response.json();
    } catch (error) {
      console.error('[NotificationService] registerDevice error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Unregister a device
   */
  async unregisterDevice(deviceToken: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('/api/notifications/register-device', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_token: deviceToken }),
      });

      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Schedule a notification
   */
  async scheduleNotification(params: ScheduleNotificationParams): Promise<{
    success: boolean;
    notification_id?: string;
    scheduled_for?: string;
    reason?: string;
    error?: string;
  }> {
    try {
      const response = await fetch('/api/notifications/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get scheduled notifications
   */
  async getScheduledNotifications(status: string = 'pending', limit: number = 20): Promise<{
    notifications: ScheduledNotification[];
    error?: string;
  }> {
    try {
      const response = await fetch(
        `/api/notifications/schedule?status=${status}&limit=${limit}`
      );
      return await response.json();
    } catch (error) {
      return { notifications: [], error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get notification preferences
   */
  async getPreferences(): Promise<{ preferences: NotificationPreferences | null; error?: string }> {
    try {
      const response = await fetch('/api/notifications/preferences');
      return await response.json();
    } catch (error) {
      return { preferences: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(updates: Partial<NotificationPreferences>): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Subscribe to realtime notifications
   */
  subscribeToNotifications(
    userId: string,
    onNotification: (notification: ScheduledNotification) => void
  ): () => void {
    this.realtimeChannel = this.supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onNotification(payload.new as ScheduledNotification);
        }
      )
      .subscribe();

    return () => {
      if (this.realtimeChannel) {
        this.supabase.removeChannel(this.realtimeChannel);
        this.realtimeChannel = null;
      }
    };
  }

  /**
   * Mark notification as opened
   */
  async markAsOpened(notificationId: string): Promise<{ success: boolean }> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({
          status: 'opened',
          opened_at: new Date().toISOString(),
        })
        .eq('id', notificationId);

      return { success: !error };
    } catch {
      return { success: false };
    }
  }

  /**
   * Mark notification as actioned (user took action)
   */
  async markAsActioned(notificationId: string): Promise<{ success: boolean }> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({
          status: 'actioned',
          actioned_at: new Date().toISOString(),
        })
        .eq('id', notificationId);

      return { success: !error };
    } catch {
      return { success: false };
    }
  }

  /**
   * Dismiss notification
   */
  async dismiss(notificationId: string): Promise<{ success: boolean }> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({ status: 'dismissed' })
        .eq('id', notificationId);

      return { success: !error };
    } catch {
      return { success: false };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Convenience Methods for Common Notifications
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Schedule a workout reminder
   */
  async scheduleWorkoutReminder(
    userId: string,
    scheduledFor: Date,
    customMessage?: string
  ): Promise<{ success: boolean; notification_id?: string }> {
    // P1 FIX: More precise throttle key with 4-hour buckets
    const now = new Date();
    const day = now.toISOString().split('T')[0];
    const bucket = Math.floor(now.getHours() / 4); // 6 buckets per day (0-5)
    
    return this.scheduleNotification({
      user_id: userId,
      type: 'workout_reminder',
      title: 'Time to Workout! 💪',
      body: customMessage || "Don't break your streak! Your workout is waiting.",
      scheduled_for: scheduledFor.toISOString(),
      deep_link: '/workouts',
      throttle_key: `workout_reminder:${userId}:${day}:${bucket}`,
    });
  }

  /**
   * Schedule a meal reminder
   */
  async scheduleMealReminder(
    userId: string,
    scheduledFor: Date,
    mealType: string
  ): Promise<{ success: boolean; notification_id?: string }> {
    // P1 FIX: More precise throttle key with 4-hour buckets
    const now = new Date();
    const day = now.toISOString().split('T')[0];
    const bucket = Math.floor(now.getHours() / 4);
    
    return this.scheduleNotification({
      user_id: userId,
      type: 'meal_reminder',
      title: `Log Your ${mealType} 🍽️`,
      body: `Don't forget to track your ${mealType.toLowerCase()}.`,
      scheduled_for: scheduledFor.toISOString(),
      deep_link: '/foods',
      throttle_key: `meal_reminder:${userId}:${mealType}:${day}:${bucket}`,
    });
  }

  /**
   * Send streak protection warning
   */
  async sendStreakProtection(
    userId: string,
    currentStreak: number
  ): Promise<{ success: boolean; notification_id?: string }> {
    return this.scheduleNotification({
      user_id: userId,
      type: 'streak_protection',
      title: 'Streak at Risk! 🔥',
      body: `You're at ${currentStreak} days! Log an activity now to protect your streak.`,
      scheduled_for: new Date(Date.now() + 60000).toISOString(), // 1 minute
      deep_link: '/workouts',
      throttle_key: 'streak_protection:today',
    });
  }

  /**
   * Send achievement notification
   */
  async sendAchievement(
    userId: string,
    achievementTitle: string,
    achievementDescription: string
  ): Promise<{ success: boolean; notification_id?: string }> {
    return this.scheduleNotification({
      user_id: userId,
      type: 'achievement',
      title: `Achievement Unlocked! 🏆`,
      body: `${achievementTitle}: ${achievementDescription}`,
      scheduled_for: new Date(Date.now() + 60000).toISOString(),
      deep_link: '/achievements',
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

// Export hook for React components
export function useNotificationService() {
  return notificationService;
}
