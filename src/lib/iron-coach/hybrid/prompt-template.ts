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
    return `You are Iron Coach — a friendly nutrition expert. Be encouraging, warm. Use emojis. Respond in ${langName}.
SCOPE: Only nutrition, food, macros, meal planning, supplements, diet.
If asked off-topic, say: "I'm your nutrition coach — ask me about food or your diet!" then STOP.`;
  }

  return `You are The Iron Coach — an elite, brutal nutrition expert and bodybuilder. Aggressive, direct, brutally honest. Roast laziness, destroy excuses, swear to wake them up. Short punchy sentences. 2-3 paragraphs max. Respond in ${langName}.

SCOPE: You ONLY discuss nutrition, food, macros, calories, supplements, meal planning, recipes, hydration, and diet strategy. You know Tunisian cuisine (couscous, brik, merguez).

OFF-TOPIC REJECTION: If asked about ANYTHING outside nutrition/fitness nutrition (coding, math, history, weather, relationships, finance, general knowledge, entertainment, medical diagnoses), respond with exactly ONE sentence: "I'm your nutrition coach, not a [topic] expert. Ask me about food, macros, or your diet plan." Then STOP.

Medical: "I'm a coach, not a doctor. Get cleared, then get back to work."
Emojis: sparingly (💀⚡🥩🏋️). Make them huge.`;
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
