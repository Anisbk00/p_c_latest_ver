-- ═══════════════════════════════════════════════════════════════
-- Weight Progress Logs — Premium Strength Tracking
-- Like Apple Fitness / Strava-level exercise progress tracking
-- ═══════════════════════════════════════════════════════════════

-- Main table: weight_progress_logs
CREATE TABLE IF NOT EXISTS weight_progress_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Exercise identification
  exercise_name   TEXT NOT NULL,
  muscle_group    TEXT NOT NULL DEFAULT 'other',
  -- muscle_group: chest, back, shoulders, biceps, triceps, legs, glutes, core, calves, forearms, full_body, other
  
  -- Performance data
  weight_kg       NUMERIC(6,2) NOT NULL DEFAULT 0,     -- weight used for working set
  max_weight_kg   NUMERIC(6,2),                        -- heaviest single rep or set
  min_weight_kg   NUMERIC(6,2),                        -- lightest warm-up set
  reps            INTEGER NOT NULL DEFAULT 1,
  sets            INTEGER NOT NULL DEFAULT 1,
  estimated_1rm   NUMERIC(6,2),                        -- Epley formula: weight * (1 + reps/30)
  
  -- Effort & quality
  rpe             INTEGER CHECK (rpe BETWEEN 1 AND 10), -- Rate of Perceived Exertion
  effort_level    TEXT CHECK (effort_level IN ('easy','moderate','hard','max','failure')),
  rest_seconds    INTEGER DEFAULT 90,
  
  -- Session context
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  week_number     INTEGER,                              -- computed via trigger (not GENERATED — EXTRACT is not immutable)
  year            INTEGER,                              -- computed via trigger
  
  -- Metadata
  is_pr           BOOLEAN NOT NULL DEFAULT FALSE,       -- personal record flag
  pr_type         TEXT CHECK (pr_type IN ('weight','volume','reps','sets','est_1rm')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_wpl_user_date ON weight_progress_logs(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpl_user_exercise ON weight_progress_logs(user_id, exercise_name);
CREATE INDEX IF NOT EXISTS idx_wpl_user_muscle ON weight_progress_logs(user_id, muscle_group);
CREATE INDEX IF NOT EXISTS idx_wpl_user_week ON weight_progress_logs(user_id, year, week_number);
CREATE INDEX IF NOT EXISTS idx_wpl_user_pr ON weight_progress_logs(user_id, is_pr) WHERE is_pr = TRUE;

-- ═══════════════════════════════════════════════════════════════
-- Trigger: auto-fill week_number and year from logged_at
-- (EXTRACT is not immutable, so can't use GENERATED columns)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fill_wpl_week_year()
RETURNS TRIGGER AS $$
BEGIN
  NEW.week_number := EXTRACT(WEEK FROM NEW.logged_at)::INTEGER;
  NEW.year := EXTRACT(YEAR FROM NEW.logged_at)::INTEGER;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wpl_fill_week_year ON weight_progress_logs;
CREATE TRIGGER trg_wpl_fill_week_year
  BEFORE INSERT OR UPDATE ON weight_progress_logs
  FOR EACH ROW EXECUTE FUNCTION fill_wpl_week_year();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_wpl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wpl_updated_at ON weight_progress_logs;
CREATE TRIGGER trg_wpl_updated_at
  BEFORE UPDATE ON weight_progress_logs
  FOR EACH ROW EXECUTE FUNCTION update_wpl_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- RLS: Users can only see their own data
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE weight_progress_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpl_users_select_own" ON weight_progress_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "wpl_users_insert_own" ON weight_progress_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wpl_users_update_own" ON weight_progress_logs
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wpl_users_delete_own" ON weight_progress_logs
  FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- Auto-PR detection function
-- Checks if a new log beats the user's previous best for the same exercise
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION detect_wpl_pr()
RETURNS TRIGGER AS $$
DECLARE
  prev_max_weight NUMERIC;
  prev_max_volume NUMERIC;
  prev_max_reps   INTEGER;
  prev_max_1rm    NUMERIC;
  new_volume      NUMERIC;
BEGIN
  -- Only check on insert
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  
  -- Calculate volume (sets × reps × weight)
  new_volume := (NEW.sets::NUMERIC * NEW.reps::NUMERIC * NEW.weight_kg);
  
  -- Get previous bests for this exercise
  SELECT 
    MAX(max_weight_kg),
    MAX(sets::NUMERIC * reps::NUMERIC * weight_kg),
    MAX(reps),
    MAX(estimated_1rm)
  INTO prev_max_weight, prev_max_volume, prev_max_reps, prev_max_1rm
  FROM weight_progress_logs
  WHERE user_id = NEW.user_id AND exercise_name = NEW.exercise_name AND id != NEW.id;
  
  -- Detect PRs
  NEW.is_pr := FALSE;
  NEW.pr_type := NULL;
  
  -- Weight PR
  IF NEW.max_weight_kg IS NOT NULL AND (prev_max_weight IS NULL OR NEW.max_weight_kg > prev_max_weight) THEN
    NEW.is_pr := TRUE;
    NEW.pr_type := 'weight';
  END IF;
  
  -- Volume PR (total tonnage)
  IF prev_max_volume IS NULL OR new_volume > prev_max_volume THEN
    IF NOT NEW.is_pr OR (prev_max_weight IS NOT NULL AND NEW.max_weight_kg IS NOT NULL AND NEW.max_weight_kg <= prev_max_weight) THEN
      NEW.is_pr := TRUE;
      NEW.pr_type := 'volume';
    END IF;
  END IF;
  
  -- Reps PR
  IF prev_max_reps IS NULL OR NEW.reps > prev_max_reps THEN
    IF NOT NEW.is_pr THEN
      NEW.is_pr := TRUE;
      NEW.pr_type := 'reps';
    END IF;
  END IF;
  
  -- Estimated 1RM PR
  IF NEW.estimated_1rm IS NOT NULL AND (prev_max_1rm IS NULL OR NEW.estimated_1rm > prev_max_1rm) THEN
    NEW.is_pr := TRUE;
    NEW.pr_type := 'est_1rm';
  END IF;
  
  -- Auto-calculate estimated 1RM if not provided (Epley formula)
  IF NEW.estimated_1rm IS NULL AND NEW.reps > 0 AND NEW.reps <= 30 AND NEW.weight_kg > 0 THEN
    NEW.estimated_1rm := ROUND((NEW.weight_kg * (1 + NEW.reps::NUMERIC / 30))::NUMERIC, 2);
    -- Check if this 1RM is a PR
    IF prev_max_1rm IS NULL OR NEW.estimated_1rm > prev_max_1rm THEN
      NEW.is_pr := TRUE;
      NEW.pr_type := 'est_1rm';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wpl_detect_pr ON weight_progress_logs;
CREATE TRIGGER trg_wpl_detect_pr
  BEFORE INSERT ON weight_progress_logs
  FOR EACH ROW EXECUTE FUNCTION detect_wpl_pr();
