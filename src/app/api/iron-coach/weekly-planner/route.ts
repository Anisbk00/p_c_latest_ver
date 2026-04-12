import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { calculatePersonalizedTargets } from '@/lib/personalized-targets';

// Direct Groq API call for weekly planner — bypasses generateText fallback chain
// Uses llama-3.3-70b-versatile with JSON mode for reliable structured output
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const PLANNER_MODEL = 'llama-3.3-70b-versatile';
const PLANNER_TIMEOUT_MS = 25000; // 25s per attempt — fits within Vercel 60s maxDuration with data fetch

/**
 * PRECISION WEEKLY PLANNER API
 * 
 * Generates hyper-personalized weekly workout and nutrition plans
 * based on comprehensive user data analysis.
 * 
 * POST /api/iron-coach/weekly-planner
 * GET /api/iron-coach/weekly-planner
 */

// TYPES

interface UserComprehensiveData {
  // Profile
  profile: {
    name: string;
    email: string;
    age: number | null;
    sex: string | null;
    height_cm: number | null;
    current_weight_kg: number | null;
    target_weight_kg: number | null;
    activity_level: string;
    fitness_level: string;
    dietary_restrictions: string[];
    allergies: string[];
    primary_goal: string;
    target_date: string | null;
  };
  
  // Calculated targets
  targets: {
    daily_calories: number;
    daily_protein: number;
    daily_carbs: number;
    daily_fat: number;
    water_ml: number;
    workout_days_per_week: number;
    bmr: number;
    tdee: number;
    confidence: number;
  };
  
  // Body metrics history
  bodyMetrics: {
    weight_trend: 'up' | 'down' | 'stable';
    weight_change_30d: number;
    weight_change_7d: number;
    latest_body_fat: number | null;
    latest_muscle_mass: number | null;
    weight_history: Array<{ date: string; weight: number }>;
  };
  
  // Workout history and patterns
  workoutPatterns: {
    total_workouts_30d: number;
    total_workouts_7d: number;
    avg_duration_minutes: number;
    avg_calories_burned: number;
    favorite_workout_types: string[];
    workout_frequency_per_week: number;
    best_performing_days: string[];
    recent_workouts: Array<{
      date: string;
      type: string;
      duration: number;
      calories: number;
      exercises: string[];
    }>;
    muscles_trained_last_7d: string[];
    recovery_days_last_7d: number;
  };
  
  // Nutrition patterns
  nutritionPatterns: {
    avg_daily_calories_7d: number;
    avg_daily_protein_7d: number;
    avg_daily_carbs_7d: number;
    avg_daily_fat_7d: number;
    protein_adherence_percent: number;
    calorie_adherence_percent: number;
    most_common_foods: string[];
    meal_timing: {
      avg_breakfast_time: string | null;
      avg_lunch_time: string | null;
      avg_dinner_time: string | null;
    };
    macro_distribution: {
      protein_percent: number;
      carbs_percent: number;
      fat_percent: number;
    };
    recent_meals: Array<{
      date: string;
      meal_type: string;
      foods: string[];
      calories: number;
      protein: number;
    }>;
  };
  
  // Sleep patterns
  sleepPatterns: {
    avg_duration_hours: number;
    avg_quality: number;
    sleep_schedule: {
      avg_bedtime: string | null;
      avg_wake_time: string | null;
    };
    sleep_debt_hours: number;
  };
  
  // Supplement usage
  supplementUsage: {
    active_supplements: string[];
    consistency_percent: number;
  };
  
  // AI insights
  aiInsights: Array<{
    type: string;
    title: string;
    content: string;
    confidence: number;
  }>;
  
  // AI memory
  aiMemory: Array<{
    key: string;
    value: any;
  }>;
  
  // Goals
  activeGoals: Array<{
    type: string;
    target: number;
    deadline: string | null;
    progress: number;
  }>;
  
  // Streaks and momentum
  momentum: {
    current_streak: number;
    longest_streak: number;
    momentum_score: number;
  };
}

// DATA FETCHING FUNCTIONS

async function fetchComprehensiveUserData(sb: any, userId: string): Promise<UserComprehensiveData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Fetch all data in parallel
  const [
    profileRes,
    userProfileRes,
    userSettingsRes,
    bodyMetricsRes,
    workoutsRes,
    workoutExercisesRes,
    foodLogsRes,
    sleepLogsRes,
    supplementLogsRes,
    supplementsRes,
    goalsRes,
    aiInsightsRes,
    aiMemoryRes,
    behaviorProfileRes,
    userStateRes,
  ] = await Promise.all([
    // Basic profile
    sb.from('profiles').select('*').eq('id', userId).single(),
    
    // Extended profile
    sb.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
    
    // User settings
    sb.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    
    // Body metrics (last 30 days)
    sb.from('body_metrics')
      .select('*')
      .eq('user_id', userId)
      .gte('captured_at', thirtyDaysAgo.toISOString())
      .order('captured_at', { ascending: false }),
    
    // Workouts (last 30 days)
    sb.from('workouts')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', thirtyDaysAgo.toISOString())
      .order('started_at', { ascending: false }),
    
    // Workout exercises
    sb.from('workout_exercises')
      .select('*, workouts!inner(user_id, started_at)')
      .eq('workouts.user_id', userId)
      .gte('workouts.started_at', sevenDaysAgo.toISOString()),
    
    // Food logs (last 7 days)
    sb.from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', sevenDaysAgo.toISOString())
      .order('logged_at', { ascending: false }),
    
    // Sleep logs (last 7 days)
    sb.from('sleep_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false }),
    
    // Supplement logs (last 7 days)
    sb.from('supplement_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', sevenDaysAgo.toISOString())
      .order('logged_at', { ascending: false }),
    
    // User's supplements
    sb.from('supplements')
      .select('id, name')
      .eq('user_id', userId),
    
    // Goals
    sb.from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5),
    
    // AI insights
    sb.from('ai_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('state', 'active')
      .order('created_at', { ascending: false })
      .limit(10),
    
    // AI memory
    sb.from('ai_memory')
      .select('*')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false })
      .limit(20),
    
    // Behavior profile
    sb.from('user_behavior_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    
    // User state
    sb.from('ai_user_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  
  // Extract data
  const profile = profileRes.data || {};
  const userProfile = userProfileRes.data || {};
  const bodyMetrics = bodyMetricsRes.data || [];
  const workouts = workoutsRes.data || [];
  const workoutExercises = workoutExercisesRes.data || [];
  const foodLogs = foodLogsRes.data || [];
  const sleepLogs = sleepLogsRes.data || [];
  const supplementLogs = supplementLogsRes.data || [];
  const supplements = supplementsRes.data || [];
  const goals = goalsRes.data || [];
  const aiInsights = aiInsightsRes.data || [];
  const aiMemory = aiMemoryRes.data || [];
  const behaviorProfile = behaviorProfileRes.data || {};
  const userState = userStateRes.data || {};
  
  // Calculate age
  let age: number | null = null;
  if (userProfile.birth_date) {
    const birth = new Date(userProfile.birth_date);
    age = Math.floor((now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }
  
  // Get latest weight
  const weightMetrics = bodyMetrics.filter((m: any) => m.metric_type === 'weight');
  const latestWeight = weightMetrics[0]?.value || null;
  
  // Calculate personalized targets
  const personalizedTargets = calculatePersonalizedTargets({
    weightKg: latestWeight,
    heightCm: userProfile.height_cm || null,
    birthDate: userProfile.birth_date || null,
    biologicalSex: userProfile.biological_sex || null,
    activityLevel: userProfile.activity_level || 'moderate',
    fitnessLevel: userProfile.fitness_level || 'beginner',
    primaryGoal: userProfile.primary_goal || 'maintenance',
    targetWeightKg: userProfile.target_weight_kg || null,
    targetDate: userProfile.target_date || null,
    bodyFatPercent: bodyMetrics.find((m: any) => m.metric_type === 'body_fat')?.value || null,
  });
  
  // ═══════════════════════════════════════════════════════════
  // BUILD COMPREHENSIVE DATA OBJECT
  // ═══════════════════════════════════════════════════════════
  
  // Weight trend calculation
  const weight30dAgo = weightMetrics.find((m: any) => 
    new Date(m.captured_at) <= thirtyDaysAgo
  )?.value;
  const weight7dAgo = weightMetrics.find((m: any) => 
    new Date(m.captured_at) <= sevenDaysAgo
  )?.value;
  
  let weightTrend: 'up' | 'down' | 'stable' = 'stable';
  if (latestWeight && weight7dAgo) {
    const diff = latestWeight - weight7dAgo;
    if (Math.abs(diff) >= 0.3) {
      weightTrend = diff > 0 ? 'up' : 'down';
    }
  }
  
  // Workout patterns
  const workouts7d = workouts.filter((w: any) => new Date(w.started_at) >= sevenDaysAgo);
  const workoutTypes: Record<string, number> = {};
  const dayWorkoutCount: Record<string, number> = {};
  const musclesTrained = new Set<string>();
  
  workouts7d.forEach((w: any) => {
    const type = w.workout_type || w.activity_type || 'other';
    workoutTypes[type] = (workoutTypes[type] || 0) + 1;
    
    const dayName = new Date(w.started_at).toLocaleDateString('en-US', { weekday: 'long' });
    dayWorkoutCount[dayName] = (dayWorkoutCount[dayName] || 0) + 1;
    
    // Extract muscles from workout type
    const typeLower = type.toLowerCase();
    if (typeLower.includes('upper')) musclesTrained.add('upper_body');
    if (typeLower.includes('lower')) musclesTrained.add('lower_body');
    if (typeLower.includes('push')) musclesTrained.add('push');
    if (typeLower.includes('pull')) musclesTrained.add('pull');
    if (typeLower.includes('leg')) musclesTrained.add('legs');
    if (typeLower.includes('chest')) musclesTrained.add('chest');
    if (typeLower.includes('back')) musclesTrained.add('back');
  });
  
  // Process workout exercises
  workoutExercises.forEach((e: any) => {
    if (e.exercise_name) musclesTrained.add(e.exercise_name.toLowerCase());
  });
  
  const avgDuration = workouts7d.length > 0 
    ? Math.round(workouts7d.reduce((sum: number, w: any) => sum + (w.duration_minutes || 0), 0) / workouts7d.length)
    : 45;
  const avgCalories = workouts7d.length > 0
    ? Math.round(workouts7d.reduce((sum: number, w: any) => sum + (w.calories_burned || 0), 0) / workouts7d.length)
    : 300;
  
  const bestDays = Object.entries(dayWorkoutCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => day);
  
  // Nutrition patterns
  const foodByDate: Record<string, { calories: number; protein: number; carbs: number; fat: number; meals: any[] }> = {};
  const foodCounts: Record<string, number> = {};
  
  foodLogs.forEach((f: any) => {
    const date = f.logged_at.split('T')[0];
    if (!foodByDate[date]) {
      foodByDate[date] = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: [] };
    }
    foodByDate[date].calories += f.calories || 0;
    foodByDate[date].protein += f.protein || 0;
    foodByDate[date].carbs += f.carbs || 0;
    foodByDate[date].fat += f.fat || 0;
    foodByDate[date].meals.push(f);
    
    if (f.food_name) {
      foodCounts[f.food_name] = (foodCounts[f.food_name] || 0) + 1;
    }
  });
  
  const dates = Object.keys(foodByDate);
  const avgCalories7d = dates.length > 0
    ? Math.round(Object.values(foodByDate).reduce((sum, d) => sum + d.calories, 0) / dates.length)
    : 0;
  const avgProtein7d = dates.length > 0
    ? Math.round(Object.values(foodByDate).reduce((sum, d) => sum + d.protein, 0) / dates.length)
    : 0;
  const avgCarbs7d = dates.length > 0
    ? Math.round(Object.values(foodByDate).reduce((sum, d) => sum + d.carbs, 0) / dates.length)
    : 0;
  const avgFat7d = dates.length > 0
    ? Math.round(Object.values(foodByDate).reduce((sum, d) => sum + d.fat, 0) / dates.length)
    : 0;
  
  const proteinAdherence = personalizedTargets.protein > 0
    ? Math.min(100, Math.round((avgProtein7d / personalizedTargets.protein) * 100))
    : 0;
  const calorieAdherence = personalizedTargets.calories > 0
    ? Math.min(100, Math.round((avgCalories7d / personalizedTargets.calories) * 100))
    : 0;
  
  const mostCommonFoods = Object.entries(foodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);
  
  // Calculate macro distribution
  const totalMacroCalories = avgProtein7d * 4 + avgCarbs7d * 4 + avgFat7d * 9;
  const macroDistribution = {
    protein_percent: totalMacroCalories > 0 ? Math.round((avgProtein7d * 4 / totalMacroCalories) * 100) : 25,
    carbs_percent: totalMacroCalories > 0 ? Math.round((avgCarbs7d * 4 / totalMacroCalories) * 100) : 50,
    fat_percent: totalMacroCalories > 0 ? Math.round((avgFat7d * 9 / totalMacroCalories) * 100) : 25,
  };
  
  // Sleep patterns
  const avgSleepDuration = sleepLogs.length > 0
    ? Math.round(sleepLogs.reduce((sum: number, s: any) => sum + (s.duration_minutes || 0), 0) / sleepLogs.length)
    : 480;
  const avgSleepQuality = sleepLogs.length > 0
    ? Math.round(sleepLogs.reduce((sum: number, s: any) => sum + (s.sleep_score || 70), 0) / sleepLogs.length)
    : 70;
  
  // Supplement usage
  const supplementConsistency = supplements.length > 0
    ? Math.round((supplementLogs.length / (supplements.length * 7)) * 100)
    : 0;
  
  // Build final comprehensive data
  const comprehensiveData: UserComprehensiveData = {
    profile: {
      name: profile.name || 'User',
      email: profile.email || '',
      age,
      sex: userProfile.biological_sex || null,
      height_cm: userProfile.height_cm || null,
      current_weight_kg: latestWeight,
      target_weight_kg: userProfile.target_weight_kg || null,
      activity_level: userProfile.activity_level || 'moderate',
      fitness_level: userProfile.fitness_level || 'beginner',
      dietary_restrictions: userProfile.dietary_restrictions || [],
      allergies: userProfile.allergies || [],
      primary_goal: userProfile.primary_goal || 'maintenance',
      target_date: userProfile.target_date || null,
    },
    
    targets: {
      daily_calories: personalizedTargets.calories,
      daily_protein: personalizedTargets.protein,
      daily_carbs: personalizedTargets.carbs,
      daily_fat: personalizedTargets.fat,
      water_ml: personalizedTargets.waterMl,
      workout_days_per_week: personalizedTargets.workoutDaysPerWeek,
      bmr: personalizedTargets.bmr,
      tdee: personalizedTargets.tdee,
      confidence: personalizedTargets.confidence,
    },
    
    bodyMetrics: {
      weight_trend: weightTrend,
      weight_change_30d: latestWeight && weight30dAgo ? Math.round((latestWeight - weight30dAgo) * 10) / 10 : 0,
      weight_change_7d: latestWeight && weight7dAgo ? Math.round((latestWeight - weight7dAgo) * 10) / 10 : 0,
      latest_body_fat: bodyMetrics.find((m: any) => m.metric_type === 'body_fat')?.value || null,
      latest_muscle_mass: bodyMetrics.find((m: any) => m.metric_type === 'muscle_mass')?.value || null,
      weight_history: weightMetrics.slice(0, 10).map((m: any) => ({
        date: m.captured_at.split('T')[0],
        weight: m.value,
      })),
    },
    
    workoutPatterns: {
      total_workouts_30d: workouts.length,
      total_workouts_7d: workouts7d.length,
      avg_duration_minutes: avgDuration,
      avg_calories_burned: avgCalories,
      favorite_workout_types: Object.entries(workoutTypes).map(([type]) => type).slice(0, 5),
      workout_frequency_per_week: Math.round((workouts.length / 4) * 10) / 10,
      best_performing_days: bestDays,
      recent_workouts: workouts.slice(0, 7).map((w: any) => ({
        date: w.started_at.split('T')[0],
        type: w.workout_type || w.activity_type,
        duration: w.duration_minutes,
        calories: w.calories_burned,
        exercises: [],
      })),
      muscles_trained_last_7d: Array.from(musclesTrained),
      recovery_days_last_7d: 7 - workouts7d.length,
    },
    
    nutritionPatterns: {
      avg_daily_calories_7d: avgCalories7d,
      avg_daily_protein_7d: avgProtein7d,
      avg_daily_carbs_7d: avgCarbs7d,
      avg_daily_fat_7d: avgFat7d,
      protein_adherence_percent: proteinAdherence,
      calorie_adherence_percent: calorieAdherence,
      most_common_foods: mostCommonFoods,
      meal_timing: {
        avg_breakfast_time: null,
        avg_lunch_time: null,
        avg_dinner_time: null,
      },
      macro_distribution: macroDistribution,
      recent_meals: foodLogs.slice(0, 10).map((f: any) => ({
        date: f.logged_at.split('T')[0],
        meal_type: f.meal_type,
        foods: [f.food_name],
        calories: f.calories,
        protein: f.protein,
      })),
    },
    
    sleepPatterns: {
      avg_duration_hours: Math.round(avgSleepDuration / 60 * 10) / 10,
      avg_quality: avgSleepQuality,
      sleep_schedule: {
        avg_bedtime: null,
        avg_wake_time: null,
      },
      sleep_debt_hours: Math.max(0, 7.5 - avgSleepDuration / 60),
    },
    
    supplementUsage: {
      active_supplements: supplements.map((s: any) => s.name),
      consistency_percent: supplementConsistency,
    },
    
    aiInsights: aiInsights.map((i: any) => ({
      type: i.insight_type,
      title: i.title,
      content: i.content,
      confidence: i.confidence,
    })),
    
    aiMemory: aiMemory.map((m: any) => ({
      key: m.memory_key,
      value: m.memory_value,
    })),
    
    activeGoals: goals.map((g: any) => ({
      type: g.goal_type,
      target: g.target_value,
      deadline: g.deadline || g.target_date,
      progress: g.current_value ? Math.round((g.current_value / g.target_value) * 100) : 0,
    })),
    
    momentum: {
      current_streak: behaviorProfile.current_streak || 0,
      longest_streak: behaviorProfile.longest_streak || 0,
      momentum_score: userState.momentum_score || 50,
    },
  };
  
  return comprehensiveData;
}

// GOAL CONFIGURATION

interface GoalConfiguration {
  workoutDays: number;
  exercisesPerSession: number;
  setsPerExercise: string;
  workoutDuration: number;
  intensity: string;
  trainingSplit: string;
  goalRules: string;
}

function getGoalConfiguration(goal: string, fitnessLevel: string, preferredDays?: number): GoalConfiguration {
  const isBeginner = fitnessLevel === 'beginner';
  const isAdvanced = fitnessLevel === 'advanced' || fitnessLevel === 'intermediate';
  
  // Base configuration by goal type
  if (goal.includes('fat_loss') || goal.includes('weight_loss') || goal.includes('lose')) {
    return {
      workoutDays: preferredDays || (isBeginner ? 4 : 5),
      exercisesPerSession: isBeginner ? 4 : 5,
      setsPerExercise: isBeginner ? '3' : '3-4',
      workoutDuration: isBeginner ? 45 : 60,
      intensity: 'moderate-high',
      trainingSplit: 'Cardio + Full Body / Upper / Lower Split',
      goalRules: `
• FAT LOSS PRIORITY: High calorie burn focus
• Include 2-3 cardio sessions per week (20-30 min)
• Circuit training or supersets to keep heart rate up
• Shorter rest periods (45-60 seconds)
• Higher rep ranges (12-15 reps)
• Add HIIT on 1-2 days
• Focus on compound movements for maximum calorie burn
• Caloric deficit through both exercise and nutrition
• Track progress photos and measurements`
    };
  }
  
  if (goal.includes('muscle') || goal.includes('gain') || goal.includes('hypertrophy') || goal.includes('build')) {
    return {
      workoutDays: preferredDays || (isBeginner ? 3 : 4),
      exercisesPerSession: isBeginner ? 4 : 5,
      setsPerExercise: isBeginner ? '3' : '4',
      workoutDuration: isBeginner ? 45 : 60,
      intensity: 'moderate',
      trainingSplit: 'Push/Pull/Legs or Upper/Lower Split',
      goalRules: `
• MUSCLE BUILDING PRIORITY: Hypertrophy focus
• Progressive overload each week
• Moderate rep ranges (8-12 reps)
• Longer rest periods (90-120 seconds for compounds)
• Focus on time under tension
• Train each muscle group 2x per week minimum
• Compound movements first, then isolation
• Caloric surplus or maintenance
• Prioritize protein intake (2g per kg bodyweight)`
    };
  }
  
  if (goal.includes('strength') || goal.includes('power')) {
    return {
      workoutDays: preferredDays || (isBeginner ? 3 : 4),
      exercisesPerSession: isBeginner ? 3 : 4,
      setsPerExercise: isBeginner ? '3' : '5',
      workoutDuration: isBeginner ? 45 : 60,
      intensity: 'high',
      trainingSplit: 'Full Body or Upper/Lower Split',
      goalRules: `
• STRENGTH PRIORITY: Low reps, heavy weights
• Focus on compound lifts (squat, deadlift, bench, overhead press)
• Low rep ranges (3-6 reps) for main lifts
• Long rest periods (3-5 minutes for compounds)
• Progressive overload with weight increases
• Power movements early in workout
• Accessory work at higher reps
• Lower total volume but higher intensity
• Ensure adequate recovery between sessions`
    };
  }
  
  if (goal.includes('endurance') || goal.includes('cardio') || goal.includes('stamina')) {
    return {
      workoutDays: preferredDays || 5,
      exercisesPerSession: isBeginner ? 3 : 4,
      setsPerExercise: isBeginner ? '3' : '3-4',
      workoutDuration: isBeginner ? 30 : 45,
      intensity: 'moderate',
      trainingSplit: 'Cardio + Circuit Training',
      goalRules: `
• ENDURANCE PRIORITY: Cardiovascular focus
• Steady-state cardio 3-4x per week
• Include 1-2 HIIT sessions
• Circuit training for muscular endurance
• Higher rep ranges (15-20 reps)
• Short rest periods (30-45 seconds)
• Progressive increase in duration/intensity
• Track heart rate zones
• Include active recovery days`
    };
  }
  
  if (goal.includes('tone') || goal.includes('definition') || goal.includes('sculpt')) {
    return {
      workoutDays: preferredDays || 4,
      exercisesPerSession: isBeginner ? 4 : 5,
      setsPerExercise: isBeginner ? '3' : '3-4',
      workoutDuration: isBeginner ? 45 : 55,
      intensity: 'moderate',
      trainingSplit: 'Upper/Lower + Cardio Split',
      goalRules: `
• TONING PRIORITY: Muscle definition focus
• Combination of strength and cardio
• Moderate weights with controlled tempo
• Rep ranges 10-15 for definition
• Include supersets and drop sets
• 2-3 cardio sessions per week
• Focus on problem areas
• Caloric maintenance or slight deficit
• Higher training frequency per muscle group`
    };
  }
  
  // Default: General Fitness / Maintenance
  return {
    workoutDays: preferredDays || (isBeginner ? 3 : 4),
    exercisesPerSession: isBeginner ? 3 : 4,
    setsPerExercise: isBeginner ? '3' : '3',
    workoutDuration: isBeginner ? 30 : 45,
    intensity: 'moderate',
    trainingSplit: 'Full Body or Upper/Lower Split',
    goalRules: `
• GENERAL FITNESS PRIORITY: Balanced approach
• Mix of strength and cardio
• Focus on functional movements
• Moderate rep ranges (8-12)
• Include flexibility/mobility work
• Sustainable, enjoyable workouts
• Progressive overload for continued improvement
• Maintain current body composition
• Focus on long-term health benefits`
  };
}

// AI PROMPT BUILDER — full user data, AI decides workout frequency

function buildPrecisionWeeklyPlanPrompt(
  data: UserComprehensiveData, 
  weekStart: string, 
  weekEnd: string
): { systemPrompt: string; userPrompt: string } {
  
  const goal = data.profile.primary_goal?.toLowerCase() || 'general_fitness';
  const p = data.profile;
  
  // Calculate actual workout frequency from user's behavior
  const actualDaysPerWeek = data.workoutPatterns.total_workouts_30d > 0
    ? Math.round((data.workoutPatterns.total_workouts_30d / 4) * 10) / 10
    : 0;
  const recentDaysPerWeek = data.workoutPatterns.total_workouts_7d;
  
  const systemPrompt = `You are Iron Coach AI — elite fitness & nutrition planner. Generate a 7-day personalized JSON plan.

═══ USER PROFILE ═══
Name: ${p.name} | Age: ${p.age || '?'} | Sex: ${p.sex || '?'}
Weight: ${p.current_weight_kg || '?'}kg → Target: ${p.target_weight_kg || '?'}kg
Height: ${p.height_cm || '?'}cm | Body Fat: ${data.bodyMetrics.latest_body_fat || '?'}% | Muscle: ${data.bodyMetrics.latest_muscle_mass || '?'}kg
Goal: ${p.primary_goal} | Fitness Level: ${p.fitness_level} | Activity: ${p.activity_level}
Allergies: [${p.allergies.join(', ') || 'none'}] | Restrictions: [${p.dietary_restrictions.join(', ') || 'none'}]

═══ METABOLIC TARGETS ═══
BMR: ${data.targets.bmr} | TDEE: ${data.targets.tdee}
Daily: ${data.targets.daily_calories}cal | ${data.targets.daily_protein}g protein | ${data.targets.daily_carbs}g carbs | ${data.targets.daily_fat}g fat | Water: ${Math.round((data.targets.water_ml || 2500) / 1000)}L

═══ ACTUAL WORKOUT BEHAVIOR ═══
Workouts last 30d: ${data.workoutPatterns.total_workouts_30d} total (~${actualDaysPerWeek}/week)
Workouts last 7d: ${recentDaysPerWeek}
Avg duration: ${data.workoutPatterns.avg_duration_minutes}min | Avg calories burned: ${data.workoutPatterns.avg_calories_burned}
Favorite types: [${data.workoutPatterns.favorite_workout_types.join(', ')}]
Best training days: [${data.workoutPatterns.best_performing_days.join(', ')}]
Muscles trained (7d): [${data.workoutPatterns.muscles_trained_last_7d.join(', ')}]
Recovery days last week: ${data.workoutPatterns.recovery_days_last_7d}
Recent workouts: ${data.workoutPatterns.recent_workouts.slice(0, 5).map(w => `${w.date?.slice(5)} ${w.type} ${w.duration}min`).join(' | ')}

═══ ACTUAL NUTRITION BEHAVIOR ═══
7d avg: ${data.nutritionPatterns.avg_daily_calories_7d}cal | ${data.nutritionPatterns.avg_daily_protein_7d}g P | ${data.nutritionPatterns.avg_daily_carbs_7d}g C | ${data.nutritionPatterns.avg_daily_fat_7d}g F
Protein adherence: ${data.nutritionPatterns.protein_adherence_percent}% of target | Calorie adherence: ${data.nutritionPatterns.calorie_adherence_percent}%
Macro split: ${data.nutritionPatterns.macro_distribution.protein_percent}%P / ${data.nutritionPatterns.macro_distribution.carbs_percent}%C / ${data.nutritionPatterns.macro_distribution.fat_percent}%F
Common foods: [${data.nutritionPatterns.most_common_foods.slice(0, 8).join(', ')}]
Recent meals: ${data.nutritionPatterns.recent_meals.slice(0, 5).map(m => `${m.date?.slice(5)} ${m.meal_type} ${m.calories}cal ${m.protein}gP`).join(' | ')}

═══ RECOVERY ═══
Sleep avg: ${data.sleepPatterns.avg_duration_hours}h | Quality: ${data.sleepPatterns.avg_quality}/100 | Sleep debt: ${data.sleepPatterns.sleep_debt_hours}h
Supplements: [${data.supplementUsage.active_supplements.join(', ')}] | Consistency: ${data.supplementUsage.consistency_percent}%

═══ WEIGHT PROGRESS ═══
Trend: ${data.bodyMetrics.weight_trend} | 7d: ${data.bodyMetrics.weight_change_7d}kg | 30d: ${data.bodyMetrics.weight_change_30d}kg
History: ${data.bodyMetrics.weight_history.map(w => `${w.date}: ${w.weight}kg`).join(' → ')}

═══ ACTIVE GOALS ═══
${data.activeGoals.map(g => `${g.type}: ${g.target} (${g.deadline || 'no deadline'}) — ${g.progress}% progress`).join(' | ') || 'No active goals set'}

═══ MOMENTUM ═══
Streak: ${data.momentum.current_streak}d | Longest: ${data.momentum.longest_streak}d | Score: ${data.momentum.momentum_score}/100

═══ INSTRUCTIONS ═══
1. ANALYZE the user's actual behavior — how often do they ACTUALLY train? Base workout days on reality, not theory. If they train 5x/week, plan 5 days. If 2x, plan 2-3 days (push them slightly).
2. Pick workout TYPES they already do and enjoy (favorite types). Don't introduce random exercises.
3. Schedule workouts on their BEST training days (the days they actually show up).
4. NUTRITION: Use their common foods in meal plans. Adjust portions to hit targets.
5. SCALE difficulty to their fitness level. Beginner = fewer sets, longer rest, simpler exercises.
6. Coach messages must reference their ACTUAL data (streak, adherence %, weight trend).
7. NEVER train same muscle 2 days in a row.
8. Output ONLY valid JSON. No markdown. No explanation. No code fences.`;

  const userPrompt = `Generate a 7-day plan from ${weekStart} to ${weekEnd}. Return ONLY this JSON (no markdown):
{"week_start":"${weekStart}","week_end":"${weekEnd}","plan_confidence":0.85,"generation_reasoning":"brief strategy based on their data","weekly_overview":{"total_workout_days":0,"total_rest_days":0,"weekly_calorie_target":0,"weekly_protein_target":0,"focus_areas":[],"weekly_strategy":""},"daily_plan":[{"date":"YYYY-MM-DD","day_name":"Monday","is_workout_day":true,"workout":{"focus":"","duration_minutes":0,"estimated_calories_burned":0,"intensity":"","exercises":[{"name":"","type":"compound","muscle_groups":[],"sets":0,"reps":"","weight_kg":0,"rest_seconds":0,"notes":""}],"warm_up":"","cool_down":"","coach_notes":""},"nutrition":{"target_calories":0,"target_protein":0,"target_carbs":0,"target_fat":0,"meals":[{"meal_type":"breakfast","time":"07:00","foods":[{"name":"","quantity":1,"unit":"serving","calories":0,"protein":0,"carbs":0,"fat":0}],"total_calories":0,"total_protein":0}],"hydration_ml":0},"sleep":{"target_bedtime":"","target_wake_time":"","target_duration_hours":0},"supplements":[{"name":"","dose":"","timing":""}],"coach_message":"","confidence":0.85}],"recommendations":[{"category":"","priority":"","recommendation":"","reasoning":""}]}`;

  return { systemPrompt, userPrompt };
}

// ═══════════════════════════════════════════════════════════════
// AI PLAN GENERATION — Direct Groq API call with JSON mode
// ═══════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface AIErrorDetail {
  attempt: string;
  stage: 'api_call' | 'json_parse' | 'json_repair' | 'invalid_structure' | 'truncated';
  model: string;
  error: string;
  timestamp: string;
}

interface AIPlanResult {
  plan: any;
  success: boolean;
  errors: AIErrorDetail[];
}

/**
 * Extract JSON from response using balanced brace counting.
 * Handles trailing text and nested objects correctly.
 */
function extractJSON(text: string): { json: string; wasTruncated: boolean } {
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) return { json: cleaned, wasTruncated: false };

  // Use balanced brace counting to find the CORRECT outer closing brace
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let lastBalancedBrace = -1;

  for (let i = firstBrace; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        lastBalancedBrace = i;
        break;
      }
    }
  }

  if (lastBalancedBrace > 0) {
    const extracted = cleaned.slice(firstBrace, lastBalancedBrace + 1);
    const wasTruncated = cleaned.length > lastBalancedBrace + 10;
    return { json: extracted, wasTruncated };
  }

  // Balanced brace not found — JSON is truncated. Use last brace as fallback.
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace > firstBrace) {
    return { json: cleaned.slice(firstBrace, lastBrace + 1), wasTruncated: true };
  }

  return { json: cleaned.slice(firstBrace), wasTruncated: true };
}

/**
 * Attempt to repair truncated JSON by closing unclosed structures.
 */
function repairTruncatedJSON(json: string): string {
  let repaired = json;

  // Count unclosed brackets/braces/strings
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\' && inString) { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }

  // If we're in a string, close it
  if (inString) repaired += '"';

  // Remove trailing comma before closing
  repaired = repaired.replace(/,\s*$/, '');
  // Close open arrays and objects (reverse order — innermost first)
  while (openBrackets > 0) { repaired += ']'; openBrackets--; }
  while (openBraces > 0) { repaired += '}'; openBraces--; }

  return repaired;
}

/**
 * Call Groq API directly for weekly planner with JSON mode.
 * Uses 70b model with temperature 0.1 for maximum JSON reliability.
 */
async function callGroqForPlanner(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; model: string; finishReason: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PLANNER_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: PLANNER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,           // Low temp for deterministic JSON
        max_tokens: 16384,          // Large output — 7-day plan is massive
        response_format: { type: 'json_object' }, // Force JSON mode
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    const finishReason = result.choices?.[0]?.finish_reason || 'unknown';

    if (!content) throw new Error('Empty response from AI');

    return { text: content, model: PLANNER_MODEL, finishReason };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract retry-after delay from error message
 */
function extractRetryDelayMs(errorMsg: string): number {
  const retryMatch = errorMsg.match(/retry.in (\d+(?:\.\d+)?)/i);
  if (retryMatch) return Math.ceil(parseFloat(retryMatch[1]) * 1000);
  return 5000; // Default 5s
}

async function generatePlanWithAI(systemPrompt: string, userPrompt: string): Promise<AIPlanResult> {
  const errors: AIErrorDetail[] = [];

  const attempts = [
    { delay: 0, label: 'attempt 1 (immediate)' },
    { delay: 5000, label: 'attempt 2 (5s delay)' },
  ];

  for (const attempt of attempts) {
    if (attempt.delay > 0) {
      console.log(`[weekly-planner] ${attempt.label}: waiting ${attempt.delay / 1000}s...`);
      await sleep(attempt.delay);
    }

    try {
      console.log(`[weekly-planner] ${attempt.label}: calling Groq API (${PLANNER_MODEL})...`);
      const { text: responseText, model, finishReason } = await callGroqForPlanner(systemPrompt, userPrompt);
      console.log(`[weekly-planner] ${attempt.label}: got response (${responseText.length} chars, finish: ${finishReason})`);

      // Step 1: Extract JSON using balanced brace counting
      const { json: extracted, wasTruncated } = extractJSON(responseText);

      // Step 2: If truncated, try to repair
      let jsonToParse = extracted;
      if (wasTruncated || finishReason === 'length') {
        console.warn(`[weekly-planner] ${attempt.label}: Response truncated (finish: ${finishReason}), repairing...`);
        jsonToParse = repairTruncatedJSON(extracted);
        errors.push({
          attempt: attempt.label,
          stage: 'truncated',
          model,
          error: `Response truncated at ${responseText.length} chars (finish_reason: ${finishReason}). Auto-repair attempted.`,
          timestamp: new Date().toISOString(),
        });
      }

      // Step 3: Try parsing
      try {
        const parsed = JSON.parse(jsonToParse);
        if (parsed.daily_plan?.length === 7) {
          console.log(`[weekly-planner] ${attempt.label}: SUCCESS — 7 days (${model})`);
          return { plan: parsed, success: true, errors };
        }
        if (parsed.daily_plan?.length > 0) {
          console.warn(`[weekly-planner] ${attempt.label}: Got ${parsed.daily_plan.length}/7 days, accepting`);
          return { plan: parsed, success: true, errors };
        }
        errors.push({
          attempt: attempt.label,
          stage: 'invalid_structure',
          model,
          error: `Valid JSON but missing daily_plan. Keys: ${Object.keys(parsed).join(', ')}`,
          timestamp: new Date().toISOString(),
        });
      } catch (parseErr) {
        const errSnippet = jsonToParse.substring(0, 200);
        errors.push({
          attempt: attempt.label,
          stage: 'json_parse',
          model,
          error: `JSON parse failed. Snippet: ${errSnippet}`,
          timestamp: new Date().toISOString(),
        });

        // Aggressive repair
        try {
          let repaired = jsonToParse
            .replace(/[\x00-\x1F\x7F]/g, '')
            .replace(/,\s*([}\]])/g, '$1')
            .replace(/'/g, '"')
            .replace(/\n/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

          repaired = repairTruncatedJSON(repaired);

          const parsed = JSON.parse(repaired);
          if (parsed.daily_plan?.length > 0) {
            console.log(`[weekly-planner] ${attempt.label}: SUCCESS after aggressive repair`);
            return { plan: parsed, success: true, errors };
          }
          errors.push({
            attempt: attempt.label,
            stage: 'invalid_structure',
            model,
            error: `Repaired JSON but missing daily_plan. Keys: ${Object.keys(parsed).join(', ')}`,
            timestamp: new Date().toISOString(),
          });
        } catch {
          errors.push({
            attempt: attempt.label,
            stage: 'json_repair',
            model,
            error: `JSON repair failed. Last 100 chars: ${jsonToParse.slice(-100)}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push({
        attempt: attempt.label,
        stage: 'api_call',
        model: PLANNER_MODEL,
        error: errMsg,
        timestamp: new Date().toISOString(),
      });
      console.error(`[weekly-planner] ${attempt.label}: AI API error — ${errMsg}`);

      // Adaptive delay for rate limits
      if (errMsg.includes('429') || errMsg.includes('rate limit')) {
        const retryMs = extractRetryDelayMs(errMsg);
        const nextIdx = attempts.indexOf(attempt) + 1;
        if (nextIdx < attempts.length && retryMs > attempts[nextIdx].delay) {
          attempts[nextIdx].delay = retryMs;
        }
      }
    }
  }

  console.error(`[weekly-planner] ALL AI ATTEMPTS FAILED:`);
  errors.forEach(e => console.error(`  [${e.attempt}] ${e.model} ${e.stage}: ${e.error}`));
  return { plan: null, success: false, errors };
}

// ═══════════════════════════════════════════════════════════════
// DETERMINISTIC FALLBACK — fully data-driven from user's actual behavior
// ═══════════════════════════════════════════════════════════════

const WORKOUT_TEMPLATES: Record<string, Array<{ focus: string; exercises: Array<{ name: string; type: string; sets: number; reps: string; muscle_groups: string[] }> }>> = {
  push: [{ focus: 'Push (Chest/Shoulders/Triceps)', exercises: [
    { name: 'Bench Press', type: 'compound', sets: 4, reps: '8-10', muscle_groups: ['chest', 'shoulders', 'triceps'] },
    { name: 'Overhead Press', type: 'compound', sets: 3, reps: '8-10', muscle_groups: ['shoulders', 'triceps'] },
    { name: 'Dumbbell Flyes', type: 'isolation', sets: 3, reps: '12-15', muscle_groups: ['chest'] },
    { name: 'Tricep Dips', type: 'compound', sets: 3, reps: '10-12', muscle_groups: ['triceps', 'chest'] },
  ]}],
  pull: [{ focus: 'Pull (Back/Biceps)', exercises: [
    { name: 'Pull-ups', type: 'compound', sets: 4, reps: '6-10', muscle_groups: ['back', 'biceps'] },
    { name: 'Barbell Row', type: 'compound', sets: 4, reps: '8-10', muscle_groups: ['back', 'biceps'] },
    { name: 'Face Pulls', type: 'isolation', sets: 3, reps: '15', muscle_groups: ['rear_delts', 'upper_back'] },
    { name: 'Bicep Curls', type: 'isolation', sets: 3, reps: '12', muscle_groups: ['biceps'] },
  ]}],
  legs: [{ focus: 'Legs (Quads/Hams/Glutes)', exercises: [
    { name: 'Barbell Squat', type: 'compound', sets: 4, reps: '8-10', muscle_groups: ['quads', 'glutes'] },
    { name: 'Romanian Deadlift', type: 'compound', sets: 4, reps: '8-10', muscle_groups: ['hamstrings', 'glutes'] },
    { name: 'Leg Press', type: 'compound', sets: 3, reps: '10-12', muscle_groups: ['quads'] },
    { name: 'Calf Raises', type: 'isolation', sets: 3, reps: '15', muscle_groups: ['calves'] },
  ]}],
  upper: [{ focus: 'Upper Body', exercises: [
    { name: 'Bench Press', type: 'compound', sets: 3, reps: '8-10', muscle_groups: ['chest', 'shoulders', 'triceps'] },
    { name: 'Barbell Row', type: 'compound', sets: 3, reps: '8-10', muscle_groups: ['back', 'biceps'] },
    { name: 'Overhead Press', type: 'compound', sets: 3, reps: '10', muscle_groups: ['shoulders'] },
    { name: 'Pull-ups', type: 'compound', sets: 3, reps: '8', muscle_groups: ['back', 'biceps'] },
  ]}],
  lower: [{ focus: 'Lower Body', exercises: [
    { name: 'Barbell Squat', type: 'compound', sets: 3, reps: '8-10', muscle_groups: ['quads', 'glutes'] },
    { name: 'Romanian Deadlift', type: 'compound', sets: 3, reps: '8-10', muscle_groups: ['hamstrings', 'glutes'] },
    { name: 'Lunges', type: 'compound', sets: 3, reps: '10 each', muscle_groups: ['quads', 'glutes'] },
    { name: 'Leg Curls', type: 'isolation', sets: 3, reps: '12', muscle_groups: ['hamstrings'] },
  ]}],
  full_body: [{ focus: 'Full Body', exercises: [
    { name: 'Squat', type: 'compound', sets: 3, reps: '8-10', muscle_groups: ['quads', 'glutes'] },
    { name: 'Bench Press', type: 'compound', sets: 3, reps: '8-10', muscle_groups: ['chest', 'shoulders', 'triceps'] },
    { name: 'Barbell Row', type: 'compound', sets: 3, reps: '8-10', muscle_groups: ['back', 'biceps'] },
    { name: 'Overhead Press', type: 'compound', sets: 3, reps: '10', muscle_groups: ['shoulders'] },
  ]}],
  hiit: [{ focus: 'HIIT Cardio', exercises: [
    { name: 'Burpees', type: 'cardio', sets: 4, reps: '30s on/15s off', muscle_groups: ['full_body'] },
    { name: 'Mountain Climbers', type: 'cardio', sets: 4, reps: '30s on/15s off', muscle_groups: ['core', 'legs'] },
    { name: 'Jump Squats', type: 'cardio', sets: 4, reps: '30s on/15s off', muscle_groups: ['quads', 'glutes'] },
    { name: 'High Knees', type: 'cardio', sets: 4, reps: '30s on/15s off', muscle_groups: ['legs', 'core'] },
  ]}],
  cardio: [{ focus: 'Steady-State Cardio', exercises: [
    { name: 'Treadmill Jog', type: 'cardio', sets: 1, reps: '20-30 min', muscle_groups: ['legs'] },
    { name: 'Cycling', type: 'cardio', sets: 1, reps: '20-30 min', muscle_groups: ['legs'] },
    { name: 'Rowing Machine', type: 'cardio', sets: 1, reps: '15-20 min', muscle_groups: ['back', 'legs'] },
    { name: 'Jump Rope', type: 'cardio', sets: 3, reps: '3 min on/1 min off', muscle_groups: ['full_body'] },
  ]}],
};

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MEAL_TEMPLATES = [
  { meal_type: 'breakfast', time: '07:00', calorie_ratio: 0.25 },
  { meal_type: 'snack', time: '10:00', calorie_ratio: 0.075 },
  { meal_type: 'lunch', time: '12:30', calorie_ratio: 0.30 },
  { meal_type: 'snack', time: '15:30', calorie_ratio: 0.075 },
  { meal_type: 'dinner', time: '19:00', calorie_ratio: 0.30 },
];

// Fallback food database (used only when user has no food log history)
const FALLBACK_FOODS = {
  breakfast: [
    { name: 'Oatmeal with Banana', calories: 280, protein: 8, carbs: 52, fat: 6 },
    { name: 'Scrambled Eggs (2) + Toast', calories: 320, protein: 18, carbs: 28, fat: 16 },
    { name: 'Greek Yogurt + Granola', calories: 260, protein: 16, carbs: 34, fat: 8 },
  ],
  lunch: [
    { name: 'Grilled Chicken Breast + Rice', calories: 420, protein: 38, carbs: 48, fat: 6 },
    { name: 'Turkey Sandwich + Salad', calories: 380, protein: 28, carbs: 40, fat: 12 },
    { name: 'Tuna Pasta Bowl', calories: 400, protein: 32, carbs: 46, fat: 8 },
  ],
  dinner: [
    { name: 'Salmon + Sweet Potato + Broccoli', calories: 480, protein: 36, carbs: 42, fat: 16 },
    { name: 'Lean Beef Stir-Fry + Rice', calories: 450, protein: 34, carbs: 44, fat: 14 },
    { name: 'Chicken Thighs + Quinoa + Vegetables', calories: 440, protein: 36, carbs: 38, fat: 16 },
  ],
  snack: [
    { name: 'Protein Bar', calories: 180, protein: 20, carbs: 18, fat: 6 },
    { name: 'Apple + Almond Butter', calories: 200, protein: 5, carbs: 26, fat: 10 },
    { name: 'Cottage Cheese + Berries', calories: 160, protein: 14, carbs: 16, fat: 4 },
  ],
};

function buildDeterministicPlan(data: UserComprehensiveData, weekStart: string, weekEnd: string): any {
  const goal = data.profile.primary_goal?.toLowerCase() || 'general_fitness';
  const isBeginner = data.profile.fitness_level === 'beginner';
  const isAdvanced = data.profile.fitness_level === 'advanced' || data.profile.fitness_level === 'intermediate';
  const userName = data.profile.name || 'there';

  // ═══════════════════════════════════════════════════════════
  // 1. WORKOUT FREQUENCY — from actual user behavior
  // ═══════════════════════════════════════════════════════════
  let workoutDays: number;
  const weeklyFreq = data.workoutPatterns.total_workouts_30d > 0
    ? data.workoutPatterns.total_workouts_30d / 4
    : 0;
  const recentFreq = data.workoutPatterns.total_workouts_7d;

  if (recentFreq >= 3) {
    workoutDays = Math.min(6, Math.max(recentFreq, Math.round(weeklyFreq)));
  } else if (weeklyFreq >= 2) {
    workoutDays = Math.ceil(weeklyFreq);
  } else if (weeklyFreq >= 1) {
    workoutDays = 3;
  } else {
    workoutDays = data.profile.activity_level === 'very_active' ? 5
      : data.profile.activity_level === 'active' ? 4
      : data.profile.activity_level === 'moderate' ? 3 : 2;
  }

  if (goal.includes('fat_loss') && workoutDays < 4) workoutDays = Math.min(workoutDays + 1, 5);
  if (goal.includes('endurance')) workoutDays = Math.max(workoutDays, 5);
  if (isBeginner && workoutDays > 4) workoutDays = 4;

  const restDays = 7 - workoutDays;

  // ═══════════════════════════════════════════════════════════
  // 2. TRAINING SPLIT — detected from user's actual workout types
  // ═══════════════════════════════════════════════════════════
  const faves = data.workoutPatterns.favorite_workout_types.map(t => t.toLowerCase());
  const favesJoined = faves.join(' ');

  let detectedSplit: 'ppl' | 'upper_lower' | 'full_body' | 'cardio_focus';
  if (favesJoined.includes('push') && favesJoined.includes('pull') && favesJoined.includes('leg')) {
    detectedSplit = 'ppl';
  } else if (favesJoined.includes('upper') && favesJoined.includes('lower')) {
    detectedSplit = 'upper_lower';
  } else if (favesJoined.includes('full') || favesJoined.includes('total')) {
    detectedSplit = 'full_body';
  } else if (faves.some(t => t.includes('cardio')) || faves.some(t => t.includes('hiit')) || faves.some(t => t.includes('run'))) {
    detectedSplit = 'cardio_focus';
  } else {
    detectedSplit = 'full_body';
  }

  // Build split array based on detected preference and workout days
  let split: string[];
  if (detectedSplit === 'ppl' && workoutDays >= 5) {
    split = ['push', 'pull', 'legs', 'rest', 'push', 'pull', 'legs'];
  } else if (detectedSplit === 'ppl' && workoutDays >= 3) {
    split = ['push', 'rest', 'pull', 'legs', 'rest', 'push', 'rest'];
  } else if (detectedSplit === 'upper_lower' && workoutDays >= 4) {
    split = ['upper', 'rest', 'lower', 'rest', 'upper', 'lower', 'rest'];
  } else if (detectedSplit === 'upper_lower' && workoutDays >= 2) {
    split = ['upper', 'rest', 'lower', 'rest', 'upper', 'rest', 'rest'];
  } else if (detectedSplit === 'cardio_focus') {
    split = ['cardio', 'rest', 'hiit', 'rest', 'cardio', 'rest', 'cardio'];
  } else if (workoutDays <= 3) {
    split = ['full_body', 'rest', 'full_body', 'rest', 'full_body', 'rest', 'rest'];
  } else {
    split = ['full_body', 'rest', 'full_body', 'full_body', 'rest', 'full_body', 'rest'];
  }

  // Insert cardio for fat loss goals
  if (goal.includes('fat_loss') || goal.includes('weight')) {
    for (let i = 0; i < split.length; i++) {
      if (split[i] === 'rest' && i < 5) { split[i] = 'hiit'; break; }
    }
  }

  // Schedule workouts on user's BEST training days
  const bestDays = data.workoutPatterns.best_performing_days.map(d => d.toLowerCase());
  if (bestDays.length > 0) {
    const dayMap: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
    const workoutIndices = split.map((s, i) => s !== 'rest' ? i : -1).filter(i => i >= 0);
    const onBestDays = workoutIndices.filter(i => bestDays.includes(DAY_NAMES[i].toLowerCase())).length;
    if (onBestDays < Math.floor(workoutDays / 2) && workoutIndices.length === workoutDays) {
      const newSplit = Array(7).fill('rest') as string[];
      let assigned = 0;
      for (const dayName of bestDays) {
        const idx = dayMap[dayName];
        if (idx !== undefined && assigned < workoutDays) {
          newSplit[idx] = split[workoutIndices[assigned]] || 'full_body';
          assigned++;
        }
      }
      if (assigned < workoutDays) {
        for (let i = 0; i < 7 && assigned < workoutDays; i++) {
          if (newSplit[i] === 'rest') {
            newSplit[i] = split[workoutIndices[assigned]] || 'full_body';
            assigned++;
          }
        }
      }
      split = newSplit;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3. NUTRITION TARGETS — from actual user intake (not theory)
  // ═══════════════════════════════════════════════════════════
  // Use the user's ACTUAL 7-day average as the target.
  // If they eat 2000cal/day, plan for 2000cal — not a theoretical number.
  const baseCal = data.nutritionPatterns.avg_daily_calories_7d > 0
    ? data.nutritionPatterns.avg_daily_calories_7d
    : data.targets.daily_calories;
  const baseProtein = data.nutritionPatterns.avg_daily_protein_7d > 0
    ? data.nutritionPatterns.avg_daily_protein_7d
    : data.targets.daily_protein;
  const baseCarbs = data.nutritionPatterns.avg_daily_carbs_7d > 0
    ? data.nutritionPatterns.avg_daily_carbs_7d
    : data.targets.daily_carbs;
  const baseFat = data.nutritionPatterns.avg_daily_fat_7d > 0
    ? data.nutritionPatterns.avg_daily_fat_7d
    : data.targets.daily_fat;
  const waterTarget = data.targets.water_ml || 2500;

  // ═══════════════════════════════════════════════════════════
  // 4. FOOD DATA — group user's actual meals by type
  // ═══════════════════════════════════════════════════════════
  const mealsByType: Record<string, typeof data.nutritionPatterns.recent_meals> = {
    breakfast: [], lunch: [], dinner: [], snack: [], other: [],
  };
  for (const meal of data.nutritionPatterns.recent_meals) {
    const type = (meal.meal_type || 'other').toLowerCase().trim();
    const bucket = mealsByType[type] || mealsByType.other;
    bucket.push(meal);
  }

  // Build a flat list of unique food names from recent meals + common foods
  const allUserFoodNames = new Set<string>();
  for (const meal of data.nutritionPatterns.recent_meals) {
    for (const fn of meal.foods) {
      if (fn) allUserFoodNames.add(fn);
    }
  }
  for (const fn of data.nutritionPatterns.most_common_foods) {
    if (fn) allUserFoodNames.add(fn);
  }
  const userFoodPool = Array.from(allUserFoodNames);

  // Helper: deterministically pick items from a pool based on day+meal indices
  function pickFoods(pool: string[], count: number, dayIdx: number, mealIdx: number): string[] {
    if (pool.length === 0) return [];
    const result: string[] = [];
    for (let k = 0; k < count; k++) {
      result.push(pool[(dayIdx * 7 + mealIdx * 3 + k) % pool.length]);
    }
    return result;
  }

  // Helper: estimate macros for a food item given its calories and protein,
  // using the user's actual macro distribution as a guide
  function estimateMacros(calories: number, protein: number): { carbs: number; fat: number } {
    const proteinCal = protein * 4;
    const remaining = Math.max(0, calories - proteinCal);
    const macroDist = data.nutritionPatterns.macro_distribution;
    const totalNonP = macroDist.carbs_percent + macroDist.fat_percent || 100;
    const carbPct = (macroDist.carbs_percent / totalNonP);
    const fatPct = (macroDist.fat_percent / totalNonP);
    // Carbs = 4 cal/g, Fat = 9 cal/g
    const carbCal = remaining * carbPct;
    const fatCal = remaining * fatPct;
    return {
      carbs: Math.round(carbCal / 4),
      fat: Math.round(fatCal / 9),
    };
  }

  // Helper: build a meal from the user's actual logged foods for that meal type
  function buildMealFromUser(
    mealType: string,
    targetCalories: number,
    targetProtein: number,
    dayIdx: number,
    mealIdx: number,
  ): Array<{ name: string; quantity: number; unit: string; calories: number; protein: number; carbs: number; fat: number }> {
    const typeKey = (mealType || 'other').toLowerCase().trim();
    const typeMeals = mealsByType[typeKey] || mealsByType.other;

    if (typeMeals.length > 0) {
      // Use actual foods the user logs for this meal type
      const numItems = mealType === 'snack' ? 1 : Math.min(3, typeMeals.length);
      const pickedMeals = pickFoods(
        typeMeals.map(m => m.foods[0] || m.foods.join(', ')),
        numItems, dayIdx, mealIdx,
      );

      // Calculate total actual calories/protein from picked items (average per entry)
      const avgCalPerItem = typeMeals.reduce((s, m) => s + (m.calories || 0), 0) / typeMeals.length;
      const avgProPerItem = typeMeals.reduce((s, m) => s + (m.protein || 0), 0) / typeMeals.length;

      // Scale factor to hit target calories
      const totalActualCal = avgCalPerItem * numItems;
      const scaleFactor = totalActualCal > 0 ? targetCalories / totalActualCal : 1;

      return pickedMeals.map(name => {
        const scaledCal = Math.round(avgCalPerItem * scaleFactor);
        const scaledPro = Math.round(avgProPerItem * scaleFactor);
        const { carbs, fat } = estimateMacros(scaledCal, scaledPro);
        return {
          name: name || 'Meal',
          quantity: Math.round(scaleFactor * 10) / 10,
          unit: 'serving',
          calories: scaledCal,
          protein: scaledPro,
          carbs,
          fat,
        };
      });
    }

    // Fallback: use user's most common foods, distributed across meal types
    if (userFoodPool.length > 0) {
      const numItems = mealType === 'snack' ? 1 : 2;
      const items = pickFoods(userFoodPool, numItems, dayIdx, mealIdx);
      const calPerItem = Math.round(targetCalories / numItems);
      const proPerItem = Math.round(targetProtein / numItems);
      return items.map(name => {
        const { carbs, fat } = estimateMacros(calPerItem, proPerItem);
        return { name, quantity: 1, unit: 'serving', calories: calPerItem, protein: proPerItem, carbs, fat };
      });
    }

    // Last resort: generic fallback database
    const fallbacks = FALLBACK_FOODS[typeKey] || FALLBACK_FOODS.lunch;
    const item = fallbacks[(dayIdx + mealIdx) % fallbacks.length];
    const scaleFactor = targetCalories / (item.calories || 1);
    return [{
      name: item.name,
      quantity: Math.round(scaleFactor * 10) / 10,
      unit: 'serving',
      calories: Math.round(item.calories * scaleFactor),
      protein: Math.round(item.protein * scaleFactor),
      carbs: Math.round(item.carbs * scaleFactor),
      fat: Math.round(item.fat * scaleFactor),
    }];
  }

  // ═══════════════════════════════════════════════════════════
  // 5. BUILD COACH MESSAGES — rotating, data-driven
  // ═══════════════════════════════════════════════════════════
  const proteinPct = data.nutritionPatterns.protein_adherence_percent;
  const caloriePct = data.nutritionPatterns.calorie_adherence_percent;
  const streak = data.momentum.current_streak;
  const weightTrend = data.bodyMetrics.weight_trend;
  const weightChange7d = data.bodyMetrics.weight_change_7d;
  const sleepHrs = data.sleepPatterns.avg_duration_hours;
  const sleepDebt = data.sleepPatterns.sleep_debt_hours;
  const workouts7d = data.workoutPatterns.total_workouts_7d;
  const workouts30d = data.workoutPatterns.total_workouts_30d;

  // Build a pool of coach messages from actual data, then rotate them
  const coachMessagePool: string[] = [];

  // Protein messages
  if (proteinPct < 50) {
    coachMessagePool.push(`Your protein has been ${data.nutritionPatterns.avg_daily_protein_7d}g/day — only ${proteinPct}% of your ${data.targets.daily_protein}g target. Priority: add a protein source to every meal.`);
  } else if (proteinPct < 70) {
    coachMessagePool.push(`Protein at ${data.nutritionPatterns.avg_daily_protein_7d}g/day (${proteinPct}% of target). You're getting closer — add one more high-protein meal today.`);
  } else if (proteinPct < 90) {
    coachMessagePool.push(`Protein adherence is ${proteinPct}% — solid work! ${data.nutritionPatterns.avg_daily_protein_7d}g/day. Push for 100% this week.`);
  } else {
    coachMessagePool.push(`Great protein discipline — ${data.nutritionPatterns.avg_daily_protein_7d}g/day at ${proteinPct}% adherence. Keep it locked in.`);
  }

  // Streak messages
  if (streak >= 14) {
    coachMessagePool.push(`${streak}-day streak! You're building real momentum. This consistency is what separates results from wishes.`);
  } else if (streak >= 7) {
    coachMessagePool.push(`One week strong — ${streak} days and counting. Don't let the weekend break your rhythm.`);
  } else if (streak >= 3) {
    coachMessagePool.push(`${streak}-day streak active. You're building the habit. Stay focused today.`);
  }

  // Training frequency messages
  if (workouts7d >= 5) {
    coachMessagePool.push(`You've been training ${workouts7d}x this week — elite consistency. Make sure you're recovering enough.`);
  } else if (workouts7d >= 3) {
    coachMessagePool.push(`${workouts7d} workouts last week — solid routine. You're on track for ${Math.round(workouts30d / 4)} sessions/week average.`);
  } else if (workouts7d >= 1) {
    coachMessagePool.push(`${workouts7d} workout${workouts7d > 1 ? 's' : ''} last week. Let's aim for ${workoutDays} this week to build momentum.`);
  } else {
    coachMessagePool.push(`No workouts logged last week. Time to get back in the game — even one session counts.`);
  }

  // Weight trend messages
  if (weightTrend === 'down' && Math.abs(weightChange7d) >= 0.3) {
    coachMessagePool.push(`Weight trending down — ${weightChange7d.toFixed(1)}kg this week. ${goal.includes('fat_loss') || goal.includes('weight') ? 'On track for your goal.' : 'Make sure you\'re eating enough to support performance.'}`);
  } else if (weightTrend === 'up' && Math.abs(weightChange7d) >= 0.3) {
    coachMessagePool.push(`Weight up ${weightChange7d.toFixed(1)}kg this week. ${goal.includes('muscle') || goal.includes('gain') ? 'Could be muscle gain — track your body fat to confirm.' : 'Keep an eye on your calorie intake.'}`);
  } else if (weightTrend === 'stable') {
    coachMessagePool.push(`Weight stable this week at ${data.profile.current_weight_kg || '?'}kg. ${goal.includes('fat_loss') ? 'A small calorie adjustment could break the plateau.' : 'Consistency is the foundation of progress.'}`);
  }

  // Sleep messages
  if (sleepDebt > 2) {
    coachMessagePool.push(`Sleep debt is ${sleepDebt.toFixed(1)}h — you're averaging ${sleepHrs}h/night. Recovery suffers. Aim for 7.5-8h tonight.`);
  } else if (sleepHrs < 6.5) {
    coachMessagePool.push(`Averaging ${sleepHrs}h of sleep — that's not enough for optimal recovery. Even 30 min more makes a difference.`);
  }

  // Calorie messages
  if (caloriePct > 0 && caloriePct < 70) {
    coachMessagePool.push(`Calorie tracking shows ${data.nutritionPatterns.avg_daily_calories_7d}cal/day — ${caloriePct}% of your target. Consistent tracking helps you stay on course.`);
  }

  // Ensure we always have at least a few messages
  if (coachMessagePool.length < 3) {
    coachMessagePool.push('Discipline today, results tomorrow. Every meal and every rep matters.');
    coachMessagePool.push(`Your ${goal.replace(/_/g, ' ')} goal is within reach — stay consistent this week.`);
  }

  // ═══════════════════════════════════════════════════════════
  // 6. BUILD THE 7-DAY PLAN
  // ═══════════════════════════════════════════════════════════
  const dailyPlans: any[] = [];
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    weekDates.push(d.toISOString().split('T')[0]);
  }

  for (let i = 0; i < 7; i++) {
    const dayType = split[i];
    const isWorkout = dayType !== 'rest';
    const template = isWorkout ? WORKOUT_TEMPLATES[dayType] || WORKOUT_TEMPLATES.full_body : null;

    // Adjust macros for training vs rest days
    const calMult = isWorkout ? 1.1 : 0.9;
    const dayCal = Math.round(baseCal * calMult);
    const dayProtein = isWorkout ? Math.round(baseProtein * 1.05) : baseProtein;
    const dayCarbs = Math.round(baseCarbs * calMult);
    const dayFat = Math.round(baseFat * (isWorkout ? 1.0 : 0.95));

    // Build meals from user's actual food data
    const meals = MEAL_TEMPLATES.map((mt, mealIdx) => {
      const mealCal = Math.round(dayCal * mt.calorie_ratio);
      const mealPro = Math.round(dayProtein * mt.calorie_ratio);
      const foods = buildMealFromUser(mt.meal_type, mealCal, mealPro, i, mealIdx);
      return {
        meal_type: mt.meal_type,
        time: mt.time,
        foods,
        total_calories: foods.reduce((s, f) => s + f.calories, 0),
        total_protein: foods.reduce((s, f) => s + f.protein, 0),
      };
    });

    // Build workout block
    const avgDuration = data.workoutPatterns.avg_duration_minutes || (isBeginner ? 45 : 60);
    const avgCalBurned = data.workoutPatterns.avg_calories_burned || (isBeginner ? 250 : 350);
    const workoutBlock = isWorkout && template ? {
      focus: template[0].focus,
      duration_minutes: avgDuration,
      estimated_calories_burned: avgCalBurned,
      intensity: isBeginner ? 'moderate' : (isAdvanced ? 'high' : 'moderate-high'),
      exercises: template[0].exercises.map(ex => ({
        name: ex.name,
        type: ex.type,
        muscle_groups: ex.muscle_groups || (ex.type === 'compound' ? [ex.name.split(' ')[0].toLowerCase()] : ['general']),
        sets: isBeginner ? Math.min(ex.sets, 3) : ex.sets,
        reps: ex.reps,
        weight_kg: 0,
        rest_seconds: isBeginner ? 90 : (isAdvanced ? 60 : 75),
        notes: '',
      })),
      warm_up: '5min light cardio + dynamic stretching',
      cool_down: '5min stretching + foam rolling',
      coach_notes: '',
    } : null;

    // Rotate coach messages deterministically across the week
    const coachMsg = coachMessagePool[i % coachMessagePool.length];

    dailyPlans.push({
      date: weekDates[i],
      day_name: DAY_NAMES[i],
      is_workout_day: isWorkout,
      workout: workoutBlock,
      nutrition: {
        target_calories: dayCal,
        target_protein: dayProtein,
        target_carbs: dayCarbs,
        target_fat: dayFat,
        meals,
        hydration_ml: waterTarget,
      },
      sleep: {
        target_bedtime: data.sleepPatterns.sleep_schedule.avg_bedtime || '22:30',
        target_wake_time: data.sleepPatterns.sleep_schedule.avg_wake_time || '06:30',
        target_duration_hours: Math.min(8.5, Math.max(7, sleepHrs + 0.5)),
      },
      supplements: data.supplementUsage.active_supplements.length > 0
        ? data.supplementUsage.active_supplements.map(s => ({ name: s, dose: 'as directed', timing: 'with meal' }))
        : [],
      coach_message: coachMsg,
      confidence: 0.75,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 7. RECOMMENDATIONS — data-driven, threshold-based
  // ═══════════════════════════════════════════════════════════
  const recs: Array<{ category: string; priority: string; recommendation: string; reasoning: string }> = [];

  // Nutrition adherence
  if (proteinPct < 50) {
    recs.push({
      category: 'nutrition', priority: 'high',
      recommendation: `Increase protein significantly — currently at ${proteinPct}% of target`,
      reasoning: `You're averaging ${data.nutritionPatterns.avg_daily_protein_7d}g/day vs ${data.targets.daily_protein}g target. Add protein to every meal.`,
    });
  } else if (proteinPct < 70) {
    recs.push({
      category: 'nutrition', priority: 'medium',
      recommendation: `Increase protein — currently at ${proteinPct}% adherence`,
      reasoning: `At ${data.nutritionPatterns.avg_daily_protein_7d}g/day, you're falling short of your ${data.targets.daily_protein}g target. Consider adding eggs, chicken, or Greek yogurt.`,
    });
  }

  if (caloriePct > 0 && caloriePct < 80) {
    recs.push({
      category: 'nutrition', priority: 'medium',
      recommendation: 'Track calories more carefully',
      reasoning: `Your actual intake (${data.nutritionPatterns.avg_daily_calories_7d}cal) is ${caloriePct}% of your target (${data.targets.daily_calories}cal). Consistent logging helps close the gap.`,
    });
  }

  // Calorie surplus check for muscle building goals
  if ((goal.includes('muscle') || goal.includes('gain') || goal.includes('hypertrophy')) && caloriePct > 0 && caloriePct < 90) {
    recs.push({
      category: 'nutrition', priority: 'high',
      recommendation: 'Eat more to support muscle growth',
      reasoning: `For muscle building, you need a slight surplus. You're at ${caloriePct}% of ${data.targets.daily_calories}cal target.`,
    });
  }

  // Training
  if (workouts7d === 0) {
    recs.push({
      category: 'training', priority: 'high',
      recommendation: 'Get back to training — even one session this week counts',
      reasoning: `No workouts logged in the last 7 days. Your ${Math.round(workouts30d / 4)} sessions/week average is at risk.`,
    });
  } else if (workouts7d < 2 && workoutDays >= 3) {
    recs.push({
      category: 'training', priority: 'medium',
      recommendation: `Aim for at least ${workoutDays} sessions this week`,
      reasoning: `Only ${workouts7d} workout${workouts7d > 1 ? 's' : ''} last week vs your typical ${Math.round(workouts30d / 4)}/week frequency.`,
    });
  }

  // Sleep
  if (sleepHrs < 7) {
    recs.push({
      category: 'recovery', priority: 'medium',
      recommendation: `Get more sleep — target at least 7.5 hours`,
      reasoning: `Averaging ${sleepHrs}h/night with ${sleepDebt.toFixed(1)}h sleep debt. Poor sleep hurts recovery and muscle growth.`,
    });
  } else if (sleepDebt > 1.5) {
    recs.push({
      category: 'recovery', priority: 'low',
      recommendation: 'Catch up on sleep this week',
      reasoning: `${sleepDebt.toFixed(1)}h sleep debt accumulated. An extra 30-60 min per night will help you recover.`,
    });
  }

  // Weight trend specific to goal
  if (goal.includes('fat_loss') || goal.includes('weight_loss') || goal.includes('lose')) {
    if (weightTrend === 'stable' && data.profile.current_weight_kg && data.profile.target_weight_kg) {
      const remaining = Math.abs(data.profile.current_weight_kg - data.profile.target_weight_kg).toFixed(1);
      recs.push({
        category: 'progress', priority: 'medium',
        recommendation: `Create a small calorie deficit to break the plateau`,
        reasoning: `Weight is stable at ${data.profile.current_weight_kg}kg, ${remaining}kg from target. Try reducing 200-300cal/day.`,
      });
    }
  } else if (goal.includes('muscle') || goal.includes('gain') || goal.includes('hypertrophy')) {
    if (weightTrend === 'down' || weightTrend === 'stable') {
      recs.push({
        category: 'nutrition', priority: 'medium',
        recommendation: 'Slight calorie surplus needed for muscle growth',
        reasoning: `Weight trend is ${weightTrend} — for muscle gain you need a small surplus (200-300cal above maintenance).`,
      });
    }
  }

  // Supplement consistency
  if (data.supplementUsage.active_supplements.length > 0 && data.supplementUsage.consistency_percent < 50) {
    recs.push({
      category: 'supplements', priority: 'low',
      recommendation: 'Take your supplements consistently',
      reasoning: `${data.supplementUsage.consistency_percent}% consistency with [${data.supplementUsage.active_supplements.slice(0, 3).join(', ')}]. Set a daily reminder.`,
    });
  }

  // Positive reinforcement for good metrics
  const hasGoodProtein = proteinPct >= 85;
  const hasGoodTraining = workouts7d >= workoutDays - 1;
  const hasGoodSleep = sleepHrs >= 7;

  if (hasGoodProtein && hasGoodTraining && hasGoodSleep) {
    recs.push({
      category: 'general', priority: 'low',
      recommendation: 'Great consistency across the board — keep it up!',
      reasoning: `Protein ${proteinPct}%, ${workouts7d} workouts, ${sleepHrs}h sleep. You're firing on all cylinders.`,
    });
  } else if (hasGoodProtein) {
    recs.push({
      category: 'nutrition', priority: 'low',
      recommendation: 'Strong protein adherence — keep this going',
      reasoning: `${data.nutritionPatterns.avg_daily_protein_7d}g/day at ${proteinPct}% is excellent.`,
    });
  }

  if (streak >= 7) {
    recs.push({
      category: 'consistency', priority: 'low',
      recommendation: `${streak}-day streak — protect it!`,
      reasoning: `You've been consistent for ${streak} days. Your longest streak is ${data.momentum.longest_streak} days.`,
    });
  }

  // Fallback if no recommendations generated
  if (recs.length === 0) {
    recs.push({
      category: 'general', priority: 'low',
      recommendation: 'Keep the momentum going — consistency beats intensity',
      reasoning: `You're on track. Stay consistent with your ${goal.replace(/_/g, ' ')} plan.`,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 8. RETURN THE PLAN
  // ═══════════════════════════════════════════════════════════
  const splitTypes = split.filter(s => s !== 'rest');
  const splitLabel = detectedSplit === 'ppl' ? 'Push/Pull/Legs'
    : detectedSplit === 'upper_lower' ? 'Upper/Lower'
    : detectedSplit === 'cardio_focus' ? 'Cardio Focus'
    : 'Full Body';

  return {
    week_start: weekStart,
    week_end: weekEnd,
    plan_confidence: 0.75,
    generation_reasoning: `Data-driven plan: ${splitLabel} split (${workoutDays} days/week), targeting ${baseCal}cal and ${baseProtein}g protein/day from your actual 7-day averages. Meals built from your logged food history.`,
    weekly_overview: {
      total_workout_days: workoutDays,
      total_rest_days: restDays,
      weekly_calorie_target: baseCal * 7,
      weekly_protein_target: baseProtein * 7,
      focus_areas: [goal.replace(/_/g, ' '), ...data.workoutPatterns.muscles_trained_last_7d.slice(0, 3)],
      weekly_strategy: `${splitLabel} — ${workoutDays} training days based on your ${workouts7d}/week actual frequency. Nutrition: ${baseCal}cal/day from your ${data.nutritionPatterns.avg_daily_calories_7d}cal 7-day average.`,
    },
    daily_plan: dailyPlans,
    recommendations: recs,
  };
}

// MAIN API HANDLERS

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();
    const sb = supabase as any;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const forceRegenerate = body.force_regenerate || false;
    const specificGoal = body.goal || null;

    // Calculate week dates (current week starting Monday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    // Get Monday of current week
    const weekStart = new Date(today);
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(today.getDate() - daysToMonday);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    // Check for existing plan (unless forcing regeneration)
    if (!forceRegenerate) {
      try {
        const { data: existingPlan } = await sb
          .from('weekly_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('week_start_date', weekStartStr)
          .eq('status', 'active')
          .maybeSingle();

        if (existingPlan?.plan_data) {
          return NextResponse.json({
            success: true,
            plan: existingPlan.plan_data,
            cached: true,
            plan_id: existingPlan.id,
            generated_at: existingPlan.created_at,
            confidence: existingPlan.confidence_score,
            generation_source: existingPlan.generation_source === 'ai' ? 'ai' : 'cached',
            ai_errors: undefined,
          });
        }
      } catch (dbError) {
        console.log('[weekly-planner] weekly_plans table may not exist, continuing without cache');
      }
    }

    // Fetch comprehensive user data
    const userData = await fetchComprehensiveUserData(sb, user.id);
    
    // Override goal if specified
    if (specificGoal) {
      userData.profile.primary_goal = specificGoal;
    }

    // Build AI prompts
    const { systemPrompt, userPrompt } = buildPrecisionWeeklyPlanPrompt(
      userData, 
      weekStartStr, 
      weekEndStr
    );

    // ═══ PRODUCTION PLAN GENERATION ═══
    // 1. Try AI (fallback chain: llama-3.3-70b → llama-3.1-8b-instant)
    // 2. If AI fails, build a deterministic plan from user data (zero AI dependency)
    let plan: any = null;
    let generationSource: 'ai' | 'fallback' = 'fallback';
    let aiErrors: AIErrorDetail[] = [];

    // ── STEP 1: AI Generation ──
    console.log('[weekly-planner] Starting AI plan generation (direct Groq API, JSON mode, 70b)...');
    const aiResult = await generatePlanWithAI(systemPrompt, userPrompt);
    aiErrors = aiResult.errors;
    
    if (aiResult.success && aiResult.plan?.daily_plan?.length > 0) {
      plan = aiResult.plan;
      generationSource = 'ai';
      console.log('[weekly-planner] AI plan generated successfully');
    } else {
      console.log('[weekly-planner] AI failed, using deterministic fallback');
    }

    // ── STEP 2: Deterministic Fallback (if AI failed) ──
    if (!plan) {
      plan = buildDeterministicPlan(userData, weekStartStr, weekEndStr);
      generationSource = 'fallback';
      console.log('[weekly-planner] Deterministic fallback plan built');
    }

    // Try to store plan in database (optional, may fail if table doesn't exist)
    try {
      await sb
        .from('weekly_plans')
        .upsert({
          user_id: user.id,
          week_start_date: weekStartStr,
          week_end_date: weekEndStr,
          status: 'active',
          generation_source: forceRegenerate ? 'regenerate' : 'auto',
          plan_data: plan,
          confidence_score: plan.plan_confidence || 0.85,
          model_version: 'ai-v1',
          generation_reasoning: plan.generation_reasoning,
          user_context_snapshot: userData,
        }, {
          onConflict: 'user_id,week_start_date',
        });
    } catch (dbError) {
      console.log('[weekly-planner] Could not save to weekly_plans table:', dbError);
      // Continue without saving - the plan is still valid
    }

    return NextResponse.json({
      success: true,
      plan,
      cached: false,
      plan_id: null,
      generated_at: new Date().toISOString(),
      confidence: plan.plan_confidence || 0.85,
      generation_source: generationSource,
      ai_errors: aiErrors.length > 0 ? aiErrors : undefined,
    });

  } catch (error) {
    console.error('[weekly-planner] Error:', error);
    
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    return NextResponse.json(
      { error: 'Failed to generate plan', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/iron-coach/weekly-planner
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();
    const sb = supabase as any;

    const url = new URL(request.url);
    const weekOffset = parseInt(url.searchParams.get('week_offset') || '0');

    // Calculate week dates
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1 + (weekOffset * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Fetch existing plan
    const { data: plan } = await sb
      .from('weekly_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStartStr)
      .maybeSingle();

    // Fetch completion data
    const { data: completions } = await sb
      .from('daily_plan_completions')
      .select('*')
      .eq('user_id', user.id)
      .gte('plan_date', weekStartStr)
      .lte('plan_date', weekEnd.toISOString().split('T')[0]);

    return NextResponse.json({
      success: true,
      plan: plan?.plan_data || null,
      plan_id: plan?.id || null,
      cached: !!plan,
      generated_at: plan?.created_at || null,
      confidence: plan?.confidence_score || null,
      generation_source: plan?.generation_source || null,
      completions: completions || [],
      week_start: weekStartStr,
      week_end: weekEnd.toISOString().split('T')[0],
    });

  } catch (error) {
    console.error('[weekly-planner] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plan' },
      { status: 500 }
    );
  }
}

