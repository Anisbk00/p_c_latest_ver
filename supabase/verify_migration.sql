-- ═══════════════════════════════════════════════════════════════
-- MIGRATION VERIFICATION SCRIPT
-- Run in Supabase Dashboard → SQL Editor
-- Every statement should return at least 1 row or a ✅ result
-- ═══════════════════════════════════════════════════════════════

-- 1. Check all new tables exist
SELECT table_name, 'EXISTS' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'ai_user_state','ai_decision_rules','ai_actions','ai_action_outcomes',
    'ai_agent_outputs','ai_coaching_summaries','ai_cohort_metrics',
    'ai_worker_logs','user_events'
  )
ORDER BY table_name;
-- Expected: 9 rows

-- 2. Check 5 agents were seeded
SELECT agent_name, agent_type, priority, active
FROM public.ai_agents
ORDER BY priority;
-- Expected: 5 rows including nutrition/training/recovery/behavior/progress agents

-- 3. Check 5 decision rules were seeded
SELECT rule_name, condition->>'field' AS field,
       condition->>'op' AS op, condition->>'value' AS threshold,
       active
FROM public.ai_decision_rules
ORDER BY priority;
-- Expected: 5 rows with jsonb condition structure

-- 4. Check ai_user_state has new columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'ai_user_state'
  AND column_name IN ('momentum_score','readiness_score','next_action_due_at',
                      'locale','units','features','intervention_needed',
                      'weight_trend_label','calorie_trend','training_trend','computed_at')
ORDER BY column_name;
-- Expected: 11 rows

-- 5. Check ai_actions has new columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'ai_actions'
  AND column_name IN ('triggered_by','rule_id','locale','reasoning_layer',
                      'agent_name','dispatched_at','completed_at','error_message')
ORDER BY column_name;
-- Expected: 8 rows

-- 6. Check ai_agent_outputs has new columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'ai_agent_outputs'
  AND column_name IN ('coordinator_processed','coordinator_priority','reasoning_layer',
                      'related_insight_id','related_recommendation_id','related_plan_id',
                      'task_id','action_id','reasoning','locale')
ORDER BY column_name;
-- Expected: 10 rows

-- 7. Check user_events columns (source_table/source_id/occurred_at)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'user_events'
  AND column_name IN ('event_type','source_table','source_id','occurred_at','event_data')
ORDER BY column_name;
-- Expected: 5 rows

-- 8. Check all 6 event triggers are registered
SELECT trigger_name, event_object_table, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN ('trg_food_log_event','trg_workout_event','trg_sleep_event',
                       'trg_body_metric_event','trg_goal_event','trg_supplement_event')
ORDER BY event_object_table;
-- Expected: 6 rows

-- 9. Check all Postgres functions exist
SELECT proname AS function_name, prosrc IS NOT NULL AS has_body
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('compute_user_state','run_decision_engine','dispatch_ai_actions',
                  'run_coordinator','log_user_event','update_cohort_metrics')
ORDER BY proname;
-- Expected: 6 rows

-- 10. Test compute_user_state runs without error
-- (Use any real user_id from your profiles table)
-- SELECT public.compute_user_state('<your-user-id-here>');

-- 11. Test decision engine runs (returns count of users processed)
SELECT public.run_decision_engine(10);
-- Expected: a number (0 if no users have next_action_due_at in the past)

-- 12. Check ai_coaching_summaries extended columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'ai_coaching_summaries'
  AND column_name IN ('summary_content','agents_involved','overall_confidence',
                      'source_output_ids','primary_focus','delivered','locale')
ORDER BY column_name;
-- Expected: 7 rows

-- 13. Check ai_cohort_metrics extended columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'ai_cohort_metrics'
  AND column_name IN ('metric_date','avg_engagement','avg_fatigue',
                      'avg_adherence','avg_momentum','active_users','metadata')
ORDER BY column_name;
-- Expected: 7 rows

-- 14. Check ai_worker_logs table
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'ai_worker_logs'
  AND column_name IN ('worker_name','run_id','status','users_processed',
                      'tasks_processed','errors','duration_ms','batch_size')
ORDER BY column_name;
-- Expected: 8 rows

-- 15. Verify RLS is enabled on all new tables
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('user_events','ai_worker_logs','ai_user_state')
ORDER BY tablename;
-- Expected: 3 rows, all rls_enabled = true
