/**
 * Notification Database Service
 * 
 * Handles all database operations for the notification system
 * 
 * @module lib/notifications/notification-service
 */

import { createClient } from '@/lib/supabase/server';
import type {
  Notification,
  NotificationPreferences,
  UserBehaviorProfile,
  UserDevice,
  NotificationType,
  NotificationStatus,
  GeneratedNotification,
  NotificationPreferencesUpdate,
  Locale,
} from './notification-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Service
// ═══════════════════════════════════════════════════════════════════════════════

export class NotificationService {
  // ────────────────────────────────────────────────────────────────────────────
  // Notifications CRUD
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new notification
   */
  static async createNotification(
    userId: string,
    notification: GeneratedNotification
  ): Promise<Notification> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        title_translations: notification.titleTranslations,
        body_translations: notification.bodyTranslations,
        generated_by_ai: notification.generatedByAI,
        scheduled_for: notification.scheduledFor.toISOString(),
        deep_link: notification.deepLink,
        action_data: notification.actionData,
        throttle_key: notification.throttleKey,
        prediction_score: notification.predictionScore,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[NotificationService] Error creating notification:', error);
      throw error;
    }

    return data as Notification;
  }

  /**
   * Get notifications for a user
   */
  static async getNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: NotificationStatus;
      unreadOnly?: boolean;
    } = {}
  ): Promise<{ notifications: Notification[]; hasMore: boolean; unreadCount: number }> {
    const supabase = await createClient();
    const { limit = 20, offset = 0, status, unreadOnly } = options;

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit);

    if (status) {
      query = query.eq('status', status);
    }

    if (unreadOnly) {
      query = query.eq('status', 'pending').or('status.eq.sent,status.eq.delivered');
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[NotificationService] Error fetching notifications:', error);
      throw error;
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['pending', 'sent', 'delivered']);

    return {
      notifications: (data || []) as Notification[],
      hasMore: (count || 0) > offset + limit,
      unreadCount: unreadCount || 0,
    };
  }

  /**
   * Mark notification as opened
   */
  static async markAsOpened(notificationId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'opened',
        opened_at: new Date().toISOString(),
      })
      .eq('id', notificationId);

    if (error) {
      console.error('[NotificationService] Error marking notification as opened:', error);
      throw error;
    }

    // Record analytics
    await this.recordAnalytics(notificationId, 'opened');
  }

  /**
   * Mark notification as actioned (user took action from notification)
   */
  static async markAsActioned(notificationId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'actioned',
        actioned_at: new Date().toISOString(),
      })
      .eq('id', notificationId);

    if (error) {
      console.error('[NotificationService] Error marking notification as actioned:', error);
      throw error;
    }

    // Record analytics
    await this.recordAnalytics(notificationId, 'actioned');
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'opened',
        opened_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .in('status', ['pending', 'sent', 'delivered']);

    if (error) {
      console.error('[NotificationService] Error marking all as read:', error);
      throw error;
    }
  }

  /**
   * Check if a similar notification was recently sent (throttle check)
   */
  static async wasRecentlySent(throttleKey: string): Promise<boolean> {
    const supabase = await createClient();

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('throttle_key', throttleKey)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

    return (count || 0) > 0;
  }

  /**
   * Get count of notifications sent today
   */
  static async getTodayNotificationCount(userId: string): Promise<number> {
    const supabase = await createClient();
    const today = new Date().toISOString().split('T')[0];

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lte('created_at', `${today}T23:59:59.999Z`);

    return count || 0;
  }

  /**
   * Get recent notification types (for deduplication)
   */
  static async getRecentNotificationTypes(userId: string, hours: number = 6): Promise<NotificationType[]> {
    const supabase = await createClient();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('notifications')
      .select('type')
      .eq('user_id', userId)
      .gte('created_at', since);

    return (data || []).map(n => n.type as NotificationType);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Notification Preferences
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Get notification preferences for a user
   */
  static async getPreferences(userId: string): Promise<NotificationPreferences> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[NotificationService] Error fetching preferences:', error);
      throw error;
    }

    // Return defaults if no preferences exist
    if (!data) {
      return {
        id: '',
        user_id: userId,
        notifications_enabled: true,
        quiet_hours_start: '22:00',
        quiet_hours_end: '08:00',
        timezone: 'UTC',
        workout_reminders_enabled: true,
        meal_reminders_enabled: true,
        streak_protection_enabled: true,
        achievements_enabled: true,
        coach_insights_enabled: true,
        daily_summary_enabled: true,
        hydration_reminders_enabled: true,
        motivational_enabled: true,
        max_notifications_per_day: 3,
        min_time_between_notifications_minutes: 60,
        preferred_morning_time: null,
        preferred_afternoon_time: null,
        preferred_evening_time: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    return data as NotificationPreferences;
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(
    userId: string,
    updates: NotificationPreferencesUpdate
  ): Promise<NotificationPreferences> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[NotificationService] Error updating preferences:', error);
      throw error;
    }

    return data as NotificationPreferences;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // User Behavior Profile
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Get user behavior profile
   */
  static async getBehaviorProfile(userId: string): Promise<UserBehaviorProfile | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('user_behavior_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[NotificationService] Error fetching behavior profile:', error);
      return null;
    }

    return data as UserBehaviorProfile | null;
  }

  /**
   * Update user behavior profile after activity
   */
  static async recordActivity(
    userId: string,
    activityType: 'workout' | 'meal' | 'app_open'
  ): Promise<void> {
    const supabase = await createClient();
    const hour = new Date().getHours();

    // Get current profile
    const { data: profile } = await supabase
      .from('user_behavior_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const distributionField = 
      activityType === 'workout' ? 'workout_hour_distribution' :
      activityType === 'meal' ? 'meal_hour_distribution' : 'app_open_hour_distribution';

    const currentDist = (profile?.[distributionField] as Record<string, number>) || {};
    currentDist[hour] = (currentDist[hour] || 0) + 1;

    // Update or insert
    const { error } = await supabase
      .from('user_behavior_profile')
      .upsert({
        user_id: userId,
        [distributionField]: currentDist,
        last_activity_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[NotificationService] Error recording activity:', error);
    }
  }

  /**
   * Update engagement metrics after notification interaction
   */
  static async updateEngagementMetrics(
    userId: string,
    opened: boolean,
    responseTimeSeconds?: number
  ): Promise<void> {
    const supabase = await createClient();

    // Get current profile
    const { data: profile } = await supabase
      .from('user_behavior_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile) return;

    // Update open rate (moving average)
    const currentRate = profile.notification_open_rate || 0.5;
    const newRate = currentRate * 0.9 + (opened ? 0.1 : 0);

    // Update engagement score
    const currentScore = profile.engagement_score || 50;
    const newScore = opened
      ? Math.min(100, currentScore + 2)
      : Math.max(0, currentScore - 1);

    // Update average response time
    let newAvgResponseTime = profile.avg_response_time_seconds;
    if (opened && responseTimeSeconds) {
      newAvgResponseTime = profile.avg_response_time_seconds
        ? Math.round((profile.avg_response_time_seconds + responseTimeSeconds) / 2)
        : responseTimeSeconds;
    }

    const { error } = await supabase
      .from('user_behavior_profile')
      .update({
        notification_open_rate: newRate,
        engagement_score: newScore,
        avg_response_time_seconds: newAvgResponseTime,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('[NotificationService] Error updating engagement metrics:', error);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // User Devices
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Register a device for push notifications
   */
  static async registerDevice(
    userId: string,
    device: {
      token: string;
      type: 'ios' | 'android' | 'web';
      name?: string;
      deviceId?: string;
    }
  ): Promise<UserDevice> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('user_devices')
      .upsert({
        user_id: userId,
        device_token: device.token,
        device_type: device.type,
        device_name: device.name || null,
        device_id: device.deviceId || null,
        last_used_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[NotificationService] Error registering device:', error);
      throw error;
    }

    return data as UserDevice;
  }

  /**
   * Get all devices for a user
   */
  static async getUserDevices(userId: string): Promise<UserDevice[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('user_devices')
      .select('*')
      .eq('user_id', userId)
      .eq('push_enabled', true);

    if (error) {
      console.error('[NotificationService] Error fetching devices:', error);
      return [];
    }

    return (data || []) as UserDevice[];
  }

  /**
   * Unregister a device
   */
  static async unregisterDevice(userId: string, deviceToken: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('user_devices')
      .delete()
      .eq('user_id', userId)
      .eq('device_token', deviceToken);

    if (error) {
      console.error('[NotificationService] Error unregistering device:', error);
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Analytics
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Record notification analytics
   */
  private static async recordAnalytics(
    notificationId: string,
    action: 'opened' | 'actioned'
  ): Promise<void> {
    const supabase = await createClient();

    // Get notification to find user
    const { data: notification } = await supabase
      .from('notifications')
      .select('user_id, sent_at')
      .eq('id', notificationId)
      .single();

    if (!notification) return;

    const now = new Date();
    const sentAt = notification.sent_at ? new Date(notification.sent_at) : now;
    const timeToOpen = action === 'opened'
      ? Math.round((now.getTime() - sentAt.getTime()) / 1000)
      : null;

    // Insert analytics record
    await supabase
      .from('notification_analytics')
      .insert({
        notification_id: notificationId,
        user_id: notification.user_id,
        [action === 'opened' ? 'opened_at' : 'actioned_at']: now.toISOString(),
        time_to_open_seconds: timeToOpen,
      });

    // Update engagement metrics
    await this.updateEngagementMetrics(
      notification.user_id,
      true,
      timeToOpen || undefined
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════════

export default NotificationService;
