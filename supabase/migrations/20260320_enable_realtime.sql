-- ═══════════════════════════════════════════════════════════════════════════════
-- Enable Realtime Publication for Tables
-- Created: 2026-03-20
-- Purpose: Enable Supabase Realtime for tables that need live updates
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE food_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE workouts;
ALTER PUBLICATION supabase_realtime ADD TABLE body_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE goals;
ALTER PUBLICATION supabase_realtime ADD TABLE sleep_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE supplement_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_insights;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_agent_outputs;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_agent_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_body_predictions;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_coaching_state;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_coaching_summaries;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_embeddings;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_energy_balance;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_experiments;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_feature_store;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_feedback;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_generated_workouts;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_memory;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_metabolic_profile;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_training_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;

ALTER TABLE food_logs REPLICA IDENTITY FULL;
ALTER TABLE workouts REPLICA IDENTITY FULL;
ALTER TABLE body_metrics REPLICA IDENTITY FULL;
ALTER TABLE goals REPLICA IDENTITY FULL;
ALTER TABLE user_settings REPLICA IDENTITY FULL;
ALTER TABLE ai_insights REPLICA IDENTITY FULL;
ALTER TABLE ai_actions REPLICA IDENTITY FULL;
ALTER TABLE ai_agent_outputs REPLICA IDENTITY FULL;
ALTER TABLE ai_agent_tasks REPLICA IDENTITY FULL;
ALTER TABLE ai_body_predictions REPLICA IDENTITY FULL;
ALTER TABLE ai_coaching_state REPLICA IDENTITY FULL;
ALTER TABLE ai_coaching_summaries REPLICA IDENTITY FULL;
ALTER TABLE ai_conversations REPLICA IDENTITY FULL;
ALTER TABLE ai_embeddings REPLICA IDENTITY FULL;
ALTER TABLE ai_energy_balance REPLICA IDENTITY FULL;
ALTER TABLE ai_experiments REPLICA IDENTITY FULL;
ALTER TABLE ai_feature_store REPLICA IDENTITY FULL;
ALTER TABLE ai_feedback REPLICA IDENTITY FULL;
ALTER TABLE ai_generated_workouts REPLICA IDENTITY FULL;
ALTER TABLE ai_memory REPLICA IDENTITY FULL;
ALTER TABLE ai_messages REPLICA IDENTITY FULL;
ALTER TABLE ai_metabolic_profile REPLICA IDENTITY FULL;
ALTER TABLE ai_plans REPLICA IDENTITY FULL;
ALTER TABLE ai_training_signals REPLICA IDENTITY FULL;
ALTER TABLE audit_logs REPLICA IDENTITY FULL;
