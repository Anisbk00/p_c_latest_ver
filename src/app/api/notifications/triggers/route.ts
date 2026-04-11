/**
 * Notification Trigger Service — Cron Endpoint
 *
 * Called every minute by Vercel cron (or manual POST).
 * Evaluates time-based trigger rules for every user with notifications
 * enabled and inserts pending notifications into the `notifications` table
 * that the `/api/notifications/process` worker will then send.
 *
 * Trigger rules implemented:
 *   1. Morning Workout Reminder
 *   2. Meal Reminder  (breakfast / lunch / dinner)
 *   3. Hydration Reminder  (every 2 h between 09:00–20:00)
 *   4. Streak Protection  (20:00)
 *   5. Daily Summary  (21:00)
 *   6. Motivational  (random once per day 10:00–18:00)
 *
 * @module app/api/notifications/triggers/route
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

type NotificationType =
  | 'workout_reminder'
  | 'meal_reminder'
  | 'hydration_reminder'
  | 'streak_protection'
  | 'daily_summary'
  | 'motivational';

interface UserPrefs {
  user_id: string;
  notifications_enabled: boolean;
  workout_reminders_enabled: boolean;
  meal_reminders_enabled: boolean;
  hydration_reminders_enabled: boolean;
  streak_protection_enabled: boolean;
  daily_summary_enabled: boolean;
  motivational_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  max_notifications_per_day: number;
  min_time_between_notifications_minutes: number;
  preferred_morning_time: string | null;
  preferred_afternoon_time: string | null;
  preferred_evening_time: string | null;
}

interface BehaviorProfile {
  user_id: string;
  current_streak: number;
  last_activity_date: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Templates
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATES: Record<NotificationType, { title: string; body: string; deepLink: string }> = {
  workout_reminder: {
    title: 'Time to Workout! 💪',
    body: "Don't break your streak! Your workout is waiting.",
    deepLink: '/workouts',
  },
  meal_reminder: {
    title: 'Log Your Meal 🍽️',
    body: "Don't forget to track your nutrition.",
    deepLink: '/foods',
  },
  hydration_reminder: {
    title: 'Stay Hydrated! 💧',
    body: "Don't forget to drink water! You're doing great.",
    deepLink: '/',
  },
  streak_protection: {
    title: 'Streak at Risk! 🔥',
    body: "You're about to lose your streak! Log an activity now.",
    deepLink: '/workouts',
  },
  daily_summary: {
    title: 'Daily Summary 📈',
    body: 'Check out your progress today!',
    deepLink: '/',
  },
  motivational: {
    title: "You've Got This! ⭐",
    body: 'Keep pushing towards your goals! Every step counts.',
    deepLink: '/',
  },
};

// Motivational message pool — rotated for variety
const MOTIVATIONAL_MESSAGES = [
  { title: "You've Got This! ⭐", body: 'Keep pushing towards your goals! Every step counts.' },
  { title: 'Stay Strong! 💪', body: 'Your consistency is your superpower. Keep going!' },
  { title: 'Champion Mindset 🏆', body: "Champions aren't made in a day. Keep showing up." },
  { title: 'Progress, Not Perfection 🚀', body: "Every rep, every meal, every day — you're building something great." },
  { title: 'Rise and Grind ⚡', body: 'The only bad workout is the one that didn\'t happen.' },
  { title: 'No Excuses 🔥', body: "Your future self will thank you for the effort you put in today." },
  { title: 'Keep Moving Forward 🏃', body: 'Small daily improvements lead to stunning results.' },
  { title: 'Iron Mindset 🧠', body: 'Mental toughness is a muscle. Train it every day.' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current time components in the user's timezone.
 */
function getUserTimeParts(timezone: string): { hour: number; minute: number; dateStr: string } {
  const now = new Date();
  const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone || 'UTC' }));
  const hour = userTime.getHours();
  const minute = userTime.getMinutes();
  // Use the user's local date string for throttle keys
  const dateStr = `${userTime.getFullYear()}-${String(userTime.getMonth() + 1).padStart(2, '0')}-${String(userTime.getDate()).padStart(2, '0')}`;
  return { hour, minute, dateStr };
}

/**
 * Check whether the user is currently in quiet hours.
 * Reuses the same logic as process/route.ts for consistency.
 */
function isInQuietHours(prefs: UserPrefs, timezone: string): boolean {
  if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) {
    return false;
  }

  try {
    const { hour, minute } = getUserTimeParts(timezone);
    const currentMinutes = hour * 60 + minute;

    const [sH, sM] = prefs.quiet_hours_start.split(':').map(Number);
    const [eH, eM] = prefs.quiet_hours_end.split(':').map(Number);
    const startMinutes = sH * 60 + (sM || 0);
    const endMinutes = eH * 60 + (eM || 0);

    // Handle overnight (e.g. 22:00 – 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false;
  }
}

/**
 * Count notifications created today for a user.
 */
async function getTodayNotificationCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  dateStr: string
): Promise<number> {
  // dateStr is the user's local date — we need to query from the start of their day.
  // We approximate by using a 24h lookback window from now, which is safe enough
  // for daily cap enforcement.
  const startOfDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay);

  return count || 0;
}

/**
 * Check min-interval — ensure we don't send notifications too close together.
 */
async function isWithinMinInterval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  minMinutes: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - minMinutes * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .limit(1);

  return !!data && data.length > 0;
}

/**
 * Check if a notification with the given throttle key already exists
 * (within the last 25 hours to cover timezone edge cases).
 */
async function throttleKeyExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  throttleKey: string
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('throttle_key', throttleKey)
    .gte('created_at', cutoff)
    .limit(1);

  return !!data && data.length > 0;
}

/**
 * Insert a pending notification and return whether it was created.
 */
async function insertNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  throttleKey: string,
  deepLink: string
): Promise<boolean> {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    title_translations: {},
    body_translations: {},
    scheduled_for: new Date().toISOString(),
    status: 'pending',
    throttle_key: throttleKey,
    deep_link: deepLink,
    action_data: { triggered_by: 'cron', trigger_type: type },
    generated_by_ai: false,
  });

  if (error) {
    // Unique constraint on throttle_key — means it was a race condition duplicate.
    if (error.code === '23505') {
      return false;
    }
    console.error(`[NotificationTriggers] Insert error for ${userId}/${type}:`, error);
    return false;
  }

  return true;
}

/**
 * Check if the user has a workout today in the `workouts` table.
 * Returns `true` when a workout exists, `false` when none found,
 * and `null` when the table doesn't exist or query fails (in which
 * case we conservatively skip the condition — always send).
 */
async function userHasWorkoutToday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  userDateStr: string
): Promise<boolean | null> {
  try {
    const startOfDay = `${userDateStr}T00:00:00`;
    const endOfDay = `${userDateStr}T23:59:59`;

    const { data, error } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .gte('started_at', startOfDay)
      .lte('started_at', endOfDay)
      .limit(1);

    if (error) {
      // Table might not exist or column mismatch — return null (skip check)
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.warn('[NotificationTriggers] workouts table not found, skipping workout check');
        return null;
      }
      console.warn('[NotificationTriggers] Error querying workouts:', error.message);
      return null;
    }

    return !!data && data.length > 0;
  } catch (err) {
    console.warn('[NotificationTriggers] workouts query exception:', err);
    return null;
  }
}

/**
 * Check if the user has a food log in the last N hours for a given meal type.
 * Returns `true` when a log exists, `false` when none found,
 * `null` when the table doesn't exist (skip check).
 */
async function userHasRecentMealLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  mealType: string | null,
  hoursWindow: number
): Promise<boolean | null> {
  try {
    const cutoff = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('food_logs')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', cutoff)
      .limit(1);

    if (mealType) {
      query = query.eq('meal_type', mealType);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.warn('[NotificationTriggers] food_logs table not found, skipping meal check');
        return null;
      }
      console.warn('[NotificationTriggers] Error querying food_logs:', error.message);
      return null;
    }

    return !!data && data.length > 0;
  } catch (err) {
    console.warn('[NotificationTriggers] food_logs query exception:', err);
    return null;
  }
}

/**
 * Check if the user has any activity today (workout or food log).
 * Used for streak protection — if any activity exists, streak is safe.
 */
async function userHasAnyActivityToday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  userDateStr: string
): Promise<boolean> {
  const startOfDay = `${userDateStr}T00:00:00`;
  const endOfDay = `${userDateStr}T23:59:59`;

  // Check workouts
  try {
    const { data: workouts } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .gte('started_at', startOfDay)
      .lte('started_at', endOfDay)
      .limit(1);

    if (workouts && workouts.length > 0) return true;
  } catch {
    // Ignore
  }

  // Check food_logs
  try {
    const { data: logs } = await supabase
      .from('food_logs')
      .select('id')
      .eq('user_id', userId)
      .gte('logged_at', startOfDay)
      .lte('logged_at', endOfDay)
      .limit(1);

    if (logs && logs.length > 0) return true;
  } catch {
    // Ignore
  }

  return false;
}

/**
 * Get the user's behavior profile (streak data).
 */
async function getBehaviorProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<BehaviorProfile | null> {
  try {
    const { data, error } = await supabase
      .from('user_behavior_profile')
      .select('user_id, current_streak, last_activity_date')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      // Table might not exist
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return null;
      }
      console.warn('[NotificationTriggers] Error fetching behavior profile:', error.message);
      return null;
    }

    return data as BehaviorProfile | null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Trigger Evaluators
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 1. Morning Workout Reminder
 *    Time: user's preferred_morning_time (default 08:00)
 *    Condition: no workout logged today
 */
async function evaluateWorkoutReminder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefs: UserPrefs,
  hour: number,
  minute: number,
  dateStr: string
): Promise<boolean> {
  if (!prefs.workout_reminders_enabled) return false;

  const morningTime = prefs.preferred_morning_time || '08:00';
  const [tH, tM] = morningTime.split(':').map(Number);

  if (hour !== tH || minute !== tM) return false;

  const throttleKey = `workout_reminder:${prefs.user_id}:${dateStr}`;
  if (await throttleKeyExists(supabase, prefs.user_id, throttleKey)) return false;

  // Check if user already worked out today
  const hasWorkout = await userHasWorkoutToday(supabase, prefs.user_id, dateStr);
  if (hasWorkout === true) return false;
  // If null (table missing), proceed with notification

  const tmpl = TEMPLATES.workout_reminder;
  return insertNotification(
    supabase, prefs.user_id, 'workout_reminder',
    tmpl.title, tmpl.body, throttleKey, tmpl.deepLink
  );
}

/**
 * 2. Meal Reminder
 *    Times: 08:00 (breakfast), 12:30 (lunch), 19:00 (dinner)
 *    Condition: no meal logged in last 3 hours for that slot
 */
async function evaluateMealReminder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefs: UserPrefs,
  hour: number,
  minute: number,
  dateStr: string
): Promise<boolean> {
  if (!prefs.meal_reminders_enabled) return false;

  const mealSlots = [
    { hour: 8, minute: 0, mealType: 'breakfast', label: 'Breakfast' },
    { hour: 12, minute: 30, mealType: 'lunch', label: 'Lunch' },
    { hour: 19, minute: 0, mealType: 'dinner', label: 'Dinner' },
  ];

  for (const slot of mealSlots) {
    if (hour === slot.hour && minute === slot.minute) {
      const throttleKey = `meal_reminder:${prefs.user_id}:${slot.mealType}:${dateStr}`;
      if (await throttleKeyExists(supabase, prefs.user_id, throttleKey)) continue;

      // Check if user has a recent meal log for this slot (3-hour window)
      const hasRecentMeal = await userHasRecentMealLog(
        supabase, prefs.user_id, slot.mealType, 3
      );
      if (hasRecentMeal === true) continue;
      // If null (table missing), proceed

      return insertNotification(
        supabase, prefs.user_id, 'meal_reminder',
        `Time to log your ${slot.label}! 🍽️`,
        `Don't forget to track your ${slot.label.toLowerCase()}. Nutrition is half the battle!`,
        throttleKey,
        TEMPLATES.meal_reminder.deepLink
      );
    }
  }

  return false;
}

/**
 * 3. Hydration Reminder
 *    Times: every 2 hours between 09:00 and 20:00
 *    (09:00, 11:00, 13:00, 15:00, 17:00, 19:00)
 */
async function evaluateHydrationReminder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefs: UserPrefs,
  hour: number,
  minute: number,
  dateStr: string
): Promise<boolean> {
  if (!prefs.hydration_reminders_enabled) return false;

  // Only trigger at exact hour marks matching the 2-hour schedule
  const hydrationHours = [9, 11, 13, 15, 17, 19];
  if (!hydrationHours.includes(hour) || minute !== 0) return false;

  const hourBucket = Math.floor(hour / 2);
  const throttleKey = `hydration_reminder:${prefs.user_id}:${dateStr}:${hourBucket}`;
  if (await throttleKeyExists(supabase, prefs.user_id, throttleKey)) return false;

  const tmpl = TEMPLATES.hydration_reminder;
  return insertNotification(
    supabase, prefs.user_id, 'hydration_reminder',
    tmpl.title, tmpl.body, throttleKey, tmpl.deepLink
  );
}

/**
 * 4. Streak Protection
 *    Time: 20:00
 *    Condition: user has streak > 0 AND no activity logged today
 */
async function evaluateStreakProtection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefs: UserPrefs,
  hour: number,
  minute: number,
  dateStr: string
): Promise<boolean> {
  if (!prefs.streak_protection_enabled) return false;
  if (hour !== 20 || minute !== 0) return false;

  const throttleKey = `streak_protection:${prefs.user_id}:${dateStr}`;
  if (await throttleKeyExists(supabase, prefs.user_id, throttleKey)) return false;

  // Fetch behavior profile for streak data
  const profile = await getBehaviorProfile(supabase, prefs.user_id);
  if (!profile || profile.current_streak <= 0) return false;

  // Check if user has any activity today
  const hasActivity = await userHasAnyActivityToday(supabase, prefs.user_id, dateStr);
  if (hasActivity) return false;

  const tmpl = TEMPLATES.streak_protection;
  const streakMsg = profile.current_streak > 1
    ? `Your ${profile.current_streak}-day streak is at risk! Log an activity now to keep it alive.`
    : "You've just started building your streak! Don't let day one slip away.";

  return insertNotification(
    supabase, prefs.user_id, 'streak_protection',
    tmpl.title, streakMsg, throttleKey, tmpl.deepLink
  );
}

/**
 * 5. Daily Summary
 *    Time: 21:00
 */
async function evaluateDailySummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefs: UserPrefs,
  hour: number,
  minute: number,
  dateStr: string
): Promise<boolean> {
  if (!prefs.daily_summary_enabled) return false;
  if (hour !== 21 || minute !== 0) return false;

  const throttleKey = `daily_summary:${prefs.user_id}:${dateStr}`;
  if (await throttleKeyExists(supabase, prefs.user_id, throttleKey)) return false;

  const tmpl = TEMPLATES.daily_summary;
  return insertNotification(
    supabase, prefs.user_id, 'daily_summary',
    tmpl.title, tmpl.body, throttleKey, tmpl.deepLink
  );
}

/**
 * 6. Motivational Notification
 *    Time: random once per day between 10:00 and 18:00
 *
 * We use a deterministic "random" hour per user-day so that across
 * the 60 cron calls in that window, only the matching minute will fire.
 * The formula: `hash(user_id + date) % 480 + 600` → minute-of-day in [600, 1080)
 * which maps to [10:00, 18:00).
 */
function getMotivationalMinuteOfDay(userId: string, dateStr: string): number {
  // Simple deterministic hash
  let hash = 0;
  const input = `${userId}:${dateStr}`;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }

  // Map to 10:00–18:00 (600–1080 minutes of day)
  const range = 480; // 8 hours in minutes
  const base = 600;  // 10:00
  const offset = Math.abs(hash) % range;
  return base + offset;
}

async function evaluateMotivational(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefs: UserPrefs,
  hour: number,
  minute: number,
  dateStr: string
): Promise<boolean> {
  if (!prefs.motivational_enabled) return false;

  // Only evaluate during 10:00–18:00 window
  if (hour < 10 || hour >= 18) return false;

  const targetMinuteOfDay = getMotivationalMinuteOfDay(prefs.user_id, dateStr);
  const currentMinuteOfDay = hour * 60 + minute;

  if (currentMinuteOfDay !== targetMinuteOfDay) return false;

  const throttleKey = `motivational:${prefs.user_id}:${dateStr}`;
  if (await throttleKeyExists(supabase, prefs.user_id, throttleKey)) return false;

  // Pick a message deterministically so retries don't change it
  const msgIndex = Math.abs(
    prefs.user_id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  ) % MOTIVATIONAL_MESSAGES.length;
  const msg = MOTIVATIONAL_MESSAGES[msgIndex];

  return insertNotification(
    supabase, prefs.user_id, 'motivational',
    msg.title, msg.body, throttleKey, TEMPLATES.motivational.deepLink
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cron Auth
// ═══════════════════════════════════════════════════════════════════════════════

function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET?.trim();
  const isDevelopment = process.env.NODE_ENV === 'development';

  // In production, ALWAYS require the cron secret
  if (!isDevelopment) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return false;
    }
  } else if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // In development, if secret is set, require it
    return false;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════════════════════════

async function handleTrigger(request: Request): Promise<NextResponse> {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('[NotificationTriggers] Starting trigger evaluation...');

  const supabase = await createClient();

  try {
    // Fetch all users with notifications enabled
    const { data: allPrefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('notifications_enabled', true);

    if (prefsError) {
      console.error('[NotificationTriggers] Error fetching preferences:', prefsError);
      return NextResponse.json(
        { error: 'Failed to fetch notification preferences' },
        { status: 500 }
      );
    }

    if (!allPrefs || allPrefs.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        evaluated: 0,
        message: 'No users with notifications enabled',
        duration: Date.now() - startTime,
      });
    }

    let created = 0;
    let evaluated = 0;
    const MAX_DURATION_MS = 25_000; // Safety margin for Vercel 30s limit

    for (const prefs of allPrefs) {
      // Timeout protection
      if (Date.now() - startTime > MAX_DURATION_MS) {
        console.log(`[NotificationTriggers] Timeout after ${Date.now() - startTime}ms, processed ${evaluated}/${allPrefs.length} users`);
        break;
      }

      const tz = (prefs as UserPrefs).timezone || 'UTC';
      const { hour, minute, dateStr } = getUserTimeParts(tz);

      evaluated++;

      // Skip if in quiet hours
      if (isInQuietHours(prefs as UserPrefs, tz)) {
        continue;
      }

      // Check daily cap
      const todayCount = await getTodayNotificationCount(supabase, prefs.user_id, dateStr);
      const maxPerDay = (prefs as UserPrefs).max_notifications_per_day || 10;
      if (todayCount >= maxPerDay) {
        continue;
      }

      // Check min interval
      const minInterval = (prefs as UserPrefs).min_time_between_notifications_minutes || 30;
      const tooSoon = await isWithinMinInterval(supabase, prefs.user_id, minInterval);
      if (tooSoon) {
        continue;
      }

      const userPrefs = prefs as UserPrefs;

      // Evaluate each trigger rule sequentially.
      // On first successful insert we move to the next user
      // (one notification per user per cron run to avoid burst).
      const triggers = [
        () => evaluateWorkoutReminder(supabase, userPrefs, hour, minute, dateStr),
        () => evaluateMealReminder(supabase, userPrefs, hour, minute, dateStr),
        () => evaluateHydrationReminder(supabase, userPrefs, hour, minute, dateStr),
        () => evaluateStreakProtection(supabase, userPrefs, hour, minute, dateStr),
        () => evaluateDailySummary(supabase, userPrefs, hour, minute, dateStr),
        () => evaluateMotivational(supabase, userPrefs, hour, minute, dateStr),
      ];

      for (const trigger of triggers) {
        try {
          const didCreate = await trigger();
          if (didCreate) {
            created++;
            break; // One notification per user per cron cycle
          }
        } catch (err) {
          console.error(`[NotificationTriggers] Trigger error for ${userPrefs.user_id}:`, err);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[NotificationTriggers] Evaluated ${evaluated} users, created ${created} notifications in ${duration}ms`);

    return NextResponse.json({
      success: true,
      created,
      evaluated,
      duration,
    });
  } catch (error) {
    console.error('[NotificationTriggers] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Route Exports
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: Request) {
  return handleTrigger(request);
}

// Also support POST for manual triggering
export const POST = GET;
