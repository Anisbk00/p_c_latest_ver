export type AppTheme = 'light' | 'dark' | 'gymbro' | 'gymgirl';

export interface UserSettings {
  user_id: string;
  theme: AppTheme;
  theme_accent: Record<string, string>;
  units: {
    weight: 'kg' | 'lbs';
    distance: 'km' | 'miles';
    time: '12h' | '24h';
    first_day_of_week?: 'mon' | 'sun';
  };
  notifications: {
    push_enabled: boolean;
    push_daily_summary: boolean;
    push_workout_reminders: boolean;
    push_premium_insights: boolean;
    email_digest: 'none' | 'weekly' | 'daily';
    do_not_disturb_start?: string; // HH:MM
    do_not_disturb_end?: string; // HH:MM
    soundEnabled?: boolean;
    // Extended notification settings
    meal_reminders_enabled?: boolean;
    hydration_reminders_enabled?: boolean;
    streak_protection_enabled?: boolean;
    achievements_enabled?: boolean;
    coach_insights?: boolean;
    coach_insights_enabled?: boolean; // Support both field names
    motivational?: boolean;
    motivational_enabled?: boolean; // Support both field names
    maxPerDay?: number;
    max_notifications_per_day?: number;
    minIntervalMinutes?: number;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
  privacy: {
    iron_coach_opt_in: boolean;
    data_retention_months: number;
    image_purge_months: number;
    share_usage_data: boolean;
  };
  map_storage: {
    downloaded_regions: Array<{
      id: string;
      name: string;
      size_mb: number;
      last_accessed: string;
    }>;
    wifi_only_downloads: boolean;
    auto_lru_threshold_mb: number;
  };
  security: {
    biometricEnabled: boolean;
  };
  accessibility: {
    reduceMotion: boolean;
    highContrast: boolean;
  };
  language: 'en' | 'fr';
  created_at: string;
  updated_at: string;
}

export const DEFAULT_SETTINGS: Partial<UserSettings> = {
  theme: 'dark',
  theme_accent: {},
  units: {
    weight: 'kg',
    distance: 'km',
    time: '24h',
    first_day_of_week: 'mon'
  },
  notifications: {
    push_enabled: true,
    push_daily_summary: true,
    push_workout_reminders: true,
    push_premium_insights: true,
    email_digest: 'weekly',
    soundEnabled: true,
  },
  privacy: {
    iron_coach_opt_in: false,
    data_retention_months: 12,
    image_purge_months: 24,
    share_usage_data: false
  },
  map_storage: {
    downloaded_regions: [],
    wifi_only_downloads: true,
    auto_lru_threshold_mb: 500
  },
  security: {
    biometricEnabled: false,
  },
  accessibility: {
    reduceMotion: false,
    highContrast: false,
  },
  language: 'en',
};
