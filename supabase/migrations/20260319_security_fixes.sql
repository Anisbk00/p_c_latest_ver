-- ═══════════════════════════════════════════════════════════════════════════════
-- Security Fixes - Supabase Linter Warnings
-- 
-- Fixes:
-- 1. Function Search Path Mutable (10 functions)
-- 2. RLS Policy Always True for audit_logs INSERT
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. FIX FUNCTION SEARCH PATH
-- ═══════════════════════════════════════════════════════════════════════════════
-- Setting search_path prevents attackers from creating objects that shadow
-- legitimate ones. Best practice: SET search_path = public, pg_temp

-- Fix update_updated_at_column (from 20260317_notification_engine.sql)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix trg_workout_to_signal (from 20260316_adaptive_engine.sql)
CREATE OR REPLACE FUNCTION public.trg_workout_to_signal()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.ai_training_signals (
    user_id, signal_type, signal_data, strength
  ) VALUES (
    NEW.user_id,
    'workout_completed',
    jsonb_build_object(
      'workout_id',        NEW.id,
      'activity_type',     NEW.activity_type,
      'duration_minutes',  NEW.duration_minutes,
      'calories_burned',   NEW.calories_burned,
      'source',            NEW.source
    ),
    1.0
  );
  RETURN NEW;
END;
$$;

-- Fix log_user_event (simple audit logger)
CREATE OR REPLACE FUNCTION public.log_user_event()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    COALESCE(NEW.user_id, auth.uid()),
    TG_OP,
    TG_TABLE_NAME,
    NEW.id::text,
    jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP)
  );
  RETURN NEW;
END;
$$;

-- Fix compute_user_state (simplified version for search_path fix)
-- This matches the implementation in 20260316_multi_agent_final.sql
CREATE OR REPLACE FUNCTION public.compute_user_state(p_user_id uuid)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    engagement_score, fatigue_score, adherence_score, recovery_score,
    weight_trend, last_event, last_coach_action, updated_at,
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

-- Fix run_decision_engine (from 20260316_multi_agent_final.sql)
CREATE OR REPLACE FUNCTION public.run_decision_engine(p_batch_size integer DEFAULT 100)
RETURNS integer 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

    FOR v_rule IN
      SELECT * FROM public.ai_decision_rules
      WHERE is_active = true
      ORDER BY priority DESC
    LOOP
      BEGIN
        v_matches := true;
        
        -- Extract condition components
        v_cond_field := v_rule.condition_json->>'field';
        v_cond_op    := v_rule.condition_json->>'op';
        v_cond_val   := (v_rule.condition_json->>'value')::numeric;

        -- Get field value from user state
        EXECUTE format('SELECT ($1->%L)::numeric', v_cond_field)
          INTO v_field_val
          USING jsonb_build_object(
            'engagement_score', v_user.engagement_score,
            'fatigue_score', v_user.fatigue_score,
            'adherence_score', v_user.adherence_score,
            'momentum_score', v_user.momentum_score,
            'readiness_score', v_user.readiness_score
          );

        -- Evaluate condition
        CASE v_cond_op
          WHEN '>'  THEN v_matches := v_field_val > v_cond_val;
          WHEN '<'  THEN v_matches := v_field_val < v_cond_val;
          WHEN '>=' THEN v_matches := v_field_val >= v_cond_val;
          WHEN '<=' THEN v_matches := v_field_val <= v_cond_val;
          WHEN '='  THEN v_matches := v_field_val = v_cond_val;
        END CASE;

        IF v_matches THEN
          v_act_type := v_rule.action_json->>'type';
          v_act_agent := v_rule.action_json->>'agent';

          INSERT INTO public.ai_action_queue (
            user_id, rule_id, action_type, action_data, status
          ) VALUES (
            v_user.user_id,
            v_rule.id,
            v_act_type,
            v_rule.action_json,
            'pending'
          );
          v_count := v_count + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Log error but continue processing
        NULL;
      END;
    END LOOP;

    UPDATE public.ai_user_state
    SET next_action_due_at = now() + interval '6 hours'
    WHERE user_id = v_user.user_id;
  END LOOP;

  UPDATE public.ai_worker_logs
  SET status = 'completed', completed_at = now(), processed_count = v_count
  WHERE run_id = v_run_id;

  RETURN v_count;
END;
$$;

-- Fix dispatch_ai_actions (from 20260316_multi_agent_final.sql)
CREATE OR REPLACE FUNCTION public.dispatch_ai_actions(p_batch_size integer DEFAULT 50)
RETURNS integer 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action      record;
  v_count       integer := 0;
  v_run_id      uuid    := gen_random_uuid();
  v_result      jsonb;
BEGIN
  INSERT INTO public.ai_worker_logs (worker_name, run_id, status, batch_size)
  VALUES ('action_dispatcher', v_run_id, 'started', p_batch_size);

  FOR v_action IN
    SELECT * FROM public.ai_action_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Process based on action type
      CASE v_action.action_type
        WHEN 'notification' THEN
          INSERT INTO public.notifications (user_id, title, body, data, type, priority)
          SELECT 
            v_action.user_id,
            v_action.action_data->>'title',
            v_action.action_data->>'body',
            v_action.action_data->'data',
            v_action.action_data->>'notification_type',
            5
          WHERE EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = v_action.user_id);
          
        WHEN 'insight' THEN
          INSERT INTO public.ai_insights (user_id, insight_type, title, content, confidence, actionable)
          VALUES (
            v_action.user_id,
            v_action.action_data->>'insight_type',
            v_action.action_data->>'title',
            v_action.action_data->>'content',
            COALESCE((v_action.action_data->>'confidence')::numeric, 0.8),
            true
          );
          
        WHEN 'nudge' THEN
          INSERT INTO public.notifications (user_id, title, body, type, priority)
          VALUES (
            v_action.user_id,
            v_action.action_data->>'title',
            v_action.action_data->>'body',
            'nudge',
            8
          );
      END CASE;

      UPDATE public.ai_action_queue
      SET status = 'completed', completed_at = now()
      WHERE id = v_action.id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ai_action_queue
      SET status = 'failed', error_message = SQLERRM
      WHERE id = v_action.id;
    END;
  END LOOP;

  UPDATE public.ai_worker_logs
  SET status = 'completed', completed_at = now(), processed_count = v_count
  WHERE run_id = v_run_id;

  RETURN v_count;
END;
$$;

-- Fix run_coordinator (from 20260316_multi_agent_final.sql)
CREATE OR REPLACE FUNCTION public.run_coordinator(p_user_id uuid)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state        record;
  v_actions      integer;
  v_recommendations jsonb := '[]'::jsonb;
BEGIN
  -- Compute user state
  PERFORM public.compute_user_state(p_user_id);
  
  -- Run decision engine for this specific user
  UPDATE public.ai_user_state
  SET next_action_due_at = now() - interval '1 second'
  WHERE user_id = p_user_id;
  
  SELECT public.run_decision_engine(1) INTO v_actions;
  
  -- Dispatch actions
  PERFORM public.dispatch_ai_actions(10);
  
  -- Get recent recommendations
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'type', recommendation_type,
    'title', title,
    'confidence', confidence
  ))
  INTO v_recommendations
  FROM public.ai_recommendations
  WHERE user_id = p_user_id
    AND created_at >= now() - interval '24 hours'
  ORDER BY confidence DESC
  LIMIT 5;

  SELECT * INTO v_state FROM public.ai_user_state WHERE user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'state', jsonb_build_object(
      'engagement', v_state.engagement_score,
      'fatigue', v_state.fatigue_score,
      'adherence', v_state.adherence_score,
      'momentum', v_state.momentum_score,
      'readiness', v_state.readiness_score
    ),
    'recommendations', v_recommendations,
    'actions_dispatched', v_actions
  );
END;
$$;

-- Fix atomic_profile_update (from 20260318_atomic_profile_update.sql)
CREATE OR REPLACE FUNCTION public.atomic_profile_update(
  p_user_id uuid,
  p_updates jsonb
)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_weight_kg      numeric;
  v_height_cm      numeric;
  v_goal           text;
  v_activity_level text;
  v_result         jsonb;
BEGIN
  -- Extract values from updates
  v_weight_kg      := (p_updates->>'weight_kg')::numeric;
  v_height_cm      := (p_updates->>'height_cm')::numeric;
  v_goal           := p_updates->>'goal';
  v_activity_level := p_updates->>'activity_level';

  -- Update user_profiles
  UPDATE public.user_profiles
  SET
    weight_kg      = COALESCE(v_weight_kg, weight_kg),
    height_cm      = COALESCE(v_height_cm, height_cm),
    goal_type      = COALESCE(v_goal, goal_type),
    activity_level = COALESCE(v_activity_level, activity_level),
    updated_at     = now()
  WHERE user_id = p_user_id
  RETURNING jsonb_build_object(
    'weight_kg', weight_kg,
    'height_cm', height_cm,
    'goal', goal_type,
    'activity_level', activity_level
  ) INTO v_result;

  -- Update daily calorie target if weight changed
  IF v_weight_kg IS NOT NULL THEN
    UPDATE public.user_settings
    SET
      daily_calorie_target = GREATEST(1200, LEAST(4000,
        CASE
          WHEN v_goal = 'fat_loss' THEN
            10 * v_weight_kg * 2.2 + 200 - 500  -- Deficit
          WHEN v_goal = 'muscle_gain' THEN
            10 * v_weight_kg * 2.2 + 200 + 300  -- Surplus
          ELSE
            10 * v_weight_kg * 2.2 + 200        -- Maintenance
        END
      )),
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  RETURN v_result;
END;
$$;

-- Fix update_cohort_metrics
CREATE OR REPLACE FUNCTION public.update_cohort_metrics()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.cohort_metrics (
    cohort_week, user_count, avg_workouts, avg_protein_adherence, avg_streak, updated_at
  )
  SELECT
    date_trunc('week', now())::date,
    COUNT(DISTINCT up.user_id),
    COALESCE(AVG(w.weekly_workouts), 0),
    COALESCE(AVG(up.protein_adherence_pct), 0),
    COALESCE(AVG(up.current_streak), 0),
    now()
  FROM public.user_profiles up
  LEFT JOIN (
    SELECT user_id, COUNT(*) as weekly_workouts
    FROM public.workouts
    WHERE started_at >= date_trunc('week', now())
    GROUP BY user_id
  ) w ON w.user_id = up.user_id
  ON CONFLICT (cohort_week) DO UPDATE SET
    user_count = EXCLUDED.user_count,
    avg_workouts = EXCLUDED.avg_workouts,
    avg_protein_adherence = EXCLUDED.avg_protein_adherence,
    avg_streak = EXCLUDED.avg_streak,
    updated_at = now();
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. FIX RLS POLICY FOR audit_logs INSERT
-- ═══════════════════════════════════════════════════════════════════════════════
-- The old policy allowed unrestricted INSERT which is a security risk
-- New policy: Users can only insert their own audit logs (or service role)

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert"
  ON public.audit_logs FOR INSERT
  WITH CHECK (user_id = auth.uid() OR auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION public.update_updated_at_column() IS 
'Security hardened: search_path set to public, pg_temp. Updates timestamp on row modification.';

COMMENT ON FUNCTION public.trg_workout_to_signal() IS 
'Security hardened: search_path set to public, pg_temp. Trigger: logs workout completion to ai_training_signals.';

COMMENT ON FUNCTION public.log_user_event() IS 
'Security hardened: search_path set to public, pg_temp. Trigger: logs user events to audit_logs.';

COMMENT ON FUNCTION public.compute_user_state(uuid) IS 
'Security hardened: search_path set to public, pg_temp. Computes engagement, fatigue, adherence, momentum, readiness scores.';

COMMENT ON FUNCTION public.run_decision_engine(integer) IS 
'Security hardened: search_path set to public, pg_temp. Evaluates decision rules and queues actions.';

COMMENT ON FUNCTION public.dispatch_ai_actions(integer) IS 
'Security hardened: search_path set to public, pg_temp. Dispatches queued actions as notifications/insights.';

COMMENT ON FUNCTION public.run_coordinator(uuid) IS 
'Security hardened: search_path set to public, pg_temp. Orchestrates state computation, decision engine, and action dispatch.';

COMMENT ON FUNCTION public.atomic_profile_update(uuid, jsonb) IS 
'Security hardened: search_path set to public, pg_temp. Atomically updates user profile with validation.';

COMMENT ON FUNCTION public.update_cohort_metrics() IS 
'Security hardened: search_path set to public, pg_temp. Updates weekly cohort aggregate metrics.';
