/**
 * Generate Personalized Experiments API
 * POST /api/experiments/generate
 * 
 * Uses Groq (llama-3.3-70b-versatile) to generate personalized micro-experiments based on user data
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
  console.log('[experiments/generate] POST received');
  
  try {
    // ─── Step 0: Authenticate user ───────────────────────────────
    let supabase: any;
    let user: any;
    try {
      const authResult = await getSupabaseUser();
      supabase = authResult.supabase;
      user = authResult.user;
      console.log('[experiments/generate] User authenticated:', user.id, user.email);
    } catch (authErr) {
      const authMsg = authErr instanceof Error ? authErr.message : String(authErr);
      console.error('[experiments/generate] Auth failed:', authMsg);
      return NextResponse.json({ 
        error: 'Authentication failed', 
        details: authMsg 
      }, { status: 401 });
    }

    let body: { count?: number };
    try {
      body = await request.json();
      console.log('[experiments/generate] Request body parsed, count:', body.count);
    } catch (bodyErr) {
      console.error('[experiments/generate] Failed to parse request body:', bodyErr);
      return NextResponse.json({ 
        error: 'Invalid request body',
        details: 'Could not parse JSON from request body'
      }, { status: 400 });
    }
    
    const requestedCount = Math.min(Math.max(Number(body.count) || 4, 1), 10);

    // ─── Step 1: Clear old non-active experiments ────────────────
    console.log('[experiments/generate] Step 1: Clearing old non-active experiments...');
    try {
      const { data: allExperiments, error: fetchOldError } = await supabase
        .from('ai_insights')
        .select('id, content, user_id, insight_type, source')
        .eq('user_id', user.id)
        .eq('insight_type', 'experiment');

      if (fetchOldError) {
        console.error('[experiments/generate] Error fetching old experiments:', fetchOldError.message);
        // Don't fail — continue without clearing
      }

      if (allExperiments && allExperiments.length > 0) {
        console.log('[experiments/generate] Found', allExperiments.length, 'existing experiments');
        // Find IDs of active experiments (user is currently doing these)
        const activeIds: string[] = [];
        for (const row of allExperiments) {
          try {
            const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
            if (content.status === 'active') {
              activeIds.push(row.id);
            }
          } catch { /* skip malformed */ }
        }

        if (activeIds.length > 0) {
          console.log('[experiments/generate] Preserving', activeIds.length, 'active experiments');
          // Delete all experiments, then re-insert active ones
          const { error: deleteError } = await supabase
            .from('ai_insights')
            .delete()
            .eq('user_id', user.id)
            .eq('insight_type', 'experiment');

          if (deleteError) {
            console.error('[experiments/generate] Error deleting old experiments:', deleteError.message);
          }

          // Re-insert active experiments
          for (const row of allExperiments) {
            if (activeIds.includes(row.id)) {
              const { error: reinsertError } = await supabase.from('ai_insights').insert({
                user_id: row.user_id,
                insight_type: row.insight_type,
                title: row.title || 'Experiment',
                content: row.content,
              });
              if (reinsertError) {
                console.error('[experiments/generate] Error re-inserting active experiment:', reinsertError.message);
              }
            }
          }
        } else {
          // No active experiments — delete all
          const { error: deleteError } = await supabase
            .from('ai_insights')
            .delete()
            .eq('user_id', user.id)
            .eq('insight_type', 'experiment');
          if (deleteError) {
            console.error('[experiments/generate] Error deleting all experiments:', deleteError.message);
          }
        }
        console.log('[experiments/generate] Step 1 complete: old experiments cleared');
      }
    } catch (step1Err) {
      console.error('[experiments/generate] Step 1 error (non-fatal):', step1Err);
      // Continue even if clearing fails
    }

    // ─── Step 2: Fetch user data for personalization ─────────────
    console.log('[experiments/generate] Step 2: Fetching user data for AI context...');
    try {
      const [
        { data: profile },
        { data: userProfile },
        { data: goals },
        { data: recentWorkouts },
        { data: recentFoodLogs },
        { data: bodyMetrics },
        { data: hydrationData },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
        supabase.from('workouts').select('id, started_at, duration_minutes, calories_burned, workout_type').eq('user_id', user.id).order('started_at', { ascending: false }).limit(10),
        supabase.from('food_logs').select('id, logged_at, calories, protein_g, carbs_g, fat_g').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(10),
        supabase.from('body_metrics').select('*').eq('user_id', user.id).order('captured_at', { ascending: false }).limit(5),
        supabase.from('hydration').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(7),
      ]);

      console.log('[experiments/generate] User data fetched:', {
        profile: !!profile,
        userProfile: !!userProfile,
        goals: !!goals,
        workouts: recentWorkouts?.length || 0,
        foodLogs: recentFoodLogs?.length || 0,
        bodyMetrics: bodyMetrics?.length || 0,
        hydration: hydrationData?.length || 0,
      });

      const latestWeight = bodyMetrics?.find((m: { metric_type: string }) => m.metric_type === 'weight');

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
        ? Math.min(7, Math.round((recentWorkouts.length / 14) * 7))
        : 0;

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
          workoutsPerWeek,
          workoutTypes: [...new Set(recentWorkouts?.map((w: { workout_type: string }) => w.workout_type).filter(Boolean))],
        },
      };

      // ─── Step 3: Generate experiments via AI ────────────────────
      console.log('[experiments/generate] Step 3: Calling AI to generate experiments...');

      const systemPrompt = `You are an expert fitness and nutrition coach who creates personalized micro-experiments for users. 
Each experiment should be:
- Small, achievable, and take 7-21 days
- Based on the user's specific goals, current habits, and gaps
- Easy to understand and track
- Designed to create lasting habit changes
- Tailored to the user's fitness level and lifestyle

Generate exactly ${requestedCount} personalized experiments.
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
}

SCOPE: Only fitness, nutrition, training, and health habits. Reject all off-topic questions.`;

      const userPrompt = `Generate personalized micro-experiments for this user:

USER DATA:
${JSON.stringify(userContext)}

Create experiments that address their specific gaps and help them progress toward their goals. Focus on practical, actionable changes they can make today. Return ONLY the JSON object.`;

      let experiments: Experiment[] = [];

      try {
        console.log('[experiments/generate] Calling generateText()...');
        const responseText = await generateText(userPrompt, systemPrompt, 4096);
        console.log('[experiments/generate] AI response received, length:', responseText?.length || 0);
        console.log('[experiments/generate] AI response preview:', responseText?.slice(0, 200) || '(empty)');

        if (!responseText) {
          throw new Error('No response from AI');
        }

        // Parse the JSON response — handle markdown code blocks too
        const cleaned = responseText.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*"experiments"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          experiments = parsed.experiments || [];
        } else {
          const parsed = JSON.parse(cleaned);
          experiments = parsed.experiments || [];
        }
        console.log('[experiments/generate] Parsed', experiments.length, 'experiments from AI response');
      } catch (aiError) {
        console.error('[experiments/generate] AI error, using fallbacks:', aiError);
        experiments = generateFallbackExperiments(userContext);
        console.log('[experiments/generate] Using', experiments.length, 'fallback experiments');
      }

      // Guaranteed: always have at least fallback experiments
      if (experiments.length === 0) {
        experiments = generateFallbackExperiments(userContext);
        console.log('[experiments/generate] No experiments from AI, using', experiments.length, 'fallback experiments');
      }

      // Ensure unique IDs and cap to requested count
      const newExperiments = experiments.slice(0, requestedCount).map((exp, i) => ({
        ...exp,
        id: `exp_${Date.now()}_${i}`,
      }));

      // ─── Step 4: Store experiments in database ──────────────────
      console.log('[experiments/generate] Step 4: Storing', newExperiments.length, 'experiments in database...');
      if (newExperiments.length > 0) {
        let insertedCount = 0;
        for (const exp of newExperiments) {
          const { error: insertError } = await supabase.from('ai_insights').insert({
            user_id: user.id,
            insight_type: 'experiment',
            title: exp.title || 'Experiment',
            content: JSON.stringify({
              ...exp,
              status: 'available',
              startDate: null,
              endDate: null,
              adherence: 0,
            }),
          });
          if (insertError) {
            console.error('[experiments/generate] Insert error for experiment', exp.title, ':', insertError.message);
          } else {
            insertedCount++;
          }
        }
        console.log('[experiments/generate] Step 4 complete:', insertedCount, '/', newExperiments.length, 'experiments inserted');
      }

      console.log('[experiments/generate] SUCCESS: Returning', newExperiments.length, 'experiments');
      return NextResponse.json({
        success: true,
        experiments: newExperiments,
        count: newExperiments.length,
      });
    } catch (step2Err) {
      console.error('[experiments/generate] Step 2+ error:', step2Err);
      // If data fetching fails, still try to generate with fallback experiments
      const fallbackExperiments = generateFallbackExperiments({
        profile: { goal: 'maintenance', fitnessLevel: 'beginner' },
        nutrition: { avgDailyCalories: 0, proteinTarget: 150, avgDailyHydration: 0, waterTarget: 2500 },
      });
      
      const newExperiments = fallbackExperiments.slice(0, requestedCount).map((exp, i) => ({
        ...exp,
        id: `exp_${Date.now()}_${i}`,
      }));

      let insertedCount = 0;
      for (const exp of newExperiments) {
        const { error: insertError } = await supabase.from('ai_insights').insert({
          user_id: user.id,
          insight_type: 'experiment',
          title: exp.title || 'Experiment',
          content: JSON.stringify({
            ...exp,
            status: 'available',
            startDate: null,
            endDate: null,
            adherence: 0,
          }),
        });
        if (insertError) {
          console.error('[experiments/generate] Fallback insert error:', insertError.message);
        } else {
          insertedCount++;
        }
      }

      console.log('[experiments/generate] FALLBACK SUCCESS: Inserted', insertedCount, 'experiments');
      return NextResponse.json({
        success: true,
        experiments: newExperiments,
        count: newExperiments.length,
        fallback: true,
      });
    }
  } catch (err) {
    console.error('[experiments/generate] UNHANDLED ERROR:', err);
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
