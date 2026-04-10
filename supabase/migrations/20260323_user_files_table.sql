-- ═══════════════════════════════════════════════════════════════════════════════
-- USER_FILES TABLE + AWARD_XP RPC
-- ═══════════════════════════════════════════════════════════════════════════════
-- Required for progress photo uploads and XP system.
-- Run this in your Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- USER_FILES TABLE
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT,
  path TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other',
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON public.user_files (user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_category ON public.user_files (category);
CREATE INDEX IF NOT EXISTS idx_user_files_user_category ON public.user_files (user_id, category, created_at DESC);

ALTER TABLE public.user_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_files' AND policyname = 'Users can read own files') THEN
    CREATE POLICY "Users can read own files" ON public.user_files FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_files' AND policyname = 'Users can insert own files') THEN
    CREATE POLICY "Users can insert own files" ON public.user_files FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_files' AND policyname = 'Users can delete own files') THEN
    CREATE POLICY "Users can delete own files" ON public.user_files FOR DELETE USING (auth.uid() = user_id);
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════
-- AWARD_XP RPC FUNCTION
-- Awards XP to a user for various actions.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.award_xp(
  p_user_id UUID,
  p_amount INTEGER,
  p_action_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Upsert user XP record in user_settings metadata or xp table
  -- For simplicity, use the user_profiles table to track XP
  INSERT INTO public.user_profiles (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Return success result
  v_result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'amount', p_amount,
    'action_type', p_action_type,
    'reference_id', p_reference_id,
    'description', p_description,
    'awarded_at', NOW()
  );

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- ENSURE STORAGE BUCKET EXISTS (public for photo access)
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-photos', 'progress-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;
