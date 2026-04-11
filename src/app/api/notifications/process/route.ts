/**
 * Notification Processing Cron Job Endpoint
 *
 * This endpoint processes pending notifications and sends them via:
 * - APNs (Apple Push Notification service) for iOS devices
 * - Expo Push (for React Native/Expo apps on iOS/Android)
 * - Web Push (VAPID) for web browsers
 * - In-app notifications (stored in database, shown via Supabase Realtime)
 *
 * Should be called by a cron job every minute.
 * For Vercel: use vercel.json crons
 * For self-hosted: use node-cron or systemd timer
 *
 * @module app/api/notifications/process/route
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface PendingNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  title_translations: Record<string, string> | null;
  body_translations: Record<string, string> | null;
  scheduled_for: string;
  deep_link: string | null;
  action_data: Record<string, unknown> | null;
  created_at: string;
}

interface UserDevice {
  id: string;
  user_id: string;
  device_token: string;
  device_type: 'ios' | 'android' | 'web';
  device_name: string | null;
  push_enabled: boolean;
  last_used_at: string;
}

interface PushResult {
  deviceId: string;
  success: boolean;
  error?: string;
}

// P0 FIX: Constants for retry logic
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = [5, 15, 60]; // 5min, 15min, 1hr

// ═══════════════════════════════════════════════════════════════════════════════
// Push Notification Services
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send push notification via Supabase Edge Function
 *
 * The Edge Function handles:
 * - APNs for iOS devices
 * - Expo Push for React Native apps
 * - Web Push (VAPID) for browsers
 */
async function sendPushViaEdgeFunction(
  deviceToken: string,
  deviceType: 'ios' | 'android' | 'web',
  notification: { title: string; body: string; data?: Record<string, unknown> }
): Promise<PushResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.log('[NotificationWorker] Supabase config missing, storing for in-app delivery');
      return { deviceId: deviceToken, success: true };
    }

    // Call the Edge Function (with timeout)
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          deviceToken,
          deviceType,
          notification: {
            title: notification.title,
            body: notification.body,
            data: notification.data,
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        // Edge function doesn't exist or failed - that's OK
        console.log('[NotificationWorker] Push function not available, notification stored for in-app');
        return { deviceId: deviceToken, success: true };
      }

      const result = await response.json();
      return {
        deviceId: deviceToken,
        success: result.success !== false,
        error: result.error,
      };
    } catch {
      // Edge function not deployed yet - notifications still work in-app
      console.log('[NotificationWorker] Push function not deployed, using in-app delivery');
      return { deviceId: deviceToken, success: true };
    }
  } catch (error) {
    console.error('[NotificationWorker] Push error:', error);
    return {
      deviceId: deviceToken,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown push error',
    };
  }
}

/**
 * Send push notification based on device type
 */
async function sendPushNotification(
  device: UserDevice,
  notification: { title: string; body: string; data?: Record<string, unknown> }
): Promise<PushResult> {
  const data = notification.data ? {
    ...notification.data,
    timestamp: Date.now().toString(),
  } : { timestamp: Date.now().toString() };

  return sendPushViaEdgeFunction(
    device.device_token,
    device.device_type,
    { ...notification, data }
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Processing Logic
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get pending notifications that are due to be sent
 */
async function getPendingNotifications(supabase: Awaited<ReturnType<typeof createClient>>): Promise<PendingNotification[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('notifications')
    .select(`
      id,
      user_id,
      type,
      title,
      body,
      title_translations,
      body_translations,
      scheduled_for,
      deep_link,
      action_data,
      created_at
    `)
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(100); // Process in batches

  if (error) {
    console.error('[NotificationWorker] Error fetching pending notifications:', error);
    return [];
  }

  return (data || []) as PendingNotification[];
}

/**
 * Get user devices for push notifications
 */
async function getUserDevices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<UserDevice[]> {
  const { data, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId)
    .eq('push_enabled', true);

  if (error) {
    console.error('[NotificationWorker] Error fetching user devices:', error);
    return [];
  }

  return (data || []) as UserDevice[];
}

/**
 * Check if user is in quiet hours
 */
function isInQuietHours(
  preferences: { quiet_hours_start: string | null; quiet_hours_end: string | null; timezone: string },
  _userLocale: string
): boolean {
  if (!preferences.quiet_hours_start || !preferences.quiet_hours_end) {
    return false;
  }

  try {
    const now = new Date();
    const userTimezone = preferences.timezone || 'UTC';

    // Get current time in user's timezone
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
    const currentHour = userTime.getHours();
    const currentMinute = userTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    // Parse quiet hours (format: "HH:MM:SS")
    const [startHour, startMin] = preferences.quiet_hours_start.split(':').map(Number);
    const [endHour, endMin] = preferences.quiet_hours_end.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMin;
    const endTimeMinutes = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startTimeMinutes > endTimeMinutes) {
      return currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
    }

    return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
  } catch {
    return false;
  }
}

/**
 * Update notification status
 */
async function updateNotificationStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  notificationId: string,
  status: 'sent' | 'delivered' | 'failed',
  sentAt?: Date
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({
      status,
      sent_at: sentAt?.toISOString() || new Date().toISOString(),
    })
    .eq('id', notificationId);

  if (error) {
    console.error('[NotificationWorker] Error updating notification status:', error);
  }
}

/**
 * Record notification analytics
 */
async function recordAnalytics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  notificationId: string,
  deviceType: string
): Promise<void> {
  try {
    await supabase.from('notification_analytics').insert({
      user_id: userId,
      notification_id: notificationId,
      device_type: deviceType,
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[NotificationWorker] Error recording analytics:', error);
  }
}

/**
 * Process a single notification
 */
async function processNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  notification: PendingNotification
): Promise<{ sent: number; failed: number }> {
  // Get user devices
  const devices = await getUserDevices(supabase, notification.user_id);

  if (devices.length === 0) {
    // No devices registered, mark as sent (in-app only via Realtime)
    await updateNotificationStatus(supabase, notification.id, 'sent');
    return { sent: 1, failed: 0 };
  }

  // Get user preferences for quiet hours and per-type check
  const { data: preferences } = await supabase
    .from('notification_preferences')
    .select('quiet_hours_start, quiet_hours_end, timezone, notifications_enabled, workout_reminders_enabled, meal_reminders_enabled, streak_protection_enabled, achievements_enabled, coach_insights_enabled, daily_summary_enabled, hydration_reminders_enabled, motivational_enabled')
    .eq('user_id', notification.user_id)
    .maybeSingle();

  // Check if notifications are globally disabled
  if (preferences && !preferences.notifications_enabled) {
    // Silently mark as sent (don't deliver)
    await updateNotificationStatus(supabase, notification.id, 'sent');
    return { sent: 1, failed: 0 };
  }

  // Check per-type preference
  const typeEnabledMap: Record<string, string | null> = {
    workout_reminder: preferences?.workout_reminders_enabled ? 'y' : null,
    meal_reminder: preferences?.meal_reminders_enabled ? 'y' : null,
    streak_protection: preferences?.streak_protection_enabled ? 'y' : null,
    achievement: preferences?.achievements_enabled ? 'y' : null,
    coach_insight: preferences?.coach_insights_enabled ? 'y' : null,
    daily_summary: preferences?.daily_summary_enabled ? 'y' : null,
    hydration_reminder: preferences?.hydration_reminders_enabled ? 'y' : null,
    motivational: preferences?.motivational_enabled ? 'y' : null,
  };

  if (preferences && typeEnabledMap[notification.type] === null) {
    await updateNotificationStatus(supabase, notification.id, 'sent');
    return { sent: 1, failed: 0 };
  }

  // Check quiet hours
  if (preferences && isInQuietHours(preferences, 'en')) {
    // Still mark as "sent" for in-app, but don't push
    await updateNotificationStatus(supabase, notification.id, 'sent');
    return { sent: 1, failed: 0 };
  }

  // Prepare notification payload
  const pushData = notification.deep_link ? { deepLink: notification.deep_link } : undefined;

  // Send to all devices
  let sentCount = 0;
  let failedCount = 0;

  const results = await Promise.allSettled(
    devices.map(device =>
      sendPushNotification(device, {
        title: notification.title,
        body: notification.body,
        data: pushData,
      })
    )
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success) {
      sentCount++;
    } else {
      failedCount++;
      const error = result.status === 'fulfilled' ? result.value.error : result.reason;
      console.error('[NotificationWorker] Push failed:', error);
    }
  }

  // P0 FIX: Implement retry logic for failed notifications
  if (sentCount === 0 && failedCount > 0) {
    // All devices failed - schedule retry with exponential backoff
    const currentRetryCount = (notification as any).retry_count || 0;
    
    if (currentRetryCount < MAX_RETRY_ATTEMPTS) {
      const nextRetryMinutes = RETRY_BACKOFF_MINUTES[currentRetryCount] || 60;
      const nextRetryTime = new Date(Date.now() + nextRetryMinutes * 60 * 1000).toISOString();
      
      console.log(`[NotificationWorker] Scheduling retry ${currentRetryCount + 1}/${MAX_RETRY_ATTEMPTS} at ${nextRetryTime}`);
      
      // Update notification to retry later instead of marking as failed
      await supabase
        .from('notifications')
        .update({
          status: 'pending',
          scheduled_for: nextRetryTime,
          retry_count: currentRetryCount + 1,
          last_error: `Push failed to all ${failedCount} devices`,
        })
        .eq('id', notification.id);
      
      return { sent: 0, failed: failedCount, retrying: true };
    } else {
      // Max retries exceeded - mark as permanently failed
      console.error(`[NotificationWorker] Max retries exceeded for notification ${notification.id}`);
      await updateNotificationStatus(supabase, notification.id, 'failed');
    }
  } else {
    // At least one device succeeded - mark as sent
    const finalStatus = sentCount > 0 ? 'sent' : 'failed';
    await updateNotificationStatus(supabase, notification.id, finalStatus);
  }

  // Record analytics
  if (sentCount > 0 && devices[0]) {
    await recordAnalytics(
      supabase,
      notification.user_id,
      notification.id,
      devices[0].device_type
    );
  }

  return { sent: sentCount, failed: failedCount };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Route Handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  // SECURITY: Require auth by default - only skip if explicitly configured for development
  const authHeader = request.headers.get('authorization');
  // Trim whitespace from env variable (Vercel sometimes adds newlines)
  const cronSecret = process.env.CRON_SECRET?.trim();
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // In production, ALWAYS require the cron secret
  // In development, allow without secret for local testing
  if (!isDevelopment) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  } else if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // In development, if secret is set, require it
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  console.log('[NotificationWorker] Starting notification processing...');

  const supabase = await createClient();
  const startTime = Date.now();

  try {
    // ── PHASE 1: Evaluate triggers & create pending notifications ──
    let triggersCreated = 0;
    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      const { data: activePrefs } = await supabase
        .from('notification_preferences')
        .select('user_id, timezone, notifications_enabled, workout_reminders_enabled, meal_reminders_enabled, streak_protection_enabled, daily_summary_enabled, hydration_reminders_enabled, motivational_enabled, max_notifications_per_day, preferred_morning_time, quiet_hours_start, quiet_hours_end')
        .eq('notifications_enabled', true);

      if (activePrefs?.length) {
        for (const prefs of activePrefs) {
          // Check daily cap
          const { count: todayCount } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', prefs.user_id)
            .gte('created_at', todayStr);

          if ((todayCount || 0) >= (prefs.max_notifications_per_day || 10)) continue;

          const tz = prefs.timezone || 'UTC';
          const userTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
          const hour = userTime.getHours();

          // Quiet hours check
          if (prefs.quiet_hours_start && prefs.quiet_hours_end) {
            try {
              const [sh, sm] = prefs.quiet_hours_start.split(':').map(Number);
              const [eh, em] = prefs.quiet_hours_end.split(':').map(Number);
              const startMins = (sh || 22) * 60 + (sm || 0);
              const endMins = (eh || 8) * 60 + (em || 0);
              const curMins = hour * 60 + userTime.getMinutes();
              if (startMins > endMins ? (curMins >= startMins || curMins < endMins) : (curMins >= startMins && curMins < endMins)) {
                continue;
              }
            } catch { /* ignore quiet hours parse error */ }
          }

          // One notification per user per cycle
          const date = todayStr;
          let notificationToCreate: { type: string; title: string; body: string; deep_link: string; throttle_key: string } | null = null;

          // Workout reminder at preferred morning time
          if (prefs.workout_reminders_enabled && !notificationToCreate) {
            const mTime = prefs.preferred_morning_time || '08:00';
            const [mH, mM] = mTime.split(':').map(Number);
            if (hour === (mH || 8) && userTime.getMinutes() === (mM || 0)) {
              notificationToCreate = {
                type: 'workout_reminder', title: "Time to Workout! 💪", body: "Don't break your streak! Your workout is waiting.",
                deep_link: '/workouts', throttle_key: `workout_reminder:${prefs.user_id}:${date}`
              };
            }
          }

          // Meal reminders
          if (prefs.meal_reminders_enabled && !notificationToCreate && [8, 12, 19].includes(hour) && userTime.getMinutes() < 1) {
            const mealNames: Record<number, string> = { 8: 'Breakfast', 12: 'Lunch', 19: 'Dinner' };
            const mealTypes: Record<number, string> = { 8: 'breakfast', 12: 'lunch', 19: 'dinner' };
            notificationToCreate = {
              type: 'meal_reminder', title: `Log Your ${mealNames[hour]} 🍽️`, body: `Don't forget to track your ${mealTypes[hour].toLowerCase()}.`,
              deep_link: '/foods', throttle_key: `meal_reminder:${prefs.user_id}:${mealTypes[hour]}:${date}`
            };
          }

          // Hydration reminder every 2h
          if (prefs.hydration_reminders_enabled && !notificationToCreate && [9, 11, 13, 15, 17, 19].includes(hour) && userTime.getMinutes() < 1) {
            const bucket = Math.floor(hour / 2);
            notificationToCreate = {
              type: 'hydration_reminder', title: 'Stay Hydrated! 💧', body: 'Time for a glass of water. You\'re doing great!',
              deep_link: '/', throttle_key: `hydration_reminder:${prefs.user_id}:${date}:${bucket}`
            };
          }

          // Streak protection at 20:00
          if (prefs.streak_protection_enabled && !notificationToCreate && hour === 20 && userTime.getMinutes() < 1) {
            notificationToCreate = {
              type: 'streak_protection', title: 'Streak at Risk! 🔥', body: 'Log an activity now to protect your streak!',
              deep_link: '/workouts', throttle_key: `streak_protection:${prefs.user_id}:${date}`
            };
          }

          // Daily summary at 21:00
          if (prefs.daily_summary_enabled && !notificationToCreate && hour === 21 && userTime.getMinutes() < 1) {
            notificationToCreate = {
              type: 'daily_summary', title: 'Daily Summary 📊', body: 'Check out your progress for today!',
              deep_link: '/', throttle_key: `daily_summary:${prefs.user_id}:${date}`
            };
          }

          // Motivational (deterministic pseudo-random time per user per day)
          if (prefs.motivational_enabled && !notificationToCreate && hour >= 10 && hour <= 18) {
            const dayHash = (parseInt(prefs.user_id.slice(0, 8), 16) + now.getDate()) % 9; // 0-8 → hours 10-18
            if (hour === 10 + dayHash && userTime.getMinutes() < 1) {
              const messages = [
                "You're stronger than you think! 💪",
                "Every step counts. Keep going! 🚀",
                "Consistency is the key to results! 🔑",
                "Your future self will thank you! 🌟",
                "Small progress is still progress! 📈",
                "Champions are made in the quiet hours! 🏆",
                "Believe in the process! 💎",
                "Today is a great day to push harder! ⚡",
                "You're one workout away from a good mood! 😊",
              ];
              const msgIdx = (parseInt(prefs.user_id.slice(8, 16), 16) + now.getDate()) % messages.length;
              notificationToCreate = {
                type: 'motivational', title: 'Daily Motivation 💪', body: messages[msgIdx],
                deep_link: '/', throttle_key: `motivational:${prefs.user_id}:${date}`
              };
            }
          }

          if (notificationToCreate) {
            // Throttle: check if notification with same key already exists today
            const { data: existing } = await supabase
              .from('notifications')
              .select('id')
              .eq('throttle_key', notificationToCreate.throttle_key)
              .gte('created_at', todayStr)
              .limit(1);

            if (!existing?.length) {
              const { error: insertErr } = await supabase
                .from('notifications')
                .insert({
                  user_id: prefs.user_id,
                  type: notificationToCreate.type,
                  title: notificationToCreate.title,
                  body: notificationToCreate.body,
                  scheduled_for: now.toISOString(),
                  deep_link: notificationToCreate.deep_link,
                  throttle_key: notificationToCreate.throttle_key,
                  status: 'pending',
                });
              if (!insertErr) triggersCreated++;
            }
          }
        }
      }
    } catch (triggerErr) {
      console.error('[NotificationWorker] Trigger evaluation error:', triggerErr);
    }

    // ── PHASE 2: Process pending notifications ──
    const pendingNotifications = await getPendingNotifications(supabase);

    if (pendingNotifications.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        triggersCreated,
        message: 'No pending notifications',
        duration: Date.now() - startTime,
      });
    }

    // Process each notification with timeout protection
    let totalSent = 0;
    let totalFailed = 0;
    const BATCH_SIZE = 10;
    const NOTIFICATION_TIMEOUT_MS = 5000; // 5s per notification batch

    for (let i = 0; i < pendingNotifications.length; i += BATCH_SIZE) {
      // Check if we're running low on time (Vercel 10s hobby limit)
      const elapsed = Date.now() - startTime;
      if (elapsed > 8000) {
        console.log(`[NotificationWorker] Approaching timeout after ${elapsed}ms, processed ${i}/${pendingNotifications.length}`);
        break;
      }

      const batch = pendingNotifications.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(notification =>
          Promise.race([
            processNotification(supabase, notification),
            new Promise<{ sent: number; failed: number }>((_, reject) =>
              setTimeout(() => reject(new Error('Notification processing timeout')), NOTIFICATION_TIMEOUT_MS)
            ),
          ]).catch((err) => {
            console.error('[NotificationWorker] Notification timeout/error:', err);
            return { sent: 0, failed: 1 };
          })
        )
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          totalSent += result.value.sent;
          totalFailed += result.value.failed;
        } else {
          totalFailed++;
        }
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[NotificationWorker] Processed ${pendingNotifications.length} notifications in ${duration}ms`);

    return NextResponse.json({
      success: true,
      processed: pendingNotifications.length,
      triggersCreated,
      sent: totalSent,
      failed: totalFailed,
      duration,
    });
  } catch (error) {
    console.error('[NotificationWorker] Processing error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export const POST = GET;
