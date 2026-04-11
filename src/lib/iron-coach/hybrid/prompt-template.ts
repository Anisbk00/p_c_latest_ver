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
  return `You are The Iron Coach — elite nutrition expert, veteran bodybuilder. Aggressive, direct, brutally honest, sarcastic. You roast laziness, destroy excuses, curse to wake them up. No coddling — you forge machines. Your mission: force reality and execution. High-testosterone, commanding tone. Savage humor. You scream because you care.

${langDirective}

YOUR ROLE:
1. Nutrition Truths: Raw facts on calories, macros, supplements. No myths. If food is garbage, say it.
2. Meal Planning: Performance & aesthetics. High protein is non-negotiable.
3. Food Analysis: Critique harshly. Explain why the diet fails. Suggest better alternatives immediately.
4. Tunisian Cuisine: Couscous, brik, lamb, merguez — optimize for muscle gain and fat loss.
5. Dietary Advice: Fat loss = suffer the deficit. Muscle gain = eat until full, then more. Discipline is the strategy.
6. Recipes: Simple, macro-focused, high-protein. No complications.

GUIDELINES:
• Tone: Aggressive, commanding, sarcastic, brutally honest. Roast and curse when needed. Encourage improvement.
• Style: Short, punchy sentences. No fluff. Get to the point FAST.
• Honesty: Expose excuses. Call out laziness.
• LENGTH: MAXIMUM 3 sentences per response. NEVER exceed 3 sentences. If you write 4+ sentences, STOP and cut it down. Be brutal and brief.
• Medical: "I'm a coach, not a doctor. Get cleared, then get back to work."
• Emojis: Sparingly for impact (💀, ⚡, 🥩, 🏋️‍♂️).
• DATA ACCURACY: Use ONLY the numbers provided in the user data below. Never make up calorie, protein, or weight numbers. If a value is 0 or missing, say "you haven't logged this yet" — do NOT invent data.
• NEVER output weekly totals as daily values. If it says "weekly total: 8500 cal", that's ~1214 cal/day, NOT 8500 cal/day.

SCOPE — NUTRITION ONLY:
Nutrition, food, macros, calories, supplements, meal planning, recipes, hydration, diet strategy.

OFF-TOPIC REJECTION: If asked about ANYTHING outside nutrition/fitness nutrition (coding, math, history, weather, relationships, finance, general knowledge, entertainment, medical diagnoses), respond with exactly ONE sentence: "I'm your nutrition coach, not a [topic] expert. Ask me about food, macros, or your diet plan." Then STOP.

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

// ═══════════════════════════════════════════════════════════════════
// CONTEXT-AWARE PROMPT BUILDER — only sends relevant data sections
// Reduces tokens by ~50-70% per request
// ═══════════════════════════════════════════════════════════════════

// Keyword patterns for detecting what data the question needs
const NUTRITION_KEYWORDS = /\b(calori|protein|carb|fat|macro|meal|food|eat|diet|nutrition|log|track|kcal|gram|hungry|cheat|snack|water|hydrat|supplement|vitamin|mineral|recipe|cook|tunisian|couscous|brik|merguez)\b/i;
const WORKOUT_KEYWORDS = /\b(workout|train|exercise|gym|lift|cardio|run|muscle|strength|rep|set|bench|squat|deadlift|push|pull|leg|chest|back|shoulder|arm|abs|core)\b/i;
const WEIGHT_KEYWORDS = /\b(weight|weigh|kg|lb|scale|body.?fat|bmi|progress|lost|gain|loose|drop|cut|bulk|shred|lean|mass)\b/i;
const PLAN_KEYWORDS = /\b(plan|schedule|week|today|tomorrow|routine|program|what.?should|what.?do)\b/i;
const SLEEP_KEYWORDS = /\b(sleep|rest|recovery|nap|bedtime|wake|tired|fatigue|insomnia)\b/i;
const STREAK_KEYWORDS = /\b(streak|consistency|habit|daily|discipline|motivation|lazy|skip|missed)\b/i;

export function buildHybridCoachUserPrompt(input: {
  question: string;
  context: IronCoachContextSnapshot;
  memory: Array<{ key: string; value: unknown; confidence: number }>;
  ragSnippets: Array<{ source: string; text: string; similarity: number }>;
}): string {
  const ctx = input.context;
  const profile = ctx.userProfile;
  const q = input.question.toLowerCase();
  const weeklyPlan = ctx.weeklyPlan;
  
  const lines: string[] = [];
  
  // ─── ALWAYS include: compact profile (one-liner) ───
  // This gives the AI basic identity + goal context in ~30 tokens
  const profileParts: string[] = [];
  if (profile?.name && profile.name !== 'User') profileParts.push(profile.name);
  if (profile?.currentWeightKg) profileParts.push(`${profile.currentWeightKg}kg`);
  if (profile?.targetWeightKg) profileParts.push(`target ${profile.targetWeightKg}kg`);
  if (profile?.primaryGoal) profileParts.push(profile.primaryGoal.replace(/_/g, ' '));
  if (profile?.fitnessLevel && profile.fitnessLevel !== 'beginner') profileParts.push(profile.fitnessLevel);
  
  lines.push(`PROFILE: ${profileParts.join(' | ') || 'No data set yet'}`);
  
  // Always include critical targets (used for almost any nutrition question)
  if (profile?.calorieTargetDaily || profile?.proteinTargetDaily) {
    const targets: string[] = [];
    if (profile.calorieTargetDaily) targets.push(`${profile.calorieTargetDaily}kcal/day`);
    if (profile.proteinTargetDaily) targets.push(`${profile.proteinTargetDaily}g P/day`);
    lines.push(`TARGETS: ${targets.join(', ')}`);
  }
  
  // Always include dietary restrictions/allergies (safety-critical, cheap tokens)
  if (profile?.allergies?.length) lines.push(`ALLERGIES: ${profile.allergies.join(', ')}`);
  if (profile?.dietaryRestrictions?.length) lines.push(`RESTRICTIONS: ${profile.dietaryRestrictions.join(', ')}`);

  // ─── CONDITIONAL SECTIONS — only include when relevant ───
  
  const needsNutrition = NUTRITION_KEYWORDS.test(q) || !WORKOUT_KEYWORDS.test(q) && !SLEEP_KEYWORDS.test(q);
  const needsWorkout = WORKOUT_KEYWORDS.test(q);
  const needsWeight = WEIGHT_KEYWORDS.test(q) || PLAN_KEYWORDS.test(q);
  const needsPlan = PLAN_KEYWORDS.test(q);
  const needsSleep = SLEEP_KEYWORDS.test(q);
  const needsStreak = STREAK_KEYWORDS.test(q);
  
  // Current week summary — include for nutrition/plan/streak questions
  if (needsNutrition || needsPlan || needsStreak) {
    lines.push('');
    const calStr = profile?.calorieTargetDaily 
      ? `${profile.avgDailyCalories || 0}/${profile.calorieTargetDaily}kcal (${profile.calorieAdherencePct != null ? profile.calorieAdherencePct + '%' : 'no target'})` 
      : `${profile?.avgDailyCalories || 0}kcal/day`;
    const proStr = profile?.proteinTargetDaily 
      ? `${profile.proteinConsumedDaily || 0}/${profile.proteinTargetDaily}g (${profile.proteinAdherencePct != null ? profile.proteinAdherencePct + '%' : 'no target'})` 
      : `${profile?.proteinConsumedDaily || 0}g P/day`;
    lines.push(`THIS WEEK: avg ${calStr}, ${proStr}, ${ctx.workoutsThisWeek || 0} workouts (${profile?.totalWorkoutMinutes || 0}min), ${profile?.daysWithFoodLogs || 0}/7 days logged`);
  }

  // Recent meals — only for nutrition questions
  if (needsNutrition && ctx.recentFoodLogs?.length) {
    lines.push('');
    lines.push('RECENT MEALS:');
    ctx.recentFoodLogs.slice(0, 4).forEach((f: any) => {
      lines.push(`- ${f.food || '?'}: ${f.calories || 0}kcal, ${f.protein || 0}g P, ${f.carbs || 0}g C, ${f.fat || 0}g F (${f.meal || '?'})`);
    });
  }

  // Weight — only for weight/progress/plan questions
  if (needsWeight && ctx.weightHistory && ctx.weightHistory.length > 0) {
    lines.push('');
    const latest = ctx.weightHistory[ctx.weightHistory.length - 1]?.weightKg;
    const trend = ctx.weightTrend === 'up' ? '↑' : ctx.weightTrend === 'down' ? '↓' : '→';
    const changes: string[] = [];
    if (ctx.weightChange7d != null) changes.push(`${ctx.weightChange7d > 0 ? '+' : ''}${ctx.weightChange7d}kg/7d`);
    if (ctx.weightChange30d != null) changes.push(`${ctx.weightChange30d > 0 ? '+' : ''}${ctx.weightChange30d}kg/30d`);
    lines.push(`WEIGHT: ${latest}kg ${trend}${changes.length ? ` (${changes.join(', ')})` : ''}`);
  }

  // Workouts — only for workout/plan questions
  if (needsWorkout && ctx.recentWorkouts?.length) {
    lines.push('');
    lines.push('RECENT WORKOUTS:');
    ctx.recentWorkouts.slice(0, 3).forEach((w: any) => {
      const d = w.startedAt ? w.startedAt.slice(5, 10) : '';
      lines.push(`- ${d} ${w.type || 'Workout'}: ${w.duration || 0}min, ${w.calories || 0}cal`);
    });
  }

  // Sleep — only for sleep questions
  if (needsSleep && profile?.avgSleepHours) {
    lines.push('');
    lines.push(`SLEEP: avg ${profile.avgSleepHours}h (${profile.avgSleepQuality || '?'}/100 quality)`);
  }

  // Streak — only for streak/motivation questions
  if (needsStreak && profile?.currentStreak > 0) {
    lines.push('');
    lines.push(`STREAK: ${profile.currentStreak} days`);
  }

  // Supplements — only for supplement/nutrition questions
  if (needsNutrition && profile?.supplements?.length) {
    lines.push('');
    lines.push(`SUPPLEMENTS: ${profile.supplements.map(s => `${s.name} (${s.dose}, ${s.timing})`).join(', ')}`);
  }

  // Weekly plan — only for plan/workout/today questions (already was conditional, kept)
  if (needsPlan && weeklyPlan?.exists) {
    lines.push('');
    lines.push('=== ACTIVE WEEKLY PLAN ===');
    lines.push(`Strategy: ${weeklyPlan.overview?.weeklyStrategy || 'N/A'}`);
    
    if (weeklyPlan.todayPlan) {
      const today = weeklyPlan.todayPlan;
      lines.push(`TODAY: ${today.dayName} — ${today.isWorkoutDay ? 'WORKOUT' : 'REST'}`);
      if (today.workout) {
        lines.push(`  Workout: ${today.workout.focus} (${today.workout.durationMinutes}min)`);
      }
      lines.push(`  Nutrition: ${today.nutrition.targetCalories}kcal, ${today.nutrition.targetProtein}g P, ${Math.round(today.nutrition.hydrationMl / 1000)}L water`);
    }
  } else if (needsPlan && !weeklyPlan?.exists) {
    lines.push('');
    lines.push('WEEKLY PLAN: Not generated yet.');
  }

  // Chat history — only last 2 messages for context (was 4)
  if (ctx.recentChatHistory?.length) {
    lines.push('');
    ctx.recentChatHistory.slice(0, 2).forEach((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Coach';
      lines.push(`${role}: ${msg.content.slice(0, 80)}${msg.content.length > 80 ? '...' : ''}`);
    });
  }
  
  // THE USER'S QUESTION
  lines.push('');
  lines.push(`Q: "${input.question}"`);
  
  return lines.join('\n');
}
