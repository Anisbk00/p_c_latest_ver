import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { UserSettings, DEFAULT_SETTINGS } from '@/lib/types/settings';
import {
  withDistributedRateLimit,
  DISTRIBUTED_RATE_LIMITS,
} from '@/lib/distributed-rate-limit';

const ALLOWED_THEMES = new Set(['light', 'dark', 'gymbro', 'gymgirl']);

function normalizeTheme(theme: unknown): UserSettings['theme'] {
  const value = String(theme ?? '').toLowerCase();
  if (value === 'light') return 'light';
  if (value === 'white') return 'light';
  if (value === 'system') return 'dark';
  if (value === 'her') return 'gymgirl';
  if (value === 'black') return 'dark';
  if (ALLOWED_THEMES.has(value)) return value as UserSettings['theme'];
  return (DEFAULT_SETTINGS.theme as UserSettings['theme']) || 'light';
}

function toDbTheme(theme: unknown): string {
  const normalized = normalizeTheme(theme);
  if (normalized === 'gymgirl') return 'her';
  if (normalized === 'light') return 'light';
  if (normalized === 'dark') return 'dark';
  if (normalized === 'gymbro') return 'gymbro';
  return 'light';
}

// Helper: Transform DB row to UserSettings object
function dbToUser(db: any): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...db, // Spread DB fields first (e.g. user_id, timestamps)
    // Overwrite with nested structures
    theme: normalizeTheme(db.theme),
    units: db.units || {
      weight: db.units === 'imperial' ? 'lbs' : 'kg',
      distance: db.units === 'imperial' ? 'miles' : 'km',
      time: '24h',
      first_day_of_week: 'mon',
      ...(DEFAULT_SETTINGS.units || {})
    },
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      // Read from JSONB column first (has all settings)
      ...(db.notifications || {}),
      // Legacy columns for backwards compatibility
      push_enabled: db.notifications?.push_enabled ?? db.notifications_enabled ?? DEFAULT_SETTINGS.notifications.push_enabled,
      push_daily_summary: db.notifications?.push_daily_summary ?? db.push_notifications ?? DEFAULT_SETTINGS.notifications.push_daily_summary,
      email_digest: db.notifications?.email_digest ?? (db.email_notifications ? 'weekly' : 'none'),
    },
    privacy: {
      ...DEFAULT_SETTINGS.privacy,
      // Read from JSONB column first (has all settings)
      ...(db.privacy || {}),
      // Legacy columns for backwards compatibility
      iron_coach_opt_in: db.privacy?.iron_coach_opt_in ?? db.iron_coach_opt_in ?? DEFAULT_SETTINGS.privacy.iron_coach_opt_in,
      data_retention_months: db.privacy?.data_retention_months ?? db.chat_retention_days ?? DEFAULT_SETTINGS.privacy.data_retention_months,
    },
    // JSONB columns can be passed through if they match schema, else ensure defaults
    map_storage: db.map_storage || DEFAULT_SETTINGS.map_storage,
    security: db.security || DEFAULT_SETTINGS.security,
    accessibility: db.accessibility || DEFAULT_SETTINGS.accessibility,
    language: (db.language as 'en' | 'fr') || 'en',
  } as UserSettings;
}

// Helper: Transform UserSettings updates to DB columns
function userToDb(updates: Partial<UserSettings>): any {
  const db: any = {};
  
  // Direct mappings
  if (updates.theme) db.theme = toDbTheme(updates.theme);
  if (updates.theme_accent) db.theme_accent = updates.theme_accent;
  if (updates.map_storage) db.map_storage = updates.map_storage;
  if (updates.security) db.security = updates.security;
  if (updates.accessibility) db.accessibility = updates.accessibility;

  // Language — validated against allowed values; updates last_locale_applied_at
  if (updates.language) {
    const allowed = ['en', 'fr'];
    if (allowed.includes(updates.language)) {
      db.language = updates.language;
      db.last_locale_applied_at = new Date().toISOString();
    }
  }

  // Flatten nested objects
  if (updates.units) {
    db.units = updates.units;
  }
  
  if (updates.notifications) {
    // Save the entire notifications object to the JSONB column
    db.notifications = updates.notifications;
    
    // Also update legacy columns for backwards compatibility
    if (updates.notifications.push_enabled !== undefined) db.notifications_enabled = updates.notifications.push_enabled;
    if (updates.notifications.email_digest !== undefined) db.email_notifications = updates.notifications.email_digest !== 'none';
    if (updates.notifications.push_daily_summary !== undefined) db.push_notifications = updates.notifications.push_daily_summary;
  }
  
  if (updates.privacy) {
    // Save the entire privacy object to the JSONB column
    db.privacy = updates.privacy;
    
    // Also update legacy columns for backwards compatibility
    if (updates.privacy.iron_coach_opt_in !== undefined) db.iron_coach_opt_in = updates.privacy.iron_coach_opt_in;
    if (updates.privacy.data_retention_months !== undefined) db.chat_retention_days = updates.privacy.data_retention_months;
  }
  
  return db;
}

export async function GET(_request: NextRequest) {
  const rateCheck = await withDistributedRateLimit(_request, DISTRIBUTED_RATE_LIMITS.API_READ);
  if (!rateCheck.allowed) return rateCheck.response;

  try {
    const { supabase, user } = await getSupabaseUser();

    // Fetch user settings and notification preferences in parallel
    const [settingsResult, notifPrefsResult] = await Promise.all([
      supabase.from('user_settings').select('*').eq('user_id', user.id).single(),
      supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    ]);

    const { data: settings, error } = settingsResult;
    const { data: notifPrefs } = notifPrefsResult;

    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
      console.error('Error fetching settings:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    // If no settings exist, return defaults
    if (!settings) {
      return NextResponse.json({ ...DEFAULT_SETTINGS, user_id: user.id });
    }

    // Transform DB row to nested UserSettings
    const userSettings = dbToUser(settings);
    
    // Merge notification_preferences into the settings if available
    // This ensures toggles reflect the actual notification system state
    if (notifPrefs) {
      userSettings.notifications = {
        ...userSettings.notifications,
        push_enabled: notifPrefs.notifications_enabled ?? userSettings.notifications?.push_enabled ?? true,
        push_workout_reminders: notifPrefs.workout_reminders_enabled ?? userSettings.notifications?.push_workout_reminders ?? true,
        meal_reminders_enabled: notifPrefs.meal_reminders_enabled ?? userSettings.notifications?.meal_reminders_enabled ?? true,
        hydration_reminders_enabled: notifPrefs.hydration_reminders_enabled ?? userSettings.notifications?.hydration_reminders_enabled ?? true,
        streak_protection_enabled: notifPrefs.streak_protection_enabled ?? userSettings.notifications?.streak_protection_enabled ?? true,
        achievements_enabled: notifPrefs.achievements_enabled ?? userSettings.notifications?.achievements_enabled ?? true,
        coach_insights: notifPrefs.coach_insights_enabled ?? userSettings.notifications?.coach_insights ?? true,
        coach_insights_enabled: notifPrefs.coach_insights_enabled ?? userSettings.notifications?.coach_insights_enabled ?? true,
        push_daily_summary: notifPrefs.daily_summary_enabled ?? userSettings.notifications?.push_daily_summary ?? true,
        motivational: notifPrefs.motivational_enabled ?? userSettings.notifications?.motivational ?? true,
        motivational_enabled: notifPrefs.motivational_enabled ?? userSettings.notifications?.motivational_enabled ?? true,
        maxPerDay: notifPrefs.max_notifications_per_day ?? userSettings.notifications?.maxPerDay ?? 5,
        max_notifications_per_day: notifPrefs.max_notifications_per_day ?? userSettings.notifications?.max_notifications_per_day ?? 5,
        minIntervalMinutes: notifPrefs.min_time_between_notifications_minutes ?? userSettings.notifications?.minIntervalMinutes ?? 60,
        quietHoursStart: notifPrefs.quiet_hours_start ?? userSettings.notifications?.quietHoursStart ?? '22:00',
        quietHoursEnd: notifPrefs.quiet_hours_end ?? userSettings.notifications?.quietHoursEnd ?? '08:00',
      };
    }
    
    return NextResponse.json(userSettings);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Unexpected error in GET /api/settings:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const rateCheck = await withDistributedRateLimit(request, DISTRIBUTED_RATE_LIMITS.PROFILE_UPDATE);
  if (!rateCheck.allowed) return rateCheck.response;

  try {
    const { supabase, user } = await getSupabaseUser();
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // Strict Zod validation
    const { UserSettingsUpdateSchema } = await import('@/lib/validation')
    const parseResult = UserSettingsUpdateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      }, { status: 400 })
    }
    body = parseResult.data
    // Extra: sanitize all strings (trim)
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }
    // Ensure we don't allow modifying user_id
    const { user_id, created_at, updated_at, ...updates } = body;
    if (user_id) console.warn('[settings PUT] user_id in body - stripped');
    // Transform nested updates to DB columns
    const dbUpdates = userToDb(updates);
    if (Object.keys(dbUpdates).length === 0) {
        return NextResponse.json({ success: true, message: 'No changes detected or mapped' });
    }

    // P1 FIX: Check version header for optimistic locking
    const versionHeader = request.headers.get('if-match') || request.headers.get('x-resource-version')
    
    // Check if settings exist
    const { data: existing } = await supabase
      .from('user_settings')
      .select('user_id, updated_at')
      .eq('user_id', user.id)
      .single();

    let result;
    if (existing) {
      // P1 FIX: Validate version if provided
      if (versionHeader && existing.updated_at) {
        const existingTimestamp = new Date(existing.updated_at).getTime()
        const providedTimestamp = new Date(versionHeader).getTime()
        // Allow 1-second tolerance for timestamp comparison
        if (Math.abs(existingTimestamp - providedTimestamp) > 1000 && providedTimestamp < existingTimestamp) {
          return NextResponse.json({
            error: 'Settings were modified by another request',
            code: 'CONFLICT',
            currentVersion: existing.updated_at,
            providedVersion: versionHeader,
          }, { status: 409 })
        }
      }
      
      // Update — include updated_at in WHERE clause to prevent TOCTOU race condition
      const newUpdatedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('user_settings')
        .update({ ...dbUpdates, updated_at: newUpdatedAt })
        .eq('user_id', user.id)
        .eq('updated_at', existing.updated_at)
        .select()
        .single();
      
      // If no row returned, another request modified the data between our read and write
      if (!data && !error) {
        return NextResponse.json({
          error: 'Settings were modified by another request',
          code: 'CONFLICT',
          currentVersion: newUpdatedAt,
          providedVersion: versionHeader,
        }, { status: 409 });
      }
      if (error) throw error;
      result = data;

      // Audit log
      const { error: auditError } = await supabase.from('settings_audit').insert({
        user_id: user.id,
        changed_by: user.id,
        change_type: 'UPDATE',
        resource: 'user_settings',
        action: 'UPDATE',
        old_values: existing, // logic for diffing omitted for brevity
        new_values: dbUpdates
      } as any);

      if (auditError) console.error('Error logging settings update:', auditError);

    } else {
      // Create
      const { data, error } = await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          ...dbUpdates,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as any)
        .select()
        .single();
        
      if (error) throw error;
      result = data;

      // Audit log
      const { error: auditError } = await supabase.from('settings_audit').insert({
        user_id: user.id,
        changed_by: user.id,
        change_type: 'CREATE',
        resource: 'user_settings',
        action: 'CREATE',
        new_values: dbUpdates
      } as any);
      
      if (auditError) console.error('Error logging settings creation:', auditError);
    }

    // Sync notification settings to notification_preferences table
    // This ensures the notification system has the correct preferences
    if (updates.notifications) {
      const notifPrefs: Record<string, unknown> = {
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };
      
      // Map Settings UI fields to notification_preferences columns
      const n = updates.notifications;
      if (n.push_enabled !== undefined) notifPrefs.notifications_enabled = n.push_enabled;
      if (n.push_workout_reminders !== undefined) notifPrefs.workout_reminders_enabled = n.push_workout_reminders;
      if (n.meal_reminders_enabled !== undefined) notifPrefs.meal_reminders_enabled = n.meal_reminders_enabled;
      if (n.hydration_reminders_enabled !== undefined) notifPrefs.hydration_reminders_enabled = n.hydration_reminders_enabled;
      if (n.streak_protection_enabled !== undefined) notifPrefs.streak_protection_enabled = n.streak_protection_enabled;
      if (n.achievements_enabled !== undefined) notifPrefs.achievements_enabled = n.achievements_enabled;
      // Support both with and without _enabled suffix for coach_insights
      if (n.coach_insights !== undefined) notifPrefs.coach_insights_enabled = n.coach_insights;
      if (n.coach_insights_enabled !== undefined) notifPrefs.coach_insights_enabled = n.coach_insights_enabled;
      if (n.push_daily_summary !== undefined) notifPrefs.daily_summary_enabled = n.push_daily_summary;
      // Support both with and without _enabled suffix for motivational
      if (n.motivational !== undefined) notifPrefs.motivational_enabled = n.motivational;
      if (n.motivational_enabled !== undefined) notifPrefs.motivational_enabled = n.motivational_enabled;
      // Support both field names for max notifications
      if (n.maxPerDay !== undefined) notifPrefs.max_notifications_per_day = n.maxPerDay;
      if (n.max_notifications_per_day !== undefined) notifPrefs.max_notifications_per_day = n.max_notifications_per_day;
      if (n.minIntervalMinutes !== undefined) notifPrefs.min_time_between_notifications_minutes = n.minIntervalMinutes;
      if (n.quietHoursStart !== undefined) notifPrefs.quiet_hours_start = n.quietHoursStart;
      if (n.quietHoursEnd !== undefined) notifPrefs.quiet_hours_end = n.quietHoursEnd;
      
      // Upsert to notification_preferences (won't fail if no new fields)
      if (Object.keys(notifPrefs).length > 2) { // More than just user_id and updated_at
        const { error: notifError } = await supabase
          .from('notification_preferences')
          .upsert(notifPrefs, { onConflict: 'user_id' });
        
        if (notifError) {
          console.error('Error syncing notification preferences:', notifError);
          // Non-blocking - don't fail the request
        }
      }
    }

    // Return the transformed object so frontend state stays consistent
    // Transform transformed object for response
    return NextResponse.json(dbToUser(result));

  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Unexpected error in PUT /api/settings:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

