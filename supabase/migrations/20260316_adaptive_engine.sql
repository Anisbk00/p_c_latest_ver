-- ═══════════════════════════════════════════════════════════════
-- Migration: Adaptive AI Engine & Feedback Loop
-- Date: 2026-03-16
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Missing tables the codebase actively queries ──────────────

-- audit_logs (used by src/lib/audit-log.ts on every API call)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action         text NOT NULL,
  entity_type    text NOT NULL DEFAULT 'unknown',
  entity_id      uuid,
  request_id     text,
  ip_address     text,
  user_agent     text,
  status_code    integer DEFAULT 200,
  duration_ms    integer,
  old_value      jsonb,
  new_value      jsonb,
  model_version  text,
  confidence     numeric,
  provenance     jsonb,
  success        boolean DEFAULT true,
  error_message  text,
  metadata       jsonb,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id  ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action   ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity   ON public.audit_logs (entity_type, entity_id);

-- food_disputes (used by /api/foods/dispute and admin moderation)
CREATE TABLE IF NOT EXISTS public.food_disputes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id      uuid NOT NULL,
  is_global    boolean NOT NULL DEFAULT false,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','reviewing','resolved','rejected')),
  resolved_by  uuid REFERENCES public.profiles(id),
  resolution   text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_disputes_status ON public.food_disputes (status);
CREATE INDEX IF NOT EXISTS idx_food_disputes_user   ON public.food_disputes (user_id);
CREATE INDEX IF NOT EXISTS idx_food_disputes_food   ON public.food_disputes (food_id, is_global);

-- ── 2. Column fixes on existing tables ──────────────────────────

-- settings_audit: code sends 'action', 'old_values', 'new_values' — schema had different names
ALTER TABLE public.settings_audit
  ADD COLUMN IF NOT EXISTS action      text,
  ADD COLUMN IF NOT EXISTS old_values  jsonb,
  ADD COLUMN IF NOT EXISTS new_values  jsonb;

-- global_foods: dispute API calls .update({ status: 'under_review' })
ALTER TABLE public.global_foods
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'
    CHECK (status IN ('active','under_review','rejected','archived'));

-- foods: same
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'
    CHECK (status IN ('active','under_review','rejected','archived'));

-- translations: namespace column (required by i18n migration)
ALTER TABLE public.translations
  ADD COLUMN IF NOT EXISTS namespace text NOT NULL DEFAULT 'app';

CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_key_locale_unique
  ON public.translations (key, locale);

-- food_translations: add global_food_id column so global foods can be translated
ALTER TABLE public.food_translations
  ADD COLUMN IF NOT EXISTS global_food_id uuid
    REFERENCES public.global_foods(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_food_translations_global_locale
  ON public.food_translations (global_food_id, locale)
  WHERE global_food_id IS NOT NULL;

-- ── 3. body_metrics: add water + steps to allowed metric types ────
-- Drop and recreate constraint to include water/steps used by app-context
ALTER TABLE public.body_metrics
  DROP CONSTRAINT IF EXISTS body_metrics_metric_type_check;

ALTER TABLE public.body_metrics
  ADD CONSTRAINT body_metrics_metric_type_check
    CHECK (metric_type IN (
      'weight','body_fat','muscle_mass','bmi',
      'waist','chest','hips','biceps','thigh','neck',
      'resting_heart_rate','blood_pressure_systolic',
      'blood_pressure_diastolic','water','steps'
    ));

-- ── 4. ai_training_signals: index for per-user recent lookups ────
CREATE INDEX IF NOT EXISTS idx_ai_training_signals_user_created
  ON public.ai_training_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_training_signals_type
  ON public.ai_training_signals (signal_type);

-- ── 5. ai_feedback: index for per-user lookups ────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user
  ON public.ai_feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_message
  ON public.ai_feedback (message_id)
  WHERE message_id IS NOT NULL;

-- ── 6. TRIGGER: workout insert → ai_training_signals ─────────────
CREATE OR REPLACE FUNCTION public.trg_workout_to_signal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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

DROP TRIGGER IF EXISTS trg_workout_signal ON public.workouts;
CREATE TRIGGER trg_workout_signal
  AFTER INSERT ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.trg_workout_to_signal();

-- ── 7. TRIGGER: food_log insert → ai_training_signals ────────────
CREATE OR REPLACE FUNCTION public.trg_food_log_to_signal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.ai_training_signals (
    user_id, signal_type, signal_data, strength
  ) VALUES (
    NEW.user_id,
    'food_logged',
    jsonb_build_object(
      'food_log_id', NEW.id,
      'meal_type',   NEW.meal_type,
      'calories',    NEW.calories,
      'protein',     NEW.protein
    ),
    0.8
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_food_log_signal ON public.food_logs;
CREATE TRIGGER trg_food_log_signal
  AFTER INSERT ON public.food_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_food_log_to_signal();

-- ── 8. TRIGGER: ai_feedback insert → ai_training_signals ─────────
CREATE OR REPLACE FUNCTION public.trg_ai_feedback_to_signal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_signal_type text;
  v_strength    numeric;
BEGIN
  -- Map feedback type to signal
  IF NEW.feedback_type IN ('thumbs_up','helpful','completed') THEN
    v_signal_type := 'feedback_positive';
    v_strength    := COALESCE(0.6 + (NEW.rating - 3) * 0.05, 0.8);
  ELSE
    v_signal_type := 'feedback_negative';
    v_strength    := COALESCE(0.6 + (3 - NEW.rating) * 0.05, 0.7);
  END IF;

  v_strength := GREATEST(0.1, LEAST(1.0, v_strength));

  INSERT INTO public.ai_training_signals (
    user_id, signal_type, signal_data, strength
  ) VALUES (
    NEW.user_id,
    v_signal_type,
    jsonb_build_object(
      'feedback_id',       NEW.id,
      'feedback_type',     NEW.feedback_type,
      'rating',            NEW.rating,
      'message_id',        NEW.message_id,
      'recommendation_id', NEW.recommendation_id
    ),
    v_strength
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_signal ON public.ai_feedback;
CREATE TRIGGER trg_feedback_signal
  AFTER INSERT ON public.ai_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trg_ai_feedback_to_signal();

-- ── 9. TRIGGER: weight log → ai_training_signals ─────────────────
CREATE OR REPLACE FUNCTION public.trg_weight_to_signal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.metric_type = 'weight' THEN
    INSERT INTO public.ai_training_signals (
      user_id, signal_type, signal_data, strength
    ) VALUES (
      NEW.user_id,
      'weight_logged',
      jsonb_build_object(
        'metric_id', NEW.id,
        'value',     NEW.value,
        'unit',      NEW.unit
      ),
      0.9
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weight_signal ON public.body_metrics;
CREATE TRIGGER trg_weight_signal
  AFTER INSERT ON public.body_metrics
  FOR EACH ROW EXECUTE FUNCTION public.trg_weight_to_signal();

-- ── 10. TRIGGER: sleep log → ai_training_signals ─────────────────
CREATE OR REPLACE FUNCTION public.trg_sleep_to_signal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.ai_training_signals (
    user_id, signal_type, signal_data, strength
  ) VALUES (
    NEW.user_id,
    'sleep_logged',
    jsonb_build_object(
      'sleep_log_id',      NEW.id,
      'duration_minutes',  NEW.duration_minutes,
      'sleep_score',       NEW.sleep_score,
      'date',              NEW.date
    ),
    0.7
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sleep_signal ON public.sleep_logs;
CREATE TRIGGER trg_sleep_signal
  AFTER INSERT ON public.sleep_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_sleep_to_signal();

-- ── 11. TRIGGER: language change in user_settings → audit ─────────
CREATE OR REPLACE FUNCTION public.trg_language_change_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.language IS DISTINCT FROM NEW.language THEN
    INSERT INTO public.settings_audit (
      user_id, changed_by, change_type, action, resource,
      payload, old_values, new_values
    ) VALUES (
      NEW.user_id, NEW.user_id,
      'language_change', 'UPDATE', 'user_settings',
      jsonb_build_object('field','language','from',OLD.language,'to',NEW.language),
      jsonb_build_object('language', OLD.language),
      jsonb_build_object('language', NEW.language)
    );

    INSERT INTO public.ai_training_signals (
      user_id, signal_type, signal_data, strength
    ) VALUES (
      NEW.user_id,
      'language_changed',
      jsonb_build_object('from', OLD.language, 'to', NEW.language),
      0.5
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_language_audit ON public.user_settings;
CREATE TRIGGER trg_language_audit
  AFTER UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_language_change_audit();

-- ── 12. RLS for new tables ────────────────────────────────────────
ALTER TABLE public.audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_disputes ENABLE ROW LEVEL SECURITY;

-- audit_logs: users see only their own; service role sees all
DROP POLICY IF EXISTS "audit_logs_own" ON public.audit_logs;
CREATE POLICY "audit_logs_own"
  ON public.audit_logs FOR SELECT
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true); -- server-side only

-- food_disputes: users can create and read their own
DROP POLICY IF EXISTS "food_disputes_owner" ON public.food_disputes;
CREATE POLICY "food_disputes_owner"
  ON public.food_disputes FOR ALL
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- ai_training_signals: users read own, triggers write
DROP POLICY IF EXISTS "training_signals_own" ON public.ai_training_signals;
CREATE POLICY "training_signals_own"
  ON public.ai_training_signals FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "training_signals_insert" ON public.ai_training_signals;
CREATE POLICY "training_signals_insert"
  ON public.ai_training_signals FOR INSERT
  WITH CHECK (true); -- triggers + server-side only

-- ── 13. Indexes for adaptive engine queries ───────────────────────
CREATE INDEX IF NOT EXISTS idx_goals_user_updated
  ON public.goals (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date
  ON public.sleep_logs (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_body_metrics_user_type_captured
  ON public.body_metrics (user_id, metric_type, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_memory_user_confidence
  ON public.ai_memory (user_id, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_food_logs_user_logged
  ON public.food_logs (user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_workouts_user_started
  ON public.workouts (user_id, started_at DESC);
