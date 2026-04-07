/**
 * Notifications API Route
 * 
 * GET: List notifications for the authenticated user
 * POST: Generate and create a notification (internal use)
 * 
 * @module app/api/notifications/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import NotificationService from '@/lib/notifications/notification-service';
import {
  BehavioralNotificationEngine,
  getTimeOfDay,
} from '@/lib/notifications/behavioral-engine';
import type { NotificationContext, Locale } from '@/lib/notifications/notification-types';

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/notifications - List notifications
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const result = await NotificationService.getNotifications(user.id, {
      limit,
      offset,
      unreadOnly,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Error in GET /api/notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/notifications - Generate and create a notification
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's notification preferences
    const preferences = await NotificationService.getPreferences(user.id);

    // Check if notifications are enabled
    if (!preferences.notifications_enabled) {
      return NextResponse.json({ 
        success: false, 
        message: 'Notifications are disabled' 
      });
    }

    // Check daily limit
    const todayCount = await NotificationService.getTodayNotificationCount(user.id);
    if (todayCount >= (preferences.max_notifications_per_day || 3)) {
      return NextResponse.json({ 
        success: false, 
        message: 'Daily notification limit reached' 
      });
    }

    // Get recent notification types for deduplication
    const recentTypes = await NotificationService.getRecentNotificationTypes(user.id);

    // Build notification context
    const context = await buildNotificationContext(user.id, recentTypes);

    // Determine what notification to send
    const notification = BehavioralNotificationEngine.determineNotification(
      context,
      preferences
    );

    if (!notification) {
      return NextResponse.json({ 
        success: false, 
        message: 'No suitable notification at this time' 
      });
    }

    // Check throttle key to prevent duplicates
    const wasRecentlySent = await NotificationService.wasRecentlySent(notification.throttleKey);
    if (wasRecentlySent) {
      return NextResponse.json({ 
        success: false, 
        message: 'Similar notification recently sent' 
      });
    }

    // Create the notification
    const created = await NotificationService.createNotification(user.id, notification);

    return NextResponse.json({ 
      success: true, 
      notification: created 
    });
  } catch (error) {
    console.error('[API] Error in POST /api/notifications:', error);
    return NextResponse.json(
      { error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

async function buildNotificationContext(
  userId: string,
  recentTypes: string[]
): Promise<NotificationContext> {
  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;

  // Fetch all data in parallel (was 9 sequential calls → 1 Promise.all)
  const [
    profileRes,
    settingsRes,
    goalsRes,
    foodLogsRes,
    workoutsRes,
    hydrationRes,
    behaviorProfile,
    recentFoodDaysRes,
    lastWorkoutHistoryRes,
  ] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', userId).single(),
    supabase.from('user_settings').select('language').eq('user_id', userId).maybeSingle(),
    supabase.from('goals').select('goal_type, target_value').eq('user_id', userId).limit(10),
    supabase.from('food_logs').select('calories, protein, logged_at').eq('user_id', userId).gte('logged_at', todayStart).lte('logged_at', todayEnd),
    supabase.from('workouts').select('calories_burned, started_at, activity_type').eq('user_id', userId).gte('started_at', todayStart).lte('started_at', todayEnd),
    supabase.from('measurements').select('value').eq('user_id', userId).eq('measurement_type', 'water').gte('captured_at', todayStart).lte('captured_at', todayEnd),
    NotificationService.getBehaviorProfile(userId),
    supabase.from('food_logs').select('logged_at').eq('user_id', userId).order('logged_at', { ascending: false }).limit(30),
    supabase.from('workouts').select('started_at, activity_type').eq('user_id', userId).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const profile = profileRes.data;
  const settings = settingsRes.data;
  const goals = goalsRes.data;
  const foodLogs = foodLogsRes.data || [];
  const workouts = workoutsRes.data || [];
  const hydration = hydrationRes.data || [];
  const recentFoodDays = recentFoodDaysRes.data || [];
  const lastWorkoutHistory = lastWorkoutHistoryRes.data;

  // Calculate aggregates
  const caloriesConsumed = foodLogs.reduce((sum: number, log: any) => sum + (log.calories || 0), 0);
  const proteinConsumed = foodLogs.reduce((sum: number, log: any) => sum + (log.protein || 0), 0);
  const caloriesBurned = workouts.reduce((sum: number, w: any) => sum + (w.calories_burned || 0), 0);
  const hydrationCurrent = hydration.reduce((sum: number, h: any) => sum + (h.value || 0), 0);

  // Get target values from goals
  const targetCalories = (goals || []).find((g: any) => g.goal_type?.includes('calorie'))?.target_value || 2000;
  const targetProtein = (goals || []).find((g: any) => g.goal_type?.includes('protein'))?.target_value || 150;
  const primaryGoal = (goals || [])?.[0]?.goal_type || 'maintenance';

  // Check streak
  const uniqueDays = new Set(
    recentFoodDays.map((log: any) =>
      new Date(log.logged_at).toISOString().split('T')[0]
    )
  );

  let currentStreak = 0;
  const checkDate = new Date();
  const todayStr = checkDate.toISOString().split('T')[0];

  if (!uniqueDays.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  for (let i = 0; i < 365; i++) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (uniqueDays.has(dateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Check if streak is at risk (no activity today and it's late in the day)
  const hour = new Date().getHours();
  const hasActivityToday = uniqueDays.has(todayStr);
  const streakAtRisk = currentStreak > 0 && !hasActivityToday && hour >= 16;

  // Get last workout info
  const hasWorkoutToday = workouts.length > 0;

  return {
    userId,
    userName: profile?.name || 'User',
    locale: (settings?.language as Locale) || 'en',
    primaryGoal,
    targetCalories,
    targetProtein,
    caloriesConsumed,
    proteinConsumed,
    caloriesBurned,
    hydrationCurrent,
    hydrationTarget: 2500,
    stepsCurrent: 0,
    stepsTarget: 10000,
    hasWorkoutToday,
    workoutCount: (workouts || []).length,
    lastWorkoutDate: lastWorkoutHistory?.started_at || null,
    lastWorkoutType: lastWorkoutHistory?.activity_type || null,
    currentStreak,
    streakAtRisk,
    timeOfDay: getTimeOfDay(hour),
    dayOfWeek: new Date().getDay(),
    behaviorProfile,
    recentNotificationTypes: recentTypes as any[],
  };
}
