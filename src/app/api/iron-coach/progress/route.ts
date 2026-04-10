import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';

const VALID_MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'legs', 'glutes', 'core', 'calves', 'forearms', 'full_body', 'other',
] as const;

const VALID_EFFORT_LEVELS = ['easy', 'moderate', 'hard', 'max', 'failure'] as const;

// Simple rate limit tracker
const rateLimit = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string, limit = 60, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimit.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// Track auto-migration so we only attempt it once per cold boot
let migrationAttempted = false;
let migrationSuccess = false;

/**
 * Auto-create the weight_progress_logs table if it doesn't exist.
 * Uses direct PostgreSQL connection via DATABASE_URL.
 * Returns true if the table is now available.
 */
async function ensureTableExists(): Promise<boolean> {
  if (migrationSuccess) return true;
  if (migrationAttempted) return false;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[weight-progress] No DATABASE_URL configured for auto-migration');
    return false;
  }

  migrationAttempted = true;

  try {
    // Dynamic import to avoid loading pg in edge runtime
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });

    const migrationSQL = `
      CREATE TABLE IF NOT EXISTS weight_progress_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        exercise_name   TEXT NOT NULL,
        muscle_group    TEXT NOT NULL DEFAULT 'other',
        weight_kg       NUMERIC(6,2) NOT NULL DEFAULT 0,
        max_weight_kg   NUMERIC(6,2),
        min_weight_kg   NUMERIC(6,2),
        reps            INTEGER NOT NULL DEFAULT 1,
        sets            INTEGER NOT NULL DEFAULT 1,
        estimated_1rm   NUMERIC(6,2),
        rpe             INTEGER CHECK (rpe BETWEEN 1 AND 10),
        effort_level    TEXT CHECK (effort_level IN ('easy','moderate','hard','max','failure')),
        rest_seconds    INTEGER DEFAULT 90,
        logged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        notes           TEXT,
        week_number     INTEGER,
        year            INTEGER,
        is_pr           BOOLEAN NOT NULL DEFAULT FALSE,
        pr_type         TEXT CHECK (pr_type IN ('weight','volume','reps','sets','est_1rm')),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_wpl_user_date ON weight_progress_logs(user_id, logged_at DESC);
      CREATE INDEX IF NOT EXISTS idx_wpl_user_week ON weight_progress_logs(user_id, year, week_number);
      CREATE INDEX IF NOT EXISTS idx_wpl_user_pr ON weight_progress_logs(user_id, is_pr) WHERE is_pr = TRUE;

      ALTER TABLE weight_progress_logs ENABLE ROW LEVEL SECURITY;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weight_progress_logs' AND policyname = 'wpl_users_select_own') THEN
          CREATE POLICY "wpl_users_select_own" ON weight_progress_logs FOR SELECT USING (auth.uid() = user_id);
          CREATE POLICY "wpl_users_insert_own" ON weight_progress_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
          CREATE POLICY "wpl_users_update_own" ON weight_progress_logs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
          CREATE POLICY "wpl_users_delete_own" ON weight_progress_logs FOR DELETE USING (auth.uid() = user_id);
        END IF;
      END $$;

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

      CREATE OR REPLACE FUNCTION detect_wpl_pr()
      RETURNS TRIGGER AS $$
      DECLARE
        prev_max_weight NUMERIC;
        prev_max_volume NUMERIC;
        prev_max_reps   INTEGER;
        prev_max_1rm    NUMERIC;
        new_volume      NUMERIC;
      BEGIN
        IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
        new_volume := (NEW.sets::NUMERIC * NEW.reps::NUMERIC * NEW.weight_kg);
        SELECT MAX(max_weight_kg), MAX(sets::NUMERIC * reps::NUMERIC * weight_kg), MAX(reps), MAX(estimated_1rm)
        INTO prev_max_weight, prev_max_volume, prev_max_reps, prev_max_1rm
        FROM weight_progress_logs WHERE user_id = NEW.user_id AND exercise_name = NEW.exercise_name AND id != NEW.id;
        NEW.is_pr := FALSE;
        NEW.pr_type := NULL;
        IF NEW.max_weight_kg IS NOT NULL AND (prev_max_weight IS NULL OR NEW.max_weight_kg > prev_max_weight) THEN
          NEW.is_pr := TRUE; NEW.pr_type := 'weight';
        END IF;
        IF prev_max_volume IS NULL OR new_volume > prev_max_volume THEN
          IF NOT NEW.is_pr OR (prev_max_weight IS NOT NULL AND NEW.max_weight_kg IS NOT NULL AND NEW.max_weight_kg <= prev_max_weight) THEN
            NEW.is_pr := TRUE; NEW.pr_type := 'volume';
          END IF;
        END IF;
        IF prev_max_reps IS NULL OR NEW.reps > prev_max_reps THEN
          IF NOT NEW.is_pr THEN NEW.is_pr := TRUE; NEW.pr_type := 'reps'; END IF;
        END IF;
        IF NEW.estimated_1rm IS NOT NULL AND (prev_max_1rm IS NULL OR NEW.estimated_1rm > prev_max_1rm) THEN
          NEW.is_pr := TRUE; NEW.pr_type := 'est_1rm';
        END IF;
        IF NEW.estimated_1rm IS NULL AND NEW.reps > 0 AND NEW.reps <= 30 AND NEW.weight_kg > 0 THEN
          NEW.estimated_1rm := ROUND((NEW.weight_kg * (1 + NEW.reps::NUMERIC / 30))::NUMERIC, 2);
          IF prev_max_1rm IS NULL OR NEW.estimated_1rm > prev_max_1rm THEN
            NEW.is_pr := TRUE; NEW.pr_type := 'est_1rm';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_wpl_detect_pr ON weight_progress_logs;
      CREATE TRIGGER trg_wpl_detect_pr
        BEFORE INSERT ON weight_progress_logs
        FOR EACH ROW EXECUTE FUNCTION detect_wpl_pr();
    `;

    await pool.query(migrationSQL);
    await pool.end();

    migrationSuccess = true;
    console.log('[weight-progress] Auto-migration completed successfully');
    return true;
  } catch (err: any) {
    console.error('[weight-progress] Auto-migration failed:', err?.message || err);
    return false;
  }
}

/**
 * GET /api/iron-coach/progress
 * Fetch weight progress logs with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!checkRateLimit(user.id, 120)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const { supabase } = await getSupabaseUser();
    const sb = supabase as any;

    const week = searchParams.get('week');
    const year = searchParams.get('year');
    const exercise = searchParams.get('exercise');
    const muscleGroup = searchParams.get('muscleGroup');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = sb
      .from('weight_progress_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (week && year) {
      query = query.eq('week_number', parseInt(week)).eq('year', parseInt(year));
    }
    if (exercise) {
      query = query.ilike('exercise_name', `%${exercise}%`);
    }
    if (muscleGroup && VALID_MUSCLE_GROUPS.includes(muscleGroup as any)) {
      query = query.eq('muscle_group', muscleGroup);
    }

    let { data: logs, error } = await query;

    if (error) {
      // Table might not exist yet — attempt auto-migration
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        const migrated = await ensureTableExists();
        if (migrated) {
          // Retry the query after migration
          const retry = await sb
            .from('weight_progress_logs')
            .select('*')
            .eq('user_id', user.id)
            .order('logged_at', { ascending: false })
            .range(offset, offset + limit - 1);
          logs = retry.data;
          error = retry.error;
        }
      }
      if (error) {
        return NextResponse.json({ logs: [], stats: null, prs: [] });
      }
    }

    // Calculate aggregate stats
    const stats = calculateStats(logs || []);

    // Get PRs
    const { data: prs } = await sb
      .from('weight_progress_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_pr', true)
      .order('logged_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      logs: logs || [],
      stats,
      prs: prs || [],
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching weight progress:', error);
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
  }
}

/**
 * POST /api/iron-coach/progress
 * Log a new weight progress entry
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!checkRateLimit(user.id, 30)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { supabase } = await getSupabaseUser();
    const sb = supabase as any;

    // Validate required fields
    const exerciseName = (body.exerciseName || body.exercise_name || '').trim();
    const muscleGroup = body.muscleGroup || body.muscle_group || 'other';
    const weightKg = parseFloat(body.weightKg || body.weight_kg || 0);

    if (!exerciseName || exerciseName.length > 100) {
      return NextResponse.json({ error: 'Exercise name is required (max 100 chars)' }, { status: 400 });
    }
    if (isNaN(weightKg) || weightKg <= 0) {
      return NextResponse.json({ error: 'Weight must be greater than 0 kg' }, { status: 400 });
    }
    if (weightKg > 2000) {
      return NextResponse.json({ error: 'Weight must be 2000 kg or less' }, { status: 400 });
    }
    if (muscleGroup && !VALID_MUSCLE_GROUPS.includes(muscleGroup)) {
      return NextResponse.json({ error: `Invalid muscle group. Valid: ${VALID_MUSCLE_GROUPS.join(', ')}` }, { status: 400 });
    }

    const maxWeightKg = body.maxWeightKg !== undefined && body.maxWeightKg !== '' ? parseFloat(body.maxWeightKg) : null;
    const minWeightKg = body.minWeightKg !== undefined && body.minWeightKg !== '' ? parseFloat(body.minWeightKg) : null;
    const reps = Math.max(1, Math.min(parseInt(body.reps || '1') || 1, 100));
    const sets = Math.max(1, Math.min(parseInt(body.sets || '1') || 1, 50));
    const rpe = body.rpe ? Math.max(1, Math.min(parseInt(body.rpe), 10)) : null;
    const effortLevel = body.effortLevel || body.effort_level || null;
    const restSeconds = body.restSeconds ? Math.max(10, Math.min(parseInt(body.restSeconds), 600)) : 90;
    const loggedAt = body.loggedAt || body.logged_at || new Date().toISOString();
    const notes = (body.notes || '').slice(0, 500);

    if (effortLevel && !VALID_EFFORT_LEVELS.includes(effortLevel)) {
      return NextResponse.json({ error: `Invalid effort level. Valid: ${VALID_EFFORT_LEVELS.join(', ')}` }, { status: 400 });
    }

    // Logical validations: max/min vs weight
    if (maxWeightKg !== null && !isNaN(maxWeightKg) && maxWeightKg < weightKg) {
      return NextResponse.json({ error: 'Max weight cannot be less than working weight', hint: 'Max weight is your heaviest single rep — it should be ≥ working weight' }, { status: 400 });
    }
    if (minWeightKg !== null && !isNaN(minWeightKg) && minWeightKg > weightKg) {
      return NextResponse.json({ error: 'Min weight cannot be greater than working weight', hint: 'Min weight is your lightest warm-up — it should be ≤ working weight' }, { status: 400 });
    }
    if (maxWeightKg !== null && !isNaN(maxWeightKg) && minWeightKg !== null && !isNaN(minWeightKg) && minWeightKg > maxWeightKg) {
      return NextResponse.json({ error: 'Min weight cannot be greater than max weight' }, { status: 400 });
    }

    // RPE vs effort level consistency
    if (rpe && effortLevel) {
      if (rpe <= 3 && (effortLevel === 'hard' || effortLevel === 'max' || effortLevel === 'failure')) {
        return NextResponse.json({ error: 'RPE and effort level conflict', hint: `RPE ${rpe} means "very easy" but effort is "${effortLevel}" — please adjust one of them` }, { status: 400 });
      }
      if (rpe >= 9 && (effortLevel === 'easy' || effortLevel === 'moderate')) {
        return NextResponse.json({ error: 'RPE and effort level conflict', hint: `RPE ${rpe} means "near failure" but effort is "${effortLevel}" — please adjust one of them` }, { status: 400 });
      }
    }

    // Calculate estimated 1RM (Epley formula)
    let estimated1rm = body.estimated1rm ? parseFloat(body.estimated1rm) : null;
    if (!estimated1rm && reps > 0 && reps <= 30 && weightKg > 0) {
      estimated1rm = parseFloat((weightKg * (1 + reps / 30)).toFixed(2));
    }

    // Calculate week_number and year from loggedAt as fallback
    const logDate = new Date(loggedAt);
    const startOfYear = new Date(logDate.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((logDate.getTime() - startOfYear.getTime()) / 86400000);
    const weekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
    const yearNum = logDate.getFullYear();

    const insertData = {
      user_id: user.id,
      exercise_name: exerciseName,
      muscle_group: muscleGroup,
      weight_kg: weightKg,
      max_weight_kg: maxWeightKg !== null && !isNaN(maxWeightKg) ? maxWeightKg : null,
      min_weight_kg: minWeightKg !== null && !isNaN(minWeightKg) ? minWeightKg : null,
      reps,
      sets,
      estimated_1rm: estimated1rm,
      rpe,
      effort_level: effortLevel,
      rest_seconds: restSeconds,
      logged_at: loggedAt,
      notes: notes || null,
      week_number: weekNum,
      year: yearNum,
    };

    let { data: log, error } = await sb
      .from('weight_progress_logs')
      .insert(insertData)
      .select()
      .single();

    // Auto-migrate if table doesn't exist
    if (error && (error.message?.includes('does not exist') || error.code === '42P01')) {
      console.log('[weight-progress] Table missing, attempting auto-migration...');
      const migrated = await ensureTableExists();
      if (migrated) {
        // Retry insert after successful migration
        const retry = await sb
          .from('weight_progress_logs')
          .insert(insertData)
          .select()
          .single();
        log = retry.data;
        error = retry.error;
      }
    }

    if (error) {
      console.error('Error inserting weight progress:', error);
      return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 });
    }

    return NextResponse.json({ log, isNewPR: log.is_pr, prType: log.pr_type });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error saving weight progress:', error);
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 });
  }
}

/**
 * DELETE /api/iron-coach/progress?id=<uuid>
 * Delete a weight progress log entry
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getSupabaseUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing log id' }, { status: 400 });
    }

    const { supabase } = await getSupabaseUser();
    const sb = supabase as any;

    const { error } = await sb
      .from('weight_progress_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      // Silently handle if table doesn't exist (user has nothing to delete)
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json({ success: true });
      }
      console.error('Error deleting weight progress:', error);
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error deleting weight progress:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper: Calculate aggregate stats
// ═══════════════════════════════════════════════════════════════

function calculateStats(logs: any[]) {
  if (!logs.length) return null;

  const totalVolume = logs.reduce((sum: number, l: any) =>
    sum + ((l.sets || 1) * (l.reps || 1) * (l.weight_kg || 0)), 0);
  const rpeLogs = logs.filter((l: any) => l.rpe);
  const avgRPE = rpeLogs.length > 0 ? rpeLogs.reduce((sum: number, l: any) => sum + (l.rpe || 0), 0) / rpeLogs.length : 0;
  const totalSets = logs.reduce((sum: number, l: any) => sum + (l.sets || 1), 0);
  const exercises = new Set(logs.map((l: any) => l.exercise_name));
  const prs = logs.filter((l: any) => l.is_pr);

  return {
    totalLogs: logs.length,
    totalVolume: parseFloat(totalVolume.toFixed(1)),
    avgRPE: parseFloat(avgRPE.toFixed(1)),
    totalSets,
    uniqueExercises: exercises.size,
    personalRecords: prs.length,
  };
}
