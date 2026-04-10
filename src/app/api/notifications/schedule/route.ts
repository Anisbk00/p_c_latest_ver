/**
 * Notification Scheduling API
 * 
 * Creates and schedules notifications for users.
 * Handles workout reminders, meal reminders, streak protection, etc.
 * 
 * POST /api/notifications/schedule
 * 
 * @module app/api/notifications/schedule/route
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

type NotificationType =
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

interface ScheduleNotificationRequest {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  title_translations?: Record<string, string>;
  body_translations?: Record<string, string>;
  scheduled_for?: string; // ISO date string
  deep_link?: string;
  action_data?: Record<string, unknown>;
  throttle_key?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Templates
// ═══════════════════════════════════════════════════════════════════════════════

const NOTIFICATION_TEMPLATES: Partial<Record<NotificationType, {
  defaultTitle: string;
  defaultBody: string;
  defaultDeepLink: string;
}>> = {
  workout_reminder: {
    defaultTitle: 'Time to Workout! 💪',
    defaultBody: "Don't break your streak! Your workout is waiting.",
    defaultDeepLink: '/workouts',
  },
  meal_reminder: {
    defaultTitle: 'Log Your Meal 🍽️',
    defaultBody: "Don't forget to track your nutrition.",
    defaultDeepLink: '/foods',
  },
  streak_protection: {
    defaultTitle: 'Streak at Risk! 🔥',
    defaultBody: "You're about to lose your streak! Log an activity now.",
    defaultDeepLink: '/workouts',
  },
  achievement: {
    defaultTitle: 'Achievement Unlocked! 🏆',
    defaultBody: 'Congratulations! You reached a new milestone!',
    defaultDeepLink: '/achievements',
  },
  goal_progress: {
    defaultTitle: 'Goal Progress 📊',
    defaultBody: "You're making progress on your goals!",
    defaultDeepLink: '/goals',
  },
  coach_insight: {
    defaultTitle: 'Coach Insight 💡',
    defaultBody: 'Your AI coach has a new insight for you.',
    defaultDeepLink: '/insights',
  },
  hydration_reminder: {
    defaultTitle: 'Stay Hydrated! 💧',
    defaultBody: "Don't forget to drink water!",
    defaultDeepLink: '/hydration',
  },
  daily_summary: {
    defaultTitle: 'Daily Summary 📈',
    defaultBody: 'Check out your progress today!',
    defaultDeepLink: '/dashboard',
  },
  motivational: {
    defaultTitle: "You've Got This! ⭐",
    defaultBody: 'Keep pushing towards your goals!',
    defaultDeepLink: '/dashboard',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

async function checkNotificationPreference(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  type: NotificationType
): Promise<boolean> {
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!prefs || !prefs.notifications_enabled) {
    return false;
  }

  // Check type-specific preference
  const typePreferenceMap: Record<NotificationType, string> = {
    workout_reminder: 'workout_reminders_enabled',
    meal_reminder: 'meal_reminders_enabled',
    streak_protection: 'streak_protection_enabled',
    achievement: 'achievements_enabled',
    goal_progress: 'achievements_enabled',
    coach_insight: 'coach_insights_enabled',
    habit_reinforcement: 'motivational_enabled',
    daily_summary: 'daily_summary_enabled',
    hydration_reminder: 'hydration_reminders_enabled',
    motivational: 'motivational_enabled',
  };

  const prefKey = typePreferenceMap[type];
  if (prefKey && prefs[prefKey as keyof typeof prefs] === false) {
    return false;
  }

  return true;
}

async function checkDailyLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('max_notifications_per_day')
    .eq('user_id', userId)
    .maybeSingle();

  const maxPerDay = prefs?.max_notifications_per_day || 5;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', today.toISOString());

  return (count || 0) < maxPerDay;
}

async function checkThrottle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  throttleKey: string | undefined
): Promise<boolean> {
  if (!throttleKey) return true;

  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('throttle_key', throttleKey)
    .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .maybeSingle();

  return !data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Route Handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ScheduleNotificationRequest = await request.json();
    const {
      user_id,
      type,
      title,
      body: notificationBody,
      title_translations,
      body_translations,
      scheduled_for,
      deep_link,
      action_data,
      throttle_key,
    } = body;

    // Validate
    if (!user_id || !type || !title || !notificationBody) {
      return NextResponse.json(
        { error: 'Missing required fields: user_id, type, title, body' },
        { status: 400 }
      );
    }

    // User can only schedule for themselves (or via service role)
    if (user.id !== user_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check preferences
    const allowed = await checkNotificationPreference(supabase, user_id, type);
    if (!allowed) {
      return NextResponse.json({
        success: false,
        reason: 'notification_type_disabled',
      });
    }

    // Check daily limit
    const withinLimit = await checkDailyLimit(supabase, user_id);
    if (!withinLimit) {
      return NextResponse.json({
        success: false,
        reason: 'daily_limit_reached',
      });
    }

    // Check throttle
    const notThrottled = await checkThrottle(supabase, user_id, throttle_key);
    if (!notThrottled) {
      return NextResponse.json({
        success: false,
        reason: 'throttled',
      });
    }

    // Get template defaults
    const template = NOTIFICATION_TEMPLATES[type];

    // Determine scheduled time
    const scheduledTime = scheduled_for
      ? new Date(scheduled_for)
      : new Date(Date.now() + 60 * 1000); // Default: 1 minute from now

    // Insert notification
    const { data: notification, error: insertError } = await supabase
      .from('notifications')
      .insert({
        user_id,
        type,
        title,
        body: notificationBody,
        title_translations: title_translations || {},
        body_translations: body_translations || {},
        scheduled_for: scheduledTime.toISOString(),
        deep_link: deep_link || template?.defaultDeepLink || null,
        action_data: action_data || {},
        throttle_key: throttle_key || null,
        status: 'pending',
      })
      .select('id, scheduled_for')
      .single();

    if (insertError) {
      console.error('[ScheduleNotification] Error:', insertError);
      return NextResponse.json(
        { error: 'Failed to schedule notification' },
        { status: 500 }
      );
    }

    console.log(`[ScheduleNotification] ${user_id} - ${type} - ${scheduledTime.toISOString()}`);

    return NextResponse.json({
      success: true,
      notification_id: notification.id,
      scheduled_for: notification.scheduled_for,
    });

  } catch (error) {
    console.error('[ScheduleNotification] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET - Get user's scheduled notifications
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '20');

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, scheduled_for, status, deep_link, created_at')
      .eq('user_id', user.id)
      .eq('status', status)
      .order('scheduled_for', { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    return NextResponse.json({ notifications });

  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
