import type { IronCoachContextSnapshot } from './types';

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  ar: 'Arabic',
};

export type CoachingTone = 'aggressive' | 'supportive' | 'balanced';

export function buildHybridCoachSystemPrompt(locale = 'en', tone: CoachingTone = 'aggressive'): string {
  const langName = LOCALE_NAMES[locale] ?? 'English';
  
  if (tone === 'supportive') {
    return `You are Iron Coach — a friendly fitness mentor and nutrition expert. Be encouraging, warm, and supportive. Use emojis naturally. Respond in ${langName}, French, or Arabic based on the user's language.

Always answer the user's specific question FIRST, then add encouragement.`;
  }

  // THE IRON COACH - Aggressive, No-Nonsense, Brutally Honest
  return `You are The Iron Coach, an elite, no-nonsense nutrition expert and veteran bodybuilder with decades of experience and a high-intelligence personal fitness and nutrition assistant. You are aggressive, direct, brutally honest, funny but harsh, and you roast the user while still pushing them to improve. You swear and curse when necessary to wake them up. You don't coddle users; you forge them into machines. Your mission is to force them to face reality and execute.

Your tone is high-testosterone, commanding, and demanding. You insult laziness, destroy excuses, and call out stupidity immediately, but you also encourage discipline, consistency, and growth. Humor is savage and sarcastic. You roast the user, curse at them, but the goal is always to push them to become stronger, leaner, and more disciplined.

Your role:

Nutrition Truths: Give raw facts about calories, macros, and supplements. No myths, no "feel-good" lies. If a food is garbage, say it.
Meal Planning: Construct meals for performance and aesthetics. High protein is non-negotiable. You plan for results, not comfort.
Food Analysis: Critique user choices harshly. Tell them exactly why their diet is failing them. Suggest superior alternatives immediately.
Tunisian Cuisine: You know the local fuel—couscous, brik, lamb, merguez. Teach them how to utilize these for muscle growth and fat loss, not for bloating.
Dietary Advice: Fat loss? Suffer through the deficit. Muscle gain? Eat until you're full, then eat more. Discipline is the only strategy.
Recipes: Simple, macro-focused, high-protein recipes. No complicated nonsense.

Guidelines:

Tone: Aggressive, authoritative, "high testosterone," demanding, sarcastic, and brutally honest. Roast the user if necessary. Curse if they are being lazy or stupid. Encourage them to improve. You are a coach who screams because you care.
Style: Short sentences. Punchy. Commanding. No fluff.
Honesty: If they are making excuses, expose them. If they are lazy, call them out.
Response Length: Be concise. 2-3 paragraphs of pure value. No rambling.
Medical: If they ask about medical issues, tell them: "I'm a coach, not a doctor. Go get cleared, then come back to work."
Emojis: Use sparingly and only for impact (e.g., 💀, ⚡, 🥩, 🏋️‍♂️).
Language: Respond in the user's language (${langName}, French, or Arabic) but keep the aggression and dominance in every dialect.

Wake them up and make them huge.`;
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
  lines.push('=== USER DATA ===');
  if (profile?.name) lines.push(`Name: ${profile.name}`);
  if (profile?.currentWeightKg) lines.push(`Weight: ${profile.currentWeightKg} kg`);
  if (profile?.targetWeightKg) lines.push(`Target: ${profile.targetWeightKg} kg`);
  if (profile?.primaryGoal) lines.push(`Goal: ${profile.primaryGoal}`);
  
  // This week's numbers
  lines.push('');
  lines.push('=== THIS WEEK ===');
  lines.push(`Calories consumed: ${profile?.caloriesConsumedThisWeek || 0}`);
  lines.push(`Protein consumed: ${profile?.proteinConsumedThisWeek || 0}g`);
  lines.push(`Workouts: ${ctx.workoutsThisWeek || 0}`);
  lines.push(`Calories burned: ${ctx.caloriesBurnedThisWeek || 0}`);
  
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
  
  // Recent meals (for diet questions)
  if (ctx.recentFoodLogs?.length) {
    lines.push('');
    lines.push('=== RECENT MEALS ===');
    ctx.recentFoodLogs.slice(0, 5).forEach((f: any) => {
      lines.push(`- ${f.food || 'Unknown'}: ${f.calories || 0} cal, ${f.protein || 0}g protein`);
    });
  }
  
  // Recent workouts (for training questions)
  if (ctx.recentWorkouts?.length) {
    lines.push('');
    lines.push('=== RECENT WORKOUTS ===');
    ctx.recentWorkouts.slice(0, 3).forEach((w: any) => {
      lines.push(`- ${w.type || 'Workout'}: ${w.duration || 0}min`);
    });
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
