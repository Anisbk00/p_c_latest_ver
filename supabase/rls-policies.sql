-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security (RLS) Policies for Progress Companion
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- This file contains all RLS policies for Supabase tables.
-- These policies ensure users can only access their own data.
--
-- IMPORTANT: Run these policies in the Supabase SQL Editor or via migration.
-- 
-- Security Model:
-- - All tables use RLS (Row Level Security)
-- - Users can only read/write their own data
-- - Service role key bypasses RLS for admin operations
-- - Public tables (if any) have explicit public read policies
--
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_laps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_map_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROFILES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- Users can insert their own profile (during signup)
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER_PROFILES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own user profile"
ON user_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own user profile"
ON user_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own user profile"
ON user_profiles FOR UPDATE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER_SETTINGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own settings"
ON user_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
ON user_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
ON user_settings FOR UPDATE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- GOALS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own goals"
ON goals FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals"
ON goals FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals"
ON goals FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals"
ON goals FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- BODY_METRICS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own body metrics"
ON body_metrics FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own body metrics"
ON body_metrics FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own body metrics"
ON body_metrics FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own body metrics"
ON body_metrics FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- MEASUREMENTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own measurements"
ON measurements FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own measurements"
ON measurements FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own measurements"
ON measurements FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own measurements"
ON measurements FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FOODS TABLE (User-created foods)
-- ═══════════════════════════════════════════════════════════════════════════

-- Users can read their own foods and all global foods
CREATE POLICY "Users can read own and global foods"
ON foods FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own foods"
ON foods FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own foods"
ON foods FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own foods"
ON foods FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FOOD_LOGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own food logs"
ON food_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own food logs"
ON food_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own food logs"
ON food_logs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own food logs"
ON food_logs FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- WORKOUTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own workouts"
ON workouts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workouts"
ON workouts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workouts"
ON workouts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workouts"
ON workouts FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- WORKOUT_LAPS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own workout laps"
ON workout_laps FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = workout_laps.workout_id 
    AND workouts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own workout laps"
ON workout_laps FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = workout_laps.workout_id 
    AND workouts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own workout laps"
ON workout_laps FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = workout_laps.workout_id 
    AND workouts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own workout laps"
ON workout_laps FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = workout_laps.workout_id 
    AND workouts.user_id = auth.uid()
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- WORKOUT_EXERCISES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own workout exercises"
ON workout_exercises FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = workout_exercises.workout_id 
    AND workouts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own workout exercises"
ON workout_exercises FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = workout_exercises.workout_id 
    AND workouts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own workout exercises"
ON workout_exercises FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = workout_exercises.workout_id 
    AND workouts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own workout exercises"
ON workout_exercises FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM workouts 
    WHERE workouts.id = workout_exercises.workout_id 
    AND workouts.user_id = auth.uid()
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROUTES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

-- Users can read their own routes and shared routes
CREATE POLICY "Users can read own and shared routes"
ON routes FOR SELECT
USING (auth.uid() = user_id OR is_shared = true);

CREATE POLICY "Users can insert own routes"
ON routes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routes"
ON routes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routes"
ON routes FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- AI_INSIGHTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own AI insights"
ON ai_insights FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI insights"
ON ai_insights FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI insights"
ON ai_insights FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own AI insights"
ON ai_insights FOR UPDATE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER_FILES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own files"
ON user_files FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own files"
ON user_files FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own files"
ON user_files FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- CHAT_SESSIONS & CHAT_MESSAGES TABLES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own chat sessions"
ON chat_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat sessions"
ON chat_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat sessions"
ON chat_sessions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat sessions"
ON chat_sessions FOR DELETE
USING (auth.uid() = user_id);

-- Chat messages - accessible through chat sessions
CREATE POLICY "Users can read own chat messages"
ON chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM chat_sessions 
    WHERE chat_sessions.id = chat_messages.session_id 
    AND chat_sessions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own chat messages"
ON chat_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM chat_sessions 
    WHERE chat_sessions.id = chat_messages.session_id 
    AND chat_sessions.user_id = auth.uid()
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SUPPLEMENTS TABLE (global catalog — no user_id column)
-- All authenticated users can read supplements. Insert/update/delete are
-- reserved for service-role (admin) operations.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Authenticated users can read supplements"
ON supplements FOR SELECT
USING (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════════════════
-- SLEEP_LOGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own sleep logs"
ON sleep_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sleep logs"
ON sleep_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sleep logs"
ON sleep_logs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sleep logs"
ON sleep_logs FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- WEARABLE_DEVICES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own wearable devices"
ON wearable_devices FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wearable devices"
ON wearable_devices FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wearable devices"
ON wearable_devices FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wearable devices"
ON wearable_devices FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- OFFLINE_MAP_REGIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Users can read own offline map regions"
ON offline_map_regions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own offline map regions"
ON offline_map_regions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own offline map regions"
ON offline_map_regions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own offline map regions"
ON offline_map_regions FOR DELETE
USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- GLOBAL_FOODS TABLE (Public read access)
-- ═══════════════════════════════════════════════════════════════════════════

-- Everyone can read global foods
CREATE POLICY "Anyone can read global foods"
ON global_foods FOR SELECT
USING (true);

-- Only service role can insert/update global foods
CREATE POLICY "Service role can manage global foods"
ON global_foods FOR ALL
USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to check if user owns a resource
CREATE OR REPLACE FUNCTION auth.uid_matches(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN auth.uid() = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('progress-photos', 'progress-photos', false),
  ('avatars', 'avatars', false),
  ('exports', 'exports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for progress-photos bucket
CREATE POLICY "Users can read own progress photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own progress photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own progress photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own progress photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for avatars bucket
CREATE POLICY "Users can read own avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════
