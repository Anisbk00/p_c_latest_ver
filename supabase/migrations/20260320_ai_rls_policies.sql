-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS Policies for AI Tables
-- Created: 2026-03-20
-- Purpose: Add missing RLS policies for AI-related tables to prevent cross-user
--          data access
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE ai_user_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_user_state ON ai_user_state USING (auth.uid() = user_id);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_insights ON ai_insights USING (auth.uid() = user_id);

ALTER TABLE ai_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_actions ON ai_actions USING (auth.uid() = user_id);

ALTER TABLE ai_agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_agent_tasks ON ai_agent_tasks USING (auth.uid() = user_id);

ALTER TABLE ai_agent_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_agent_outputs ON ai_agent_outputs USING (auth.uid() = user_id);

ALTER TABLE ai_coaching_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_coaching_summaries ON ai_coaching_summaries USING (auth.uid() = user_id);

ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_memory ON ai_memory USING (auth.uid() = user_id);

ALTER TABLE ai_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_plans ON ai_plans USING (auth.uid() = user_id);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_conversations ON ai_conversations USING (auth.uid() = user_id);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_messages ON ai_messages USING (auth.uid() = user_id);

ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_ai_embeddings ON ai_embeddings USING (auth.uid() = user_id);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_notifications ON notifications USING (auth.uid() = user_id);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_access_own_chat_sessions ON chat_sessions USING (auth.uid() = user_id);

-- Removing RLS policies for chat_messages as it does not have a user_id column
