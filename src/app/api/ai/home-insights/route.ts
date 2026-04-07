/**
 * AI Home Insights API
 * 
 * Generates real AI insights from user data for the home page.
 * Falls back to rule-based insights if AI is unavailable.
 * 
 * GET /api/ai/home-insights
 */

import { NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface InsightResult {
  title: string;
  description: string;
  actionSuggestion?: string;
  category: 'trend' | 'anomaly' | 'correlation' | 'prediction';
  confidence: number;
  source: 'ai' | 'rule';
  dataSources: string[];
}

interface HomeInsightsResponse {
  insights: InsightResult[];
  bodyIntelligenceInsight: string;
  source: 'ai' | 'rule';
  generatedAt: string;
  /** Real aggregate data used to generate insights */
  aggregateData: {
    hydrationMl: number;
    caloriesBurned: number;
    proteinG: number;
    caloriesConsumed: number;
    streak: number;
    workoutsThisWeek: number;
    weightTrend: string;
    primaryGoal: string;
    hasFoodToday: boolean;
    hasWorkoutToday: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════
// Rule-Based Insight Engine
// ═══════════════════════════════════════════════════════════════

function generateRuleBasedInsights(data: {
  workoutsThisWeek: number;
  totalCaloriesBurned: number;
  totalProteinConsumed: number;
  totalCaloriesConsumed: number;
  streak: number;
  hydrationAvg: number;
  latestWeight?: number;
  weightTrend?: 'up' | 'down' | 'stable';
  primaryGoal?: string;
  hasFoodLogsToday: boolean;
  hasWorkoutToday: boolean;
  daysSinceLastWorkout?: number;
}): { insights: InsightResult[]; bodyIntelligenceInsight: string } {
  const insights: InsightResult[] = [];
  const {
    workoutsThisWeek,
    totalCaloriesBurned,
    totalProteinConsumed,
    streak,
    hydrationAvg,
    primaryGoal,
    hasFoodLogsToday,
    hasWorkoutToday,
    daysSinceLastWorkout,
  } = data;

  // ─── Workout Insights ──────────────────────────────────────
  if (workoutsThisWeek >= 4) {
    insights.push({
      title: 'Training Volume On Point',
      description: `You've hit ${workoutsThisWeek} workouts this week, burning ${totalCaloriesBurned} cal. Solid consistency.`,
      actionSuggestion: 'Ensure adequate rest days to prevent overtraining.',
      category: 'trend',
      confidence: 85,
      source: 'rule',
      dataSources: ['workouts (7 days)', 'calories burned'],
    });
  } else if (workoutsThisWeek === 0) {
    insights.push({
      title: 'No Workouts This Week',
      description: 'Zero training sessions so far. Your muscles need stimulus to grow.',
      actionSuggestion: 'Start with a 20-min session today, even if light.',
      category: 'anomaly',
      confidence: 95,
      source: 'rule',
      dataSources: ['workouts (7 days)'],
    });
  } else if (daysSinceLastWorkout && daysSinceLastWorkout >= 3) {
    insights.push({
      title: 'Workout Gap Detected',
      description: `${daysSinceLastWorkout} days since your last session. Consistency beats intensity.`,
      actionSuggestion: 'Schedule your next workout now before life gets in the way.',
      category: 'anomaly',
      confidence: 88,
      source: 'rule',
      dataSources: ['workouts (7 days)'],
    });
  }

  // ─── Nutrition Insights ────────────────────────────────────
  if (totalProteinConsumed > 0) {
    const dailyProteinAvg = Math.round(totalProteinConsumed / 7);

    if (dailyProteinAvg >= 140) {
      insights.push({
        title: 'Protein Intake Excellent',
        description: `Averaging ${dailyProteinAvg}g protein/day this week. Fueling recovery and growth.`,
        actionSuggestion: 'Spread intake across 4-5 meals for optimal absorption.',
        category: 'trend',
        confidence: 82,
        source: 'rule',
        dataSources: ['food logs (7 days)', 'protein macro'],
      });
    } else if (dailyProteinAvg > 0 && dailyProteinAvg < 80) {
      insights.push({
        title: 'Protein Too Low',
        description: `Only ${dailyProteinAvg}g protein/day average. You need 1.6-2.2g per kg bodyweight.`,
        actionSuggestion: 'Add a protein-rich meal or shake to hit at least 120g daily.',
        category: 'anomaly',
        confidence: 90,
        source: 'rule',
        dataSources: ['food logs (7 days)', 'protein macro'],
      });
    }
  }

  if (!hasFoodLogsToday) {
    insights.push({
      title: 'No Food Logged Today',
      description: "You haven't tracked any meals yet. What gets measured gets managed.",
      actionSuggestion: 'Log your next meal now — even a rough estimate helps.',
      category: 'anomaly',
      confidence: 92,
      source: 'rule',
      dataSources: ['food logs (today)'],
    });
  }

  // ─── Hydration Insight ─────────────────────────────────────
  if (hydrationAvg > 0 && hydrationAvg < 1500) {
    insights.push({
      title: 'Dehydration Risk',
      description: `Averaging ${Math.round(hydrationAvg)}ml water/day. Dehydration kills performance.`,
      actionSuggestion: 'Aim for at least 2L daily. Set hourly reminders if needed.',
      category: 'anomaly',
      confidence: 88,
      source: 'rule',
      dataSources: ['hydration logs (7 days)'],
    });
  }

  // ─── Streak Insight ────────────────────────────────────────
  if (streak >= 14) {
    insights.push({
      title: `${streak}-Day Beast Mode`,
      description: 'Two weeks of consistent logging. Habits are crystallizing into identity.',
      actionSuggestion: 'Review your weekly data — find one area to optimize.',
      category: 'trend',
      confidence: 95,
      source: 'rule',
      dataSources: ['streak data'],
    });
  }

  // ─── Weight Trend Insight ──────────────────────────────────
  if (data.weightTrend === 'down' && primaryGoal?.includes('fat')) {
    insights.push({
      title: 'Fat Loss Progress',
      description: 'Weight trending down — the right direction. Keep the deficit consistent.',
      actionSuggestion: "Don't cut calories further — focus on protein and training volume.",
      category: 'prediction',
      confidence: 78,
      source: 'rule',
      dataSources: ['body metrics', 'weight trend'],
    });
  }

  // ─── Body Intelligence Insight ─────────────────────────────
  let bodyIntelligenceInsight: string;
  if (workoutsThisWeek >= 3 && totalProteinConsumed > 500 && hydrationAvg > 1500) {
    bodyIntelligenceInsight = 'Firing on all cylinders. Training, nutrition, and hydration are aligned.';
  } else if (workoutsThisWeek >= 2 && totalProteinConsumed > 300) {
    bodyIntelligenceInsight = 'Solid foundation this week. Bump protein and hydration to level up.';
  } else if (hasWorkoutToday && hasFoodLogsToday) {
    bodyIntelligenceInsight = 'You showed up today. That\'s the hardest part. Now make it a pattern.';
  } else if (streak >= 3) {
    bodyIntelligenceInsight = `${streak} days of consistency. The compound effect is building — trust the process.`;
  } else if (workoutsThisWeek === 0 && totalProteinConsumed === 0) {
    bodyIntelligenceInsight = 'Fresh start. Log a meal and a workout today — momentum starts with one action.';
  } else {
    bodyIntelligenceInsight = 'Track nutrition and workouts consistently for personalized AI insights.';
  }

  // Sort by confidence descending, limit to 3
  insights.sort((a, b) => b.confidence - a.confidence);

  return {
    insights: insights.slice(0, 3),
    bodyIntelligenceInsight,
  };
}

// ═══════════════════════════════════════════════════════════════
// GET /api/ai/home-insights
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  // Early guard: return empty insights for unauthenticated users (no 401 noise)
  try {
    const { user } = await getSupabaseUser();
    if (!user) {
      return NextResponse.json({ bodyIntelligenceInsight: '', insights: [] });
    }
  } catch {
    return NextResponse.json({ bodyIntelligenceInsight: '', insights: [] });
  }

  const rateCheck = withRateLimit({} as any, RATE_LIMITS.API_READ);
  if (!rateCheck.allowed) {
    return rateCheck.response;
  }

  try {
    const { supabase, user } = await getSupabaseUser();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = now.toISOString().split('T')[0];

    // ─── Fetch all user data in parallel ─────────────────────────
    const [
      workoutsResult,
      foodLogsResult,
      bodyMetricsResult,
      goalsResult,
      settingsResult,
      hydrationResult,
    ] = await Promise.all([
      supabase
        .from('workouts')
        .select('id, started_at, calories_burned, duration_minutes, type')
        .eq('user_id', user.id)
        .gte('started_at', weekAgo.toISOString())
        .order('started_at', { ascending: false }),

      supabase
        .from('food_logs')
        .select('id, calories, protein, carbs, fat, logged_at, meal_type')
        .eq('user_id', user.id)
        .gte('logged_at', weekAgo.toISOString()),

      supabase
        .from('body_metrics')
        .select('id, metric_type, value, captured_at')
        .eq('user_id', user.id)
        .eq('metric_type', 'weight')
        .order('captured_at', { ascending: false })
        .limit(14),

      supabase
        .from('goals')
        .select('id, goal_type, target_value')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1),

      supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single(),

      supabase
        .from('supplement_logs')
        .select('id, amount_ml, logged_at')
        .eq('user_id', user.id)
        .gte('logged_at', weekAgo.toISOString()),
    ]);

    const workouts = workoutsResult.data || [];
    const foodLogs = foodLogsResult.data || [];
    const bodyMetrics = bodyMetricsResult.data || [];
    const goals = goalsResult.data || [];
    const settings = settingsResult.data as any;
    const hydrationLogs = hydrationResult.data || [];

    // ─── Calculate aggregates ───────────────────────────────────
    const workoutsThisWeek = workouts.length;
    const totalCaloriesBurned = workouts.reduce((sum: number, w: any) => sum + (w.calories_burned || 0), 0);
    const totalProteinConsumed = foodLogs.reduce((sum: number, f: any) => sum + (f.protein || 0), 0);
    const totalCaloriesConsumed = foodLogs.reduce((sum: number, f: any) => sum + (f.calories || 0), 0);

    // FIX: Calculate hydration average over actual days logged, not hardcoded 7
    const hydrationDaysLogged = hydrationLogs.length > 0
      ? new Set(hydrationLogs.map((h: any) => h.logged_at?.split('T')[0]).filter(Boolean)).size
      : 0;
    const hydrationAvg = hydrationDaysLogged > 0
      ? hydrationLogs.reduce((sum: number, h: any) => sum + (h.amount_ml || 0), 0) / hydrationDaysLogged
      : 0;

    const streak = settings?.streak_count || settings?.login_streak || 0;

    // Weight trend
    let weightTrend: 'up' | 'down' | 'stable' = 'stable';
    let latestWeight: number | undefined;
    if (bodyMetrics.length >= 2) {
      const recent = bodyMetrics[0].value as number;
      const older = bodyMetrics[Math.min(bodyMetrics.length - 1, 6)].value as number;
      latestWeight = recent;
      const diff = recent - older;
      if (diff > 0.5) weightTrend = 'up';
      else if (diff < -0.5) weightTrend = 'down';
    } else if (bodyMetrics.length === 1) {
      latestWeight = bodyMetrics[0].value as number;
    }

    const hasFoodLogsToday = foodLogs.some((f: any) => f.logged_at?.startsWith(today));
    const hasWorkoutToday = workouts.some((w: any) => w.started_at?.startsWith(today));

    // Days since last workout
    let daysSinceLastWorkout: number | undefined;
    if (workouts.length === 0) {
      const { data: olderWorkouts } = await supabase
        .from('workouts')
        .select('started_at')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1);
      if (olderWorkouts && olderWorkouts.length > 0) {
        const lastDate = new Date(olderWorkouts[0].started_at);
        daysSinceLastWorkout = Math.floor((now.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
      }
    } else {
      daysSinceLastWorkout = 0;
    }

    const primaryGoal = goals[0]?.goal_type;

    // ─── Generate rule-based insights ──────────────────────────
    const result = generateRuleBasedInsights({
      workoutsThisWeek,
      totalCaloriesBurned,
      totalProteinConsumed,
      totalCaloriesConsumed,
      streak,
      hydrationAvg,
      latestWeight,
      weightTrend,
      primaryGoal,
      hasFoodLogsToday,
      hasWorkoutToday,
      daysSinceLastWorkout,
    });

    // ─── Try AI-powered insight (best-effort, non-blocking) ─────
    let aiInsight: string | null = null;
    try {
      const { generateText } = await import('@/lib/ai/gemini-service');
      const prompt = `You are a concise fitness AI. Based on this user data from the past 7 days, write ONE actionable insight sentence (max 15 words). Be specific.

Workouts: ${workoutsThisWeek} sessions, ${totalCaloriesBurned} cal burned
Protein: ${totalProteinConsumed}g total this week (${Math.round(totalProteinConsumed / 7)}g/day avg)
Calories: ${totalCaloriesConsumed} total consumed
Hydration: ${Math.round(hydrationAvg)}ml/day avg
Streak: ${streak} days
Goal: ${primaryGoal || 'not set'}
Weight trend: ${weightTrend}
${hasFoodLogsToday ? 'Has food logs today.' : 'No food logged today.'}
${hasWorkoutToday ? 'Worked out today.' : 'No workout today.'}

Respond with ONLY the insight sentence. No explanation, no markdown.`;

      aiInsight = await generateText(prompt, 'You are a fitness data analyst. Respond with one concise insight sentence only.');
      if (aiInsight) {
        aiInsight = aiInsight
          .replace(/^["'`\u201C\u201D]+|["'`\u201C\u201D]+$/g, '')
          .replace(/^[•\-\*]\s*/, '')
          .trim()
          .slice(0, 200);
      }
    } catch {
      aiInsight = null;
    }

    const response: HomeInsightsResponse = {
      insights: result.insights,
      bodyIntelligenceInsight: aiInsight || result.bodyIntelligenceInsight,
      source: aiInsight ? 'ai' : 'rule',
      generatedAt: new Date().toISOString(),
      aggregateData: {
        hydrationMl: Math.round(hydrationAvg),
        caloriesBurned: totalCaloriesBurned,
        proteinG: totalProteinConsumed,
        caloriesConsumed: totalCaloriesConsumed,
        streak,
        workoutsThisWeek,
        weightTrend,
        primaryGoal: primaryGoal || 'not set',
        hasFoodToday: hasFoodLogsToday,
        hasWorkoutToday: hasWorkoutToday,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[ai/home-insights] Error:', err);
    return NextResponse.json({ error: 'Failed to generate insights', details: msg }, { status: 500 });
  }
}
