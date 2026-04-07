-- ═══════════════════════════════════════════════════════════════════════════════
-- BEHAVIORAL NOTIFICATION ENGINE - Intelligent Notification System
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. USER BEHAVIOR PROFILE - Predictive timing data
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_behavior_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  
  -- Preferred activity times (aggregated from historical data)
  preferred_workout_time TIME,              -- Most common workout time
  preferred_meal_time TIME,                 -- Most common meal log time
  preferred_app_open_time TIME,             -- Most common app open time
  
  -- Activity patterns (hour of day distribution 0-23)
  workout_hour_distribution JSONB DEFAULT '{}'::jsonb,   -- { "0": count, "1": count, ... }
  meal_hour_distribution JSONB DEFAULT '{}'::jsonb,      -- { "0": count, "1": count, ... }
  app_open_hour_distribution JSONB DEFAULT '{}'::jsonb,  -- { "0": count, "1": count, ... }
  
  -- Engagement metrics
  engagement_score INTEGER DEFAULT 50,      -- 0-100: How responsive user is to notifications
  avg_response_time_seconds INTEGER,        -- Average time to open notification
  notification_open_rate DECIMAL(5,4) DEFAULT 0.5,  -- % of notifications opened
  
  -- Prediction confidence
  prediction_confidence INTEGER DEFAULT 0,  -- 0-100: How confident in timing predictions
  last_prediction_update TIMESTAMPTZ,
  
  -- Sleep window (user-configured, used for DND)
  sleep_start_time TIME DEFAULT '23:00'::time,
  sleep_end_time TIME DEFAULT '07:00'::time,
  timezone TEXT DEFAULT 'UTC',
  
  -- Computed optimal notification times
  best_morning_notification_time TIME DEFAULT '08:00'::time,
  best_afternoon_notification_time TIME DEFAULT '12:00'::time,
  best_evening_notification_time TIME DEFAULT '18:00'::time,
  
  -- Streak and habit data
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date DATE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_behavior_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own behavior profile" ON public.user_behavior_profile
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own behavior profile" ON public.user_behavior_profile
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own behavior profile" ON public.user_behavior_profile
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. NOTIFICATIONS - Main notification store
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE notification_type AS ENUM (
  'workout_reminder',
  'meal_reminder',
  'streak_protection',
  'achievement',
  'goal_progress',
  'coach_insight',
  'habit_reinforcement',
  'daily_summary',
  'hydration_reminder',
  'motivational'
);

CREATE TYPE notification_status AS ENUM (
  'pending',
  'sent',
  'delivered',
  'opened',
  'actioned',
  'dismissed',
  'failed'
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Content
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  
  -- Multilingual support
  title_translations JSONB DEFAULT '{}'::jsonb,  -- { "en": "...", "fr": "...", "ar": "..." }
  body_translations JSONB DEFAULT '{}'::jsonb,   -- { "en": "...", "fr": "...", "ar": "..." }
  
  -- AI generation metadata
  generated_by_ai BOOLEAN DEFAULT false,
  ai_prompt_used TEXT,
  ai_cache_key TEXT,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  
  -- Delivery tracking
  status notification_status DEFAULT 'pending',
  delivery_status TEXT,
  
  -- Prediction & analytics
  prediction_score DECIMAL(5,4),            -- Predicted probability of engagement
  actual_engagement BOOLEAN,                 -- Did user engage after notification?
  
  -- Deep linking
  deep_link TEXT,                            -- e.g., "/workouts", "/foods"
  action_data JSONB DEFAULT '{}'::jsonb,    -- Additional action payload
  
  -- Throttle key to prevent duplicates
  throttle_key TEXT,                         -- Unique key for deduplication
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_scheduled_time CHECK (scheduled_for > created_at OR status != 'pending')
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_for ON public.notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_throttle_key ON public.notifications(throttle_key);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. NOTIFICATION TEMPLATES - Reusable AI-generated content
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template identification
  type notification_type NOT NULL,
  trigger_condition TEXT NOT NULL,          -- When to use this template
  
  -- Content
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  
  -- Multilingual versions
  title_translations JSONB DEFAULT '{}'::jsonb,
  body_translations JSONB DEFAULT '{}'::jsonb,
  
  -- Template variables (e.g., {{streak}}, {{goal}})
  variables TEXT[] DEFAULT '{}',
  
  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  avg_engagement_rate DECIMAL(5,4),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. NOTIFICATION ANALYTICS - Track engagement for learning
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  
  -- Timing metrics
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  
  -- Calculated metrics
  time_to_open_seconds INTEGER,              -- Time from delivery to open
  time_to_action_seconds INTEGER,            -- Time from open to action
  
  -- Context
  device_type TEXT,                          -- 'ios', 'android', 'web'
  app_state TEXT,                            -- 'foreground', 'background', 'terminated'
  
  -- Outcome tracking
  user_action TEXT,                          -- What user did after notification
  subsequent_workout BOOLEAN DEFAULT false,  -- Did user workout after notification?
  subsequent_meal_log BOOLEAN DEFAULT false, -- Did user log meal after notification?
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_analytics_user_id ON public.notification_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_analytics_notification_id ON public.notification_analytics(notification_id);

ALTER TABLE public.notification_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification analytics" ON public.notification_analytics
  FOR SELECT USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. USER DEVICES - Push notification tokens
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Device identification
  device_token TEXT NOT NULL UNIQUE,         -- APNs or FCM token
  device_type TEXT NOT NULL CHECK (device_type IN ('ios', 'android', 'web')),
  device_name TEXT,
  device_id TEXT,                            -- Unique device identifier
  
  -- Push notification settings
  push_enabled BOOLEAN DEFAULT true,
  sound_enabled BOOLEAN DEFAULT true,
  badge_enabled BOOLEAN DEFAULT true,
  
  -- Timestamps
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint per user-device
  CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_token ON public.user_devices(device_token);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own devices" ON public.user_devices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own devices" ON public.user_devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices" ON public.user_devices
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices" ON public.user_devices
  FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. NOTIFICATION PREFERENCES - Fine-grained user settings
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  
  -- Global settings
  notifications_enabled BOOLEAN DEFAULT true,
  quiet_hours_start TIME DEFAULT '22:00'::time,
  quiet_hours_end TIME DEFAULT '08:00'::time,
  timezone TEXT DEFAULT 'UTC',
  
  -- Per-type preferences
  workout_reminders_enabled BOOLEAN DEFAULT true,
  meal_reminders_enabled BOOLEAN DEFAULT true,
  streak_protection_enabled BOOLEAN DEFAULT true,
  achievements_enabled BOOLEAN DEFAULT true,
  coach_insights_enabled BOOLEAN DEFAULT true,
  daily_summary_enabled BOOLEAN DEFAULT true,
  hydration_reminders_enabled BOOLEAN DEFAULT true,
  motivational_enabled BOOLEAN DEFAULT true,
  
  -- Frequency limits
  max_notifications_per_day INTEGER DEFAULT 3,
  min_time_between_notifications_minutes INTEGER DEFAULT 60,
  
  -- Best times (user-configured overrides)
  preferred_morning_time TIME,
  preferred_afternoon_time TIME,
  preferred_evening_time TIME,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification preferences" ON public.notification_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification preferences" ON public.notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification preferences" ON public.notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. FUNCTIONS AND TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_user_behavior_profile_updated_at ON public.user_behavior_profile;
CREATE TRIGGER update_user_behavior_profile_updated_at
  BEFORE UPDATE ON public.user_behavior_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notifications_updated_at ON public.notifications;
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. HELPER VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

-- View for notification engagement stats (with SECURITY INVOKER for proper RLS)
CREATE OR REPLACE VIEW notification_engagement_stats 
WITH (security_barrier = true) AS
SELECT 
  n.user_id,
  COUNT(*) as total_notifications,
  COUNT(*) FILTER (WHERE n.status = 'opened') as opened_count,
  COUNT(*) FILTER (WHERE n.status = 'actioned') as actioned_count,
  ROUND(COUNT(*) FILTER (WHERE n.status = 'opened')::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as open_rate,
  ROUND(COUNT(*) FILTER (WHERE n.status = 'actioned')::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as action_rate,
  AVG(na.time_to_open_seconds) FILTER (WHERE n.status = 'opened') as avg_time_to_open_seconds
FROM public.notifications n
LEFT JOIN public.notification_analytics na ON n.id = na.notification_id
GROUP BY n.user_id;

-- Set the view to use SECURITY INVOKER (runs with querying user's permissions)
ALTER VIEW notification_engagement_stats SET (security_invoker = on);
