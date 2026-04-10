/**
 * AI Adaptive Workouts API
 * 
 * GET /api/ai/workouts - Get adaptive workout recommendations
 * POST /api/ai/workouts - Generate new workout
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { aiErrorResponse } from '@/lib/api-security';
import {
  generateWorkoutRecommendation,
  type SupportedLocale,
} from '@/lib/ai/comprehensive-ai-service';

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();

    const { searchParams } = new URL(request.url);
    const locale = (searchParams.get('locale') || 'en') as SupportedLocale;

    // Get user's workout history and state
    const [settingsResult, recentWorkouts, userState] = await Promise.all([
      supabase.from('user_settings').select('preferred_language, language').eq('user_id', user.id).single(),
      supabase.from('workouts')
        .select('id, activity_type, started_at, calories_burned, training_load')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(7),
      supabase.from('ai_user_state').select('*').eq('user_id', user.id).single(),
    ]);

    const userLocale = (settingsResult.data?.preferred_language || settingsResult.data?.language || locale) as SupportedLocale;

    // Generate recommendation
    const recommendation = await generateWorkoutRecommendation(user.id, userLocale);

    // Format response
    const workout = {
      id: `workout-${Date.now()}`,
      ...recommendation.related_data,
      title: recommendation.title,
      description: recommendation.description,
      translations: recommendation.translations,
      confidence: recommendation.confidence,
    };

    return NextResponse.json({
      workout,
      userState: {
        fatigueScore: userState.data?.fatigue_score || 0,
        recoveryScore: userState.data?.recovery_score || 0,
        momentumScore: userState.data?.momentum_score || 0,
      },
      recentWorkouts: recentWorkouts.data || [],
      locale: userLocale,
    });
  } catch (error) {
    // P1 FIX: Sanitize error message to prevent internal data leakage
    return aiErrorResponse(error, 'get workouts');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();

    // Strict Zod validation
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { AiWorkoutRequestSchema } = await import('@/lib/validation')
    const parseResult = AiWorkoutRequestSchema.safeParse(body)
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
    const { locale = 'en', workoutType, focusArea } = body;

    // Get user's preferred language
    const { data: settings } = await supabase
      .from('user_settings')
      .select('preferred_language, language')
      .eq('user_id', user.id)
      .single();

    const userLocale = (settings?.preferred_language || settings?.language || locale) as SupportedLocale;

    // Generate workout
    const recommendation = await generateWorkoutRecommendation(user.id, userLocale);

    return NextResponse.json({
      success: true,
      workout: {
        id: `workout-${Date.now()}`,
        ...recommendation.related_data,
        title: recommendation.title,
        description: recommendation.description,
        translations: recommendation.translations,
        confidence: recommendation.confidence,
        recommendationId: recommendation,
      },
    });
  } catch (error) {
    // P1 FIX: Sanitize error message to prevent internal data leakage
    return aiErrorResponse(error, 'generate workout');
  }
}
