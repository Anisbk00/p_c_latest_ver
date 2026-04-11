import { retrieveContext } from '@/lib/iron-coach/retriever';
import { getSupabase } from '@/lib/supabase/supabase-data';
import { createCloudEmbedding } from './cloud';
import { getTopAIMemory, searchAIEmbeddings } from './ai-store';
import { buildHybridCoachSystemPrompt, buildHybridCoachUserPrompt } from './prompt-template';
import type { IronCoachContextSnapshot } from './types';

// Type for weekly plan data
interface WeeklyPlanData {
  id: string;
  week_start_date: string;
  week_end_date: string;
  plan_data: {
    week_start: string;
    week_end: string;
    plan_confidence: number;
    generation_reasoning: string;
    weekly_overview?: {
      total_workout_days: number;
      total_rest_days: number;
      weekly_calorie_target: number;
      weekly_protein_target: number;
      focus_areas: string[];
      weekly_strategy: string;
    };
    daily_plan?: Array<{
      date: string;
      day_name: string;
      is_workout_day: boolean;
      workout: {
        focus: string;
        duration_minutes: number;
        estimated_calories_burned: number;
        intensity: string;
        exercises: Array<{
          name: string;
          type: string;
          sets: number;
          reps: string;
          weight_kg?: number;
          notes?: string;
        }>;
        warm_up?: string;
        cool_down?: string;
        coach_notes?: string;
      } | null;
      nutrition: {
        target_calories: number;
        target_protein: number;
        target_carbs: number;
        target_fat: number;
        meals: Array<{
          meal_type: string;
          time?: string;
          foods: Array<{
            name: string;
            quantity: number;
            unit: string;
            calories: number;
            protein: number;
          }>;
          total_calories: number;
          total_protein: number;
        }>;
        hydration_ml: number;
      };
      sleep: {
        target_bedtime: string;
        target_wake_time: string;
        target_duration_hours: number;
      };
      supplements: Array<{ name: string; dose: string; timing: string }>;
      coach_message: string;
      confidence: number;
    }>;
    recommendations?: Array<{
      category: string;
      priority: string;
      recommendation: string;
      reasoning: string;
    }>;
  };
  confidence_score: number;
  created_at: string;
}

function clampPercent(value: number | null | undefined): number {
  if (!Number.isFinite(value as number)) return 0;
  return Math.max(0, Math.min(100, Math.round(value as number)));
}

function calculateAge(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Calculate protein target based on bodyweight and goal
 * Standard recommendations:
 * - General fitness: 1.6g/kg
 * - Fat loss: 2.0-2.2g/kg (higher to preserve muscle)
 * - Muscle gain: 1.8-2.0g/kg
 * 
 * Returns null if weight is unknown (will be marked as "unknown" in prompt)
 */
function calculateProteinTarget(weightKg: number | null | undefined, goal?: string | null): number | null {
  if (!weightKg || weightKg <= 0) return null;
  
  const goalLower = goal?.toLowerCase() || '';
  let multiplier = 1.6; // default
  
  if (goalLower.includes('fat_loss') || goalLower.includes('fat loss')) {
    multiplier = 2.0;
  } else if (goalLower.includes('muscle') || goalLower.includes('gain')) {
    multiplier = 1.8;
  } else if (goalLower.includes('strength')) {
    multiplier = 1.8;
  }
  
  return Math.round(weightKg * multiplier);
}

export async function buildIronCoachContext(userId: string, question: string): Promise<IronCoachContextSnapshot> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  // Calculate current week dates for weekly plan lookup
  const today = new Date();
  const dayOfWeek = today.getDay();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); // Monday
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  // Fetch all user data in parallel
  const [
    profileRes,
    extendedProfileRes,
    settingsRes,
    goalsRes,
    workoutsRes,
    foodRes,
    insightsRes,
    bodyMetricsRes,
    sleepRes,
    hydrationRes,
    supplementsRes,
    recentChatRes,
    docs,
    memoryContext,
    weeklyPlanRes,
  ] = await Promise.all([
    // User profile (name, age, weight, height, etc.)
    supabase
      .from('profiles')
      .select('id, name, birthdate, sex, height_cm, weight_kg, activity_level, fitness_level, dietary_restrictions, allergies, avatar_url')
      .eq('id', userId)
      .maybeSingle(),
    // Extended user profile (target weight, primary goal, etc.)
    supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    // User settings (streak, preferences)
    supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    // User goals
    supabase
      .from('goals')
      .select('goal_type, target_weight_kg, target_date, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3),
    // Recent workouts
    supabase
      .from('workouts')
      .select('calories_burned, started_at, duration_minutes, workout_type, notes')
      .eq('user_id', userId)
      .gte('started_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order('started_at', { ascending: false }),
    // Recent food logs
    supabase
      .from('food_logs')
      .select('protein, calories, carbs, fat, logged_at, food_name, meal_type')
      .eq('user_id', userId)
      .gte('logged_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order('logged_at', { ascending: false }),
    // AI insights
    supabase
      .from('ai_insights')
      .select('title, content, confidence, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    // Body metrics (weight history)
    supabase
      .from('body_metrics')
      .select('metric_type, value, unit, logged_at')
      .eq('user_id', userId)
      .in('metric_type', ['weight', 'body_fat', 'muscle_mass', 'waist', 'chest', 'arms'])
      .order('logged_at', { ascending: false })
      .limit(20),
    // Sleep logs
    supabase
      .from('sleep_logs')
      .select('duration_minutes, quality, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order('logged_at', { ascending: false })
      .limit(7),
    // Hydration logs (last 7 days)
    supabase
      .from('supplement_logs')
      .select('amount_ml, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order('logged_at', { ascending: false })
      .limit(14),
    // User's supplements
    supabase
      .from('supplements')
      .select('name, dose, timing, frequency')
      .eq('user_id', userId),
    // Recent chat messages (last 10 for memory)
    sb
      .from('ai_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    // RAG documents
    retrieveContext(userId, question, { usePersonalData: true, maxDocuments: 6, daysWindow: 30 }),
    // AI memory
    getTopAIMemory(userId, 10),
    // Weekly plan for current week
    sb
      .from('weekly_plans')
      .select('id, week_start_date, week_end_date, plan_data, confidence_score, created_at')
      .eq('user_id', userId)
      .eq('week_start_date', weekStartStr)
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const profile = profileRes.data as {
    id: string;
    name?: string | null;
    birthdate?: string | null;
    sex?: string | null;
    height_cm?: number | null;
    weight_kg?: number | null;
    activity_level?: string | null;
    fitness_level?: string | null;
    dietary_restrictions?: string[] | null;
    allergies?: string[] | null;
    avatar_url?: string | null;
  } | null;

  const goals = (goalsRes.data ?? []) as Array<{
    goal_type?: string | null;
    target_weight_kg?: number | null;
    target_date?: string | null;
  }>;

  const workouts = (workoutsRes.data ?? []) as Array<{
    calories_burned?: number | null;
    duration_minutes?: number | null;
    workout_type?: string | null;
    notes?: string | null;
    started_at?: string | null;
  }>;

  const foodLogs = (foodRes.data ?? []) as Array<{
    protein?: number | null;
    calories?: number | null;
    carbs?: number | null;
    fat?: number | null;
    food_name?: string | null;
    meal_type?: string | null;
    logged_at?: string | null;
  }>;

  const insights = (insightsRes.data ?? []) as Array<{
    title?: string | null;
    content?: string | null;
    confidence?: number | null;
  }>;

  const bodyMetrics = (bodyMetricsRes.data ?? []) as Array<{
    metric_type?: string | null;
    value?: number | null;
    unit?: string | null;
    logged_at?: string | null;
  }>;

  const sleepLogs = (sleepRes.data ?? []) as Array<{
    duration_minutes?: number | null;
    quality?: number | null;
    logged_at?: string | null;
  }>;

  const hydrationLogs = (hydrationRes.data ?? []) as Array<{
    amount_ml?: number | null;
    logged_at?: string | null;
  }>;

  const supplements = (supplementsRes.data ?? []) as Array<{
    name?: string | null;
    dose?: string | null;
    timing?: string | null;
    frequency?: string | null;
  }>;

  const recentChat = (recentChatRes.data ?? []) as Array<{
    role?: string | null;
    content?: string | null;
    created_at?: string | null;
  }>;

  const extendedProfile = extendedProfileRes.data as Record<string, any> | null;
  const settings = settingsRes.data as Record<string, any> | null;

  const latestGoal = goals[0];

  // Get latest body metrics (need these early for weight calculation)
  const latestWeight = bodyMetrics.find(m => m.metric_type === 'weight');
  const latestBodyFat = bodyMetrics.find(m => m.metric_type === 'body_fat');
  const latestMuscleMass = bodyMetrics.find(m => m.metric_type === 'muscle_mass');

  // Calculate stats
  const workoutsThisWeek = workouts.length;
  const caloriesBurnedThisWeek = Math.round(workouts.reduce((sum, w) => sum + (w.calories_burned ?? 0), 0));
  const totalWorkoutMinutes = workouts.reduce((sum, w) => sum + (w.duration_minutes ?? 0), 0);

  const proteinConsumed = foodLogs.reduce((sum, f) => sum + (f.protein ?? 0), 0);
  const caloriesConsumed = foodLogs.reduce((sum, f) => sum + (f.calories ?? 0), 0);
  
  // Calculate protein target based on user's actual weight, or use null if unknown
  const userWeightKg = profile?.weight_kg || latestWeight?.value || null;
  const calculatedProteinTarget = calculateProteinTarget(userWeightKg, latestGoal?.goal_type);
  
  // Use calculated target if available, otherwise we cannot calculate adherence accurately
  // Protein adherence will be shown as "unknown" if we don't have the target
  const proteinTargetDaily = calculatedProteinTarget;
  const proteinTargetWeekly = calculatedProteinTarget ? calculatedProteinTarget * 7 : null;
  
  // Calculate adherence only if we have a valid target
  const proteinAdherencePct = proteinTargetWeekly 
    ? clampPercent((proteinConsumed / proteinTargetWeekly) * 100)
    : 0; // 0 means "unknown", not actual adherence

  const latestInsightConfidence = insights[0]?.confidence ?? 0.75;
  const momentumScore = clampPercent((workoutsThisWeek * 15) + (proteinAdherencePct * 0.55) + (latestInsightConfidence * 20));

  const recentInsights = insights.map((insight) => insight.title || insight.content || 'AI insight');

  // Calculate average sleep
  const avgSleepMinutes = sleepLogs.length > 0
    ? Math.round(sleepLogs.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) / sleepLogs.length)
    : null;
  const avgSleepQuality = sleepLogs.length > 0
    ? Math.round(sleepLogs.reduce((sum, s) => sum + (s.quality ?? 0), 0) / sleepLogs.length)
    : null;

  // Build embedding snippets
  let embeddingSnippets: Array<{ source: string; text: string; similarity: number }> = [];
  try {
    const vector = await createCloudEmbedding(question);
    if (vector.length > 0) {
      const matches = await searchAIEmbeddings({
        userId,
        queryEmbedding: vector,
        matchCount: 5,
        sourceTables: ['workouts', 'food_logs', 'sleep_logs', 'body_metrics', 'ai_messages'],
      });

      embeddingSnippets = matches.map((match) => ({
        source: match.source_table,
        text: match.content,
        similarity: match.similarity,
      }));
    }
  } catch {
    embeddingSnippets = [];
  }

  const retrievalContext = [
    ...docs.map((d) => d.content),
    ...embeddingSnippets.map((snippet) => snippet.text),
  ].slice(0, 10);

  // Process weekly plan data
  const weeklyPlanData = weeklyPlanRes?.data as WeeklyPlanData | null;
  const planData = weeklyPlanData?.plan_data;
  const todayDailyPlan = planData?.daily_plan?.find((d: any) => d.date === todayStr);

  const weeklyPlan = {
    exists: !!weeklyPlanData,
    weekStart: weeklyPlanData?.week_start_date || null,
    weekEnd: weeklyPlanData?.week_end_date || null,
    confidence: weeklyPlanData?.confidence_score || null,
    overview: planData?.weekly_overview ? {
      totalWorkoutDays: planData.weekly_overview.total_workout_days || 0,
      totalRestDays: planData.weekly_overview.total_rest_days || 0,
      weeklyCalorieTarget: planData.weekly_overview.weekly_calorie_target || 0,
      weeklyProteinTarget: planData.weekly_overview.weekly_protein_target || 0,
      focusAreas: planData.weekly_overview.focus_areas || [],
      weeklyStrategy: planData.weekly_overview.weekly_strategy || '',
    } : undefined,
    todayPlan: todayDailyPlan ? {
      date: todayDailyPlan.date,
      dayName: todayDailyPlan.day_name,
      isWorkoutDay: todayDailyPlan.is_workout_day,
      workout: todayDailyPlan.workout ? {
        focus: todayDailyPlan.workout.focus,
        durationMinutes: todayDailyPlan.workout.duration_minutes,
        estimatedCaloriesBurned: todayDailyPlan.workout.estimated_calories_burned,
        intensity: todayDailyPlan.workout.intensity,
        exercises: (todayDailyPlan.workout.exercises || []).map((e: any) => ({
          name: e.name,
          type: e.type,
          sets: e.sets,
          reps: e.reps,
        })),
        coachNotes: todayDailyPlan.workout.coach_notes,
      } : null,
      nutrition: {
        targetCalories: todayDailyPlan.nutrition?.target_calories || 0,
        targetProtein: todayDailyPlan.nutrition?.target_protein || 0,
        targetCarbs: todayDailyPlan.nutrition?.target_carbs || 0,
        targetFat: todayDailyPlan.nutrition?.target_fat || 0,
        meals: (todayDailyPlan.nutrition?.meals || []).map((m: any) => ({
          mealType: m.meal_type,
          foods: (m.foods || []).map((f: any) => ({
            name: f.name,
            quantity: f.quantity,
            unit: f.unit,
          })),
        })),
        hydrationMl: todayDailyPlan.nutrition?.hydration_ml || 0,
      },
      sleep: {
        targetBedtime: todayDailyPlan.sleep?.target_bedtime || '22:00',
        targetWakeTime: todayDailyPlan.sleep?.target_wake_time || '06:00',
        targetDurationHours: todayDailyPlan.sleep?.target_duration_hours || 8,
      },
      coachMessage: todayDailyPlan.coach_message || '',
    } : undefined,
    recommendations: planData?.recommendations || undefined,
  };

  // Build comprehensive user profile for AI context
  // IMPORTANT: null values mean "unknown" - AI should NOT assume defaults
  const userProfile = {
    // Basic info
    name: profile?.name || 'User',
    age: calculateAge(profile?.birthdate),
    sex: profile?.sex || null,
    
    // Body metrics - null means not set, AI should ask or give general advice
    heightCm: profile?.height_cm || extendedProfile?.height_cm || null,
    currentWeightKg: userWeightKg,
    targetWeightKg: latestGoal?.target_weight_kg || extendedProfile?.target_weight_kg || null,
    bodyFatPercent: latestBodyFat?.value || null,
    muscleMassKg: latestMuscleMass?.value || null,
    
    // Activity & fitness level
    activityLevel: extendedProfile?.activity_level || profile?.activity_level || 'moderate',
    fitnessLevel: extendedProfile?.fitness_level || profile?.fitness_level || 'beginner',
    
    // Dietary info
    dietaryRestrictions: extendedProfile?.dietary_restrictions || profile?.dietary_restrictions || [],
    allergies: extendedProfile?.allergies || profile?.allergies || [],
    
    // Goals
    primaryGoal: extendedProfile?.primary_goal || latestGoal?.goal_type || 'general_fitness',
    goalTargetDate: latestGoal?.target_date || extendedProfile?.target_date || null,
    
    // Calculated targets based on actual data
    proteinTargetDaily,
    proteinTargetWeekly,
    
    // Recent stats
    workoutsThisWeek,
    caloriesBurnedThisWeek,
    totalWorkoutMinutes,
    proteinAdherencePct,
    caloriesConsumedThisWeek: Math.round(caloriesConsumed),
    proteinConsumedThisWeek: Math.round(proteinConsumed),
    
    // Sleep
    avgSleepHours: avgSleepMinutes ? Math.round(avgSleepMinutes / 60 * 10) / 10 : null,
    avgSleepQuality,
    
    // Hydration (daily average)
    avgHydrationMl: hydrationLogs.length > 0
      ? Math.round(hydrationLogs.reduce((sum, h) => sum + (h.amount_ml ?? 0), 0) / Math.max(1, new Set(hydrationLogs.map(h => h.logged_at?.split('T')[0])).size))
      : null,
    
    // Supplements the user takes
    supplements: supplements.filter(s => s.name).map(s => ({
      name: s.name!,
      dose: s.dose || '',
      timing: s.timing || '',
    })),
    
    // Streak
    currentStreak: settings?.streak_count || settings?.login_streak || 0,
    
    // Momentum
    momentumScore,
  };

  return {
    // Basic context
    userGoal: latestGoal?.goal_type ?? 'general_fitness',
    workoutsThisWeek,
    caloriesBurnedThisWeek,
    proteinAdherencePct,
    proteinTargetDaily, // Add calculated target
    momentumScore,
    recentInsights,
    retrievalContext,
    memoryContext,
    ragSnippets: embeddingSnippets,
    
    // Full user profile for AI
    userProfile,
    
    // Recent food logs (for diet analysis)
    recentFoodLogs: foodLogs.slice(0, 10).map(f => ({
      food: f.food_name,
      meal: f.meal_type,
      protein: f.protein,
      calories: f.calories,
      carbs: f.carbs,
      fat: f.fat,
    })),
    
    // Recent workouts
    recentWorkouts: workouts.slice(0, 5).map(w => ({
      type: w.workout_type,
      duration: w.duration_minutes,
      calories: w.calories_burned,
      notes: w.notes,
    })),
    
    // Weekly plan data
    weeklyPlan,

    // Recent chat history (for conversational continuity)
    recentChatHistory: recentChat.slice(0, 6).reverse().map(m => ({
      role: m.role || 'user',
      content: m.content || '',
    })),
  };
}

export function buildContextPrompt(context: IronCoachContextSnapshot, question: string, locale = 'en', adaptiveBlock?: string): string {
  const systemPrompt = buildHybridCoachSystemPrompt(locale);
  const userPrompt = buildHybridCoachUserPrompt({
    question,
    context,
    memory: context.memoryContext ?? [],
    ragSnippets: context.ragSnippets ?? [],
  });

  const adaptiveSection = adaptiveBlock ? `\n\n${adaptiveBlock}` : '';
  return `${systemPrompt}

${userPrompt}${adaptiveSection}`;
}
