'use client';

import { useEffect, useRef } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { apiFetch } from '@/lib/mobile-api';

// Map local UI fields to API notification_preferences fields
const FIELD_MAP: Record<string, string> = {
  push_enabled: 'notifications_enabled',
  push_workout_reminders: 'workout_reminders_enabled',
  meal_reminders_enabled: 'meal_reminders_enabled',
  hydration_reminders_enabled: 'hydration_reminders_enabled',
  streak_protection_enabled: 'streak_protection_enabled',
  push_daily_summary: 'daily_summary_enabled',
  achievements_enabled: 'achievements_enabled',
  coach_insights_enabled: 'coach_insights_enabled',
  motivational_enabled: 'motivational_enabled',
  max_notifications_per_day: 'max_notifications_per_day',
  do_not_disturb_start: 'quiet_hours_start',
  do_not_disturb_end: 'quiet_hours_end',
};

export function useNotificationSync() {
  const { settings } = useSettings();
  const lastSyncedRef = useRef<string>('');

  useEffect(() => {
    const notifSettings = settings?.notifications;
    if (!notifSettings) return;

    // Create a fingerprint to avoid unnecessary syncs
    const fingerprint = JSON.stringify(notifSettings);
    if (fingerprint === lastSyncedRef.current) return;
    lastSyncedRef.current = fingerprint;

    // Build the API update payload
    const updates: Record<string, unknown> = {};
    for (const [localKey, apiKey] of Object.entries(FIELD_MAP)) {
      const value = (notifSettings as Record<string, unknown>)[localKey];
      if (value !== undefined) {
        // Convert "HH:MM" to "HH:MM:SS" for quiet hours
        if ((apiKey === 'quiet_hours_start' || apiKey === 'quiet_hours_end') && typeof value === 'string') {
          updates[apiKey] = value.includes(':') && value.split(':').length === 2
            ? `${value}:00`
            : value;
        } else {
          updates[apiKey] = value;
        }
      }
    }

    if (Object.keys(updates).length === 0) return;

    // Sync to API (fire-and-forget, don't block UI)
    apiFetch('/api/notifications/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {
      // Silently fail - the UI already saved locally
    });
  }, [settings?.notifications]);
}
