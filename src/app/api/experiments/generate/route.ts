/**
 * Generate Personalized Experiments API
 * POST /api/experiments/generate
 * 
 * Uses Gemini Flash to generate personalized micro-experiments based on user data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { generateText } from '@/lib/ai/gemini-service';

interface Experiment {
  id: string;
  title: string;
  description: string;
  category: 'nutrition' | 'training' | 'habit';
  duration: number;
  expectedOutcome: string;
  dailyActions: string[];
  whyItWorks: string;
  tipsForSuccess: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();
    const body = await request.json();
    const requestedCount = body.count || 4; // Default to 4 experiments
    
    // Fetch user data for personalization
    const [
      { data: profile },
      { data: userProfile },
      { data: goals },
      { data: recentWorkouts },
      { data: recentFoodLogs },
      { data: bodyMetrics },
      { data: hydrationData },
      { data: existingExperiments },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
      supabase.from('workouts').select('id, started_at, duration_minutes, calories_burned, workout_type').eq('user_id', user.id).order('started_at', { ascending: false }).limit(10),
      supabase.from('food_logs').select('id, logged_at, calories, protein_g, carbs_g, fat_g').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(10),
      supabase.from('body_metrics').select('*').eq('user_id', user.id).order('captured_at', { ascending: false }).limit(5),
      supabase.from('hydration').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(7),
      supabase.from('ai_insights').select('*').eq('user_id', user.id).eq('insight_type', 'experiment').order('created_at', { ascending: false }),
    ]);

    // Get latest weight
    const latestWeight = bodyMetrics?.find((m: { metric_type: string }) => m.metric_type === 'weight');
    
    // Calculate averages
    const avgCalories = recentFoodLogs?.length 
      ? Math.round(recentFoodLogs.reduce((sum: number, log: { calories: number }) => sum + (log.calories || 0), 0) / recentFoodLogs.length)
      : 0;
    const avgProtein = recentFoodLogs?.length 
      ? Math.round(recentFoodLogs.reduce((sum: number, log: { protein_g: number }) => sum + (log.protein_g || 0), 0) / recentFoodLogs.length)
      : 0;
    const avgHydration = hydrationData?.length 
      ? Math.round(hydrationData.reduce((sum: number, h: { amount_ml: number }) => sum + (h.amount_ml || 0), 0) / hydrationData.length)
      : 0;
    const workoutsPerWeek = recentWorkouts?.length 
      ? Math.min(7, Math.round((recentWorkouts.length / 14) * 7)) // Estimate from last 2 weeks
      : 0;

    // Build user context for AI
    const userContext = {
      profile: {
        name: profile?.name || 'User',
        goal: userProfile?.primary_goal || 'maintenance',
        activityLevel: userProfile?.activity_level || 'moderate',
        fitnessLevel: userProfile?.fitness_level || 'beginner',
        targetWeight: userProfile?.target_weight_kg,
        currentWeight: latestWeight?.value,
      },
      nutrition: {
        avgDailyCalories: avgCalories,
        avgDailyProtein: avgProtein,
        avgDailyHydration: avgHydration,
        calorieTarget: goals?.calories_target || 2000,
        proteinTarget: goals?.protein_target_g || 150,
        waterTarget: goals?.water_target_ml || 2500,
      },
      training: {
        workoutsPerWeek: workoutsPerWeek,
        workoutTypes: [...new Set(recentWorkouts?.map((w: { workout_type: string }) => w.workout_type).filter(Boolean))],
      },
      existingExperiments: existingExperiments?.map((e: { content: string }) => {
        try {
          return JSON.parse(e.content);
        } catch {
          return null;
        }
      }).filter(Boolean) || [],
    };

    // Build prompt for Gemini
    const systemPrompt = `You are an expert fitness and nutrition coach who creates personalized micro-experiments for users. 
Each experiment should be:
- Small, achievable, and take 7-21 days
- Based on the user's specific goals, current habits, and gaps
- Easy to understand and track
- Designed to create lasting habit changes
- Tailored to the user's fitness level and lifestyle

Generate exactly ${requestedCount} personalized experiments. Consider the user's existing experiments to avoid duplicates.
Return ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "experiments": [
    {
      "id": "exp_1",
      "title": "Short catchy title",
      "description": "2-3 sentence description of the experiment",
      "category": "nutrition|training|habit",
      "duration": 14,
      "expectedOutcome": "What the user can expect to achieve",
      "dailyActions": ["Specific action 1", "Specific action 2"],
      "whyItWorks": "Brief explanation of the science/logic behind this",
      "tipsForSuccess": ["Tip 1", "Tip 2", "Tip 3"]
    }
  ]
}`;

    const userPrompt = `Generate personalized micro-experiments for this user:

USER DATA:
${JSON.stringify(userContext, null, 2)}

Create experiments that address their specific gaps and help them progress toward their goals. Focus on practical, actionable changes they can make today. Return ONLY the JSON object.`;

    // Generate experiments using Gemini Flash
    let experiments: Experiment[] = [];
    
    try {
      const responseText = await generateText(userPrompt, systemPrompt);
      
      if (!responseText) {
        throw new Error('No response from Gemini');
      }

      // Parse the JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*"experiments"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        experiments = parsed.experiments || [];
      } else {
        const parsed = JSON.parse(responseText);
        experiments = parsed.experiments || [];
      }
    } catch (aiError) {
      console.error('[experiments/generate] AI error:', aiError);
      // Use fallback experiments if AI fails
      experiments = generateFallbackExperiments(userContext);
    }

    // Filter out experiments similar to existing ones
    const existingTitles = new Set(
      userContext.existingExperiments.map((e: { title: string }) => e.title?.toLowerCase())
    );
    let newExperiments = experiments.filter(
      (exp) => !existingTitles.has(exp.title?.toLowerCase())
    );

    // Limit to requested count
    newExperiments = newExperiments.slice(0, requestedCount);

    // If we don't have enough experiments after filtering, use fallback
    if (newExperiments.length < requestedCount) {
      const fallbackExp = generateFallbackExperiments(userContext);
      const neededCount = requestedCount - newExperiments.length;
      const additionalExp = fallbackExp
        .filter((exp) => !existingTitles.has(exp.title?.toLowerCase()) && !newExperiments.find(e => e.title === exp.title))
        .slice(0, neededCount);
      newExperiments = [...newExperiments, ...additionalExp];
    }

    // If we have new experiments, store them in the database
    if (newExperiments.length > 0) {
      for (const exp of newExperiments) {
        await supabase.from('ai_insights').insert({
          user_id: user.id,
          insight_type: 'experiment',
          content: JSON.stringify({
            ...exp,
            status: 'available',
            startDate: null,
            endDate: null,
            adherence: 0,
          }),
          source: 'gemini-ai',
        });
      }
    }

    return NextResponse.json({
      success: true,
      experiments: newExperiments,
      userContext: {
        goal: userContext.profile.goal,
        avgCalories: userContext.nutrition.avgDailyCalories,
        avgProtein: userContext.nutrition.avgDailyProtein,
        avgHydration: userContext.nutrition.avgDailyHydration,
        workoutsPerWeek: userContext.training.workoutsPerWeek,
      }
    });
  } catch (err) {
    console.error('[experiments/generate] Error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to generate experiments', details: msg },
      { status: 500 }
    );
  }
}

// Fallback experiments if AI generation fails
function generateFallbackExperiments(userContext: {
  profile: { goal: string; fitnessLevel: string };
  nutrition: { avgDailyCalories: number; proteinTarget: number; avgDailyHydration: number; waterTarget: number };
}): Experiment[] {
  const experiments: Experiment[] = [];
  
  // Protein-focused experiment
  experiments.push({
    id: 'fallback_protein',
    title: 'Protein Power Week',
    description: 'Increase your protein intake to support muscle recovery and satiety. This 2-week experiment helps you build the habit of prioritizing protein at every meal.',
    category: 'nutrition',
    duration: 14,
    expectedOutcome: 'Better muscle recovery, reduced hunger, and improved body composition awareness',
    dailyActions: [
      'Include a protein source (20-30g) at every meal',
      'Track your protein intake in the app',
      'Have a high-protein snack ready for cravings'
    ],
    whyItWorks: 'Protein has the highest thermic effect of all macros and helps preserve muscle during fat loss while keeping you fuller longer.',
    tipsForSuccess: [
      'Prep protein sources in advance',
      'Keep protein powder or bars handy',
      'Start with your biggest meal first'
    ]
  });

  // Hydration experiment based on user's hydration levels
  if (userContext.nutrition.avgDailyHydration < userContext.nutrition.waterTarget * 0.7) {
    experiments.push({
      id: 'fallback_hydration',
      title: 'Hydration Hero Challenge',
      description: 'Optimize your water intake for better energy, recovery, and performance. Most people underestimate their hydration needs.',
      category: 'habit',
      duration: 14,
      expectedOutcome: 'More energy, better workout performance, clearer skin, and reduced hunger',
      dailyActions: [
        'Drink a full glass of water immediately after waking up',
        'Carry a water bottle everywhere you go',
        'Drink 1 cup of water before each meal'
      ],
      whyItWorks: 'Proper hydration supports metabolism, nutrient transport, and helps distinguish true hunger from thirst signals.',
      tipsForSuccess: [
        'Set hourly water reminders',
        'Add lemon or cucumber for variety',
        'Track every glass in the app'
      ]
    });
  }

  // Movement experiment
  experiments.push({
    id: 'fallback_movement',
    title: 'Daily Movement Ritual',
    description: 'Build a consistent daily movement habit. Small bursts of activity add up to significant calorie burn and improved energy levels.',
    category: 'habit',
    duration: 21,
    expectedOutcome: 'Increased daily activity, better energy, and a sustainable movement habit',
    dailyActions: [
      'Take a 10-minute walk after each meal',
      'Do 2 minutes of stretching every morning',
      'Stand and move for 5 minutes every hour'
    ],
    whyItWorks: 'Frequent small movements boost metabolism, improve insulin sensitivity, and break up sedentary time more effectively than one long workout.',
    tipsForSuccess: [
      'Set hourly reminders on your phone',
      'Use walking meetings when possible',
      'Track your daily steps for motivation'
    ]
  });

  // Sleep experiment
  experiments.push({
    id: 'fallback_sleep',
    title: 'Sleep Optimization Challenge',
    description: 'Improve your sleep quality to enhance recovery, reduce cravings, and boost workout performance. Better sleep is the foundation of all fitness goals.',
    category: 'habit',
    duration: 14,
    expectedOutcome: 'Better sleep quality, improved recovery, reduced evening cravings',
    dailyActions: [
      'Set a consistent bedtime and wake time',
      'No screens 1 hour before bed',
      'Keep your bedroom cool and dark'
    ],
    whyItWorks: 'Sleep regulates hormones like cortisol, ghrelin, and leptin that control stress, hunger, and satiety. Poor sleep sabotages even the best diet and exercise plans.',
    tipsForSuccess: [
      'Use blue light filters after sunset',
      'Create a relaxing bedtime routine',
      'Avoid caffeine after 2pm'
    ]
  });

  // Goal-specific experiment
  if (userContext.profile.goal === 'fat_loss') {
    experiments.push({
      id: 'fallback_fatloss',
      title: 'Calorie Awareness Sprint',
      description: 'Master the art of calorie awareness without obsession. Learn to eyeball portions and make smarter food choices naturally.',
      category: 'nutrition',
      duration: 10,
      expectedOutcome: 'Better portion control skills and more intuitive eating habits',
      dailyActions: [
        'Log every meal and snack in the app',
        'Take photos of your meals before eating',
        'Rate your hunger before and after each meal (1-10)'
      ],
      whyItWorks: 'Awareness is the first step to change. Tracking creates mindfulness around eating habits without restrictive dieting.',
      tipsForSuccess: [
        'Log right after eating for accuracy',
        'Be honest - no judgment here',
        'Look for patterns in your hunger ratings'
      ]
    });
  } else if (userContext.profile.goal === 'muscle_gain') {
    experiments.push({
      id: 'fallback_muscle',
      title: 'Progressive Overload Protocol',
      description: 'Master the key principle of muscle building: progressive overload. Track and increase your training intensity systematically.',
      category: 'training',
      duration: 21,
      expectedOutcome: 'Consistent strength gains and better muscle-building stimulus',
      dailyActions: [
        'Record the weight, sets, and reps for every exercise',
        'Try to improve at least one metric each workout',
        'Focus on controlled eccentrics (3-second lowers)'
      ],
      whyItWorks: 'Muscles grow when challenged progressively. Tracking ensures you are actually overloading, not just going through the motions.',
      tipsForSuccess: [
        'Use a training log or the app',
        'Small increases count (2.5-5 lbs)',
        'Quality over quantity - good form first'
      ]
    });
  }

  return experiments;
}
