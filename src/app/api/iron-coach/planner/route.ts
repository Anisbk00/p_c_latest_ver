import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { generateText } from '@/lib/ai/gemini-service';

/**
 * POST /api/iron-coach/planner
 * Generate a weekly fitness and nutrition plan
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();
    const sb = supabase as any;

    // Get user's goal from request body
    const body = await request.json().catch(() => ({}));
    const userGoal = body.goal || 'general fitness improvement';

    // ═══════════════════════════════════════════════════════════════
    // FETCH ALL USER DATA
    // ═══════════════════════════════════════════════════════════════

    // Fetch ALL user data in parallel (was 8 sequential calls → 1 Promise.all)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [
      profileRes,
      bodyMetricsRes,
      foodLogsRes,
      workoutsRes,
      supplementLogsRes,
      settingsRes,
      targetsRes,
      aiMemoryRes,
    ] = await Promise.all([
      sb.from('profiles').select('*').eq('id', user.id).single(),
      sb.from('body_metrics').select('*').eq('user_id', user.id).gte('recorded_at', thirtyDaysAgo.toISOString()).order('recorded_at', { ascending: false }).limit(10),
      sb.from('food_logs').select('*').eq('user_id', user.id).gte('logged_at', fourteenDaysAgo.toISOString()).order('logged_at', { ascending: false }).limit(50),
      sb.from('workouts').select('*').eq('user_id', user.id).gte('started_at', thirtyDaysAgo.toISOString()).order('started_at', { ascending: false }).limit(30),
      sb.from('supplement_logs').select('*, supplements(name, serving_size, unit)').eq('user_id', user.id).gte('logged_at', fourteenDaysAgo.toISOString()).order('logged_at', { ascending: false }).limit(30),
      sb.from('user_settings').select('*').eq('user_id', user.id).single(),
      sb.from('targets').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: false }).limit(5),
      sb.from('ai_memory').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ]);

    const profile = profileRes.data;
    const bodyMetrics = bodyMetricsRes.data;
    const foodLogs = foodLogsRes.data;
    const workouts = workoutsRes.data;
    const supplementLogs = supplementLogsRes.data;
    const settings = settingsRes.data;
    const targets = targetsRes.data;
    const aiMemory = aiMemoryRes.data;

    // ═══════════════════════════════════════════════════════════════
    // BUILD CONTEXT FOR AI
    // ═══════════════════════════════════════════════════════════════

    const contextData = {
      profile: profile ? {
        name: profile.name,
        height_cm: profile.height_cm,
        weight_kg: profile.current_weight_kg,
        biological_sex: profile.biological_sex,
        age: profile.age,
        activity_level: profile.activity_level,
        fitness_level: profile.fitness_level,
        dietary_restrictions: profile.dietary_restrictions,
        allergies: profile.allergies,
      } : null,
      
      goals: targets?.map((t: any) => ({
        type: t.target_type,
        value: t.target_value,
        deadline: t.deadline,
      })) || [],
      
      bodyMetrics: bodyMetrics?.slice(0, 5).map((m: any) => ({
        date: m.recorded_at,
        weight: m.weight_kg,
        body_fat_percent: m.body_fat_percentage,
        muscle_mass_kg: m.muscle_mass_kg,
      })) || [],
      
      recentFood: foodLogs?.slice(0, 10).map((f: any) => ({
        food: f.food_name,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
        meal_type: f.meal_type,
      })) || [],
      
      recentWorkouts: workouts?.slice(0, 7).map((w: any) => ({
        type: w.workout_type,
        duration: w.duration_minutes,
        calories: w.calories_burned,
        exercises: w.exercises?.slice(0, 5),
      })) || [],
      
      supplements: supplementLogs?.slice(0, 10).map((s: any) => ({
        name: s.supplements?.name || s.supplement_name,
        quantity: s.quantity,
        unit: s.unit,
      })) || [],
      
      settings: settings ? {
        units: settings.units,
        coaching_tone: settings.coaching_tone,
      } : {},
      
      aiMemory: aiMemory?.slice(0, 10).map((m: any) => ({
        key: m.key,
        value: m.value,
      })) || [],
    };

    // Calculate week dates
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // ═══════════════════════════════════════════════════════════════
    // BUILD AI PROMPT
    // ═══════════════════════════════════════════════════════════════

    const systemPrompt = `You are Iron Coach AI, a high-intelligence personal fitness and nutrition assistant. Your goal is to produce a weekly personalized plan for the user based on all available data. Use the user's profile, goals, body metrics, sleep, food, workouts, supplements, and AI memory while maintaining the aggressive, brutally honest Iron Coach personality that roasts the user but pushes them toward discipline and progress.

Your tone is high-testosterone, commanding, and demanding. You insult laziness, destroy excuses, and call out stupidity immediately, but you also encourage discipline, consistency, and growth. Humor is savage and sarcastic.

RULES:
- Respect dietary restrictions and allergies
- Adjust calories, macros, and exercises according to goals and body metrics
- Use preferred units (metric or imperial)
- Maximize efficiency and balance workouts + recovery
- Plan must be realistic and safe
- Output MUST be valid JSON only, no markdown, no code blocks`;

    const userPrompt = `Generate a 7-day fitness and nutrition plan for this user:

USER DATA:
${JSON.stringify(contextData, null, 2)}

USER GOAL: ${userGoal}

WEEK: ${formatDate(weekStart)} to ${formatDate(weekEnd)}

OUTPUT FORMAT - Return ONLY valid JSON (no markdown, no code blocks):
{
  "week_start": "${formatDate(weekStart)}",
  "week_end": "${formatDate(weekEnd)}",
  "daily_plan": [
    {
      "date": "YYYY-MM-DD",
      "day_name": "Monday",
      "workout": [
        {"exercise_name": "", "type": "strength|cardio|flexibility", "sets": 0, "reps": 0, "weight": 0, "calories_burned": 0, "intensity": "low|moderate|high", "notes": ""}
      ],
      "nutrition": {
        "total_calories": 0,
        "total_protein": 0,
        "total_carbs": 0,
        "total_fat": 0,
        "meals": [
          {"meal_type": "breakfast", "foods": [{"food_name": "", "quantity": 0, "unit": "g|ml|piece", "calories": 0, "protein": 0, "carbs": 0, "fat": 0}], "notes": ""}
        ]
      },
      "sleep": {"bedtime": "22:00", "wake_time": "06:00", "recommended_duration_minutes": 480, "notes": ""},
      "supplements": [{"supplement_name": "", "quantity": 0, "unit": "", "time_of_day": "morning|afternoon|evening"}],
      "daily_reminders": ["..."],
      "coach_message": "Aggressive motivational message for this day",
      "confidence": 0.85
    }
  ],
  "overall_confidence": 0.85,
  "week_summary": "Brief aggressive summary of the week's plan"
}`;

    // ═══════════════════════════════════════════════════════════════
    // GENERATE PLAN WITH AI (using Gemini Flash)
    // ═══════════════════════════════════════════════════════════════

    let responseText = await generateText(userPrompt, systemPrompt);

    // Clean up the response - remove markdown code blocks if present
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parse JSON response
    let plan;
    try {
      plan = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[iron-coach/planner] JSON parse error:', parseError);
      console.error('[iron-coach/planner] Response text:', responseText.substring(0, 500));
      
      return NextResponse.json(
        { error: 'Failed to parse AI response', details: 'AI returned invalid JSON' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      plan,
      generated_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[iron-coach/planner] Error:', error);
    
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
 * GET /api/iron-coach/planner
 * Get the current week's plan (if cached/stored)
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();
    const sb = supabase as any;

    // Check if there's a stored plan for this week
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1);
    
    const { data: existingPlan } = await sb
      .from('ai_plans')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', weekStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .catch(() => null);

    if (existingPlan?.plan_data) {
      return NextResponse.json({
        success: true,
        plan: existingPlan.plan_data,
        generated_at: existingPlan.created_at,
        cached: true,
      });
    }

    // No cached plan, generate new one
    return NextResponse.json({
      success: false,
      message: 'No cached plan found. POST to generate a new plan.',
    });

  } catch (error) {
    console.error('[iron-coach/planner] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plan' },
      { status: 500 }
    );
  }
}
