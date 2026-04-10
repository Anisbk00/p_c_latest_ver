-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Autonomous Multi-Agent AI Coaching System
-- Date: 2026-03-16
-- Strategy:
--   • Extend existing tables via ALTER TABLE ADD COLUMN IF NOT EXISTS
--   • Add new tables via CREATE TABLE IF NOT EXISTS
--   • Never drop, rename, or modify existing columns/constraints
--   • All changes idempotent — safe to run multiple times
-- ═══════════════════════════════════════════════════════════════════════════

-- ── STEP 1: Extend existing ai_agents with multi-agent fields ──────────────
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS agent_type      text    DEFAULT 'analysis',
  ADD COLUMN IF NOT EXISTS input_schema    jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS output_schema   jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS priority        integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

-- Seed the five core agents (idempotent via ON CONFLICT)
INSERT INTO public.ai_agents (agent_name, description, model, temperature, max_tokens, active, agent_type, priority)
VALUES
  ('nutrition_agent',  'Analyses food logs, macro adherence, and caloric balance. Generates meal optimisation recommendations.', 'cloud_model', 0.3, 1500, true, 'analysis', 10),
  ('training_agent',   'Reviews workout history, volume, intensity, and progression. Adjusts training plans adaptively.',          'cloud_model', 0.3, 1500, true, 'analysis', 20),
  ('recovery_agent',   'Monitors sleep quality, fatigue signals, and recovery metrics. Issues rest and de-load recommendations.',  'cloud_model', 0.2, 1000, true, 'analysis', 5),
  ('behavior_agent',   'Tracks habit adherence, engagement patterns, and motivational signals. Drives behavioural nudges.',        'cloud_model', 0.4, 1200, true, 'analysis', 30),
  ('progress_agent',   'Evaluates goal progression, weight trends, body composition changes, and milestone proximity.',            'cloud_model', 0.3, 1200, true, 'analysis', 25)
ON CONFLICT (agent_name) DO UPDATE
  SET description = EXCLUDED.description,
      agent_type  = EXCLUDED.agent_type,
      priority    = EXCLUDED.priority,
      updated_at  = now();

-- ── STEP 2: Extend existing ai_agent_tasks ────────────────────────────────
ALTER TABLE public.ai_agent_tasks
  ADD COLUMN IF NOT EXISTS action_id      uuid,
  ADD COLUMN IF NOT EXISTS locale         text    DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS reasoning_layer text   DEFAULT 'cloud'
    CHECK (reasoning_layer IN ('rule', 'embedding', 'small_model', 'cloud')),
  ADD COLUMN IF NOT EXISTS started_at     timestamptz,
  ADD COLUMN IF NOT EXISTS error_message  text,
  ADD COLUMN IF NOT EXISTS retry_count    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_agent_tasks_status_priority
  ON public.ai_agent_tasks (status, priority DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ai_agent_tasks_user_status
  ON public.ai_agent_tasks (user_id, status, created_at DESC);

-- ── STEP 3: user_events — Central Event Stream ────────────────────────────
-- Records every meaningful user action. The primary input to the feature pipeline.
-- Different from ai_training_signals: events are raw facts; signals are weighted derivatives.
CREATE TABLE IF NOT EXISTS public.user_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type    text        NOT NULL,
  entity_type   text,
  entity_id     uuid,
  event_data    jsonb       DEFAULT '{}'::jsonb,
  source        text        DEFAULT 'trigger',
  processed     boolean     DEFAULT false,
  processed_at  timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_events_user_created
  ON public.user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_type
  ON public.user_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_unprocessed
  ON public.user_events (processed, created_at)
  WHERE processed = false;

-- ── STEP 4: ai_user_state — Computed Feature Vector per User ──────────────
-- Stores the latest computed metrics from the feature pipeline.
-- Supplements ai_coaching_state (which stores qualitative phase).
CREATE TABLE IF NOT EXISTS public.ai_user_state (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid    NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Feature scores (0–100)
  engagement_score      numeric DEFAULT 0   CHECK (engagement_score BETWEEN 0 AND 100),
  fatigue_score         numeric DEFAULT 0   CHECK (fatigue_score     BETWEEN 0 AND 100),
  adherence_score       numeric DEFAULT 0   CHECK (adherence_score   BETWEEN 0 AND 100),
  momentum_score        numeric DEFAULT 0   CHECK (momentum_score    BETWEEN 0 AND 100),
  readiness_score       numeric DEFAULT 0   CHECK (readiness_score   BETWEEN 0 AND 100),

  -- Trend signals
  weight_trend          text    DEFAULT 'stable'
    CHECK (weight_trend IN ('losing_fast','losing','stable','gaining','gaining_fast')),
  calorie_trend         text    DEFAULT 'stable'
    CHECK (calorie_trend IN ('under','at_target','over','highly_over')),
  training_trend        text    DEFAULT 'stable'
    CHECK (training_trend IN ('declining','stable','improving','peaking')),

  -- Raw feature data (last computed values)
  features              jsonb   DEFAULT '{}'::jsonb,

  -- Decision state
  last_action_type      text,
  next_action_due_at    timestamptz DEFAULT now(),
  intervention_needed   boolean DEFAULT false,
  intervention_reason   text,

  -- Locale / units from settings
  locale                text    DEFAULT 'en',
  units                 text    DEFAULT 'metric',

  -- Timestamps
  computed_at           timestamptz DEFAULT now(),
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_user_state_intervention
  ON public.ai_user_state (intervention_needed, next_action_due_at)
  WHERE intervention_needed = true;

CREATE INDEX IF NOT EXISTS idx_ai_user_state_next_action
  ON public.ai_user_state (next_action_due_at)
  WHERE next_action_due_at <= now();

-- ── STEP 5: ai_decision_rules — Layer-1 Rules Engine ────────────────────
CREATE TABLE IF NOT EXISTS public.ai_decision_rules (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name       text    NOT NULL UNIQUE,
  description     text,
  condition_sql   text    NOT NULL,    -- SQL expression evaluated against ai_user_state
  action_type     text    NOT NULL,    -- what action to enqueue
  action_payload  jsonb   DEFAULT '{}'::jsonb,
  priority        integer DEFAULT 50,
  active          boolean DEFAULT true,
  locale_filter   text[],             -- null = applies to all locales
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_decision_rules_active
  ON public.ai_decision_rules (active, priority DESC)
  WHERE active = true;

-- Seed baseline rules (idempotent)
INSERT INTO public.ai_decision_rules (rule_name, description, condition_sql, action_type, action_payload, priority)
VALUES
  ('high_fatigue_alert',
   'Trigger recovery intervention when fatigue score is critically high',
   'fatigue_score > 80',
   'run_agent_analysis',
   '{"agent": "recovery_agent", "urgency": "high"}'::jsonb,
   10),
  ('low_engagement_nudge',
   'Send a motivational nudge when engagement drops below threshold',
   'engagement_score < 30',
   'ask_question',
   '{"template": "engagement_check_in"}'::jsonb,
   20),
  ('missed_meals_alert',
   'Trigger nutrition review when meal log adherence is very low',
   '(features->>''meal_log_adherence_pct'')::numeric < 30',
   'generate_insight',
   '{"agent": "nutrition_agent", "focus": "meal_logging"}'::jsonb,
   30),
  ('no_workout_week',
   'Trigger training plan review when no workouts logged in 7 days',
   '(features->>''workouts_this_week'')::numeric = 0',
   'run_agent_analysis',
   '{"agent": "training_agent", "focus": "re-engagement"}'::jsonb,
   25),
  ('goal_plateau',
   'Trigger progress review when momentum drops below 20 for 3+ days',
   'momentum_score < 20 AND training_trend = ''declining''',
   'run_agent_analysis',
   '{"agent": "progress_agent", "focus": "plateau_intervention"}'::jsonb,
   15)
ON CONFLICT (rule_name) DO UPDATE
  SET description    = EXCLUDED.description,
      condition_sql  = EXCLUDED.condition_sql,
      action_type    = EXCLUDED.action_type,
      action_payload = EXCLUDED.action_payload,
      priority       = EXCLUDED.priority,
      updated_at     = now();

-- ── STEP 6: ai_actions — Orchestration Queue ─────────────────────────────
-- Distinct from ai_planning_queue (which was a simpler queue).
-- This is the main decision engine output → agent dispatcher input.
CREATE TABLE IF NOT EXISTS public.ai_actions (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type     text    NOT NULL
    CHECK (action_type IN (
      'generate_insight','create_recommendation','update_plan',
      'ask_question','run_agent_analysis','send_nudge',
      'update_user_state','run_coordinator'
    )),
  triggered_by    text    NOT NULL DEFAULT 'decision_engine'
    CHECK (triggered_by IN ('decision_engine','rule_engine','user_event','scheduler','manual')),
  rule_id         uuid    REFERENCES public.ai_decision_rules(id),
  payload         jsonb   DEFAULT '{}'::jsonb,
  priority        integer DEFAULT 50,
  status          text    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','dispatched','processing','done','failed','skipped')),
  locale          text    DEFAULT 'en',
  reasoning_layer text    DEFAULT 'cloud'
    CHECK (reasoning_layer IN ('rule','embedding','small_model','cloud')),
  agent_name      text,
  scheduled_for   timestamptz DEFAULT now(),
  dispatched_at   timestamptz,
  completed_at    timestamptz,
  error_message   text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_pending
  ON public.ai_actions (status, priority DESC, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_actions_user
  ON public.ai_actions (user_id, created_at DESC);

-- ── STEP 7: ai_action_outcomes — Result Tracking ─────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_action_outcomes (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id        uuid    NOT NULL REFERENCES public.ai_actions(id) ON DELETE CASCADE,
  user_id          uuid    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outcome_type     text    NOT NULL
    CHECK (outcome_type IN ('insight_created','recommendation_created','plan_updated',
                            'question_asked','analysis_complete','nudge_sent','error')),
  result_id        uuid,
  result_table     text,
  result_data      jsonb   DEFAULT '{}'::jsonb,
  user_responded   boolean DEFAULT false,
  response_data    jsonb,
  responded_at     timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_outcomes_action
  ON public.ai_action_outcomes (action_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_outcomes_user
  ON public.ai_action_outcomes (user_id, created_at DESC);

-- ── STEP 8: ai_agent_outputs — Structured Per-Agent Results ──────────────
CREATE TABLE IF NOT EXISTS public.ai_agent_outputs (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             uuid    REFERENCES public.ai_agent_tasks(id) ON DELETE SET NULL,
  action_id           uuid    REFERENCES public.ai_actions(id) ON DELETE SET NULL,
  user_id             uuid    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_name          text    NOT NULL,
  output_type         text    NOT NULL
    CHECK (output_type IN ('analysis','recommendation','plan','insight','question','nudge')),

  -- Structured multilingual output
  content             jsonb   NOT NULL DEFAULT '{}'::jsonb,
    -- shape: { en: "...", fr: "...", ar: "..." }
  reasoning           text,
  confidence          numeric DEFAULT 0.8 CHECK (confidence BETWEEN 0 AND 1),
  reasoning_layer     text    DEFAULT 'cloud'
    CHECK (reasoning_layer IN ('rule','embedding','small_model','cloud')),

  -- References
  related_insight_id       uuid REFERENCES public.ai_insights(id) ON DELETE SET NULL,
  related_recommendation_id uuid REFERENCES public.ai_recommendations(id) ON DELETE SET NULL,
  related_plan_id          uuid REFERENCES public.ai_plans(id) ON DELETE SET NULL,

  -- Coordination metadata
  coordinator_processed    boolean DEFAULT false,
  coordinator_priority     integer DEFAULT 50,
  conflicts_with           uuid[],   -- other output ids this conflicts with
  resolved_by_coordinator  boolean DEFAULT false,

  locale      text DEFAULT 'en',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_outputs_user_agent
  ON public.ai_agent_outputs (user_id, agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_outputs_unprocessed
  ON public.ai_agent_outputs (coordinator_processed, created_at)
  WHERE coordinator_processed = false;
CREATE INDEX IF NOT EXISTS idx_ai_agent_outputs_action
  ON public.ai_agent_outputs (action_id)
  WHERE action_id IS NOT NULL;

-- ── STEP 9: ai_coaching_summaries — Coordinator Output ───────────────────
CREATE TABLE IF NOT EXISTS public.ai_coaching_summaries (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Source outputs merged by coordinator
  source_output_ids uuid[]  DEFAULT '{}',
  agents_involved   text[]  DEFAULT '{}',

  -- Resolved content (multilingual)
  summary_content   jsonb   NOT NULL DEFAULT '{}'::jsonb,
    -- shape: { en: "...", fr: "...", ar: "..." }
  primary_focus     text,   -- which agent won priority
  conflict_count    integer DEFAULT 0,
  resolution_notes  text,

  -- Generated artefacts
  insight_ids       uuid[]  DEFAULT '{}',
  recommendation_ids uuid[] DEFAULT '{}',
  plan_ids          uuid[]  DEFAULT '{}',

  -- Scoring
  overall_confidence numeric DEFAULT 0.8,
  user_state_snapshot jsonb  DEFAULT '{}'::jsonb,

  -- Delivery
  delivered         boolean DEFAULT false,
  delivered_at      timestamptz,
  delivery_channel  text    DEFAULT 'in_app',

  locale            text    DEFAULT 'en',
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_coaching_summaries_user
  ON public.ai_coaching_summaries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_coaching_summaries_undelivered
  ON public.ai_coaching_summaries (delivered, created_at)
  WHERE delivered = false;

-- ── STEP 10: ai_cohort_metrics — Aggregate Metrics ───────────────────────
CREATE TABLE IF NOT EXISTS public.ai_cohort_metrics (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key        text    NOT NULL,   -- e.g. 'goal:fat_loss', 'locale:ar', 'activity:active'
  metric_date       date    NOT NULL    DEFAULT current_date,
  user_count        integer DEFAULT 0,
  avg_engagement    numeric DEFAULT 0,
  avg_fatigue       numeric DEFAULT 0,
  avg_adherence     numeric DEFAULT 0,
  avg_momentum      numeric DEFAULT 0,
  avg_weight_change numeric DEFAULT 0,
  active_users      integer DEFAULT 0,
  insight_count     integer DEFAULT 0,
  plan_count        integer DEFAULT 0,
  metadata          jsonb   DEFAULT '{}'::jsonb,
  computed_at       timestamptz DEFAULT now(),
  UNIQUE (cohort_key, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_cohort_metrics_key_date
  ON public.ai_cohort_metrics (cohort_key, metric_date DESC);

-- ── STEP 11: ai_worker_logs — Monitoring & Observability ─────────────────
CREATE TABLE IF NOT EXISTS public.ai_worker_logs (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name     text    NOT NULL,
  run_id          uuid    NOT NULL DEFAULT gen_random_uuid(),
  status          text    NOT NULL DEFAULT 'started'
    CHECK (status IN ('started','completed','failed','partial')),
  users_processed integer DEFAULT 0,
  tasks_processed integer DEFAULT 0,
  errors          integer DEFAULT 0,
  duration_ms     integer,
  batch_size      integer DEFAULT 100,
  metadata        jsonb   DEFAULT '{}'::jsonb,
  error_details   jsonb   DEFAULT '{}'::jsonb,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_worker_logs_worker_started
  ON public.ai_worker_logs (worker_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_worker_logs_status
  ON public.ai_worker_logs (status, started_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- EVENT STREAM TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Central event logger function
CREATE OR REPLACE FUNCTION public.log_user_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event_type text;
  v_entity_type text;
  v_event_data jsonb;
BEGIN
  v_entity_type := TG_TABLE_NAME;

  CASE TG_TABLE_NAME
    WHEN 'food_logs' THEN
      v_event_type := 'food_logged';
      v_event_data := jsonb_build_object(
        'food_name',  NEW.food_name,
        'meal_type',  NEW.meal_type,
        'calories',   NEW.calories,
        'protein',    NEW.protein,
        'carbs',      NEW.carbs,
        'fat',        NEW.fat,
        'logged_at',  NEW.logged_at
      );
    WHEN 'workouts' THEN
      v_event_type := 'workout_logged';
      v_event_data := jsonb_build_object(
        'activity_type',    NEW.activity_type,
        'duration_minutes', NEW.duration_minutes,
        'calories_burned',  NEW.calories_burned,
        'distance_meters',  NEW.distance_meters,
        'source',           NEW.source
      );
    WHEN 'sleep_logs' THEN
      v_event_type := 'sleep_logged';
      v_event_data := jsonb_build_object(
        'duration_minutes', NEW.duration_minutes,
        'sleep_score',      NEW.sleep_score,
        'date',             NEW.date
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
        'goal_type',    NEW.goal_type,
        'target_value', NEW.target_value,
        'status',       NEW.status
      );
    WHEN 'supplement_logs' THEN
      v_event_type := 'supplement_logged';
      v_event_data := jsonb_build_object(
        'supplement_name', NEW.supplement_name,
        'quantity',        NEW.quantity,
        'time_of_day',     NEW.time_of_day
      );
    ELSE
      v_event_type := TG_TABLE_NAME || '_' || lower(TG_OP);
      v_event_data := '{}'::jsonb;
  END CASE;

  INSERT INTO public.user_events (
    user_id, event_type, entity_type, entity_id, event_data, source
  ) VALUES (
    NEW.user_id, v_event_type, v_entity_type, NEW.id, v_event_data, 'trigger'
  );

  -- Also update ai_user_state.next_action_due_at to trigger near-realtime processing
  INSERT INTO public.ai_user_state (user_id, next_action_due_at, computed_at)
  VALUES (NEW.user_id, now() + interval '5 minutes', now())
  ON CONFLICT (user_id) DO UPDATE
    SET next_action_due_at = LEAST(
      public.ai_user_state.next_action_due_at,
      now() + interval '5 minutes'
    );

  RETURN NEW;
END;
$$;

-- Attach triggers to all key tables
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
-- FEATURE PIPELINE — Compute ai_user_state from recent events
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_user_state(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_workouts_7d        integer;
  v_food_days_7d       integer;
  v_avg_calories_7d    numeric;
  v_avg_protein_7d     numeric;
  v_sleep_hours_7d     numeric;
  v_latest_weight_kg   numeric;
  v_prev_weight_kg     numeric;
  v_weight_trend       text;
  v_events_7d          integer;
  v_events_14d         integer;
  v_positive_signals   integer;
  v_negative_signals   integer;

  v_engagement_score   numeric;
  v_fatigue_score      numeric;
  v_adherence_score    numeric;
  v_momentum_score     numeric;
  v_readiness_score    numeric;
  v_calorie_trend      text;
  v_training_trend     text;
  v_tdee_estimate      numeric;
  v_intervention       boolean;
  v_intervention_reason text;

  v_locale  text;
  v_units   text;
  v_goal    text;
BEGIN
  -- Settings
  SELECT language, units INTO v_locale, v_units
  FROM public.user_settings WHERE user_id = p_user_id;
  v_locale := COALESCE(v_locale, 'en');
  v_units  := COALESCE(v_units,  'metric');

  -- Goal
  SELECT goal_type INTO v_goal
  FROM public.goals WHERE user_id = p_user_id
  ORDER BY updated_at DESC LIMIT 1;

  -- Workouts 7d
  SELECT count(*) INTO v_workouts_7d
  FROM public.workouts
  WHERE user_id = p_user_id
    AND started_at >= now() - interval '7 days';

  -- Food logs: days with entries (7d), avg calories
  SELECT
    count(DISTINCT logged_at::date),
    COALESCE(avg(calories), 0),
    COALESCE(avg(protein),  0)
  INTO v_food_days_7d, v_avg_calories_7d, v_avg_protein_7d
  FROM public.food_logs
  WHERE user_id = p_user_id
    AND logged_at >= now() - interval '7 days';

  -- Sleep: average hours (7d)
  SELECT COALESCE(avg(duration_minutes) / 60.0, 0)
  INTO v_sleep_hours_7d
  FROM public.sleep_logs
  WHERE user_id = p_user_id
    AND date >= (now() - interval '7 days')::date;

  -- Weight trend
  SELECT value INTO v_latest_weight_kg
  FROM public.body_metrics
  WHERE user_id = p_user_id AND metric_type = 'weight'
  ORDER BY captured_at DESC LIMIT 1;

  SELECT value INTO v_prev_weight_kg
  FROM public.body_metrics
  WHERE user_id = p_user_id AND metric_type = 'weight'
    AND captured_at < now() - interval '7 days'
  ORDER BY captured_at DESC LIMIT 1;

  IF v_latest_weight_kg IS NOT NULL AND v_prev_weight_kg IS NOT NULL THEN
    CASE
      WHEN v_latest_weight_kg < v_prev_weight_kg - 1    THEN v_weight_trend := 'losing';
      WHEN v_latest_weight_kg < v_prev_weight_kg - 2    THEN v_weight_trend := 'losing_fast';
      WHEN v_latest_weight_kg > v_prev_weight_kg + 1    THEN v_weight_trend := 'gaining';
      WHEN v_latest_weight_kg > v_prev_weight_kg + 2    THEN v_weight_trend := 'gaining_fast';
      ELSE v_weight_trend := 'stable';
    END CASE;
  ELSE
    v_weight_trend := 'stable';
  END IF;

  -- Event counts
  SELECT count(*) INTO v_events_7d
  FROM public.user_events
  WHERE user_id = p_user_id AND created_at >= now() - interval '7 days';

  SELECT count(*) INTO v_events_14d
  FROM public.user_events
  WHERE user_id = p_user_id AND created_at >= now() - interval '14 days';

  -- Training signals
  SELECT
    count(*) FILTER (WHERE signal_type IN ('workout_completed','food_logged','feedback_positive','weight_logged')),
    count(*) FILTER (WHERE signal_type IN ('feedback_negative','plan_dismissed'))
  INTO v_positive_signals, v_negative_signals
  FROM public.ai_training_signals
  WHERE user_id = p_user_id
    AND created_at >= now() - interval '14 days';

  -- ── Compute Scores ────────────────────────────────────────────────────

  -- Engagement (events + workouts + food days)
  v_engagement_score := LEAST(100, (
    (v_events_7d        * 3.0) +
    (v_workouts_7d      * 10.0) +
    (v_food_days_7d     * 8.0) +
    (v_positive_signals * 2.0)
  ) - (v_negative_signals * 5.0));
  v_engagement_score := GREATEST(0, v_engagement_score);

  -- Fatigue (high workouts + low sleep = high fatigue)
  v_fatigue_score := LEAST(100, GREATEST(0,
    (v_workouts_7d * 12.0) -
    (COALESCE(v_sleep_hours_7d, 7) * 5.0) +
    (v_negative_signals * 8.0)
  ));

  -- Adherence (food logging + workout frequency)
  v_adherence_score := LEAST(100, GREATEST(0, (
    (v_food_days_7d  / 7.0 * 50.0) +
    (LEAST(v_workouts_7d, 5) / 5.0 * 50.0)
  )));

  -- Momentum (positive signals, engagement, adherence)
  v_momentum_score := LEAST(100, GREATEST(0, (
    v_engagement_score * 0.3 +
    v_adherence_score  * 0.4 +
    v_positive_signals * 3.0 -
    v_negative_signals * 5.0
  )));

  -- Readiness (sleep quality, fatigue inverse)
  v_readiness_score := LEAST(100, GREATEST(0, (
    LEAST(COALESCE(v_sleep_hours_7d, 7), 9) * 8.0 -
    v_fatigue_score * 0.3 +
    v_adherence_score * 0.2
  )));

  -- Calorie trend
  v_tdee_estimate := 2000; -- simplified; could use ai_metabolic_profile if populated
  IF    v_avg_calories_7d = 0               THEN v_calorie_trend := 'under';
  ELSIF v_avg_calories_7d < v_tdee_estimate * 0.85 THEN v_calorie_trend := 'under';
  ELSIF v_avg_calories_7d < v_tdee_estimate * 1.15 THEN v_calorie_trend := 'at_target';
  ELSIF v_avg_calories_7d < v_tdee_estimate * 1.30 THEN v_calorie_trend := 'over';
  ELSE                                             v_calorie_trend := 'highly_over';
  END IF;

  -- Training trend
  IF    v_workouts_7d = 0                   THEN v_training_trend := 'declining';
  ELSIF v_workouts_7d <= 2                  THEN v_training_trend := 'stable';
  ELSIF v_workouts_7d <= 4                  THEN v_training_trend := 'improving';
  ELSE                                           v_training_trend := 'peaking';
  END IF;

  -- Intervention check
  v_intervention := false;
  v_intervention_reason := null;
  IF v_fatigue_score > 80 THEN
    v_intervention := true;
    v_intervention_reason := 'high_fatigue';
  ELSIF v_engagement_score < 20 THEN
    v_intervention := true;
    v_intervention_reason := 'low_engagement';
  ELSIF v_food_days_7d = 0 AND v_workouts_7d = 0 THEN
    v_intervention := true;
    v_intervention_reason := 'inactive_user';
  END IF;

  -- Upsert ai_user_state
  INSERT INTO public.ai_user_state (
    user_id, engagement_score, fatigue_score, adherence_score, momentum_score, readiness_score,
    weight_trend, calorie_trend, training_trend,
    features, intervention_needed, intervention_reason,
    next_action_due_at, locale, units, computed_at
  )
  VALUES (
    p_user_id,
    round(v_engagement_score, 1),
    round(v_fatigue_score, 1),
    round(v_adherence_score, 1),
    round(v_momentum_score, 1),
    round(v_readiness_score, 1),
    v_weight_trend,
    v_calorie_trend,
    v_training_trend,
    jsonb_build_object(
      'workouts_this_week',         v_workouts_7d,
      'food_days_this_week',        v_food_days_7d,
      'avg_calories_daily',         round(v_avg_calories_7d, 0),
      'avg_protein_daily_g',        round(v_avg_protein_7d, 1),
      'avg_sleep_hours',            round(v_sleep_hours_7d, 1),
      'latest_weight_kg',           v_latest_weight_kg,
      'meal_log_adherence_pct',     round(v_food_days_7d / 7.0 * 100, 0),
      'workout_adherence_pct',      round(LEAST(v_workouts_7d, 5) / 5.0 * 100, 0),
      'positive_signals_14d',       v_positive_signals,
      'negative_signals_14d',       v_negative_signals,
      'primary_goal',               v_goal
    ),
    v_intervention,
    v_intervention_reason,
    now() + interval '6 hours',
    v_locale,
    v_units,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    engagement_score    = EXCLUDED.engagement_score,
    fatigue_score       = EXCLUDED.fatigue_score,
    adherence_score     = EXCLUDED.adherence_score,
    momentum_score      = EXCLUDED.momentum_score,
    readiness_score     = EXCLUDED.readiness_score,
    weight_trend        = EXCLUDED.weight_trend,
    calorie_trend       = EXCLUDED.calorie_trend,
    training_trend      = EXCLUDED.training_trend,
    features            = EXCLUDED.features,
    intervention_needed = EXCLUDED.intervention_needed,
    intervention_reason = EXCLUDED.intervention_reason,
    next_action_due_at  = EXCLUDED.next_action_due_at,
    locale              = EXCLUDED.locale,
    units               = EXCLUDED.units,
    computed_at         = now();

  -- Also sync to existing ai_coaching_state (backward compatibility)
  INSERT INTO public.ai_coaching_state (
    user_id, phase, current_focus, last_evaluation, metadata
  )
  VALUES (
    p_user_id,
    CASE
      WHEN v_intervention THEN 'intervention'
      WHEN v_momentum_score > 70 THEN 'momentum'
      WHEN v_adherence_score > 60 THEN 'building'
      ELSE 'onboarding'
    END,
    COALESCE(v_intervention_reason, v_goal, 'general_fitness'),
    now(),
    jsonb_build_object(
      'engagement', v_engagement_score,
      'fatigue',    v_fatigue_score,
      'adherence',  v_adherence_score
    )
  )
  ON CONFLICT (user_id) DO UPDATE SET
    phase            = EXCLUDED.phase,
    current_focus    = EXCLUDED.current_focus,
    last_evaluation  = now(),
    metadata         = EXCLUDED.metadata;

END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DECISION ENGINE — Evaluates rules against user state, produces ai_actions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.run_decision_engine(p_batch_size integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user     record;
  v_rule     record;
  v_count    integer := 0;
  v_matches  boolean;
  v_run_id   uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.ai_worker_logs (worker_name, run_id, status, batch_size)
  VALUES ('decision_engine', v_run_id, 'started', p_batch_size);

  FOR v_user IN
    SELECT s.*
    FROM public.ai_user_state s
    WHERE s.next_action_due_at <= now()
    ORDER BY s.next_action_due_at ASC
    LIMIT p_batch_size
  LOOP
    -- First refresh state
    PERFORM public.compute_user_state(v_user.user_id);

    -- Reload freshly computed state
    SELECT * INTO v_user
    FROM public.ai_user_state
    WHERE user_id = v_user.user_id;

    -- Evaluate each active rule
    FOR v_rule IN
      SELECT * FROM public.ai_decision_rules
      WHERE active = true
        AND (locale_filter IS NULL OR v_user.locale = ANY(locale_filter))
      ORDER BY priority ASC
    LOOP
      BEGIN
        EXECUTE format(
          'SELECT ($1.%s)',
          v_rule.condition_sql
        ) USING v_user INTO v_matches;
      EXCEPTION WHEN OTHERS THEN
        -- Fallback: evaluate as plain expression
        BEGIN
          EXECUTE 'SELECT ' || v_rule.condition_sql
            USING v_user.engagement_score, v_user.fatigue_score,
                  v_user.adherence_score, v_user.momentum_score,
                  v_user.features
          INTO v_matches;
        EXCEPTION WHEN OTHERS THEN
          v_matches := false;
        END;
      END;

      IF v_matches THEN
        -- Enqueue action (skip duplicates for same user+type in last hour)
        INSERT INTO public.ai_actions (
          user_id, action_type, triggered_by, rule_id, payload,
          priority, locale, reasoning_layer, agent_name
        )
        SELECT
          v_user.user_id,
          v_rule.action_type,
          'rule_engine',
          v_rule.id,
          v_rule.action_payload || jsonb_build_object('user_state_snapshot', row_to_json(v_user)::jsonb),
          v_rule.priority,
          v_user.locale,
          'rule',
          v_rule.action_payload->>'agent'
        WHERE NOT EXISTS (
          SELECT 1 FROM public.ai_actions
          WHERE user_id = v_user.user_id
            AND action_type = v_rule.action_type
            AND triggered_by = 'rule_engine'
            AND rule_id = v_rule.id
            AND created_at > now() - interval '6 hours'
        );
      END IF;
    END LOOP;

    -- General scheduled action if no rule triggered
    IF NOT EXISTS (
      SELECT 1 FROM public.ai_actions
      WHERE user_id = v_user.user_id
        AND status = 'pending'
        AND created_at > now() - interval '6 hours'
    ) THEN
      INSERT INTO public.ai_actions (
        user_id, action_type, triggered_by, payload, priority, locale, reasoning_layer
      ) VALUES (
        v_user.user_id,
        'run_agent_analysis',
        'scheduler',
        jsonb_build_object(
          'agents', ARRAY['nutrition_agent','training_agent','progress_agent'],
          'user_state_snapshot', row_to_json(v_user)::jsonb
        ),
        50,
        v_user.locale,
        'cloud'
      );
    END IF;

    -- Update next_action_due_at
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
-- ACTION DISPATCHER — Converts ai_actions into ai_agent_tasks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.dispatch_ai_actions(p_batch_size integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action   record;
  v_agent    record;
  v_count    integer := 0;
  v_run_id   uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.ai_worker_logs (worker_name, run_id, status, batch_size)
  VALUES ('action_dispatcher', v_run_id, 'started', p_batch_size);

  FOR v_action IN
    SELECT a.*
    FROM public.ai_actions a
    WHERE a.status = 'pending'
      AND a.scheduled_for <= now()
    ORDER BY a.priority ASC, a.created_at ASC
    LIMIT p_batch_size
  LOOP
    -- Mark as dispatched
    UPDATE public.ai_actions
    SET status = 'dispatched', dispatched_at = now()
    WHERE id = v_action.id;

    -- Create agent task(s)
    IF v_action.action_type = 'run_agent_analysis' THEN
      -- Dispatch to specific agent(s)
      FOR v_agent IN
        SELECT id, agent_name FROM public.ai_agents
        WHERE active = true
          AND (
            v_action.agent_name IS NULL
            OR agent_name = v_action.agent_name
            OR agent_name = ANY(
                ARRAY(SELECT jsonb_array_elements_text(v_action.payload->'agents'))
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
          v_action.locale,
          v_action.reasoning_layer
        );
      END LOOP;
    ELSE
      -- Single task for non-agent actions
      INSERT INTO public.ai_agent_tasks (
        user_id, agent_id, task_type, input_data, status, priority,
        action_id, locale, reasoning_layer
      )
      SELECT
        v_action.user_id,
        a.id,
        v_action.action_type,
        v_action.payload,
        'pending',
        v_action.priority,
        v_action.id,
        v_action.locale,
        v_action.reasoning_layer
      FROM public.ai_agents a
      WHERE a.active = true
        AND a.agent_name = COALESCE(v_action.agent_name, 'progress_agent')
      LIMIT 1;
    END IF;

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
-- COORDINATOR — Merges agent outputs, resolves conflicts, creates summaries
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.run_coordinator(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_outputs      record;
  v_summary_id   uuid;
  v_agent_order  text[] := ARRAY['recovery_agent','training_agent','nutrition_agent','progress_agent','behavior_agent'];
  v_primary_agent text;
  v_merged_en    text := '';
  v_merged_fr    text := '';
  v_merged_ar    text := '';
  v_output_ids   uuid[] := '{}';
  v_agents_seen  text[] := '{}';
  v_insight_ids  uuid[] := '{}';
  v_rec_ids      uuid[] := '{}';
  v_plan_ids     uuid[] := '{}';
  v_conflicts    integer := 0;
  v_confidence   numeric := 0;
  v_conf_count   integer := 0;
  v_user_state   record;
BEGIN
  -- Get user state
  SELECT * INTO v_user_state
  FROM public.ai_user_state WHERE user_id = p_user_id;

  -- Collect unprocessed outputs in priority order
  FOR v_outputs IN
    SELECT o.*
    FROM public.ai_agent_outputs o
    WHERE o.user_id = p_user_id
      AND o.coordinator_processed = false
      AND o.created_at > now() - interval '24 hours'
    ORDER BY
      array_position(ARRAY['recovery_agent','training_agent','nutrition_agent','progress_agent','behavior_agent'], o.agent_name),
      o.confidence DESC
  LOOP
    -- Track first (highest priority) agent as primary
    IF v_primary_agent IS NULL THEN
      v_primary_agent := v_outputs.agent_name;
    END IF;

    -- Detect conflicts (same agent_name seen twice = conflict)
    IF v_outputs.agent_name = ANY(v_agents_seen) THEN
      v_conflicts := v_conflicts + 1;
    END IF;
    v_agents_seen := v_agents_seen || ARRAY[v_outputs.agent_name];

    -- Merge multilingual content
    IF v_outputs.content->>'en' IS NOT NULL AND v_outputs.content->>'en' != '' THEN
      v_merged_en := v_merged_en || E'\n\n' || (v_outputs.agent_name) || ': ' || (v_outputs.content->>'en');
    END IF;
    IF v_outputs.content->>'fr' IS NOT NULL AND v_outputs.content->>'fr' != '' THEN
      v_merged_fr := v_merged_fr || E'\n\n' || (v_outputs.agent_name) || ': ' || (v_outputs.content->>'fr');
    END IF;
    IF v_outputs.content->>'ar' IS NOT NULL AND v_outputs.content->>'ar' != '' THEN
      v_merged_ar := v_merged_ar || E'\n\n' || (v_outputs.agent_name) || ': ' || (v_outputs.content->>'ar');
    END IF;

    -- Collect references
    v_output_ids := v_output_ids || ARRAY[v_outputs.id];
    IF v_outputs.related_insight_id IS NOT NULL THEN
      v_insight_ids := v_insight_ids || ARRAY[v_outputs.related_insight_id];
    END IF;
    IF v_outputs.related_recommendation_id IS NOT NULL THEN
      v_rec_ids := v_rec_ids || ARRAY[v_outputs.related_recommendation_id];
    END IF;
    IF v_outputs.related_plan_id IS NOT NULL THEN
      v_plan_ids := v_plan_ids || ARRAY[v_outputs.related_plan_id];
    END IF;

    -- Accumulate confidence
    v_confidence   := v_confidence + v_outputs.confidence;
    v_conf_count   := v_conf_count + 1;

    -- Mark processed
    UPDATE public.ai_agent_outputs
    SET coordinator_processed = true, coordinator_priority = array_position(v_agent_order, v_outputs.agent_name)
    WHERE id = v_outputs.id;
  END LOOP;

  IF v_conf_count = 0 THEN
    RETURN NULL; -- Nothing to coordinate
  END IF;

  v_confidence := v_confidence / v_conf_count;

  -- Create summary
  INSERT INTO public.ai_coaching_summaries (
    user_id, source_output_ids, agents_involved,
    summary_content, primary_focus, conflict_count,
    insight_ids, recommendation_ids, plan_ids,
    overall_confidence, user_state_snapshot,
    locale
  ) VALUES (
    p_user_id,
    v_output_ids,
    v_agents_seen,
    jsonb_build_object(
      'en', trim(v_merged_en),
      'fr', trim(v_merged_fr),
      'ar', trim(v_merged_ar)
    ),
    v_primary_agent,
    v_conflicts,
    v_insight_ids,
    v_rec_ids,
    v_plan_ids,
    round(v_confidence, 3),
    CASE WHEN v_user_state IS NOT NULL THEN row_to_json(v_user_state)::jsonb ELSE '{}'::jsonb END,
    COALESCE(v_user_state.locale, 'en')
  )
  RETURNING id INTO v_summary_id;

  RETURN v_summary_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- COHORT METRICS UPDATER
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_cohort_metrics()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Goal-based cohorts
  INSERT INTO public.ai_cohort_metrics (
    cohort_key, metric_date, user_count, avg_engagement, avg_fatigue,
    avg_adherence, avg_momentum, active_users
  )
  SELECT
    'goal:' || COALESCE(s.features->>'primary_goal', 'unknown'),
    current_date,
    count(*),
    round(avg(s.engagement_score), 1),
    round(avg(s.fatigue_score), 1),
    round(avg(s.adherence_score), 1),
    round(avg(s.momentum_score), 1),
    count(*) FILTER (WHERE s.engagement_score > 40)
  FROM public.ai_user_state s
  GROUP BY s.features->>'primary_goal'
  ON CONFLICT (cohort_key, metric_date) DO UPDATE SET
    user_count    = EXCLUDED.user_count,
    avg_engagement = EXCLUDED.avg_engagement,
    avg_fatigue   = EXCLUDED.avg_fatigue,
    avg_adherence = EXCLUDED.avg_adherence,
    avg_momentum  = EXCLUDED.avg_momentum,
    active_users  = EXCLUDED.active_users,
    computed_at   = now();

  -- Locale-based cohorts
  INSERT INTO public.ai_cohort_metrics (
    cohort_key, metric_date, user_count, avg_engagement, avg_adherence, avg_momentum, active_users
  )
  SELECT
    'locale:' || s.locale,
    current_date,
    count(*),
    round(avg(s.engagement_score), 1),
    round(avg(s.adherence_score), 1),
    round(avg(s.momentum_score), 1),
    count(*) FILTER (WHERE s.engagement_score > 40)
  FROM public.ai_user_state s
  GROUP BY s.locale
  ON CONFLICT (cohort_key, metric_date) DO UPDATE SET
    user_count    = EXCLUDED.user_count,
    avg_engagement = EXCLUDED.avg_engagement,
    avg_adherence = EXCLUDED.avg_adherence,
    avg_momentum  = EXCLUDED.avg_momentum,
    active_users  = EXCLUDED.active_users,
    computed_at   = now();
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_user_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_decision_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_actions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_outcomes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_outputs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_coaching_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_cohort_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_worker_logs        ENABLE ROW LEVEL SECURITY;

-- user_events: own only
DROP POLICY IF EXISTS "user_events_own" ON public.user_events;
CREATE POLICY "user_events_own" ON public.user_events
  FOR ALL USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ai_user_state: own only
DROP POLICY IF EXISTS "ai_user_state_own" ON public.ai_user_state;
CREATE POLICY "ai_user_state_own" ON public.ai_user_state
  FOR ALL USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ai_decision_rules: read-only for authenticated users
DROP POLICY IF EXISTS "ai_decision_rules_read" ON public.ai_decision_rules;
CREATE POLICY "ai_decision_rules_read" ON public.ai_decision_rules
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- ai_actions: own only
DROP POLICY IF EXISTS "ai_actions_own" ON public.ai_actions;
CREATE POLICY "ai_actions_own" ON public.ai_actions
  FOR ALL USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ai_action_outcomes: own only
DROP POLICY IF EXISTS "ai_action_outcomes_own" ON public.ai_action_outcomes;
CREATE POLICY "ai_action_outcomes_own" ON public.ai_action_outcomes
  FOR ALL USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ai_agent_outputs: own only
DROP POLICY IF EXISTS "ai_agent_outputs_own" ON public.ai_agent_outputs;
CREATE POLICY "ai_agent_outputs_own" ON public.ai_agent_outputs
  FOR ALL USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ai_coaching_summaries: own only
DROP POLICY IF EXISTS "ai_coaching_summaries_own" ON public.ai_coaching_summaries;
CREATE POLICY "ai_coaching_summaries_own" ON public.ai_coaching_summaries
  FOR ALL USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ai_cohort_metrics: read-only for all authenticated
DROP POLICY IF EXISTS "ai_cohort_metrics_read" ON public.ai_cohort_metrics;
CREATE POLICY "ai_cohort_metrics_read" ON public.ai_cohort_metrics
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- ai_worker_logs: service_role only
DROP POLICY IF EXISTS "ai_worker_logs_service" ON public.ai_worker_logs;
CREATE POLICY "ai_worker_logs_service" ON public.ai_worker_logs
  FOR ALL USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEDULER — pg_cron jobs (requires pg_cron extension)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pg_cron if available (Supabase Pro/Enterprise)
-- If not available, these can be called from Edge Functions on a timer

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    -- Decision engine: every 6 hours
    PERFORM cron.schedule(
      'decision-engine-run',
      '0 */6 * * *',
      'SELECT public.run_decision_engine(100)'
    );

    -- Action dispatcher: every minute
    PERFORM cron.schedule(
      'action-dispatcher-run',
      '* * * * *',
      'SELECT public.dispatch_ai_actions(50)'
    );

    -- Cohort metrics: daily at midnight
    PERFORM cron.schedule(
      'cohort-metrics-run',
      '0 0 * * *',
      'SELECT public.update_cohort_metrics()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available; schedule via Edge Functions instead
  NULL;
END;
$$;
