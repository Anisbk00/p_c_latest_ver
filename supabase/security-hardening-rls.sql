-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING: RLS POLICY FIXES
-- ═══════════════════════════════════════════════════════════════════════════════
-- 
-- This migration addresses critical RLS policy vulnerabilities:
-- 1. Overly permissive INSERT policies on audit_logs and ai_training_signals
-- 2. Missing DELETE/UPDATE policies on AI tables
-- 3. Insecure route sharing
-- 4. Missing RLS on settings_audit
--
-- IMPORTANT: Run this migration in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. FIX CRITICAL: Overly Permissive INSERT on audit_logs
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop the insecure policy
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;

-- Create secure policy: users can only insert their own audit logs
CREATE POLICY "audit_logs_insert_secure"
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    -- User can only insert their own audit logs
    user_id = auth.uid()
    OR
    -- Service role bypass for server-side operations
    auth.role() = 'service_role'
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. FIX CRITICAL: Overly Permissive INSERT on ai_training_signals
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop the insecure policy
DROP POLICY IF EXISTS "training_signals_insert" ON public.ai_training_signals;

-- Create secure policy: users can only insert their own training signals
CREATE POLICY "training_signals_insert_secure"
  ON public.ai_training_signals FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR
    auth.role() = 'service_role'
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. FIX HIGH: Add missing DELETE policy on chat_messages
-- ═══════════════════════════════════════════════════════════════════════════════

-- Users can delete messages in their own chat sessions
CREATE POLICY IF NOT EXISTS "Users can delete own chat messages"
  ON chat_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions 
      WHERE chat_sessions.id = chat_messages.session_id 
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. FIX HIGH: Improve route sharing security
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can read own and shared routes" ON public.routes;

-- Create improved policy with share token validation
CREATE POLICY "Users can read own and explicitly shared routes"
  ON public.routes FOR SELECT
  USING (
    -- User owns the route
    auth.uid() = user_id
    OR
    -- Route is explicitly shared with valid share token (for future implementation)
    (is_shared = true AND is_private = false AND share_token IS NOT NULL)
    OR
    -- Service role can access all
    auth.role() = 'service_role'
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. FIX MEDIUM: Enable RLS on settings_audit
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE public.settings_audit ENABLE ROW LEVEL SECURITY;

-- Users can read their own settings audit
CREATE POLICY "Users can read own settings audit"
  ON public.settings_audit FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    auth.role() = 'service_role'
  );

-- Only service role can insert/modify (these are system-generated)
CREATE POLICY "Service role manages settings audit"
  ON public.settings_audit FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Add comprehensive CRUD policies to AI tables
-- ═══════════════════════════════════════════════════════════════════════════════

-- ai_user_state
CREATE POLICY IF NOT EXISTS "Users can insert own ai_user_state"
  ON public.ai_user_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own ai_user_state"
  ON public.ai_user_state FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ai_actions
CREATE POLICY IF NOT EXISTS "Users can insert own ai_actions"
  ON public.ai_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own ai_actions"
  ON public.ai_actions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own ai_actions"
  ON public.ai_actions FOR DELETE
  USING (auth.uid() = user_id);

-- ai_agent_tasks
CREATE POLICY IF NOT EXISTS "Users can insert own ai_agent_tasks"
  ON public.ai_agent_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own ai_agent_tasks"
  ON public.ai_agent_tasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own ai_agent_tasks"
  ON public.ai_agent_tasks FOR DELETE
  USING (auth.uid() = user_id);

-- ai_agent_outputs
CREATE POLICY IF NOT EXISTS "Users can insert own ai_agent_outputs"
  ON public.ai_agent_outputs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY IF NOT EXISTS "Users can update own ai_agent_outputs"
  ON public.ai_agent_outputs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own ai_agent_outputs"
  ON public.ai_agent_outputs FOR DELETE
  USING (auth.uid() = user_id);

-- ai_coaching_summaries
CREATE POLICY IF NOT EXISTS "Users can insert own ai_coaching_summaries"
  ON public.ai_coaching_summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own ai_coaching_summaries"
  ON public.ai_coaching_summaries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own ai_coaching_summaries"
  ON public.ai_coaching_summaries FOR DELETE
  USING (auth.uid() = user_id);

-- ai_memory
CREATE POLICY IF NOT EXISTS "Users can insert own ai_memory"
  ON public.ai_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own ai_memory"
  ON public.ai_memory FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own ai_memory"
  ON public.ai_memory FOR DELETE
  USING (auth.uid() = user_id);

-- ai_plans
CREATE POLICY IF NOT EXISTS "Users can insert own ai_plans"
  ON public.ai_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own ai_plans"
  ON public.ai_plans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own ai_plans"
  ON public.ai_plans FOR DELETE
  USING (auth.uid() = user_id);

-- ai_conversations
CREATE POLICY IF NOT EXISTS "Users can insert own ai_conversations"
  ON public.ai_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own ai_conversations"
  ON public.ai_conversations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own ai_conversations"
  ON public.ai_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- ai_messages
CREATE POLICY IF NOT EXISTS "Users can insert own ai_messages"
  ON public.ai_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY IF NOT EXISTS "Users can delete own ai_messages"
  ON public.ai_messages FOR DELETE
  USING (auth.uid() = user_id);

-- ai_embeddings
CREATE POLICY IF NOT EXISTS "Users can insert own ai_embeddings"
  ON public.ai_embeddings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own ai_embeddings"
  ON public.ai_embeddings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own ai_embeddings"
  ON public.ai_embeddings FOR DELETE
  USING (auth.uid() = user_id);

-- notifications
CREATE POLICY IF NOT EXISTS "Users can insert own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Add column for route sharing improvement
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add is_private column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'routes' 
    AND column_name = 'is_private'
  ) THEN
    ALTER TABLE public.routes ADD COLUMN is_private BOOLEAN DEFAULT true;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. Add global food visibility flag
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add is_global column to foods if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'foods' 
    AND column_name = 'is_global'
  ) THEN
    ALTER TABLE public.foods ADD COLUMN is_global BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Update the foods SELECT policy
DROP POLICY IF EXISTS "Users can read own and global foods" ON public.foods;

CREATE POLICY "Users can read own and verified global foods"
  ON public.foods FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    (user_id IS NULL AND is_global = true AND status = 'active')
    OR
    auth.role() = 'service_role'
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. STORAGE BUCKET POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure storage buckets exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('avatars', 'avatars', false),
  ('progress-photos', 'progress-photos', false),
  ('food-photos', 'food-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
CREATE POLICY IF NOT EXISTS "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "Users can read own avatar"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for progress-photos
CREATE POLICY IF NOT EXISTS "Users can upload own progress photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'progress-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "Users can read own progress photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'progress-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "Users can delete own progress photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'progress-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for food-photos
CREATE POLICY IF NOT EXISTS "Users can upload own food photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'food-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "Users can read own food photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'food-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "Users can delete own food photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'food-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. VERIFICATION QUERIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- After running this migration, verify policies are in place:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd 
-- FROM pg_policies 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename, policyname;

-- Check RLS is enabled:
-- SELECT schemaname, tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' AND rowsecurity = true;
