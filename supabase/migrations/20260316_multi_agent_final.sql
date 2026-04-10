-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Multi-Agent System — Schema-Accurate Version
-- Date: 2026-03-16
--
-- Written against the ACTUAL live schema (verified from Supabase dashboard).
-- Every ALTER TABLE, INSERT, and function uses real column names.
-- All changes are idempotent (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Extend ai_agents (already exists, add new columns) ─────────────────
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS agent_type   text    DEFAULT 'analysis',
  ADD COLUMN IF NOT EXISTS priority     integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz DEFAULT now();

-- Seed five core agents — ON CONFLICT (agent_name) works because UNIQUE exists
INSERT INTO public.ai_agents (agent_name, description, model, temperature, max_tokens, active, agent_type, priority)
VALUES
  ('nutrition_agent', 'Analyses food logs, macro adherence, and caloric balance.',   'cloud_model', 0.3, 1500, true, 'analysis', 10),
  ('training_agent',  'Reviews workout history, volume, intensity, and progression.', 'cloud_model', 0.3, 1500, true, 'analysis', 20),
  ('recovery_agent',  'Monitors sleep quality, fatigue, and recovery metrics.',       'cloud_model', 0.2, 1000, true, 'analysis', 5),
  ('behavior_agent',  'Tracks habit adherence, engagement, and motivational signals.','cloud_model', 0.4, 1200, true, 'analysis', 30),
  ('progress_agent',  'Evaluates goal progression, weight trends, and milestones.',   'cloud_model', 0.3, 1200, true, 'analysis', 25)
ON CONFLICT (agent_name) DO UPDATE
  SET description = EXCLUDED.description,
      agent_type  = EXCLUDED.agent_type,
      priority    = EXCLUDED.priority,
      updated_at  = now();

-- ── 2. Extend ai_agent_tasks (already exists) ─────────────────────────────
ALTER TABLE public.ai_agent_tasks
  ADD COLUMN IF NOT EXISTS action_id       uuid,
  ADD COLUMN IF NOT EXISTS locale          text    DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS reasoning_layer text    DEFAULT 'cloud',
  ADD COLUMN IF NOT EXISTS started_at     timestamptz,
  ADD COLUMN IF NOT EXISTS error_message  text,
  ADD COLUMN IF NOT EXISTS retry_count    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_agent_tasks_status_priority
  ON public.ai_agent_tasks (status, priority DESC)
  WHERE status = 'pending';

-- ── 3. Extend ai_user_state (already exists, user_id IS the PK) ───────────
-- Live schema: user_id PK, fitness_level, weight_trend (numeric), adherence_score,
--              recovery_score, fatigue_score, engagement_score,
--              last_event, last_coach_action, updated_at
ALTER TABLE public.ai_user_state
  ADD COLUMN IF NOT EXISTS momentum_score      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS readiness_score     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calorie_trend       text    DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS training_trend      text    DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS weight_trend_label  text    DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS features            jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS intervention_needed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS intervention_reason text,
  ADD COLUMN IF NOT EXISTS next_action_due_at  timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locale              text    DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS units               text    DEFAULT 'metric',
  ADD COLUMN IF NOT EXISTS computed_at         timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_user_state_next_action
  ON public.ai_user_state (next_action_due_at);

-- ── 4. Extend ai_decision_rules (already exists) ──────────────────────────
-- Live schema: id, rule_name, description, condition(jsonb), action(jsonb),
--              priority, active, created_at
-- The condition column is jsonb — we store {"field":"fatigue_score","op":"gt","value":80}
-- No UNIQUE on rule_name in live schema — use condition column for rule logic
ALTER TABLE public.ai_decision_rules
  ADD COLUMN IF NOT EXISTS locale_filter text[]      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();

-- Seed rules using live schema column names (condition jsonb, action jsonb)
INSERT INTO public.ai_decision_rules (rule_name, description, condition, action, priority)
VALUES
  ('high_fatigue_alert',
   'Recovery intervention when fatigue is critically high',
   '{"field":"fatigue_score","op":"gt","value":80}'::jsonb,
   '{"type":"run_agent_analysis","agent":"recovery_agent","urgency":"high"}'::jsonb,
   10),
  ('low_engagement_nudge',
   'Motivational nudge when engagement drops below threshold',
   '{"field":"engagement_score","op":"lt","value":30}'::jsonb,
   '{"type":"ask_question","template":"engagement_check_in"}'::jsonb,
   20),
  ('low_adherence_alert',
   'Nutrition review when adherence score is very low',
   '{"field":"adherence_score","op":"lt","value":25}'::jsonb,
   '{"type":"generate_insight","agent":"nutrition_agent","focus":"meal_logging"}'::jsonb,
   30),
  ('low_momentum_plateau',
   'Progress review when momentum drops critically',
   '{"field":"momentum_score","op":"lt","value":20}'::jsonb,
   '{"type":"run_agent_analysis","agent":"progress_agent","focus":"plateau_intervention"}'::jsonb,
   15),
  ('high_readiness_push',
   'Increase training intensity when readiness is peak',
   '{"field":"readiness_score","op":"gt","value":85}'::jsonb,
   '{"type":"run_agent_analysis","agent":"training_agent","focus":"intensity_increase"}'::jsonb,
   40)
ON CONFLICT DO NOTHING;

-- ── 5. Extend ai_actions (already exists) ─────────────────────────────────
-- Live schema: id, user_id, action_type, priority, payload, status,
--              cooldown_hours, scheduled_at, executed_at, created_at
ALTER TABLE public.ai_actions
  ADD COLUMN IF NOT EXISTS triggered_by   text        DEFAULT 'decision_engine',
  ADD COLUMN IF NOT EXISTS rule_id        uuid,
  ADD COLUMN IF NOT EXISTS locale         text        DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS reasoning_layer text       DEFAULT 'cloud',
  ADD COLUMN IF NOT EXISTS agent_name     text,
  ADD COLUMN IF NOT EXISTS dispatched_at  timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS error_message  text;

CREATE INDEX IF NOT EXISTS idx_ai_actions_pending
  ON public.ai_actions (status, priority DESC, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_actions_user
  ON public.ai_actions (user_id, created_at DESC);

-- ── 6. Extend ai_action_outcomes (already exists) ─────────────────────────
-- Live schema: id, action_id, outcome(text), user_response(jsonb), recorded_at
ALTER TABLE public.ai_action_outcomes
  ADD COLUMN IF NOT EXISTS user_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS outcome_type  text DEFAULT 'analysis_complete',
  ADD COLUMN IF NOT EXISTS result_id     uuid,
  ADD COLUMN IF NOT EXISTS result_table  text,
  ADD COLUMN IF NOT EXISTS result_data   jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_action_outcomes_action
  ON public.ai_action_outcomes (action_id);

-- ── 7. Extend ai_agent_outputs (already exists) ───────────────────────────
-- Live schema: id, user_id, agent_id(FK→ai_agents), output_type,
--              confidence, content(jsonb), created_at
-- agent_id is UUID FK — NOT agent_name text
ALTER TABLE public.ai_agent_outputs
  ADD COLUMN IF NOT EXISTS task_id                   uuid,
  ADD COLUMN IF NOT EXISTS action_id                 uuid,
  ADD COLUMN IF NOT EXISTS reasoning                 text,
  ADD COLUMN IF NOT EXISTS reasoning_layer           text    DEFAULT 'cloud',
  ADD COLUMN IF NOT EXISTS related_insight_id        uuid    REFERENCES public.ai_insights(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_recommendation_id uuid    REFERENCES public.ai_recommendations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_plan_id           uuid    REFERENCES public.ai_plans(id)           ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coordinator_processed     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS coordinator_priority      integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS locale                    text    DEFAULT 'en';

CREATE INDEX IF NOT EXISTS idx_ai_agent_outputs_user
  ON public.ai_agent_outputs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_outputs_unprocessed
  ON public.ai_agent_outputs (coordinator_processed, created_at)
  WHERE coordinator_processed = false;

-- ── 8. Extend ai_coaching_summaries (already exists) ──────────────────────
-- Live schema: id, user_id, nutrition_summary, training_summary,
--              recovery_summary, final_recommendation, created_at
ALTER TABLE public.ai_coaching_summaries
  ADD COLUMN IF NOT EXISTS source_output_ids  uuid[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS agents_involved    text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS summary_content    jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_focus      text,
  ADD COLUMN IF NOT EXISTS conflict_count     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overall_confidence numeric DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS delivered          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivered_at       timestamptz,
  ADD COLUMN IF NOT EXISTS locale             text    DEFAULT 'en';

CREATE INDEX IF NOT EXISTS idx_ai_coaching_summaries_user
  ON public.ai_coaching_summaries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_coaching_summaries_undelivered
  ON public.ai_coaching_summaries (delivered, created_at)
  WHERE delivered = false;

-- ── 9. Extend ai_cohort_metrics (already exists) ──────────────────────────
-- Live schema: id, cohort_key, metric_name, metric_value, sample_size, calculated_at
-- Add aggregate columns alongside existing ones
ALTER TABLE public.ai_cohort_metrics
  ADD COLUMN IF NOT EXISTS metric_date      date    DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS avg_engagement   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_fatigue      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_adherence    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_momentum     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_users     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata         jsonb   DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_cohort_metrics_key_date
  ON public.ai_cohort_metrics (cohort_key, metric_date DESC);

-- ── 10. Extend user_events (already exists) ───────────────────────────────
-- Live schema: id, user_id, event_type, source_table, source_id,
--              event_data, occurred_at, created_at
-- Note: live uses source_table/source_id (not entity_type/entity_id)
--       and occurred_at (not processed/processed_at)
ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS processed    boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_events_user_occurred
  ON public.user_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_type
  ON public.user_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_unprocessed
  ON public.user_events (processed, occurred_at)
  WHERE processed = false;

-- ── 11. ai_worker_logs (new table — create fresh) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_worker_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name     text        NOT NULL,
  run_id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  status          text        NOT NULL DEFAULT 'started'
    CHECK (status IN ('started','completed','failed','partial')),
  users_processed integer     DEFAULT 0,
  tasks_processed integer     DEFAULT 0,
  errors          integer     DEFAULT 0,
  duration_ms     integer,
  batch_size      integer     DEFAULT 100,
  metadata        jsonb       DEFAULT '{}'::jsonb,
  error_details   jsonb       DEFAULT '{}'::jsonb,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);
ALTER TABLE public.ai_worker_logs
  ADD COLUMN IF NOT EXISTS worker_name     text        DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS run_id          uuid        DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS status          text        DEFAULT 'started',
  ADD COLUMN IF NOT EXISTS users_processed integer     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_processed integer     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors          integer     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms     integer,
  ADD COLUMN IF NOT EXISTS batch_size      integer     DEFAULT 100,
  ADD COLUMN IF NOT EXISTS metadata        jsonb       DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_details   jsonb       DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at      timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at    timestamptz;

CREATE INDEX IF NOT EXISTS idx_ai_worker_logs_worker_started
  ON public.ai_worker_logs (worker_name, started_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- EVENT STREAM TRIGGER
-- Uses actual live user_events columns:
--   source_table, source_id, event_data, occurred_at
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_user_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event_type text;
  v_event_data jsonb;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'food_logs' THEN
      v_event_type := 'food_logged';
      v_event_data := jsonb_build_object(
        'food_name', NEW.food_name, 'meal_type', NEW.meal_type,
        'calories',  NEW.calories,  'protein',   NEW.protein
      );
    WHEN 'workouts' THEN
      v_event_type := 'workout_logged';
      v_event_data := jsonb_build_object(
        'activity_type',    NEW.activity_type,
        'duration_minutes', NEW.duration_minutes,
        'calories_burned',  NEW.calories_burned
      );
    WHEN 'sleep_logs' THEN
      v_event_type := 'sleep_logged';
      v_event_data := jsonb_build_object(
        'duration_minutes', NEW.duration_minutes,
        'sleep_score',      NEW.sleep_score
      );
    WHEN 'body_metrics' THEN
      v_event_type := 'metric_logged';
      v_event_data := jsonb_build_object(
        'metric_type', NEW.metric_type,
        'value',       NEW.value,
        'unit',        NEW.unit
      );
    WHEN 'goals' THEN
      v_event_type := CASE TG_OP WHEN 'INSERT' THEN 'goal_created' ELSE 'goal_updated' END;
      v_event_data := jsonb_build_object(
        'goal_type', NEW.goal_type, 'status', NEW.status
      );
    WHEN 'supplement_logs' THEN
      v_event_type := 'supplement_logged';
      v_event_data := jsonb_build_object(
        'supplement_name', NEW.supplement_name, 'quantity', NEW.quantity
      );
    ELSE
      v_event_type := TG_TABLE_NAME || '_' || lower(TG_OP);
      v_event_data := '{}'::jsonb;
  END CASE;

  -- Use actual live column names: source_table, source_id, occurred_at
  INSERT INTO public.user_events (
    user_id, event_type, source_table, source_id, event_data, occurred_at
  ) VALUES (
    NEW.user_id, v_event_type, TG_TABLE_NAME, NEW.id, v_event_data, now()
  );

  -- Update ai_user_state.next_action_due_at to trigger processing
  -- ai_user_state uses user_id as PK (not a separate id column)
  UPDATE public.ai_user_state
  SET next_action_due_at = LEAST(
        COALESCE(next_action_due_at, now() + interval '5 minutes'),
        now() + interval '5 minutes'
      )
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Attach triggers (idempotent)
DROP TRIGGER IF EXISTS trg_food_log_event    ON public.food_logs;
DROP TRIGGER IF EXISTS trg_workout_event     ON public.workouts;
DROP TRIGGER IF EXISTS trg_sleep_event       ON public.sleep_logs;
DROP TRIGGER IF EXISTS trg_body_metric_event ON public.body_metrics;
DROP TRIGGER IF EXISTS trg_goal_event        ON public.goals;
DROP TRIGGER IF EXISTS trg_supplement_event  ON public.supplement_logs;

CREATE TRIGGER trg_food_log_event
  AFTER INSERT ON public.food_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_user_event();

CREATE TRIGGER trg_workout_event
  AFTER INSERT ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.log_user_event();

CREATE TRIGGER trg_sleep_event
  AFTER INSERT ON public.sleep_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_user_event();

CREATE TRIGGER trg_body_metric_event
  AFTER INSERT ON public.body_metrics
  FOR EACH ROW EXECUTE FUNCTION public.log_user_event();

CREATE TRIGGER trg_goal_event
  AFTER INSERT OR UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.log_user_event();

CREATE TRIGGER trg_supplement_event
  AFTER INSERT ON public.supplement_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_user_event();

-- ═══════════════════════════════════════════════════════════════════════════
-- FEATURE PIPELINE — compute_user_state
-- Uses actual live ai_user_state columns (user_id is the PK)
-- Adds new columns via the ALTER TABLE block above
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_user_state(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_workouts_7d      integer := 0;
  v_food_days_7d     integer := 0;
  v_avg_calories_7d  numeric := 0;
  v_avg_protein_7d   numeric := 0;
  v_sleep_hours_7d   numeric := 0;
  v_latest_weight    numeric;
  v_prev_weight      numeric;
  v_weight_delta     numeric;
  v_weight_label     text    := 'stable';
  v_events_7d        integer := 0;
  v_events_14d       integer := 0;
  v_pos_signals      integer := 0;
  v_neg_signals      integer := 0;
  v_engagement       numeric;
  v_fatigue          numeric;
  v_adherence        numeric;
  v_momentum         numeric;
  v_readiness        numeric;
  v_calorie_trend    text    := 'at_target';
  v_training_trend   text    := 'stable';
  v_intervention     boolean := false;
  v_reason           text;
  v_locale           text    := 'en';
  v_units            text    := 'metric';
  v_goal             text;
BEGIN
  SELECT COALESCE(language,'en'), COALESCE(units,'metric')
  INTO v_locale, v_units
  FROM public.user_settings WHERE user_id = p_user_id;

  SELECT goal_type INTO v_goal
  FROM public.goals WHERE user_id = p_user_id
  ORDER BY updated_at DESC LIMIT 1;

  SELECT COALESCE(count(*), 0) INTO v_workouts_7d
  FROM public.workouts
  WHERE user_id = p_user_id AND started_at >= now() - interval '7 days';

  SELECT
    COALESCE(count(DISTINCT logged_at::date), 0),
    COALESCE(avg(calories), 0),
    COALESCE(avg(protein),  0)
  INTO v_food_days_7d, v_avg_calories_7d, v_avg_protein_7d
  FROM public.food_logs
  WHERE user_id = p_user_id AND logged_at >= now() - interval '7 days';

  SELECT COALESCE(avg(duration_minutes) / 60.0, 0)
  INTO v_sleep_hours_7d
  FROM public.sleep_logs
  WHERE user_id = p_user_id AND date >= (now() - interval '7 days')::date;

  SELECT value INTO v_latest_weight
  FROM public.body_metrics
  WHERE user_id = p_user_id AND metric_type = 'weight'
  ORDER BY captured_at DESC LIMIT 1;

  SELECT value INTO v_prev_weight
  FROM public.body_metrics
  WHERE user_id = p_user_id AND metric_type = 'weight'
    AND captured_at < now() - interval '7 days'
  ORDER BY captured_at DESC LIMIT 1;

  IF v_latest_weight IS NOT NULL AND v_prev_weight IS NOT NULL THEN
    v_weight_delta := v_latest_weight - v_prev_weight;
    IF    v_weight_delta <= -2.0 THEN v_weight_label := 'losing_fast';
    ELSIF v_weight_delta <= -0.5 THEN v_weight_label := 'losing';
    ELSIF v_weight_delta >=  2.0 THEN v_weight_label := 'gaining_fast';
    ELSIF v_weight_delta >=  0.5 THEN v_weight_label := 'gaining';
    END IF;
  END IF;

  -- Use actual live column: occurred_at
  SELECT COALESCE(count(*), 0) INTO v_events_7d
  FROM public.user_events
  WHERE user_id = p_user_id AND occurred_at >= now() - interval '7 days';

  SELECT COALESCE(count(*), 0) INTO v_events_14d
  FROM public.user_events
  WHERE user_id = p_user_id
    AND occurred_at >= now() - interval '14 days'
    AND occurred_at <  now() - interval '7 days';

  SELECT
    COALESCE(count(*) FILTER (WHERE signal_type IN ('workout_completed','food_logged','feedback_positive','weight_logged')), 0),
    COALESCE(count(*) FILTER (WHERE signal_type IN ('feedback_negative','plan_dismissed')), 0)
  INTO v_pos_signals, v_neg_signals
  FROM public.ai_training_signals
  WHERE user_id = p_user_id AND created_at >= now() - interval '14 days';

  -- Score computation
  v_engagement := LEAST(100, GREATEST(0,
    (v_events_7d * 3.0) + (v_events_14d * 1.0) +
    (v_workouts_7d * 10.0) + (v_food_days_7d * 8.0) +
    (v_pos_signals * 2.0) - (v_neg_signals * 5.0)
  ));

  v_fatigue := LEAST(100, GREATEST(0,
    (v_workouts_7d * 12.0) -
    (COALESCE(v_sleep_hours_7d, 7.0) * 5.0) +
    (v_neg_signals * 8.0)
  ));

  v_adherence := LEAST(100, GREATEST(0,
    (v_food_days_7d / 7.0 * 50.0) +
    (LEAST(v_workouts_7d, 5) / 5.0 * 50.0)
  ));

  v_momentum := LEAST(100, GREATEST(0,
    v_engagement * 0.3 + v_adherence * 0.4 +
    v_pos_signals * 3.0 - v_neg_signals * 5.0
  ));

  v_readiness := LEAST(100, GREATEST(0,
    LEAST(COALESCE(v_sleep_hours_7d, 7.0), 9.0) * 8.0 -
    v_fatigue * 0.3 + v_adherence * 0.2
  ));

  IF    v_avg_calories_7d < 1700  THEN v_calorie_trend := 'under';
  ELSIF v_avg_calories_7d < 2300  THEN v_calorie_trend := 'at_target';
  ELSIF v_avg_calories_7d < 2700  THEN v_calorie_trend := 'over';
  ELSE                                 v_calorie_trend := 'highly_over';
  END IF;

  IF    v_workouts_7d = 0  THEN v_training_trend := 'declining';
  ELSIF v_workouts_7d <= 2 THEN v_training_trend := 'stable';
  ELSIF v_workouts_7d <= 4 THEN v_training_trend := 'improving';
  ELSE                          v_training_trend := 'peaking';
  END IF;

  IF    v_fatigue > 80                       THEN v_intervention := true; v_reason := 'high_fatigue';
  ELSIF v_engagement < 20                    THEN v_intervention := true; v_reason := 'low_engagement';
  ELSIF v_food_days_7d = 0 AND v_workouts_7d = 0 THEN v_intervention := true; v_reason := 'inactive_user';
  END IF;

  -- Upsert using actual live PK (user_id is the primary key)
  INSERT INTO public.ai_user_state (
    user_id,
    -- original live columns
    engagement_score, fatigue_score, adherence_score, recovery_score,
    weight_trend, last_event, last_coach_action, updated_at,
    -- new extended columns
    momentum_score, readiness_score, calorie_trend, training_trend,
    weight_trend_label, features, intervention_needed, intervention_reason,
    next_action_due_at, locale, units, computed_at
  ) VALUES (
    p_user_id,
    round(v_engagement, 1), round(v_fatigue, 1), round(v_adherence, 1), round(v_readiness, 1),
    COALESCE(v_weight_delta, 0), now(), now(), now(),
    round(v_momentum, 1), round(v_readiness, 1), v_calorie_trend, v_training_trend,
    v_weight_label,
    jsonb_build_object(
      'workouts_this_week',     v_workouts_7d,
      'food_days_this_week',    v_food_days_7d,
      'avg_calories_daily',     round(v_avg_calories_7d, 0),
      'avg_protein_daily_g',    round(v_avg_protein_7d, 1),
      'avg_sleep_hours',        round(v_sleep_hours_7d, 1),
      'latest_weight_kg',       v_latest_weight,
      'meal_log_adherence_pct', round(v_food_days_7d / 7.0 * 100, 0),
      'positive_signals_14d',   v_pos_signals,
      'negative_signals_14d',   v_neg_signals,
      'primary_goal',           v_goal
    ),
    v_intervention, v_reason,
    now() + interval '6 hours',
    v_locale, v_units, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    engagement_score    = EXCLUDED.engagement_score,
    fatigue_score       = EXCLUDED.fatigue_score,
    adherence_score     = EXCLUDED.adherence_score,
    recovery_score      = EXCLUDED.recovery_score,
    weight_trend        = EXCLUDED.weight_trend,
    last_event          = EXCLUDED.last_event,
    updated_at          = now(),
    momentum_score      = EXCLUDED.momentum_score,
    readiness_score     = EXCLUDED.readiness_score,
    calorie_trend       = EXCLUDED.calorie_trend,
    training_trend      = EXCLUDED.training_trend,
    weight_trend_label  = EXCLUDED.weight_trend_label,
    features            = EXCLUDED.features,
    intervention_needed = EXCLUDED.intervention_needed,
    intervention_reason = EXCLUDED.intervention_reason,
    next_action_due_at  = EXCLUDED.next_action_due_at,
    locale              = EXCLUDED.locale,
    units               = EXCLUDED.units,
    computed_at         = now();

  -- Sync ai_coaching_state (backward compat)
  INSERT INTO public.ai_coaching_state (
    user_id, phase, current_focus, last_evaluation, metadata
  ) VALUES (
    p_user_id,
    CASE
      WHEN v_intervention        THEN 'intervention'
      WHEN v_momentum > 70       THEN 'momentum'
      WHEN v_adherence > 60      THEN 'building'
      ELSE 'onboarding'
    END,
    COALESCE(v_reason, v_goal, 'general_fitness'),
    now(),
    jsonb_build_object('engagement', v_engagement, 'fatigue', v_fatigue, 'adherence', v_adherence)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    phase           = EXCLUDED.phase,
    current_focus   = EXCLUDED.current_focus,
    last_evaluation = now(),
    metadata        = EXCLUDED.metadata;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DECISION ENGINE — uses live ai_decision_rules columns (condition jsonb)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.run_decision_engine(p_batch_size integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user        record;
  v_rule        record;
  v_count       integer := 0;
  v_run_id      uuid    := gen_random_uuid();
  v_field_val   numeric;
  v_matches     boolean;
  v_cond_field  text;
  v_cond_op     text;
  v_cond_val    numeric;
  v_act_type    text;
  v_act_agent   text;
BEGIN
  INSERT INTO public.ai_worker_logs (worker_name, run_id, status, batch_size)
  VALUES ('decision_engine', v_run_id, 'started', p_batch_size);

  FOR v_user IN
    SELECT * FROM public.ai_user_state
    WHERE next_action_due_at <= now()
    ORDER BY next_action_due_at ASC
    LIMIT p_batch_size
  LOOP
    PERFORM public.compute_user_state(v_user.user_id);
    SELECT * INTO v_user FROM public.ai_user_state WHERE user_id = v_user.user_id;

    -- Evaluate rules using condition jsonb: {"field":"...","op":"...","value":...}
    FOR v_rule IN
      SELECT * FROM public.ai_decision_rules
      WHERE active = true
      ORDER BY priority ASC
    LOOP
      v_cond_field := v_rule.condition->>'field';
      v_cond_op    := v_rule.condition->>'op';
      v_cond_val   := (v_rule.condition->>'value')::numeric;
      v_act_type   := v_rule.action->>'type';
      v_act_agent  := v_rule.action->>'agent';

      -- Safe named-field extraction from ai_user_state
      v_field_val := CASE v_cond_field
        WHEN 'engagement_score'  THEN v_user.engagement_score
        WHEN 'fatigue_score'     THEN v_user.fatigue_score
        WHEN 'adherence_score'   THEN v_user.adherence_score
        WHEN 'momentum_score'    THEN v_user.momentum_score
        WHEN 'readiness_score'   THEN v_user.readiness_score
        ELSE NULL
      END;

      CONTINUE WHEN v_field_val IS NULL OR v_cond_op IS NULL;

      v_matches := CASE v_cond_op
        WHEN 'gt'  THEN v_field_val >  v_cond_val
        WHEN 'lt'  THEN v_field_val <  v_cond_val
        WHEN 'gte' THEN v_field_val >= v_cond_val
        WHEN 'lte' THEN v_field_val <= v_cond_val
        WHEN 'eq'  THEN v_field_val =  v_cond_val
        ELSE false
      END;

      IF v_matches THEN
        -- Enqueue action using live ai_actions columns
        INSERT INTO public.ai_actions (
          user_id, action_type, priority, payload, status,
          scheduled_at, triggered_by, rule_id, locale, agent_name
        )
        SELECT
          v_user.user_id,
          COALESCE(v_act_type, 'run_agent_analysis'),
          v_rule.priority,
          v_rule.action || jsonb_build_object(
            'matched_field', v_cond_field,
            'matched_value', v_field_val
          ),
          'pending',
          now(),
          'rule_engine',
          v_rule.id,
          COALESCE(v_user.locale, 'en'),
          v_act_agent
        WHERE NOT EXISTS (
          SELECT 1 FROM public.ai_actions
          WHERE user_id    = v_user.user_id
            AND rule_id    = v_rule.id
            AND created_at > now() - interval '6 hours'
        );
      END IF;
    END LOOP;

    -- Scheduled general analysis if no rule fired
    IF NOT EXISTS (
      SELECT 1 FROM public.ai_actions
      WHERE user_id    = v_user.user_id
        AND status     = 'pending'
        AND created_at > now() - interval '6 hours'
    ) THEN
      INSERT INTO public.ai_actions (
        user_id, action_type, priority, payload, status,
        scheduled_at, triggered_by, locale
      ) VALUES (
        v_user.user_id, 'run_agent_analysis', 50,
        jsonb_build_object(
          'agents',             ARRAY['nutrition_agent','training_agent','progress_agent'],
          'engagement_score',   v_user.engagement_score,
          'fatigue_score',      v_user.fatigue_score,
          'intervention_needed', v_user.intervention_needed
        ),
        'pending', now(), 'scheduler', COALESCE(v_user.locale, 'en')
      );
    END IF;

    UPDATE public.ai_user_state
    SET next_action_due_at = now() + interval '6 hours'
    WHERE user_id = v_user.user_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.ai_worker_logs
  SET status = 'completed', users_processed = v_count, completed_at = now(),
      duration_ms = extract(epoch from (now() - started_at))::integer * 1000
  WHERE run_id = v_run_id;

  RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ACTION DISPATCHER — uses live ai_actions columns
-- Uses agent_id FK (not agent_name) when inserting into ai_agent_tasks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dispatch_ai_actions(p_batch_size integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action  record;
  v_agent   record;
  v_count   integer := 0;
  v_run_id  uuid    := gen_random_uuid();
BEGIN
  INSERT INTO public.ai_worker_logs (worker_name, run_id, status, batch_size)
  VALUES ('action_dispatcher', v_run_id, 'started', p_batch_size);

  FOR v_action IN
    SELECT * FROM public.ai_actions
    WHERE status = 'pending'
      AND scheduled_at <= now()
    ORDER BY priority ASC, created_at ASC
    LIMIT p_batch_size
  LOOP
    -- Use executed_at as dispatch timestamp (live column name)
    UPDATE public.ai_actions
    SET status = 'dispatched', executed_at = now(), dispatched_at = now()
    WHERE id = v_action.id;

    FOR v_agent IN
      SELECT id, agent_name FROM public.ai_agents
      WHERE active = true
        AND (
          v_action.agent_name IS NULL
          OR agent_name = v_action.agent_name
          OR agent_name = ANY(
              ARRAY(SELECT jsonb_array_elements_text(
                COALESCE(v_action.payload->'agents', '[]'::jsonb)
              ))
            )
        )
      ORDER BY priority ASC
    LOOP
      INSERT INTO public.ai_agent_tasks (
        user_id, agent_id, task_type, input_data, status, priority,
        action_id, locale, reasoning_layer
      ) VALUES (
        v_action.user_id,
        v_agent.id,
        v_action.action_type,
        v_action.payload || jsonb_build_object('agent_name', v_agent.agent_name),
        'pending',
        v_action.priority,
        v_action.id,
        COALESCE(v_action.locale, 'en'),
        COALESCE(v_action.reasoning_layer, 'cloud')
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.ai_worker_logs
  SET status = 'completed', tasks_processed = v_count, completed_at = now(),
      duration_ms = extract(epoch from (now() - started_at))::integer * 1000
  WHERE run_id = v_run_id;

  RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- COORDINATOR — uses actual live ai_agent_outputs columns
-- agent_id FK is used (not agent_name text)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.run_coordinator(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_out         record;
  v_agent       record;
  v_summary_id  uuid;
  v_priority    integer[] := ARRAY[5, 20, 10, 25, 30]; -- recovery, training, nutrition, progress, behavior
  v_merged_en   text := '';
  v_merged_fr   text := '';
  v_merged_ar   text := '';
  v_output_ids  uuid[]  := '{}';
  v_agents_seen text[]  := '{}';
  v_confidence  numeric := 0;
  v_conf_count  integer := 0;
  v_primary     text;
  v_user_state  record;
BEGIN
  SELECT * INTO v_user_state FROM public.ai_user_state WHERE user_id = p_user_id;

  -- Collect unprocessed outputs; join to ai_agents to get agent_name
  FOR v_out IN
    SELECT o.*, a.agent_name, a.priority AS agent_priority
    FROM public.ai_agent_outputs o
    JOIN public.ai_agents a ON a.id = o.agent_id
    WHERE o.user_id = p_user_id
      AND o.coordinator_processed = false
      AND o.created_at > now() - interval '24 hours'
    ORDER BY a.priority ASC, o.confidence DESC
  LOOP
    IF v_primary IS NULL THEN v_primary := v_out.agent_name; END IF;

    v_agents_seen := v_agents_seen || ARRAY[v_out.agent_name];
    v_output_ids  := v_output_ids  || ARRAY[v_out.id];

    -- content is jsonb {en, fr, ar} in the new extended column
    IF COALESCE(v_out.content->>'en', '') != '' THEN
      v_merged_en := v_merged_en || E'\n\n' || v_out.agent_name || ': ' || (v_out.content->>'en');
    END IF;
    IF COALESCE(v_out.content->>'fr', '') != '' THEN
      v_merged_fr := v_merged_fr || E'\n\n' || v_out.agent_name || ': ' || (v_out.content->>'fr');
    END IF;
    IF COALESCE(v_out.content->>'ar', '') != '' THEN
      v_merged_ar := v_merged_ar || E'\n\n' || v_out.agent_name || ': ' || (v_out.content->>'ar');
    END IF;

    v_confidence := v_confidence + COALESCE(v_out.confidence, 0.8);
    v_conf_count := v_conf_count + 1;

    UPDATE public.ai_agent_outputs
    SET coordinator_processed = true, coordinator_priority = v_out.agent_priority
    WHERE id = v_out.id;
  END LOOP;

  IF v_conf_count = 0 THEN RETURN NULL; END IF;

  v_confidence := v_confidence / v_conf_count;

  -- Insert using live schema columns + new extended columns
  INSERT INTO public.ai_coaching_summaries (
    user_id,
    -- live columns
    final_recommendation,
    -- extended columns
    source_output_ids, agents_involved, summary_content,
    primary_focus, overall_confidence, locale
  ) VALUES (
    p_user_id,
    jsonb_build_object('primary_agent', v_primary, 'confidence', round(v_confidence, 3)),
    v_output_ids, v_agents_seen,
    jsonb_build_object(
      'en', trim(v_merged_en),
      'fr', trim(v_merged_fr),
      'ar', trim(v_merged_ar)
    ),
    v_primary, round(v_confidence, 3),
    COALESCE(v_user_state.locale, 'en')
  )
  RETURNING id INTO v_summary_id;

  RETURN v_summary_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- COHORT METRICS — uses live ai_cohort_metrics columns + extended ones
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_cohort_metrics()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Upsert per goal cohort
  -- live columns: cohort_key, metric_name, metric_value, sample_size
  -- extended: metric_date, avg_engagement, avg_adherence, avg_momentum, active_users
  INSERT INTO public.ai_cohort_metrics (
    cohort_key, metric_name, metric_value, sample_size,
    metric_date, avg_engagement, avg_adherence, avg_momentum, active_users
  )
  SELECT
    'goal:' || COALESCE(features->>'primary_goal', 'unknown'),
    'composite',
    round(avg(momentum_score), 1),
    count(*)::integer,
    current_date,
    round(avg(engagement_score), 1),
    round(avg(adherence_score),  1),
    round(avg(momentum_score),   1),
    count(*) FILTER (WHERE engagement_score > 40)::integer
  FROM public.ai_user_state
  GROUP BY features->>'primary_goal'
  ON CONFLICT DO NOTHING;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_worker_logs    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_events_own"        ON public.user_events;
DROP POLICY IF EXISTS "ai_worker_logs_service" ON public.ai_worker_logs;

CREATE POLICY "user_events_own"
  ON public.user_events FOR ALL
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

CREATE POLICY "ai_worker_logs_service"
  ON public.ai_worker_logs FOR ALL
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- pg_cron (if enabled)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('decision-engine-run');   EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('action-dispatcher-run'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('cohort-metrics-run');    EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('decision-engine-run',  '0 */6 * * *', 'SELECT public.run_decision_engine(100)');
    PERFORM cron.schedule('action-dispatcher-run','* * * * *',   'SELECT public.dispatch_ai_actions(50)');
    PERFORM cron.schedule('cohort-metrics-run',   '0 0 * * *',   'SELECT public.update_cohort_metrics()');
    RAISE NOTICE 'pg_cron jobs scheduled';
  ELSE
    RAISE NOTICE 'pg_cron not enabled — use external scheduler or Edge Functions';
  END IF;
END;
$$;
