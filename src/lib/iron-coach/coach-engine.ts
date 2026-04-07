/**
 * Iron Coach — Deterministic Response Engine
 *
 * Generates intelligent, data-driven coaching responses WITHOUT any external LLM.
 * Uses:
 *   - Pattern matching to classify user intent
 *   - The existing retriever to fetch user data from Supabase
 *   - The existing tools (TDEE, calories, macros, pace, nutrition summary)
 *   - User profile + goals + recent data for personalized answers
 *
 * This engine works both online (with Supabase data) and offline (generic advice).
 */

import { retrieveContext, buildContextString, type RetrievedDocument } from '@/lib/iron-coach/retriever';
import { calcTDEE, calcCalories, calcMacros, calcPace, summarizeNutrition, type ToolResult } from '@/lib/iron-coach/tools';

// ═══════════════════════════════════════════════════════════════
// Intent Detection
// ═══════════════════════════════════════════════════════════════

type CoachIntent =
  | 'nutrition_status'
  | 'workout_status'
  | 'progress_check'
  | 'tdee_calc'
  | 'calorie_calc'
  | 'macro_calc'
  | 'pace_calc'
  | 'workout_plan'
  | 'meal_plan'
  | 'sleep_advice'
  | 'energy_advice'
  | 'motivation'
  | 'greeting'
  | 'general';

const INTENT_PATTERNS: Array<{ intent: CoachIntent; patterns: RegExp }> = [
  { intent: 'greeting', patterns: /^(hi|hello|hey|sup|yo|what'?s up|howdy|good\s*(morning|afternoon|evening))\b/i },
  { intent: 'nutrition_status', patterns: /\b(nutrition|diet|eat(en|ing)?|food|calorie|meal|macro|protein|carb|fat|intake|logged|track)\b/i },
  { intent: 'workout_status', patterns: /\b(workout|exercise|training|activity|gym|running|cycling|swim|active|session|burn(ed)?)\b/i },
  { intent: 'progress_check', patterns: /\b(progress|weight|body|measurement|goal|target|trend|track|how\s+am\s+i\s+doing|where\s+do\s+i\s+stand)\b/i },
  { intent: 'tdee_calc', patterns: /\b(tdee|total\s+daily|maintenance\s+calorie|bmr|basal\s+metabolic)\b/i },
  { intent: 'calorie_calc', patterns: /\b(calculate\s+calorie|calorie\s+burn|how\s+many\s+calorie|burned\s+calorie)\b/i },
  { intent: 'macro_calc', patterns: /\b(macro\s+split|calculate\s+macro|macro\s+breakdown|protein\s+target|how\s+much\s+protein)\b/i },
  { intent: 'pace_calc', patterns: /\b(pace|speed|km\/h|min\/km|running\s+pace|how\s+fast)\b/i },
  { intent: 'workout_plan', patterns: /\b(plan\s+(a\s+)?workout|workout\s+plan|what\s+should\s+i\s+do\s+today|suggest\s+exercise|recommend\s+workout)\b/i },
  { intent: 'meal_plan', patterns: /\b(meal\s+plan|what\s+to\s+eat|suggest\s+food|recommend\s+meal|diet\s+plan|eating\s+plan)\b/i },
  { intent: 'sleep_advice', patterns: /\b(sleep|rest|recover|insomnia|tired|fatigue|nap)\b/i },
  { intent: 'energy_advice', patterns: /\b(energy|boost|motivation|tired|low\s+energy|sluggish|pre.?workout)\b/i },
  { intent: 'motivation', patterns: /\b(motivat|keep\s+going|not\s+seeing\s+results|stuck|plateau|discourag|giv(e|ing)\s+up)\b/i },
];

function detectIntent(query: string): CoachIntent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.test(query)) return intent;
  }
  return 'general';
}

// ═══════════════════════════════════════════════════════════════
// Data Extractors
// ═══════════════════════════════════════════════════════════════

interface ExtractedProfile {
  heightCm?: number;
  activityLevel?: string;
  primaryGoal?: string;
  targetWeightKg?: number;
  coachingTone?: string;
}

interface ExtractedNutrition {
  todayCalories?: number;
  todayProtein?: number;
  todayCarbs?: number;
  todayFat?: number;
  entryCount?: number;
}

interface ExtractedWorkout {
  weeklyCount?: number;
  totalDuration?: number;
  totalCalories?: number;
  totalDistance?: number;
}

interface ExtractedWeight {
  latestWeight?: number;
  trend?: string;
  change?: number;
}

interface ExtractedGoals {
  goals: Array<{ type: string; progress: number; current: number; target: number }>;
}

function extractDataFromDocs(docs: RetrievedDocument[]) {
  const profile: ExtractedProfile = {};
  const nutrition: ExtractedNutrition = {};
  const workout: ExtractedWorkout = {};
  const weight: ExtractedWeight = {};
  const goals: ExtractedGoals = { goals: [] };

  for (const doc of docs) {
    if (doc.type === 'profile') {
      const m = doc.metadata;
      if (m.heightCm) profile.heightCm = Number(m.heightCm);
      if (m.activityLevel) profile.activityLevel = String(m.activityLevel);
      if (m.primaryGoal) profile.primaryGoal = String(m.primaryGoal);
      if (m.targetWeightKg) profile.targetWeightKg = Number(m.targetWeightKg);
      if (m.coachingTone) profile.coachingTone = String(m.coachingTone);
    }

    if (doc.id === 'food_log:today_summary') {
      const totals = doc.metadata.totals as Record<string, number> | undefined;
      nutrition.entryCount = Number(doc.metadata.entryCount ?? 0);
      if (totals) {
        nutrition.todayCalories = Math.round(totals.calories || 0);
        nutrition.todayProtein = Math.round(totals.protein || 0);
        nutrition.todayCarbs = Math.round(totals.carbs || 0);
        nutrition.todayFat = Math.round(totals.fat || 0);
      }
    }

    if (doc.id === 'workout:weekly_summary') {
      workout.weeklyCount = Number(doc.metadata.workoutCount ?? 0);
      workout.totalDuration = Number(doc.metadata.totalDuration ?? 0);
      workout.totalCalories = Number(doc.metadata.totalCalories ?? 0);
      workout.totalDistance = Number(doc.metadata.totalDistance ?? 0);
    }

    if (doc.id === 'measurement:latest_weight') {
      weight.latestWeight = Number(doc.metadata.value ?? 0);
    }

    if (doc.id === 'measurement:weight_trend') {
      weight.trend = String(doc.metadata.direction ?? 'stable');
      weight.change = Number(doc.metadata.change ?? 0);
    }

    if (doc.type === 'goal') {
      goals.goals.push({
        type: String(doc.metadata.goalType ?? 'unknown'),
        progress: Number(doc.metadata.progress ?? 0),
        current: Number(doc.metadata.currentValue ?? 0),
        target: Number(doc.metadata.targetValue ?? 0),
      });
    }
  }

  return { profile, nutrition, workout, weight, goals };
}

// ═══════════════════════════════════════════════════════════════
// Response Generators
// ═══════════════════════════════════════════════════════════════

interface CoachResponse {
  text: string;
  confidence: number;
  actions?: string[];
  suggestion?: string;
  calculationResult?: unknown;
  source: 'deterministic_engine';
}

function buildNutritionResponse(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { nutrition, profile } = data;

  if (nutrition.todayCalories === undefined || nutrition.entryCount === 0) {
    return {
      text: "You haven't logged any damn food yet today. What are you, lazy? Tracking your meals is non-negotiable if you want results. Stop making excuses and do it now before I lose my mind. 💀\n\n**ACTION:** Log your last meal immediately.",
      confidence: 0.9,
      actions: ['Log a meal', 'Show my goals'],
      suggestion: 'Tap "Foods" on the bottom bar to log your intake.',
      source: 'deterministic_engine',
    };
  }

  const lines: string[] = [];
  lines.push(`**Today's Fuel** (${nutrition.entryCount} entries)\n`);
  lines.push(`• **Calories:** ${nutrition.todayCalories} kcal`);
  lines.push(`• **Protein:** ${nutrition.todayProtein}g`);
  lines.push(`• **Carbs:** ${nutrition.todayCarbs}g`);
  lines.push(`• **Fat:** ${nutrition.todayFat}g`);

  // Goal-aware commentary
  const goal = profile.primaryGoal?.toLowerCase();
  if (goal === 'fat_loss' && nutrition.todayCalories && nutrition.todayCalories > 2200) {
    lines.push(`\n⚠️ You call that a diet? You're eating like a pig on a bulk, but you want to lose fat. Suffer through the deficit or stay soft. 💀`);
  } else if (goal === 'muscle_gain' && nutrition.todayProtein && nutrition.todayProtein < 100) {
    lines.push(`\n🥩 Your protein is pathetic. How do you expect to grow? Eat a damn steak, crack some eggs, or chug a shake. No excuses.`);
  } else {
    lines.push(`\n✅ Actually doing what you're supposed to for once. Don't completely ruin it tomorrow.`);
  }

  return {
    text: lines.join('\n'),
    confidence: 0.92,
    actions: ['Log a meal', 'Calculate my macros'],
    source: 'deterministic_engine',
  };
}

function buildWorkoutResponse(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { workout, profile } = data;

  if (!workout.weeklyCount || workout.weeklyCount === 0) {
    return {
      text: "Zero workouts this week? You are pathetic! Get off your ass and move. You couldn't even handle 20 minutes? Weak. ⚡\n\n**ACTION:** Pick up some heavy weight and stop making excuses.",
      confidence: 0.85,
      actions: ['Plan a workout', 'Show my goals'],
      source: 'deterministic_engine',
    };
  }

  const lines: string[] = [];
  lines.push(`**This Week's Damage**\n`);
  lines.push(`• **Workouts:** ${workout.weeklyCount} sessions`);
  if (workout.totalDuration) lines.push(`• **Suffering Time:** ${Math.round(workout.totalDuration)} minutes`);
  if (workout.totalCalories) lines.push(`• **Calories Burned:** ${Math.round(workout.totalCalories)} kcal`);
  if (workout.totalDistance && workout.totalDistance > 0) {
    lines.push(`• **Distance:** ${(workout.totalDistance / 1000).toFixed(1)} km`);
  }

  if (workout.weeklyCount >= 5) {
    lines.push(`\n🔥 ${workout.weeklyCount} sessions? Finally, some actual work. Don't injure yourself being stupid though. Recover.`);
  } else if (workout.weeklyCount >= 3) {
    lines.push(`\n💪 Acceptable. Push harder next time. Don't get complacent.`);
  } else {
    lines.push(`\nOnly ${workout.weeklyCount} sessions? Stop skipping days. Discipline is the only strategy.`);
  }

  return {
    text: lines.join('\n'),
    confidence: 0.9,
    actions: ['Plan a workout', "How is my nutrition?"],
    source: 'deterministic_engine',
  };
}

function buildProgressResponse(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { weight, goals, profile, workout, nutrition } = data;
  const lines: string[] = [];

  lines.push('**Reality Check** 💀\n');

  if (weight.latestWeight) {
    lines.push(`• **Current Mass:** ${weight.latestWeight} kg`);
    if (weight.trend && weight.change !== undefined) {
      const absChange = Math.abs(weight.change).toFixed(1);
      const emoji = weight.trend === 'lost' ? '📉' : weight.trend === 'gained' ? '📈' : '➡️';
      lines.push(`• **Trend:** ${emoji} ${weight.trend} ${absChange} kg. Is this what you wanted?`);
    }
  }

  if (goals.goals.length > 0) {
    lines.push(`\n**Your So-Called Goals:**`);
    for (const g of goals.goals) {
      const bar = g.progress >= 75 ? '🟢' : g.progress >= 50 ? '🟡' : '🔴';
      lines.push(`• ${bar} ${g.type}: ${g.current}/${g.target} (${g.progress}%). You call that effort?`);
    }
  }

  if (workout.weeklyCount) {
    lines.push(`\n• **Weekly Workouts:** ${workout.weeklyCount} sessions. Bare minimum.`);
  }

  if (nutrition.todayCalories) {
    lines.push(`• **Today's Calories:** ${nutrition.todayCalories} kcal. Better be clean fuel.`);
  }

  if (lines.length <= 2) {
    return {
      text: "You haven't logged a damn thing. Meals? Workouts? Weight? Give me data or stop wasting my time. I can't build a machine out of thin air. ⚡",
      confidence: 0.7,
      actions: ['Log a meal', 'Log a workout', 'Log weight'],
      source: 'deterministic_engine',
    };
  }

  return {
    text: lines.join('\n'),
    confidence: 0.88,
    actions: ['Show my nutrition', 'Show my workouts', 'Calculate TDEE'],
    source: 'deterministic_engine',
  };
}

function buildTDEEResponse(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { profile, weight } = data;
  const weightKg = weight.latestWeight || 70;
  const heightCm = profile.heightCm || 170;
  const activityLevel = profile.activityLevel || 'moderate';

  const result = calcTDEE({ weightKg, heightCm, activityLevel });

  if (!result.success || !result.result) {
    return {
      text: "I can't calculate your TDEE without your weight. Stop hiding from the scale and log it so we can actually build a plan. 💀",
      confidence: 0.5,
      actions: ['Log weight'],
      source: 'deterministic_engine',
    };
  }

  const { tdeeKcal, bmrKcal, activityMultiplier } = result.result;
  const goal = profile.primaryGoal?.toLowerCase();
  let goalCalories = tdeeKcal;
  let goalNote = '';

  if (goal === 'fat_loss') {
    goalCalories = Math.round(tdeeKcal - 500);
    goalNote = `You want to lose fat? Suffer through a 500 kcal deficit: **~${goalCalories} kcal/day**. No shortcuts, no cheat meals.`;
  } else if (goal === 'muscle_gain') {
    goalCalories = Math.round(tdeeKcal + 300);
    goalNote = `You want to grow? Eat a 300 kcal surplus: **~${goalCalories} kcal/day**. Eat until you're full, then eat more.`;
  } else {
    goalNote = `Maintenance: **~${tdeeKcal} kcal/day**. Don't get comfortable.`;
  }

  const lines = [
    `**Your TDEE (Total Daily Energy Expenditure)** ⚡\n`,
    `• **BMR:** ${bmrKcal} kcal (What you burn doing absolutely nothing)`,
    `• **Activity Multiplier:** ${activityMultiplier}x (${activityLevel})`,
    `• **TDEE:** ${tdeeKcal} kcal/day`,
    `\n${goalNote}`,
  ];

  return {
    text: lines.join('\n'),
    confidence: 0.85,
    calculationResult: result.result,
    actions: ['Calculate my macros', "How's my nutrition?"],
    source: 'deterministic_engine',
  };
}

function buildMacroResponse(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { profile, weight } = data;
  const goal = (profile.primaryGoal?.toLowerCase() || 'maintenance') as 'fat_loss' | 'muscle_gain' | 'maintenance' | 'recomposition';
  const tdeeResult = calcTDEE({
    weightKg: weight.latestWeight || 70,
    heightCm: profile.heightCm || 170,
    activityLevel: profile.activityLevel || 'moderate',
  });

  const targetCalories = tdeeResult.result?.tdeeKcal || 2000;
  const adjusted = goal === 'fat_loss' ? targetCalories - 500
    : goal === 'muscle_gain' ? targetCalories + 300
    : targetCalories;

  const result = calcMacros({
    targetCalories: adjusted,
    goal,
    bodyweightKg: weight.latestWeight || 70,
  });

  if (!result.success || !result.result) {
    return {
      text: "I can't calculate a macro split without your weight and goal. Are you guessing, or are you actually trying to build a physique? Log your data. 💀",
      confidence: 0.5,
      actions: ['Log weight', 'Set a goal'],
      source: 'deterministic_engine',
    };
  }

  const m = result.result;
  const lines = [
    `**Your Macro Split** (${goal.replace('_', ' ')})\n`,
    `Target: **${adjusted} kcal/day**\n`,
    `• **Protein:** ${m.protein.grams}g (${m.protein.percent}%) — High protein is non-negotiable. 🥩`,
    `• **Carbs:** ${m.carbs.grams}g (${m.carbs.percent}%) — Use this for fuel, not as an excuse to eat garbage.`,
    `• **Fat:** ${m.fat.grams}g (${m.fat.percent}%) — Essential, but don't overdo it.`,
  ];

  return {
    text: lines.join('\n'),
    confidence: 0.88,
    calculationResult: result.result,
    actions: ["How is my nutrition?", 'Plan a workout'],
    source: 'deterministic_engine',
  };
}

function buildWorkoutPlanResponse(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { profile, workout } = data;
  const goal = profile.primaryGoal?.toLowerCase() || 'maintenance';
  const weeklyWorkouts = workout.weeklyCount || 0;

  const plans: Record<string, string> = {
    fat_loss: `**Today's Execution Plan** 🔥\n\n1. **Warm-up:** 5 min strict cardio\n2. **Circuit** (3 rounds, 45s work / 15s rest, no crying):\n   - Burpees\n   - Mountain climbers\n   - Jump squats\n   - Push-ups\n   - Plank hold\n3. **Finisher:** 15 min steady-state suffering (walk/jog)\n4. **Cool-down:** 5 min stretching\n\n*Execute this. Keep your heart rate up and burn the fat off.*`,

    muscle_gain: `**Today's Execution Plan** 💪\n\n**Upper Body:**\n1. **Bench Press** — 4×8-10. Go heavy.\n2. **Bent-over Rows** — 4×8-10.\n3. **Overhead Press** — 3×10-12.\n4. **Pull-ups/Lat Pulldown** — 3×10-12.\n5. **Bicep Curls** — 3×12-15.\n6. **Tricep Dips** — 3×12-15.\n\nRest 60-90s between sets. Progressive overload. If you aren't struggling on the last rep, you're wasting time.\n\n*And eat your damn protein (2g per kg).*`,

    maintenance: `**Today's Execution Plan** ✨\n\n**Full Body Check:**\n1. **Squats** — 3×12\n2. **Push-ups** — 3×15\n3. **Dumbbell Rows** — 3×12 each arm\n4. **Lunges** — 3×10 each leg\n5. **Plank** — 3×60s. Hold it.\n6. **Cardio** — 20 min walk/jog\n\nMaintenance doesn't mean lazy. Do the work.`,
  };

  const plan = plans[goal] || plans.maintenance;
  const restNote = weeklyWorkouts >= 5
    ? `\n\n⚠️ You've already done ${weeklyWorkouts} sessions this week. Don't be an idiot and overtrain. Take a recovery day.`
    : '';

  return {
    text: plan + restNote,
    confidence: 0.82,
    actions: ["How is my nutrition?", 'Calculate calories burned'],
    source: 'deterministic_engine',
  };
}

function buildMealPlanResponse(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { profile, nutrition } = data;
  const goal = profile.primaryGoal?.toLowerCase() || 'maintenance';

  const remainingCals = nutrition.todayCalories !== undefined ? Math.max(0, 2000 - nutrition.todayCalories) : 2000;
  const remainingProtein = nutrition.todayProtein !== undefined ? Math.max(0, 140 - nutrition.todayProtein) : 140;

  const lines = [
    `**Meal Suggestions** 🥩\n`,
  ];

  if (nutrition.todayCalories !== undefined) {
    lines.push(`You have roughly **${remainingCals} kcal** and **${remainingProtein}g protein** left today. Don't ruin it.\n`);
  }

  if (goal === 'fat_loss') {
    lines.push(
      `**High-protein, lower-calorie fuel:**`,
      `• Grilled chicken breast + roasted vegetables (~400 cal, 40g protein)`,
      `• Greek yogurt with berries and zero sugar (~200 cal, 20g protein)`,
      `• Egg white omelette with spinach (~250 cal, 25g protein)`,
      `• Tuna salad with mixed greens. No mayo garbage. (~300 cal, 35g protein)`,
    );
  } else if (goal === 'muscle_gain') {
    lines.push(
      `**Calorie-dense mass builders:**`,
      `• Salmon with sweet potato and broccoli (~600 cal, 45g protein)`,
      `• Tunisian special: Brik, but baked, not deep fried logic, add triple chicken (~500 cal, 40g protein)`,
      `• Chicken stir-fry with rice and vegetables (~550 cal, 40g protein)`,
      `• Steak, couscous, and asparagus. Eat until it hurts. (~650 cal, 50g protein)`,
    );
  } else {
    lines.push(
      `**Clean maintenance options:**`,
      `• Grilled chicken salad with avocado (~450 cal, 35g protein)`,
      `• Whole wheat pasta with lean meat (~500 cal, 30g protein)`,
      `• Merguez with a massive salad instead of bread (~400 cal, 20g protein)`,
      `• Turkey sandwich on whole grain (~450 cal, 30g protein)`,
    );
  }

  return {
    text: lines.join('\n'),
    confidence: 0.8,
    actions: ['Log a meal', 'Calculate my macros'],
    source: 'deterministic_engine',
  };
}

function buildSleepAdvice(): CoachResponse {
  return {
    text: `**Sleep & Recovery Rules** 😴\n\n• **Aim for 7-9 hours** — this is when you grow. Stay up playing video games, stay small.\n• **Stop screens 30 min before bed** — put the damn phone away.\n• **Keep your room cool** — 18-20°C is ideal.\n• **Consistent schedule** — go to bed and wake up at the same time. No excuses on weekends.\n\n*Quality sleep is free. If you skip it, you're just wasting your time in the gym.*`,
    confidence: 0.88,
    actions: ["How is my nutrition?", 'Plan a workout'],
    source: 'deterministic_engine',
  };
}

function buildEnergyAdvice(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { nutrition } = data;

  const lines = [
    `**Energy Optimization** ⚡\n`,
    `Stop complaining that you're tired. Fix these first:`,
    `• **Hydrate** — You're probably just dehydrated. Drink 3L of water.`,
    `• **Eat real food** — Pair protein and complex carbs. Stop eating sugar.`,
    `• **Move** — Being lazy breeds lethargy. Get up and walk for 10 minutes.`,
    `\n**Fuel Timing:**`,
    `• Pre-workout: Light carbs 30-60 min before. No heavy junk.`,
    `• Post-workout: Protein within 45 min. Feed the machine.`,
    `• Afternoon slump: Don't you dare touch that candy. Handful of almonds.`,
  ];

  if (nutrition.todayCalories !== undefined && nutrition.todayCalories < 800) {
    lines.push(`\n⚠️ You've eaten ${nutrition.todayCalories} kcal today. No wonder you have no energy. Go eat some real food immediately or you're going to fail your workout.`);
  }

  return {
    text: lines.join('\n'),
    confidence: 0.85,
    actions: ['Suggest a meal', "How is my nutrition?"],
    source: 'deterministic_engine',
  };
}

function buildMotivationResponse(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { workout, goals } = data;

  const lines = [
    `**Listen To Me** 💀\n`,
  ];

  if (workout.weeklyCount && workout.weeklyCount > 0) {
    lines.push(`You've done **${workout.weeklyCount} workouts** this week. That's a start. Now double it.`);
  }

  if (goals.goals.length > 0) {
    const best = goals.goals.reduce((a, b) => (a.progress > b.progress ? a : b));
    if (best.progress > 0) {
      lines.push(`\nYour **${best.type}** goal is at **${best.progress}%**. You're nowhere near done.`);
    }
  }

  lines.push(
    `\n**Reality:**`,
    `• Motivation is garbage. Discipline is what gets you out of bed when you don't feel like it.`,
    `• Stop looking for a magic pill. Suffer the pain of discipline or the pain of regret.`,
    `• You think it's supposed to be easy? If it was easy, everyone would look great.`,
    `\nNow stop crying and get back to work. ⚡`,
  );

  return {
    text: lines.join('\n'),
    confidence: 0.9,
    actions: ['Show my progress', 'Plan a workout'],
    source: 'deterministic_engine',
  };
}

function buildGreetingResponse(data: ReturnType<typeof extractDataFromDocs>): CoachResponse {
  const { workout, nutrition, profile } = data;

  const lines = [`**Wake up!** ⚡\n`];

  if (nutrition.todayCalories !== undefined && nutrition.todayCalories > 0) {
    lines.push(`You've logged **${nutrition.todayCalories} kcal** and **${nutrition.todayProtein}g protein**. Is that all you've got today?`);
  }

  if (workout.weeklyCount && workout.weeklyCount > 0) {
    lines.push(`You've done **${workout.weeklyCount} workouts** this week. ${workout.weeklyCount >= 3 ? 'Acceptable' : 'Stop slacking'}.`);
  }

  lines.push(`\nNo excuses today. What are we destroying?`);

  return {
    text: lines.join('\n'),
    confidence: 0.95,
    actions: ["How is my nutrition?", 'Plan a workout', 'Show my progress'],
    source: 'deterministic_engine',
  };
}

function buildGeneralResponse(): CoachResponse {
  return {
    text: `I'm **The Iron Coach**. I don't coddle you. I force you to execute. What do you need?\n\n• 📊 **Reality Check** — I'll tell you if your diet is garbage\n• 🏋️ **Execution Plan** — I'll give you a workout that makes you suffer\n• 📈 **Progress** — We look at the brutal numbers\n• 🧮 **Calculations** — TDEE, macros, pace\n• 🥗 **Fuel** — Real food options. High protein.\n\nAsk me something so we can get to work. 💀`,
    confidence: 0.95,
    actions: ["How is my nutrition?", 'Calculate TDEE', 'Plan a workout'],
    source: 'deterministic_engine',
  };
}

// ═══════════════════════════════════════════════════════════════
// Main Engine
// ═══════════════════════════════════════════════════════════════

export async function generateCoachResponse(
  userId: string | null,
  message: string,
): Promise<CoachResponse> {
  const intent = detectIntent(message);

  // Fetch user data if userId is available (online mode)
  let docs: RetrievedDocument[] = [];
  if (userId) {
    try {
      docs = await retrieveContext(userId, message, {
        usePersonalData: true,
        daysWindow: 30,
        maxDocuments: 10,
      });
    } catch {
      // Offline or error — proceed with generic advice
      docs = [];
    }
  }

  const data = extractDataFromDocs(docs);

  switch (intent) {
    case 'greeting':
      return buildGreetingResponse(data);
    case 'nutrition_status':
      return buildNutritionResponse(data);
    case 'workout_status':
      return buildWorkoutResponse(data);
    case 'progress_check':
      return buildProgressResponse(data);
    case 'tdee_calc':
      return buildTDEEResponse(data);
    case 'calorie_calc':
      return buildTDEEResponse(data); // TDEE includes calorie info
    case 'macro_calc':
      return buildMacroResponse(data);
    case 'workout_plan':
      return buildWorkoutPlanResponse(data);
    case 'meal_plan':
      return buildMealPlanResponse(data);
    case 'sleep_advice':
      return buildSleepAdvice();
    case 'energy_advice':
      return buildEnergyAdvice(data);
    case 'motivation':
      return buildMotivationResponse(data);
    case 'pace_calc':
      return {
        text: "To calculate your pace, I need your **distance** (in km) and **duration** (in minutes). For example: *\"I ran 5km in 28 minutes\"*.\n\nShare those details and I'll compute your pace, speed, and splits!",
        confidence: 0.8,
        source: 'deterministic_engine',
      };
    default:
      return buildGeneralResponse();
  }
}
