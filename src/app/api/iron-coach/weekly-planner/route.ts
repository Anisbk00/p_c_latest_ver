import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { generateText } from '@/lib/ai/gemini-service';
import { calculatePersonalizedTargets } from '@/lib/personalized-targets';

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
// AI PLAN GENERATION — tries all models, waits between attempts
// ═══════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface AIErrorDetail {
  attempt: string;
  stage: 'api_call' | 'json_parse' | 'json_repair' | 'invalid_structure';
  error: string;
  timestamp: string;
}

interface AIPlanResult {
  plan: any;
  success: boolean;
  errors: AIErrorDetail[];
}

async function generatePlanWithAI(systemPrompt: string, userPrompt: string): Promise<AIPlanResult> {
  const errors: AIErrorDetail[] = [];
  // Use default fallback chain: llama-3.3-70b-versatile → llama-3.1-8b-instant
  // Same as Iron Coach chat — no forced model
  const attempts = [
    { delay: 0, label: 'attempt 1 (immediate)' },
    { delay: 5000, label: 'attempt 2 (5s delay)' },
    { delay: 10000, label: 'attempt 3 (10s delay)' },
  ];

  for (const attempt of attempts) {
    if (attempt.delay > 0) await sleep(attempt.delay);
    
    try {
      console.log(`[weekly-planner] ${attempt.label}: calling generateText...`);
      const responseText = await generateText(userPrompt, systemPrompt, 4096);
      console.log(`[weekly-planner] ${attempt.label}: got response (${responseText.length} chars)`);

      // Clean response
      let cleaned = responseText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }

      try {
        const parsed = JSON.parse(cleaned);
        if (parsed.daily_plan?.length === 7) {
          console.log(`[weekly-planner] ${attempt.label}: SUCCESS — 7 days`);
          return { plan: parsed, success: true, errors };
        }
        if (parsed.daily_plan?.length > 0) {
          console.warn(`[weekly-planner] ${attempt.label}: Got ${parsed.daily_plan.length}/7 days, accepting`);
          return { plan: parsed, success: true, errors };
        }
        // Valid JSON but no daily_plan — log the structure
        errors.push({
          attempt: attempt.label,
          stage: 'invalid_structure',
          error: `Valid JSON but missing daily_plan. Keys: ${Object.keys(parsed).join(', ')}`,
          timestamp: new Date().toISOString(),
        });
        console.warn(`[weekly-planner] ${attempt.label}: Invalid structure — keys: ${Object.keys(parsed).join(', ')}`);
      } catch (parseErr) {
        // JSON parse failed — log snippet
        const errSnippet = cleaned.substring(0, 200);
        errors.push({
          attempt: attempt.label,
          stage: 'json_parse',
          error: `JSON parse failed. Snippet: ${errSnippet}`,
          timestamp: new Date().toISOString(),
        });
        console.warn(`[weekly-planner] ${attempt.label}: JSON parse failed. First 200 chars: ${errSnippet}`);
        
        // Try repair
        try {
          const repaired = cleaned
            .replace(/,\s*([}\]])/g, '$1')
            .replace(/'/g, '"')
            .replace(/\n/g, '')
            .replace(/\s{2,}/g, ' ');
          const parsed = JSON.parse(repaired);
          if (parsed.daily_plan?.length > 0) {
            console.log(`[weekly-planner] ${attempt.label}: SUCCESS after JSON repair`);
            return { plan: parsed, success: true, errors };
          }
          errors.push({
            attempt: attempt.label,
            stage: 'invalid_structure',
            error: `Repaired JSON but missing daily_plan. Keys: ${Object.keys(parsed).join(', ')}`,
            timestamp: new Date().toISOString(),
          });
        } catch {
          errors.push({
            attempt: attempt.label,
            stage: 'json_repair',
            error: `JSON repair also failed. Last 100 chars: ${cleaned.slice(-100)}`,
            timestamp: new Date().toISOString(),
          });
          console.warn(`[weekly-planner] ${attempt.label}: JSON repair failed`);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push({
        attempt: attempt.label,
        stage: 'api_call',
        error: errMsg,
        timestamp: new Date().toISOString(),
      });
      console.error(`[weekly-planner] ${attempt.label}: AI API error — ${errMsg}`);
    }
  }
  
  // All attempts exhausted
  console.error(`[weekly-planner] ALL AI ATTEMPTS FAILED. Error summary:`);
  errors.forEach(e => console.error(`  [${e.attempt}] ${e.stage}: ${e.error}`));
  return { plan: null, success: false, errors };
}

// ═══════════════════════════════════════════════════════════════
// DETERMINISTIC FALLBACK — last resort, uses ACTUAL user behavior
// ═══════════════════════════════════════════════════════════════

const WORKOUT_TEMPLATES: Record<string, Array<{ focus: string; exercises: Array<{ name: string; type: string; sets: number; reps: string }> }>> = {
  push: [{ focus: 'Push (Chest/Shoulders/Triceps)', exercises: [
    { name: 'Bench Press', type: 'compound', sets: 4, reps: '8-10' },
    { name: 'Overhead Press', type: 'compound', sets: 3, reps: '8-10' },
    { name: 'Dumbbell Flyes', type: 'isolation', sets: 3, reps: '12-15' },
    { name: 'Tricep Dips', type: 'compound', sets: 3, reps: '10-12' },
  ]}],
  pull: [{ focus: 'Pull (Back/Biceps)', exercises: [
    { name: 'Pull-ups', type: 'compound', sets: 4, reps: '6-10' },
    { name: 'Barbell Row', type: 'compound', sets: 4, reps: '8-10' },
    { name: 'Face Pulls', type: 'isolation', sets: 3, reps: '15' },
    { name: 'Bicep Curls', type: 'isolation', sets: 3, reps: '12' },
  ]}],
  legs: [{ focus: 'Legs (Quads/Hams/Glutes)', exercises: [
    { name: 'Barbell Squat', type: 'compound', sets: 4, reps: '8-10' },
    { name: 'Romanian Deadlift', type: 'compound', sets: 4, reps: '8-10' },
    { name: 'Leg Press', type: 'compound', sets: 3, reps: '10-12' },
    { name: 'Calf Raises', type: 'isolation', sets: 3, reps: '15' },
  ]}],
  upper: [{ focus: 'Upper Body', exercises: [
    { name: 'Bench Press', type: 'compound', sets: 3, reps: '8-10' },
    { name: 'Barbell Row', type: 'compound', sets: 3, reps: '8-10' },
    { name: 'Overhead Press', type: 'compound', sets: 3, reps: '10' },
    { name: 'Pull-ups', type: 'compound', sets: 3, reps: '8' },
  ]}],
  lower: [{ focus: 'Lower Body', exercises: [
    { name: 'Barbell Squat', type: 'compound', sets: 3, reps: '8-10' },
    { name: 'Romanian Deadlift', type: 'compound', sets: 3, reps: '8-10' },
    { name: 'Lunges', type: 'compound', sets: 3, reps: '10 each' },
    { name: 'Leg Curls', type: 'isolation', sets: 3, reps: '12' },
  ]}],
  full_body: [{ focus: 'Full Body', exercises: [
    { name: 'Squat', type: 'compound', sets: 3, reps: '8-10' },
    { name: 'Bench Press', type: 'compound', sets: 3, reps: '8-10' },
    { name: 'Barbell Row', type: 'compound', sets: 3, reps: '8-10' },
    { name: 'Overhead Press', type: 'compound', sets: 3, reps: '10' },
  ]}],
  hiit: [{ focus: 'HIIT Cardio', exercises: [
    { name: 'Burpees', type: 'cardio', sets: 4, reps: '30s on/15s off' },
    { name: 'Mountain Climbers', type: 'cardio', sets: 4, reps: '30s on/15s off' },
    { name: 'Jump Squats', type: 'cardio', sets: 4, reps: '30s on/15s off' },
    { name: 'High Knees', type: 'cardio', sets: 4, reps: '30s on/15s off' },
  ]}],
};

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MEAL_TEMPLATES = [
  { meal_type: 'breakfast', time: '07:00' },
  { meal_type: 'snack', time: '10:00' },
  { meal_type: 'lunch', time: '12:30' },
  { meal_type: 'snack', time: '15:30' },
  { meal_type: 'dinner', time: '19:00' },
];

function buildDeterministicPlan(data: UserComprehensiveData, weekStart: string, weekEnd: string): any {
  const goal = data.profile.primary_goal?.toLowerCase() || 'general_fitness';
  const isBeginner = data.profile.fitness_level === 'beginner';
  const isAdvanced = data.profile.fitness_level === 'advanced' || data.profile.fitness_level === 'intermediate';

  // Calculate workout days from ACTUAL user behavior, not theory
  let workoutDays: number;
  const weeklyFreq = data.workoutPatterns.total_workouts_30d > 0
    ? data.workoutPatterns.total_workouts_30d / 4
    : 0;
  const recentFreq = data.workoutPatterns.total_workouts_7d;

  if (recentFreq >= 3) {
    // Active user — match their current frequency or push slightly
    workoutDays = Math.min(6, Math.max(recentFreq, Math.round(weeklyFreq)));
  } else if (weeklyFreq >= 2) {
    // Moderate — use their 30d average rounded up
    workoutDays = Math.ceil(weeklyFreq);
  } else if (weeklyFreq >= 1) {
    // Getting started — 3 days to build habit
    workoutDays = 3;
  } else {
    // No data — use activity level
    workoutDays = data.profile.activity_level === 'very_active' ? 5
      : data.profile.activity_level === 'active' ? 4
      : data.profile.activity_level === 'moderate' ? 3 : 2;
  }

  // Goal adjustments
  if (goal.includes('fat_loss') && workoutDays < 4) workoutDays = Math.min(workoutDays + 1, 5);
  if (goal.includes('endurance')) workoutDays = Math.max(workoutDays, 5);
  if (isBeginner && workoutDays > 4) workoutDays = 4;

  const restDays = 7 - workoutDays;

  // Pick training split
  let split: string[];
  if (workoutDays <= 3) {
    split = ['full_body', 'rest', 'full_body', 'rest', 'full_body', 'rest', 'rest'];
  } else if (workoutDays <= 4) {
    split = ['upper', 'rest', 'lower', 'rest', 'upper', 'lower', 'rest'];
  } else {
    split = ['push', 'pull', 'legs', 'rest', 'push', 'pull', 'legs'];
  }

  // Adjust for goal
  if (goal.includes('fat_loss') || goal.includes('weight')) {
    // Insert cardio on a rest day
    for (let i = 0; i < split.length; i++) {
      if (split[i] === 'rest' && i < 5) { split[i] = 'hiit'; break; }
    }
  }

  // Schedule workouts on user's BEST training days
  const bestDays = data.workoutPatterns.best_performing_days.map(d => d.toLowerCase());
  if (bestDays.length > 0) {
    // Count workouts currently scheduled on best days
    const dayMap: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
    const workoutIndices = split.map((s, i) => s !== 'rest' ? i : -1).filter(i => i >= 0);
    
    // If most workouts are NOT on best days, try to reschedule
    let onBestDays = workoutIndices.filter(i => bestDays.includes(DAY_NAMES[i].toLowerCase())).length;
    if (onBestDays < Math.floor(workoutDays / 2) && workoutIndices.length === workoutDays) {
      // Simple reschedule: put workouts on best days first
      const newSplit = Array(7).fill('rest');
      let assigned = 0;
      // First pass: assign to best days
      for (const dayName of bestDays) {
        const idx = dayMap[dayName];
        if (idx !== undefined && assigned < workoutDays) {
          newSplit[idx] = split[workoutIndices[assigned]] || 'full_body';
          assigned++;
        }
      }
      // Second pass: fill remaining
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

  // Distribute calories: higher on training days, lower on rest
  const baseCal = data.targets.daily_calories;
  const baseProtein = data.targets.daily_protein;
  const baseCarbs = data.targets.daily_carbs;
  const baseFat = data.targets.daily_fat;

  const dailyPlans = [];
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

    // Adjust macros for training vs rest
    const calMult = isWorkout ? 1.1 : 0.9;
    const dayCal = Math.round(baseCal * calMult);
    const dayProtein = isWorkout ? Math.round(baseProtein * 1.05) : baseProtein;
    const dayCarbs = Math.round(baseCarbs * calMult);
    const dayFat = Math.round(baseFat * (isWorkout ? 1.0 : 0.95));

    // Build meals from user's common foods + fallbacks
    const userFoods = data.nutritionPatterns.most_common_foods.slice(0, 5);
    const fallbackFoods = [
      { name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
      { name: 'Eggs', calories: 78, protein: 6, carbs: 1, fat: 5 },
      { name: 'Rice', calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
      { name: 'Oats', calories: 150, protein: 5, carbs: 27, fat: 2.5 },
      { name: 'Tuna', calories: 130, protein: 29, carbs: 0, fat: 0.6 },
    ];

    const meals = MEAL_TEMPLATES.map(mt => {
      // Pick food: user food or fallback
      const foodSource = userFoods.length > 0 ? userFoods : fallbackFoods.map(f => f.name);
      const foodName = foodSource[Math.floor(Math.random() * foodSource.length)] || 'Chicken Breast';
      const portion = mt.meal_type === 'snack' ? 0.5 : 1;
      const cal = Math.round((dayCal / 5) * portion);
      const pro = Math.round((dayProtein / 5) * portion);
      const carbs = Math.round((dayCarbs / 5) * portion);
      const fat = Math.round((dayFat / 5) * portion);

      return {
        meal_type: mt.meal_type,
        time: mt.time,
        foods: [{ name: foodName, quantity: portion === 0.5 ? 1 : 1, unit: 'serving', calories: cal, protein: pro, carbs, fat }],
        total_calories: cal,
        total_protein: pro,
      };
    });

    const workoutBlock = isWorkout ? {
      focus: template![0].focus,
      duration_minutes: isBeginner ? 45 : 60,
      estimated_calories_burned: isBeginner ? 250 : 350,
      intensity: isBeginner ? 'moderate' : 'high',
      exercises: template![0].exercises.map(ex => ({
        name: ex.name, type: ex.type, muscle_groups: [ex.type === 'compound' ? ex.name.split(' ')[0].toLowerCase() : 'general'],
        sets: ex.sets, reps: ex.reps, weight_kg: 0, rest_seconds: isBeginner ? 90 : 60, notes: '',
      })),
      warm_up: '5min light cardio + dynamic stretching',
      cool_down: '5min stretching',
      coach_notes: isWorkout && dayType === 'hiit' ? 'Burn that fat. No excuses.' : 'Progressive overload. Every rep counts.',
    } : null;

    // Coach messages based on actual data
    const pAdh = data.nutritionPatterns.protein_adherence_percent;
    let coachMsg = 'Discipline is everything. Execute.';
    if (pAdh < 50) coachMsg = `You're hitting only ${pAdh}% protein adherence. Fix your diet NOW.`;
    else if (pAdh < 75) coachMsg = `${pAdh}% protein adherence is weak. Step up.`;
    else if (data.momentum.current_streak > 7) coachMsg = `${data.momentum.current_streak} day streak! Don't you dare break it.`;
    else if (isWorkout) coachMsg = 'Time to work. Leave nothing in the tank.';

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
        hydration_ml: data.targets.water_ml || 2500,
      },
      sleep: { target_bedtime: '22:30', target_wake_time: '06:30', target_duration_hours: 8 },
      supplements: data.supplementUsage.active_supplements.map(s => ({ name: s, dose: 'as directed', timing: 'daily' })),
      coach_message: coachMsg,
      confidence: 0.7,
    });
  }

  // Build recommendations from actual data
  const proteinPct = data.nutritionPatterns.protein_adherence_percent;
  const recs = [];
  if (proteinPct < 70) recs.push({ category: 'nutrition', priority: 'high', recommendation: `Hit your ${baseProtein}g daily protein target`, reasoning: `Current adherence is ${proteinPct}%` });
  if (data.workoutPatterns.total_workouts_7d < 2) recs.push({ category: 'training', priority: 'high', recommendation: `Train at least ${workoutDays}x this week`, reasoning: `Only ${data.workoutPatterns.total_workouts_7d} workouts last week` });
  if (data.sleepPatterns.avg_duration_hours < 7) recs.push({ category: 'recovery', priority: 'medium', recommendation: 'Sleep at least 7.5 hours', reasoning: `Current avg: ${data.sleepPatterns.avg_duration_hours}h` });
  if (recs.length === 0) recs.push({ category: 'general', priority: 'low', recommendation: 'Keep the streak alive', reasoning: 'Consistency is key to progress' });

  return {
    week_start: weekStart,
    week_end: weekEnd,
    plan_confidence: 0.7,
    generation_reasoning: 'Deterministic plan based on user profile data and goals (AI unavailable)',
    weekly_overview: {
      total_workout_days: workoutDays,
      total_rest_days: restDays,
      weekly_calorie_target: baseCal * 7,
      weekly_protein_target: baseProtein * 7,
      focus_areas: [goal],
      weekly_strategy: `${goal.replace('_', ' ')} — ${split.filter(s => s !== 'rest')[0]?.toUpperCase()} split`,
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
    console.log('[weekly-planner] Starting AI plan generation...');
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
      ai_errors: generationSource === 'fallback' ? aiErrors : undefined,
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

