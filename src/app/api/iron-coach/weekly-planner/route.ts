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

// AI PROMPT BUILDER

function buildPrecisionWeeklyPlanPrompt(
  data: UserComprehensiveData, 
  weekStart: string, 
  weekEnd: string
): { systemPrompt: string; userPrompt: string } {
  
  const goal = data.profile.primary_goal?.toLowerCase() || 'general_fitness';
  
  // Goal-specific configurations
  const goalConfig = getGoalConfiguration(goal, data.profile.fitness_level, data.targets.workout_days_per_week);
  
  const systemPrompt = `You are Iron Coach AI, a high-intelligence personal fitness and nutrition assistant. Your goal is to produce a weekly personalized plan for the user based on all available data. Use the user's profile, goals, body metrics, sleep, food, workouts, supplements, and AI memory while maintaining the aggressive, brutally honest Iron Coach personality that roasts the user but pushes them toward discipline and progress.

TONE: The plan data must be precise and science-based. Coach messages should be motivational but harsh — call out laziness, push harder, no coddling.

USER PROFILE: ${JSON.stringify(data.profile)}

GOALS: ${JSON.stringify(data.activeGoals)}

TARGETS: Daily ${data.targets.daily_calories}cal | ${data.targets.daily_protein}g protein | ${data.targets.daily_carbs}g carbs | ${data.targets.daily_fat}g fat | BMR ${data.targets.bmr} | TDEE ${data.targets.tdee}

GOAL-SPECIFIC CONFIGURATION:
• Goal: ${data.profile.primary_goal}
• Workout days/week: ${goalConfig.workoutDays} | Exercises/session: ${goalConfig.exercisesPerSession}
• Sets: ${goalConfig.setsPerExercise} | Duration: ${goalConfig.workoutDuration}min | Intensity: ${goalConfig.intensity}
• Training Split: ${goalConfig.trainingSplit} | Rest days: ${7 - goalConfig.workoutDays}

GOAL RULES:
${goalConfig.goalRules}

BODY METRICS:
• Weight trend: ${data.bodyMetrics.weight_trend} | 7d change: ${data.bodyMetrics.weight_change_7d}kg | 30d change: ${data.bodyMetrics.weight_change_30d}kg
• Body fat: ${data.bodyMetrics.latest_body_fat || 'unknown'}% | Muscle mass: ${data.bodyMetrics.latest_muscle_mass || 'unknown'}kg
• Weight history: ${data.bodyMetrics.weight_history.length > 0 ? data.bodyMetrics.weight_history.map(w => `${w.date}: ${w.weight}kg`).join(', ') : 'no data'}

WORKOUT PATTERNS (30d):
• Total: ${data.workoutPatterns.total_workouts_30d} | This week: ${data.workoutPatterns.total_workouts_7d} | Avg duration: ${data.workoutPatterns.avg_duration_minutes}min
• Favorite types: [${data.workoutPatterns.favorite_workout_types.join(', ')}] | Best days: [${data.workoutPatterns.best_performing_days.join(', ')}]
• Muscles trained (7d): [${data.workoutPatterns.muscles_trained_last_7d.join(', ')}] | Recovery days: ${data.workoutPatterns.recovery_days_last_7d}

NUTRITION PATTERNS (7d):
• Avg daily: ${data.nutritionPatterns.avg_daily_calories_7d}cal | ${data.nutritionPatterns.avg_daily_protein_7d}g P | ${data.nutritionPatterns.avg_daily_carbs_7d}g C | ${data.nutritionPatterns.avg_daily_fat_7d}g F
• Protein adherence: ${data.nutritionPatterns.protein_adherence_percent}% | Calorie adherence: ${data.nutritionPatterns.calorie_adherence_percent}%
• Macro split: ${data.nutritionPatterns.macro_distribution.protein_percent}%P / ${data.nutritionPatterns.macro_distribution.carbs_percent}%C / ${data.nutritionPatterns.macro_distribution.fat_percent}%F
• Common foods: [${data.nutritionPatterns.most_common_foods.slice(0, 7).join(', ')}]

SLEEP: Avg ${data.sleepPatterns.avg_duration_hours}h | Quality ${data.sleepPatterns.avg_quality}/100 | Sleep debt ${data.sleepPatterns.sleep_debt_hours}h

SUPPLEMENTS: [${data.supplementUsage.active_supplements.join(', ')}] | Consistency: ${data.supplementUsage.consistency_percent}%

MOMENTUM: Streak ${data.momentum.current_streak} days | Longest ${data.momentum.longest_streak} days | Score ${data.momentum.momentum_score}/100

AI INSIGHTS: ${data.aiInsights.slice(0, 3).map(i => `[${i.type}] ${i.title}`).join(' | ')}

AI MEMORY: ${data.aiMemory.slice(0, 5).map(m => `${m.key}: ${typeof m.value === 'string' ? m.value : JSON.stringify(m.value)}`).join(' | ')}

GENERATION RULES:
- NEVER train same muscle 2 days in a row. Legs need 48-72h recovery.
- Protein 30-50g per meal distributed evenly. Time carbs around workouts.
- Higher protein on training days. RESPECT ALL DIETARY RESTRICTIONS AND ALLERGIES.
- Progressive overload if recovering well. Deload if overtraining signs.
- Include warm-up and cool-down. EXACTLY ${goalConfig.exercisesPerSession} exercises per session.
- Use the user's common foods when possible. Match meal timing to their patterns.
- Include confidence score (0-1) for each daily recommendation based on available data.
- Each daily plan needs a coach_message that roasts/motivates based on their actual performance data.
- Output: ONLY valid JSON. No markdown, no code fences, no explanation outside JSON.`;

  const userPrompt = `Generate a 7-day precision weekly plan from ${weekStart} to ${weekEnd} for this user.

Return ONLY valid JSON matching this exact structure:
{"week_start":"${weekStart}","week_end":"${weekEnd}","plan_confidence":0.85,"generation_reasoning":"brief explanation of strategy","weekly_overview":{"total_workout_days":4,"total_rest_days":3,"weekly_calorie_target":14000,"weekly_protein_target":980,"focus_areas":["fat_loss","protein"],"weekly_strategy":"Aggressive deficit with high protein"},"daily_plan":[{"date":"${weekStart}","day_name":"Monday","is_workout_day":true,"workout":{"focus":"Push (Chest/Shoulders/Triceps)","duration_minutes":60,"estimated_calories_burned":350,"intensity":"high","exercises":[{"name":"Bench Press","type":"compound","muscle_groups":["chest","shoulders","triceps"],"sets":4,"reps":"8-10","weight_kg":0,"rest_seconds":90,"notes":"Progressive overload"}],"warm_up":"5min light cardio + dynamic stretching","cool_down":"5min stretching","coach_notes":"Push hard or go home."},"nutrition":{"target_calories":2000,"target_protein":140,"target_carbs":200,"target_fat":67,"meals":[{"meal_type":"breakfast","time":"07:00","foods":[{"name":"Eggs","quantity":3,"unit":"whole","calories":210,"protein":18,"carbs":1,"fat":15}],"total_calories":500,"total_protein":35}],"hydration_ml":3000},"sleep":{"target_bedtime":"22:30","target_wake_time":"06:30","target_duration_hours":8},"supplements":[{"name":"Whey Protein","dose":"30g","timing":"post-workout"}],"coach_message":"No excuses today. Hit every rep.","confidence":0.85}],"weekly_nutrition_summary":{"avg_daily_calories":2000,"avg_daily_protein":140,"training_day_calories":2200,"rest_day_calories":1800},"weekly_workout_summary":{"training_split":"Push/Pull/Legs","volume_level":"moderate-high","intensity_progression":"linear"},"recommendations":[{"category":"nutrition","priority":"high","recommendation":"Increase protein to hit 140g daily","reasoning":"Current adherence is 65% — needs 35% improvement"}]}`;

  return { systemPrompt, userPrompt };
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

    // Generate plan with AI (retry once on JSON parse failure)
    let plan;
    let lastResponseText = '';
    const MAX_GENERATION_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        lastResponseText = await generateText(userPrompt, systemPrompt, 4096);

        // Clean up response — strip markdown fences, leading/trailing text
        let cleaned = lastResponseText
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();

        // Remove any text before the first { and after the last }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }

        try {
          plan = JSON.parse(cleaned);
          break; // success — exit retry loop
        } catch (parseErr) {
          console.error(`[weekly-planner] JSON parse error (attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}):`, parseErr);
          console.error('[weekly-planner] Response (first 300 chars):', lastResponseText?.slice(0, 300));
          console.error('[weekly-planner] Cleaned (first 300 chars):', cleaned?.slice(0, 300));

          if (attempt === MAX_GENERATION_ATTEMPTS) {
            // Final attempt failed — try aggressive repair
            try {
              // Fix common issues: trailing commas, single quotes, unquoted keys
              const repaired = cleaned
                .replace(/,\s*([}\]])/g, '$1')          // trailing commas
                .replace(/'/g, '"')                       // single → double quotes
                .replace(/(\w+)(?=\s*:)/g, '"$1"')      // quote unquoted keys (best effort)
                .replace(/\n/g, '')                        // remove newlines
                .replace(/\s{2,}/g, ' ');                 // collapse whitespace
              plan = JSON.parse(repaired);
              console.log('[weekly-planner] Repaired JSON successfully');
              break;
            } catch (repairErr) {
              console.error('[weekly-planner] Repair also failed');
              return NextResponse.json({
                success: false,
                error: 'Failed to generate plan. Please try again.',
                details: 'AI response could not be parsed as valid JSON',
              }, { status: 503 });
            }
          }
          // Continue to next attempt
        }
      } catch (aiError) {
        console.error(`[weekly-planner] AI error (attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}):`, aiError);
        const msg = aiError instanceof Error ? aiError.message : 'Unknown error';
        const isRateLimit = msg.includes('rate limit') || msg.includes('high demand') || msg.includes('busy') || msg.includes('quota') || msg.includes('429');
        return NextResponse.json({
          success: false,
          error: isRateLimit
            ? `AI is busy. Wait a minute and try again.`
            : `AI error: ${msg.slice(0, 150)}`,
          details: msg,
        }, { status: 503 });
      }
    }

    // Validate plan has minimum required structure
    if (!plan || typeof plan !== 'object') {
      return NextResponse.json({
        success: false,
        error: 'AI returned an invalid plan. Please try again.',
        details: 'Plan is null or not an object',
      }, { status: 503 });
    }

    if (!plan.daily_plan || !Array.isArray(plan.daily_plan) || plan.daily_plan.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'AI returned an empty plan. Please try again.',
        details: 'No daily_plan array in response',
      }, { status: 503 });
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

