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

/**
 * GET /api/iron-coach/progress
 * Fetch weight progress logs with optional filters
 * 
 * Query params:
 *   - week: ISO week number (1-53)
 *   - year: year (e.g. 2025)
 *   - exercise: filter by exercise name
 *   - muscleGroup: filter by muscle group
 *   - limit: max records (default 100, max 200)
 *   - offset: pagination offset
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

    const { data: logs, error } = await query;

    if (error) {
      // Table might not exist yet (migration not run)
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json({ logs: [], stats: null, prs: [] });
      }
      console.error('Error fetching weight progress:', error);
      return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
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
    if (isNaN(weightKg) || weightKg < 0 || weightKg > 2000) {
      return NextResponse.json({ error: 'Weight must be between 0 and 2000 kg' }, { status: 400 });
    }
    if (muscleGroup && !VALID_MUSCLE_GROUPS.includes(muscleGroup)) {
      return NextResponse.json({ error: `Invalid muscle group. Valid: ${VALID_MUSCLE_GROUPS.join(', ')}` }, { status: 400 });
    }

    const maxWeightKg = body.maxWeightKg !== undefined ? parseFloat(body.maxWeightKg) : null;
    const minWeightKg = body.minWeightKg !== undefined ? parseFloat(body.minWeightKg) : null;
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

    // Calculate estimated 1RM (Epley formula) if not provided
    let estimated1rm = body.estimated1rm ? parseFloat(body.estimated1rm) : null;
    if (!estimated1rm && reps > 0 && reps <= 30 && weightKg > 0) {
      estimated1rm = parseFloat((weightKg * (1 + reps / 30)).toFixed(2));
    }

    const insertData = {
      user_id: user.id,
      exercise_name: exerciseName,
      muscle_group: muscleGroup,
      weight_kg: weightKg,
      max_weight_kg: maxWeightKg && !isNaN(maxWeightKg) ? maxWeightKg : null,
      min_weight_kg: minWeightKg && !isNaN(minWeightKg) ? minWeightKg : null,
      reps,
      sets,
      estimated_1rm: estimated1rm,
      rpe,
      effort_level: effortLevel,
      rest_seconds: restSeconds,
      logged_at: loggedAt,
      notes: notes || null,
    };

    const { data: log, error } = await sb
      .from('weight_progress_logs')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json(
          { error: 'Weight progress table not found. Please run the migration SQL.', hint: 'supabase/migrations/20260626_weight_progress_logs.sql' },
          { status: 503 }
        );
      }
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
