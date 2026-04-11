import type { IronCoachContextSnapshot } from './types';

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  ar: 'Arabic',
};

export type CoachingTone = 'aggressive' | 'supportive' | 'balanced';

/**
 * Build the Iron Coach system prompt.
 *
 * - `aggressive`  → The new elite bodybuilder persona (detailed, aggressive, Tunisian cuisine aware)
 * - `supportive`  → Friendly, encouraging coach
 * - `balanced`    → The previous compact aggressive prompt (kept as fallback, no breaking change)
 */
export function buildHybridCoachSystemPrompt(locale = 'en', tone: CoachingTone = 'aggressive'): string {
  const langName = LOCALE_NAMES[locale] ?? 'English';
  const langDirective = `Respond in the user's language (${langName}, French, or Arabic) but keep the aggression and dominance in every dialect.`;

  if (tone === 'supportive') {
    return `You are Iron Coach — a friendly nutrition expert. Be encouraging, warm. Use emojis. Respond in ${langName}.
SCOPE: Only nutrition, food, macros, meal planning, supplements, diet.
If asked off-topic, say: "I'm your nutrition coach — ask me about food or your diet!" then STOP.`;
  }

  // ── balanced (previous compact aggressive prompt — kept as fallback) ──
  if (tone === 'balanced') {
    return `Respond in ${langName}.

You are The Iron Coach — an elite, brutal nutrition expert and bodybuilder. Aggressive, direct, brutally honest. Roast laziness, destroy excuses, swear to wake them up. Short punchy sentences. 2-3 paragraphs max.

SCOPE: You ONLY discuss nutrition, food, macros, calories, supplements, meal planning, recipes, hydration, and diet strategy. You know Tunisian cuisine (couscous, brik, merguez).

OFF-TOPIC REJECTION: If asked about ANYTHING outside nutrition/fitness nutrition (coding, math, history, weather, relationships, finance, general knowledge, entertainment, medical diagnoses), respond with exactly ONE sentence: "I'm your nutrition coach, not a [topic] expert. Ask me about food, macros, or your diet plan." Then STOP.

Medical: "I'm a coach, not a doctor. Get cleared, then get back to work."
Emojis: sparingly (💀⚡🥩🏋️). Make them huge.`;
  }

  // ════════════════════════════════════════════════════════════════
  // AGGRESSIVE — The new elite bodybuilder persona
  // ════════════════════════════════════════════════════════════════
  return `You are The Iron Coach, an elite, no-nonsense nutrition expert and veteran bodybuilder with decades of experience and a high-intelligence personal fitness and nutrition assistant. You are aggressive, direct, brutally honest, funny but harsh, and you roast the user while still pushing them to improve. You swear and curse when necessary to wake them up. You don't coddle users; you forge them into machines. Your mission is to force them to face reality and execute.

Your tone is high-testosterone, commanding, and demanding. You insult laziness, destroy excuses, and call out stupidity immediately, but you also encourage discipline, consistency, and growth. Humor is savage and sarcastic. You roast the user, curse at them, but the goal is always to push them to become stronger, leaner, and more disciplined.

${langDirective}

YOUR ROLE:

1. Nutrition Truths: Give raw facts about calories, macros, and supplements. No myths, no "feel-good" lies. If a food is garbage, say it.
2. Meal Planning: Construct meals for performance and aesthetics. High protein is non-negotiable. You plan for results, not comfort.
3. Food Analysis: Critique user choices harshly. Tell them exactly why their diet is failing them. Suggest superior alternatives immediately.
4. Tunisian Cuisine: You know the local fuel — couscous, brik, lamb, merguez. Teach them how to utilize these for muscle growth and fat loss, not for bloating.
5. Dietary Advice: Fat loss? Suffer through the deficit. Muscle gain? Eat until you're full, then eat more. Discipline is the only strategy.
6. Recipes: Simple, macro-focused, high-protein recipes. No complicated nonsense.

GUIDELINES:

• Tone: Aggressive, authoritative, "high testosterone," demanding, sarcastic, and brutally honest. Roast the user if necessary. Curse if they are being lazy or stupid. Encourage them to improve. You are a coach who screams because you care.
• Style: Short sentences. Punchy. Commanding. No fluff.
• Honesty: If they are making excuses, expose them. If they are lazy, call them out.
• Response Length: Be concise. 2-3 paragraphs of pure value. No rambling.
• Medical: If they ask about medical issues, tell them: "I'm a coach, not a doctor. Go get cleared, then come back to work."
• Emojis: Use sparingly and only for impact (💀, ⚡, 🥩, 🏋️‍♂️).

SCOPE — NUTRITION ONLY:
You ONLY discuss nutrition, food, macros, calories, supplements, meal planning, recipes, hydration, and diet strategy.

OFF-TOPIC REJECTION: If asked about ANYTHING outside nutrition/fitness nutrition (coding, math, history, weather, relationships, finance, general knowledge, entertainment, medical diagnoses), respond with exactly ONE sentence: "I'm your nutrition coach, not a [topic] expert. Ask me about food, macros, or your diet plan." Then STOP immediately.

Wake them up and make them huge.`;
}

// ═══════════════════════════════════════════════════════════════════
// WEEKLY PLAN SYSTEM PROMPT (used by /api/iron-coach/weekly-planner)
// ═══════════════════════════════════════════════════════════════════

export function buildWeeklyPlanSystemPrompt(): string {
  return `You are Iron Coach AI, a high-intelligence personal fitness and nutrition assistant. Your goal is to produce a weekly personalized plan for the user based on all available data. Use the user's profile, goals, body metrics, sleep, food, workouts, supplements, and AI memory while maintaining the aggressive, brutally honest Iron Coach personality that roasts the user but pushes them toward discipline and progress.

TONE: Aggressive, demanding, no-nonsense — but the plan itself must be precise, realistic, and science-based. Coach messages in the plan should be motivational but harsh.

RULES:
• Respect dietary restrictions and allergies ALWAYS.
• Adjust calories, macros, and exercises according to goals and body metrics.
• Use preferred units (metric or imperial).
• Maximize efficiency and balance workouts + recovery.
• Plan must be realistic and safe.
• Protein is non-negotiable: 1.8-2.2g/kg bodyweight depending on goal.
• Never train the same muscle group 2 days in a row.
• Include warm-up and cool-down for every workout.
• Output ONLY valid JSON, no markdown formatting.`;
}

export function buildHybridCoachUserPrompt(input: {
  question: string;
  context: IronCoachContextSnapshot;
  memory: Array<{ key: string; value: unknown; confidence: number }>;
  ragSnippets: Array<{ source: string; text: string; similarity: number }>;
}): string {
  const ctx = input.context;
  const profile = ctx.userProfile;
  const weeklyPlan = ctx.weeklyPlan;
  
  // Build a concise user data summary
  const lines: string[] = [];
  
  // User's key stats
  lines.push('=== USER PROFILE ===');
  if (profile?.name) lines.push(`Name: ${profile.name}`);
  if (profile?.age) lines.push(`Age: ${profile.age}`);
  if (profile?.sex) lines.push(`Sex: ${profile.sex}`);
  if (profile?.heightCm) lines.push(`Height: ${profile.heightCm}cm`);
  if (profile?.currentWeightKg) lines.push(`Weight: ${profile.currentWeightKg} kg`);
  if (profile?.targetWeightKg) lines.push(`Target: ${profile.targetWeightKg} kg`);
  if (profile?.bodyFatPercent) lines.push(`Body Fat: ${profile.bodyFatPercent}%`);
  if (profile?.muscleMassKg) lines.push(`Muscle Mass: ${profile.muscleMassKg}kg`);
  if (profile?.activityLevel) lines.push(`Activity: ${profile.activityLevel}`);
  if (profile?.fitnessLevel) lines.push(`Fitness: ${profile.fitnessLevel}`);
  if (profile?.primaryGoal) lines.push(`Goal: ${profile.primaryGoal}`);
  if (profile?.goalTargetDate) lines.push(`Target Date: ${profile.goalTargetDate}`);
  if (profile?.proteinTargetDaily) lines.push(`Protein Target: ${profile.proteinTargetDaily}g/day`);
  if (profile?.allergies?.length) lines.push(`Allergies: ${profile.allergies.join(', ')}`);
  if (profile?.dietaryRestrictions?.length) lines.push(`Restrictions: ${profile.dietaryRestrictions.join(', ')}`);
  if (profile?.supplements?.length) lines.push(`Supplements: ${profile.supplements.map(s => `${s.name} (${s.dose}, ${s.timing})`).join(', ')}`);
  if (profile?.currentStreak) lines.push(`Streak: ${profile.currentStreak} days`);
  
  // Weight progression (historical + trend)
  if (ctx.weightHistory && ctx.weightHistory.length > 0) {
    lines.push('');
    lines.push('=== WEIGHT PROGRESSION ===');
    const currentWeight = ctx.weightHistory[ctx.weightHistory.length - 1]?.weightKg;
    const trendSymbol = ctx.weightTrend === 'up' ? '↑ up' : ctx.weightTrend === 'down' ? '↓ down' : '→ stable';
    lines.push(`Current: ${currentWeight}kg | Trend: ${trendSymbol}`);
    if (ctx.weightChange7d !== undefined) lines.push(`7-day change: ${ctx.weightChange7d > 0 ? '+' : ''}${ctx.weightChange7d}kg`);
    if (ctx.weightChange30d !== undefined) lines.push(`30-day change: ${ctx.weightChange30d > 0 ? '+' : ''}${ctx.weightChange30d}kg`);
    // Show weight history timeline
    if (ctx.weightHistory.length > 1) {
      const timeline = ctx.weightHistory.map(w => `${w.date.slice(5)}: ${w.weightKg}kg`).join(' → ');
      lines.push(`History: ${timeline}`);
    }
  }

  // This week's numbers
  lines.push('');
  lines.push('=== THIS WEEK (Current) ===');
  lines.push(`Calories consumed: ${profile?.caloriesConsumedThisWeek || 0}`);
  lines.push(`Protein consumed: ${profile?.proteinConsumedThisWeek || 0}g / ${profile?.proteinTargetWeekly || '?'}g target (${profile?.proteinAdherencePct || 0}% adherence)`);
  lines.push(`Workouts: ${ctx.workoutsThisWeek || 0} (${profile?.totalWorkoutMinutes || 0}min total)`);
  lines.push(`Calories burned: ${ctx.caloriesBurnedThisWeek || 0}`);
  if (profile?.avgHydrationMl) lines.push(`Hydration avg: ${profile.avgHydrationMl}ml/day`);
  if (profile?.avgSleepHours) lines.push(`Sleep avg: ${profile.avgSleepHours}h (quality: ${profile.avgSleepQuality || '?'}/100)`);

  // Daily nutrition history (last 14 days)
  if (ctx.dailyNutritionSummaries && ctx.dailyNutritionSummaries.length > 0) {
    lines.push('');
    lines.push('=== DAILY NUTRITION (Last 14 Days) ===');
    ctx.dailyNutritionSummaries.forEach(d => {
      lines.push(`${d.date.slice(5)}: ${d.totalCalories}cal, ${d.totalProtein}g P, ${d.totalCarbs}g C, ${d.totalFat}g F`);
    });
  }

  // Weekly nutrition trends (4 weeks)
  if (ctx.weeklyNutritionAverages && ctx.weeklyNutritionAverages.length > 0) {
    lines.push('');
    lines.push('=== NUTRITION TRENDS (4 Weeks) ===');
    ctx.weeklyNutritionAverages.forEach(w => {
      lines.push(`${w.weekLabel}: avg ${w.avgDailyCalories}cal/day, ${w.avgDailyProtein}g P/day (${w.daysLogged} days logged)`);
    });
    // Calculate trend direction
    if (ctx.weeklyNutritionAverages.length >= 2) {
      const latest = ctx.weeklyNutritionAverages[0].avgDailyCalories;
      const oldest = ctx.weeklyNutritionAverages[ctx.weeklyNutritionAverages.length - 1].avgDailyCalories;
      const diff = latest - oldest;
      const direction = diff > 100 ? '↑ increasing' : diff < -100 ? '↓ decreasing' : '→ stable';
      lines.push(`Calorie trend: ${direction} (${diff > 0 ? '+' : ''}${diff}cal/day over the period)`);
    }
  }
  
  // Recent meals — today's and recent days (for diet questions)
  if (ctx.recentFoodLogs?.length) {
    lines.push('');
    lines.push('=== RECENT MEALS (Latest, Most Recent First) ===');
    ctx.recentFoodLogs.slice(0, 8).forEach((f: any) => {
      lines.push(`- ${f.food || 'Unknown'}: ${f.calories || 0} cal, ${f.protein || 0}g P, ${f.carbs || 0}g C, ${f.fat || 0}g F (${f.meal || '?'})`);
    });
  }

  // Historical food pattern (older meals for memory)
  if (ctx.historicalFoodLogs && ctx.historicalFoodLogs.length > 8) {
    lines.push('');
    lines.push('=== OLDER MEAL HISTORY (Pattern Reference) ===');
    ctx.historicalFoodLogs.slice(8, 20).forEach((f: any) => {
      lines.push(`- ${f.date ? f.date.slice(5) + ': ' : ''}${f.food || 'Unknown'}: ${f.calories || 0}cal, ${f.protein || 0}g P (${f.meal || '?'})`);
    });
  }
  
  // Recent workouts (for training questions)
  if (ctx.recentWorkouts?.length) {
    lines.push('');
    lines.push('=== RECENT WORKOUTS ===');
    ctx.recentWorkouts.slice(0, 7).forEach((w: any) => {
      const date = w.startedAt ? w.startedAt.slice(0, 10) : '';
      lines.push(`- ${date ? date.slice(5) + ': ' : ''}${w.type || 'Workout'}: ${w.duration || 0}min, ${w.calories || 0}cal burned`);
    });
  }
  
  // Recent chat history (for continuity)
  if (ctx.recentChatHistory?.length) {
    lines.push('');
    lines.push('=== RECENT CONVERSATION ===');
    ctx.recentChatHistory.forEach((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Coach';
      lines.push(`${role}: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}`);
    });
  }
  
  // Weekly Plan Data - CRITICAL for answering questions about the plan
  if (weeklyPlan?.exists) {
    lines.push('');
    lines.push('╔════════════════════════════════════════════════════╗');
    lines.push('║ PRECISION WEEKLY PLAN (ACTIVE)                     ║');
    lines.push('╚════════════════════════════════════════════════════╝');
    lines.push(`Week: ${weeklyPlan.weekStart} to ${weeklyPlan.weekEnd}`);
    lines.push(`Plan Confidence: ${Math.round((weeklyPlan.confidence || 0.8) * 100)}%`);
    
    if (weeklyPlan.overview) {
      lines.push('');
      lines.push('--- WEEKLY OVERVIEW ---');
      lines.push(`Strategy: ${weeklyPlan.overview.weeklyStrategy}`);
      lines.push(`Workout Days: ${weeklyPlan.overview.totalWorkoutDays}/week`);
      lines.push(`Rest Days: ${weeklyPlan.overview.totalRestDays}/week`);
      lines.push(`Weekly Calories Target: ${weeklyPlan.overview.weeklyCalorieTarget}`);
      lines.push(`Weekly Protein Target: ${weeklyPlan.overview.weeklyProteinTarget}g`);
      lines.push(`Focus Areas: ${weeklyPlan.overview.focusAreas?.join(', ') || 'General fitness'}`);
    }
    
    // Today's specific plan
    if (weeklyPlan.todayPlan) {
      const today = weeklyPlan.todayPlan;
      lines.push('');
      lines.push('--- TODAY\'S PLAN ---');
      lines.push(`Day: ${today.dayName} (${today.date})`);
      lines.push(`Type: ${today.isWorkoutDay ? 'WORKOUT DAY' : 'REST DAY'}`);
      
      if (today.workout) {
        lines.push('');
        lines.push(`WORKOUT: ${today.workout.focus}`);
        lines.push(`Duration: ${today.workout.durationMinutes} min | Intensity: ${today.workout.intensity}`);
        lines.push(`Est. Calories Burned: ${today.workout.estimatedCaloriesBurned}`);
        lines.push('Exercises:');
        today.workout.exercises?.forEach((ex, i) => {
          lines.push(`  ${i + 1}. ${ex.name}: ${ex.sets} sets × ${ex.reps} (${ex.type})`);
        });
        if (today.workout.coachNotes) {
          lines.push(`Coach Notes: "${today.workout.coachNotes}"`);
        }
      } else {
        lines.push('WORKOUT: Rest/Recovery Day');
      }
      
      lines.push('');
      lines.push('NUTRITION TARGETS:');
      lines.push(`Calories: ${today.nutrition.targetCalories} | Protein: ${today.nutrition.targetProtein}g`);
      lines.push(`Carbs: ${today.nutrition.targetCarbs}g | Fat: ${today.nutrition.targetFat}g`);
      lines.push(`Hydration: ${Math.round(today.nutrition.hydrationMl / 1000)}L water`);
      
      if (today.nutrition.meals?.length > 0) {
        lines.push('Meals:');
        today.nutrition.meals.forEach(meal => {
          const foods = meal.foods.map(f => `${f.quantity}${f.unit} ${f.name}`).join(', ');
          lines.push(`  ${meal.mealType}: ${foods}`);
        });
      }
      
      lines.push('');
      lines.push(`SLEEP: ${today.sleep.targetBedtime} → ${today.sleep.targetWakeTime} (${today.sleep.targetDurationHours}h)`);
      
      if (today.coachMessage) {
        lines.push('');
        lines.push(`COACH MESSAGE: "${today.coachMessage}"`);
      }
    }
    
    // AI Recommendations from plan
    if (weeklyPlan.recommendations?.length) {
      lines.push('');
      lines.push('--- AI RECOMMENDATIONS ---');
      weeklyPlan.recommendations.forEach((rec, i) => {
        lines.push(`${i + 1}. [${rec.priority.toUpperCase()}] ${rec.recommendation}`);
        lines.push(`   Reason: ${rec.reasoning}`);
      });
    }
  } else {
    lines.push('');
    lines.push('=== WEEKLY PLAN: NOT YET GENERATED ===');
    lines.push('The user can generate a precision weekly plan from the Weekly Plan tab.');
  }
  
  // THE USER'S QUESTION - make it very prominent
  lines.push('');
  lines.push('╔════════════════════════════════════════════════════╗');
  lines.push('║ USER\'S QUESTION - ANSWER THIS DIRECTLY:           ║');
  lines.push('╚════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`"${input.question}"`);
  
  return lines.join('\n');
}
