/**
 * Adaptive Engine
 *
 * Core of the feedback loop. Responsibilities:
 *
 * 1. Record training signals into ai_training_signals whenever the user
 *    completes a workout, logs food, gives feedback, or updates a goal.
 *
 * 2. Build a rich AdaptiveUserContext snapshot that the AI uses to
 *    personalise recommendations based on recent behaviour.
 *
 * 3. Compute a momentum score and adherence metrics that modulate
 *    confidence in future AI outputs.
 *
 * @module lib/ai/adaptive-engine
 */

import { getSupabase } from '@/lib/supabase/supabase-data';
import type { SupportedLocale } from './multilingual-output';

// ─────────────────────────────────────────────────────────────
// Signal types
// ─────────────────────────────────────────────────────────────

export type SignalType =
  | 'workout_completed'
  | 'food_logged'
  | 'meal_plan_followed'
  | 'goal_updated'
  | 'feedback_positive'
  | 'feedback_negative'
  | 'weight_logged'
  | 'sleep_logged'
  | 'language_changed'
  | 'plan_generated'
  | 'plan_dismissed';

export interface TrainingSignal {
  userId: string;
  signalType: SignalType;
  signalData: Record<string, unknown>;
  strength?: number; // 0–1, default 1
}

// ─────────────────────────────────────────────────────────────
// Record a training signal
// ─────────────────────────────────────────────────────────────

export async function recordSignal(signal: TrainingSignal): Promise<void> {
  try {
    const supabase = await getSupabase();
    const { error } = await (supabase as any).from('ai_training_signals').insert({
      user_id: signal.userId,
      signal_type: signal.signalType,
      signal_data: signal.signalData,
      strength: signal.strength ?? 1.0,
    });
    if (error) {
      console.error('[AdaptiveEngine] Failed to record signal:', error.message);
    }
  } catch (err) {
    // Non-blocking — never throw from signal recording
    console.error('[AdaptiveEngine] recordSignal error:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// Adaptive User Context
// ─────────────────────────────────────────────────────────────

export interface AdaptiveUserContext {
  userId: string;
  locale: SupportedLocale;
  units: 'metric' | 'imperial';

  // Profile
  primaryGoal: string | null;
  activityLevel: string | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  biologicalSex: string | null;
  ageYears: number | null;
  dietaryRestrictions: string[];
  allergies: string[];

  // Recent activity (7-day window)
  workoutsThisWeek: number;
  totalCaloriesBurnedWeek: number;
  avgCaloriesConsumedDaily: number;
  avgProteinDailyG: number;
  avgSleepHours: number | null;
  latestWeightKg: number | null;

  // Adherence signals
  mealLogAdherencePct: number;   // 0–100
  workoutAdherencePct: number;   // 0–100
  momentumScore: number;         // 0–100 composite

  // AI memory keys (top 5)
  memoryHighlights: Array<{ key: string; value: unknown }>;

  // Signal strengths (last 14 days)
  positiveSignalCount: number;
  negativeSignalCount: number;

  snapshotAt: string;
}

// ─────────────────────────────────────────────────────────────
// Build the adaptive context for a user
// ─────────────────────────────────────────────────────────────

export async function buildAdaptiveContext(userId: string): Promise<AdaptiveUserContext> {
  const supabase = await getSupabase();
  const sb = supabase as any;
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const since14d = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  const [
    settingsRes,
    profileRes,
    userProfileRes,
    workoutsRes,
    foodLogsRes,
    sleepRes,
    weightRes,
    memoryRes,
    signalsRes,
  ] = await Promise.all([
    sb.from('user_settings').select('language, units').eq('user_id', userId).single(),
    sb.from('profiles').select('locale').eq('id', userId).single(),
    sb.from('user_profiles').select(
      'primary_goal, activity_level, height_cm, target_weight_kg, biological_sex, birth_date, dietary_restrictions, allergies'
    ).eq('user_id', userId).single(),
    sb.from('workouts').select('calories_burned, duration_minutes, started_at')
      .eq('user_id', userId).gte('started_at', since7d),
    sb.from('food_logs').select('calories, protein, logged_at')
      .eq('user_id', userId).gte('logged_at', since7d),
    sb.from('sleep_logs').select('duration_minutes, date')
      .eq('user_id', userId).gte('date', since7d.slice(0, 10)).order('date', { ascending: false }).limit(7),
    sb.from('body_metrics').select('value, captured_at')
      .eq('user_id', userId).eq('metric_type', 'weight')
      .order('captured_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('ai_memory').select('memory_key, memory_value, confidence')
      .eq('user_id', userId).order('confidence', { ascending: false }).limit(5),
    sb.from('ai_training_signals').select('signal_type, strength')
      .eq('user_id', userId).gte('created_at', since14d),
  ]);

  // Settings
  const LOCALE_SET = new Set<SupportedLocale>(['en', 'fr', 'ar']);
  const rawLang = settingsRes.data?.language ?? profileRes.data?.locale ?? 'en';
  const locale: SupportedLocale = LOCALE_SET.has(rawLang as SupportedLocale)
    ? (rawLang as SupportedLocale) : 'en';
  const units: 'metric' | 'imperial' =
    settingsRes.data?.units === 'imperial' ? 'imperial' : 'metric';

  // User profile
  const up = userProfileRes.data;
  const ageYears = up?.birth_date
    ? Math.floor((Date.now() - new Date(up.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  // Workouts
  const workouts = (workoutsRes.data ?? []) as Array<{ calories_burned?: number | null }>;
  const workoutsThisWeek = workouts.length;
  const totalCaloriesBurnedWeek = Math.round(
    workouts.reduce((s, w) => s + (w.calories_burned ?? 0), 0)
  );

  // Food logs — group by day for adherence
  const foodLogs = (foodLogsRes.data ?? []) as Array<{ calories?: number | null; protein?: number | null; logged_at: string }>;
  const foodDays = new Set(foodLogs.map(f => f.logged_at?.slice(0, 10)));
  const mealLogAdherencePct = Math.round((foodDays.size / 7) * 100);
  const avgCaloriesConsumedDaily = foodDays.size > 0
    ? Math.round(foodLogs.reduce((s, f) => s + (f.calories ?? 0), 0) / foodDays.size)
    : 0;
  const avgProteinDailyG = foodDays.size > 0
    ? Math.round(foodLogs.reduce((s, f) => s + (f.protein ?? 0), 0) / foodDays.size)
    : 0;

  // Sleep
  const sleepLogs = (sleepRes.data ?? []) as Array<{ duration_minutes?: number | null }>;
  const avgSleepHours = sleepLogs.length > 0
    ? Math.round((sleepLogs.reduce((s, l) => s + (l.duration_minutes ?? 0), 0) / sleepLogs.length) / 60 * 10) / 10
    : null;

  // Weight
  const latestWeightKg = weightRes.data?.value ?? null;

  // Workout adherence — assume 4 workouts/week is 100%
  const workoutAdherencePct = Math.min(100, Math.round((workoutsThisWeek / 4) * 100));

  // Momentum — composite
  const momentumScore = Math.min(100, Math.round(
    mealLogAdherencePct * 0.4 +
    workoutAdherencePct * 0.4 +
    (sleepLogs.length / 7) * 100 * 0.2
  ));

  // Memory highlights
  const memoryHighlights = (memoryRes.data ?? []).map((m: any) => ({
    key: m.memory_key as string,
    value: m.memory_value as unknown,
  }));

  // Signals
  const signals = (signalsRes.data ?? []) as Array<{ signal_type: string; strength: number }>;
  const positiveSignalCount = signals.filter(s =>
    ['workout_completed', 'food_logged', 'feedback_positive', 'meal_plan_followed'].includes(s.signal_type)
  ).length;
  const negativeSignalCount = signals.filter(s =>
    ['feedback_negative', 'plan_dismissed'].includes(s.signal_type)
  ).length;

  return {
    userId,
    locale,
    units,
    primaryGoal: up?.primary_goal ?? null,
    activityLevel: up?.activity_level ?? null,
    heightCm: up?.height_cm ?? null,
    currentWeightKg: latestWeightKg,
    targetWeightKg: up?.target_weight_kg ?? null,
    biologicalSex: up?.biological_sex ?? null,
    ageYears,
    dietaryRestrictions: Array.isArray(up?.dietary_restrictions) ? up.dietary_restrictions : [],
    allergies: Array.isArray(up?.allergies) ? up.allergies : [],
    workoutsThisWeek,
    totalCaloriesBurnedWeek,
    avgCaloriesConsumedDaily,
    avgProteinDailyG,
    avgSleepHours,
    latestWeightKg,
    mealLogAdherencePct,
    workoutAdherencePct,
    momentumScore,
    memoryHighlights,
    positiveSignalCount,
    negativeSignalCount,
    snapshotAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Build a prompt preamble from adaptive context
// ─────────────────────────────────────────────────────────────

export function buildAdaptiveContextBlock(ctx: AdaptiveUserContext): string {
  const LOCALE_NAMES: Record<SupportedLocale, string> = { en: 'English', fr: 'French', ar: 'Arabic' };
  const langName = LOCALE_NAMES[ctx.locale];

  const lines = [
    `=== USER ADAPTIVE CONTEXT ===`,
    `Language: ${langName} (${ctx.locale}) — ALL output MUST be in ${langName}`,
    `Units: ${ctx.units}`,
    ``,
    `-- Profile --`,
    `Goal: ${ctx.primaryGoal ?? 'not set'}`,
    `Activity: ${ctx.activityLevel ?? 'unknown'}`,
    `Height: ${ctx.heightCm ? ctx.heightCm + ' cm' : 'not set'}`,
    `Current weight: ${ctx.currentWeightKg ? ctx.currentWeightKg + ' kg' : 'not set'}`,
    `Target weight: ${ctx.targetWeightKg ? ctx.targetWeightKg + ' kg' : 'not set'}`,
    `Sex: ${ctx.biologicalSex ?? 'not set'}`,
    `Age: ${ctx.ageYears ?? 'unknown'}`,
    ctx.dietaryRestrictions.length ? `Dietary restrictions: ${ctx.dietaryRestrictions.join(', ')}` : '',
    ctx.allergies.length ? `Allergies: ${ctx.allergies.join(', ')}` : '',
    ``,
    `-- Last 7 days --`,
    `Workouts: ${ctx.workoutsThisWeek} (adherence ${ctx.workoutAdherencePct}%)`,
    `Calories burned: ${ctx.totalCaloriesBurnedWeek} kcal`,
    `Avg daily calories: ${ctx.avgCaloriesConsumedDaily} kcal`,
    `Avg daily protein: ${ctx.avgProteinDailyG}g`,
    ctx.avgSleepHours !== null ? `Avg sleep: ${ctx.avgSleepHours}h` : '',
    `Meal log adherence: ${ctx.mealLogAdherencePct}%`,
    ``,
    `-- Momentum --`,
    `Score: ${ctx.momentumScore}/100`,
    `Positive signals (14d): ${ctx.positiveSignalCount}`,
    `Negative signals (14d): ${ctx.negativeSignalCount}`,
    ctx.memoryHighlights.length
      ? `Key memories: ${ctx.memoryHighlights.map(m => `${m.key}: ${JSON.stringify(m.value)}`).join('; ')}`
      : '',
    `=== END CONTEXT ===`,
  ].filter(Boolean);

  return lines.join('\n');
}
