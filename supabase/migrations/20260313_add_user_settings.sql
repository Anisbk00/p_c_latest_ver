-- Enable pgcrypto (usually enabled but good to check)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'black' CHECK (theme IN ('black', 'white', 'gymbro', 'her')),
  theme_accent JSONB DEFAULT '{}'::jsonb,
  units JSONB DEFAULT '{"weight":"kg","distance":"km","time":"24h"}'::jsonb,
  notifications JSONB DEFAULT '{"push":true,"email_digest":"weekly"}'::jsonb,
  privacy JSONB DEFAULT '{"iron_coach_opt_in":false,"data_retention_months":12,"image_purge_months":24}'::jsonb,
  map_storage JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- User Policies
CREATE POLICY "Users can view their own settings" ON public.user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" ON public.user_settings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" ON public.user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Audit Table
CREATE TABLE IF NOT EXISTS public.settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.settings_audit ENABLE ROW LEVEL SECURITY;

-- Audit Policies (Users can only read their own audit logs, insert happens via trigger/functions ideally but for now standard RLS)
CREATE POLICY "Users can view their own audit logs" ON public.settings_audit
  FOR SELECT USING (auth.uid() = user_id);

-- Trigger to create default settings on new user? 
-- Usually safer to handle in app logic or trigger on auth.users insert.
-- For now, let's rely on the app to insert if missing.
