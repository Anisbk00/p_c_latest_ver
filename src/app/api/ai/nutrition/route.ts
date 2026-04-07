/**
 * AI Adaptive Nutrition API
 * 
 * GET /api/ai/nutrition - Get nutrition insights and meal suggestions
 * POST /api/ai/nutrition - Generate meal recommendation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiErrorResponse } from '@/lib/api-security';
import {
  generateMealRecommendation,
  type SupportedLocale,
} from '@/lib/ai/comprehensive-ai-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const locale = (searchParams.get('locale') || 'en') as SupportedLocale;
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Timezone-aware date range — use the user's preferred timezone or UTC
    // Without timezone info, use UTC midnight to midnight+24h to avoid missing entries
    // This ensures all entries for a given calendar date (in their stored timestamp) are captured
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    // Get user's nutrition data
    const [settingsResult, foodLogs, targetsResult] = await Promise.all([
      supabase.from('user_settings').select('preferred_language, language').eq('user_id', user.id).single(),
      supabase.from('food_logs')
        .select('id, food_name, calories, protein, carbs, fat, meal_type, logged_at')
        .eq('user_id', user.id)
        .gte('logged_at', startOfDay)
        .lte('logged_at', endOfDay)
        .order('logged_at', { ascending: true }),
      supabase.from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const userLocale = (settingsResult.data?.preferred_language || settingsResult.data?.language || locale) as SupportedLocale;

    // Calculate daily totals
    const logs = foodLogs.data || [];
    const totals = logs.reduce((acc: any, log: any) => ({
      calories: acc.calories + (log.calories || 0),
      protein: acc.protein + (log.protein || 0),
      carbs: acc.carbs + (log.carbs || 0),
      fat: acc.fat + (log.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    // Get targets from goals
    const targets = {
      calories: (targetsResult.data as any)?.calories_target || 2200,
      protein: (targetsResult.data as any)?.protein_target_g || 150,
      carbs: (targetsResult.data as any)?.carbs_target_g || 250,
      fat: (targetsResult.data as any)?.fat_target_g || 70,
    };

    // Calculate adherence
    const adherence = {
      calories: Math.min(100, Math.round((totals.calories / targets.calories) * 100)),
      protein: Math.min(100, Math.round((totals.protein / targets.protein) * 100)),
      carbs: Math.min(100, Math.round((totals.carbs / targets.carbs) * 100)),
      fat: Math.min(100, Math.round((totals.fat / targets.fat) * 100)),
    };

    return NextResponse.json({
      date,
      locale: userLocale,
      current: totals,
      targets,
      adherence,
      logs: logs.map((log: any) => ({
        id: log.id,
        foodName: log.food_name,
        calories: log.calories,
        protein: log.protein,
        carbs: log.carbs,
        fat: log.fat,
        mealType: log.meal_type,
        loggedAt: log.logged_at,
      })),
      translations: {
        en: {
          calories: 'Calories',
          protein: 'Protein',
          carbs: 'Carbs',
          fat: 'Fat',
        },
        fr: {
          calories: 'Calories',
          protein: 'Protéines',
          carbs: 'Glucides',
          fat: 'Lipides',
        },
        ar: {
          calories: 'سعرات حرارية',
          protein: 'بروتين',
          carbs: 'كربوهيدرات',
          fat: 'دهون',
        },
      },
    });
  } catch (error) {
    // P1 FIX: Sanitize error message to prevent internal data leakage
    return aiErrorResponse(error, 'get nutrition data');
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    // Strict Zod validation
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { AiNutritionRequestSchema } = await import('@/lib/validation')
    const parseResult = AiNutritionRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      }, { status: 400 })
    }
    body = parseResult.data
    // Extra: sanitize all strings (trim)
    for (const k of Object.keys(body)) {
      if (typeof body[k] === 'string') body[k] = body[k].trim()
    }
    const { locale = 'en', mealType = 'lunch' } = body;

    // Get user's preferred language
    const { data: settings } = await supabase
      .from('user_settings')
      .select('preferred_language, language')
      .eq('user_id', user.id)
      .single();

    const userLocale = (settings?.preferred_language || settings?.language || locale) as SupportedLocale;

    // Generate meal recommendation
    const recommendation = await generateMealRecommendation(user.id, mealType, userLocale);

    return NextResponse.json({
      success: true,
      meal: {
        id: `meal-${Date.now()}`,
        ...recommendation.related_data,
        title: recommendation.title,
        description: recommendation.description,
        translations: recommendation.translations,
        confidence: recommendation.confidence,
        mealType,
      },
    });
  } catch (error) {
    // P1 FIX: Sanitize error message to prevent internal data leakage
    return aiErrorResponse(error, 'generate meal');
  }
}
