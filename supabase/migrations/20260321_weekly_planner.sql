-- Weekly Planner Auto-Generation System
-- Stores AI-generated weekly workout and nutrition plans

-- Weekly plans table - stores the complete weekly plan
CREATE TABLE IF NOT EXISTS public.weekly_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start_date date NOT NULL,
  week_end_date date NOT NULL,
  
  -- Plan status
  status text DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'superseded')),
  generation_source text DEFAULT 'auto' CHECK (generation_source IN ('auto', 'manual', 'regenerate')),
  
  -- Complete plan data as JSONB
  plan_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- AI metadata
  confidence_score numeric DEFAULT 0.85,
  model_version text,
  generation_reasoning text,
  
  -- User context snapshot at generation time
  user_context_snapshot jsonb DEFAULT '{}'::jsonb,
  
  -- Tracking
  viewed_at timestamp with time zone,
  last_viewed_day date,
  
  -- Feedback
  user_rating integer CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback text,
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT weekly_plans_pkey PRIMARY KEY (id),
  CONSTRAINT weekly_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT weekly_plans_unique_week UNIQUE (user_id, week_start_date)
);

-- Daily plan completions - tracks user's progress through the plan
CREATE TABLE IF NOT EXISTS public.daily_plan_completions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  weekly_plan_id uuid NOT NULL,
  user_id uuid NOT NULL,
  plan_date date NOT NULL,
  
  -- Workout completion
  workout_completed boolean DEFAULT false,
  workout_completed_at timestamp with time zone,
  workout_exercises_completed jsonb DEFAULT '[]'::jsonb,
  workout_modifications text,
  workout_skipped_reason text,
  
  -- Nutrition completion
  nutrition_adherence_percent numeric DEFAULT 0,
  meals_logged_count integer DEFAULT 0,
  meals_total_count integer DEFAULT 0,
  actual_calories integer DEFAULT 0,
  actual_protein integer DEFAULT 0,
  actual_carbs integer DEFAULT 0,
  actual_fat integer DEFAULT 0,
  
  -- Hydration
  water_intake_ml integer DEFAULT 0,
  
  -- Sleep
  sleep_quality integer CHECK (sleep_quality >= 1 AND sleep_quality <= 5),
  sleep_duration_minutes integer,
  
  -- Supplements
  supplements_taken jsonb DEFAULT '[]'::jsonb,
  
  -- Overall day rating
  day_rating integer CHECK (day_rating >= 1 AND day_rating <= 5),
  user_notes text,
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT daily_plan_completions_pkey PRIMARY KEY (id),
  CONSTRAINT daily_plan_completions_weekly_plan_id_fkey FOREIGN KEY (weekly_plan_id) REFERENCES public.weekly_plans(id) ON DELETE CASCADE,
  CONSTRAINT daily_plan_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT daily_plan_completions_unique_date UNIQUE (user_id, plan_date)
);

-- Planner generation queue - for scheduled auto-generation
CREATE TABLE IF NOT EXISTS public.planner_generation_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scheduled_for timestamp with time zone NOT NULL,
  generation_type text DEFAULT 'weekly' CHECK (generation_type IN ('weekly', 'midweek_update', 'goal_change')),
  priority integer DEFAULT 5,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone,
  
  CONSTRAINT planner_generation_queue_pkey PRIMARY KEY (id),
  CONSTRAINT planner_generation_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_weekly_plans_user_id ON public.weekly_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plans_week_start ON public.weekly_plans(week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_plans_status ON public.weekly_plans(status);
CREATE INDEX IF NOT EXISTS idx_daily_completions_user_date ON public.daily_plan_completions(user_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_planner_queue_status ON public.planner_generation_queue(status);

-- RLS Policies
ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plan_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_generation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weekly plans"
  ON public.weekly_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own weekly plans"
  ON public.weekly_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weekly plans"
  ON public.weekly_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own daily completions"
  ON public.daily_plan_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily completions"
  ON public.daily_plan_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily completions"
  ON public.daily_plan_completions FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_weekly_plans_updated_at
  BEFORE UPDATE ON public.weekly_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_completions_updated_at
  BEFORE UPDATE ON public.daily_plan_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to queue weekly plan generation for all users
CREATE OR REPLACE FUNCTION queue_weekly_plan_generation()
RETURNS void AS $$
BEGIN
  INSERT INTO public.planner_generation_queue (user_id, scheduled_for, generation_type, priority)
  SELECT 
    id as user_id,
    date_trunc('week', CURRENT_DATE + INTERVAL '1 week') as scheduled_for,
    'weekly' as generation_type,
    5 as priority
  FROM public.profiles
  WHERE id NOT IN (
    SELECT user_id FROM public.planner_generation_queue
    WHERE scheduled_for >= date_trunc('week', CURRENT_DATE + INTERVAL '1 week')
    AND status IN ('pending', 'processing')
  )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on tables
COMMENT ON TABLE public.weekly_plans IS 'Stores AI-generated weekly workout and nutrition plans';
COMMENT ON TABLE public.daily_plan_completions IS 'Tracks user progress through their weekly plan';
COMMENT ON TABLE public.planner_generation_queue IS 'Queue for scheduled plan generation';
