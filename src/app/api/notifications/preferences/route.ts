/**
 * Notification Preferences API
 * 
 * GET/PUT /api/notifications/preferences
 * 
 * @module app/api/notifications/preferences/route
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════════════════════
// GET - Retrieve notification preferences
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[Preferences] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    // Return defaults if no preferences exist
    if (!preferences) {
      return NextResponse.json({
        preferences: {
          notifications_enabled: true,
          quiet_hours_start: '22:00:00',
          quiet_hours_end: '08:00:00',
          timezone: 'UTC',
          workout_reminders_enabled: true,
          meal_reminders_enabled: true,
          streak_protection_enabled: true,
          achievements_enabled: true,
          coach_insights_enabled: true,
          daily_summary_enabled: true,
          hydration_reminders_enabled: true,
          motivational_enabled: true,
          max_notifications_per_day: 5,
          min_time_between_notifications_minutes: 60,
        },
      });
    }

    return NextResponse.json({ preferences });

  } catch (error) {
    console.error('[Preferences] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUT - Update notification preferences
// ═══════════════════════════════════════════════════════════════════════════════

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updates = await request.json();

    // Validate allowed fields
    const allowedFields = [
      'notifications_enabled',
      'quiet_hours_start',
      'quiet_hours_end',
      'timezone',
      'workout_reminders_enabled',
      'meal_reminders_enabled',
      'streak_protection_enabled',
      'achievements_enabled',
      'coach_insights_enabled',
      'daily_summary_enabled',
      'hydration_reminders_enabled',
      'motivational_enabled',
      'max_notifications_per_day',
      'min_time_between_notifications_minutes',
      'preferred_morning_time',
      'preferred_afternoon_time',
      'preferred_evening_time',
    ];

    const filteredUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    filteredUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        ...filteredUpdates,
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('[Preferences] Update error:', error);
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Preferences] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
