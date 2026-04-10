-- ═══════════════════════════════════════════════════════════════════════════════
-- XP SYSTEM — Complete Implementation
-- ═══════════════════════════════════════════════════════════════════════════════
-- Run this in your Supabase SQL Editor.
--
-- This migration:
-- 1. Adds xp + level columns to profiles table
-- 2. Creates xp_transactions table for history
-- 3. Rewrites award_xp() to actually persist XP and calculate level
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. ADD XP COLUMNS TO profiles TABLE
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'xp'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'level'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. CREATE XP_TRANSACTIONS TABLE
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  reference_id UUID DEFAULT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_id ON public.xp_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_created ON public.xp_transactions (user_id, created_at DESC);

ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'xp_transactions' AND policyname = 'Users can read own xp') THEN
    CREATE POLICY "Users can read own xp" ON public.xp_transactions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'xp_transactions' AND policyname = 'Service role can insert xp') THEN
    CREATE POLICY "Service role can insert xp" ON public.xp_transactions FOR INSERT WITH CHECK (true);
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. REWRITE award_xp() — ACTUALLY PERSISTS XP AND CALCULATES LEVEL
-- ═══════════════════════════════════════════════════════════════════════════════
-- Formula: level = floor(total_xp / 100) + 1
-- Each level requires 100 XP. Linear progression.

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
  v_old_xp INTEGER;
  v_old_level INTEGER;
  v_new_xp INTEGER;
  v_new_level INTEGER;
  v_leveled_up BOOLEAN;
  v_result JSONB;
BEGIN
  -- Ensure profiles row exists
  INSERT INTO public.profiles (id)
  VALUES (p_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- Get current XP and level
  SELECT COALESCE(xp, 0), COALESCE(level, 1) INTO v_old_xp, v_old_level
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_old_xp IS NULL THEN
    v_old_xp := 0;
    v_old_level := 1;
  END IF;

  -- Calculate new XP and level
  v_new_xp := v_old_xp + p_amount;
  v_new_level := FLOOR(v_new_xp / 100) + 1;
  v_leveled_up := v_new_level > v_old_level;

  -- Update profiles table
  UPDATE public.profiles
  SET xp = v_new_xp,
      level = v_new_level,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Insert transaction record (idempotency: skip if same reference_id exists)
  IF p_reference_id IS NOT NULL THEN
    INSERT INTO public.xp_transactions (user_id, amount, action_type, reference_id, description)
    SELECT p_user_id, p_amount, p_action_type, p_reference_id, p_description
    WHERE NOT EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE reference_id = p_reference_id
    );
  ELSE
    INSERT INTO public.xp_transactions (user_id, amount, action_type, reference_id, description)
    VALUES (p_user_id, p_amount, p_action_type, NULL, p_description);
  END IF;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'new_xp', v_new_xp,
    'new_level', v_new_level,
    'old_xp', v_old_xp,
    'old_level', v_old_level,
    'leveled_up', v_leveled_up,
    'amount', p_amount,
    'action_type', p_action_type,
    'xp_progress', v_new_xp - ((v_new_level - 1) * 100),
    'xp_to_next_level', 100
  );

  RETURN v_result;
END;
$$;
