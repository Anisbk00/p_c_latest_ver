/**
 * AI Feedback API
 * 
 * Records user feedback for adaptive learning.
 * - Stores feedback in ai_feedback
 * - Generates training signals in ai_training_signals
 * 
 * GET /api/ai/feedback - Get user feedback history
 * POST /api/ai/feedback - Record new feedback
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    // Get user's feedback history
    const { data: feedback, error } = await supabase
      .from('ai_feedback')
      .select(`
        id,
        feedback_type,
        rating,
        feedback_text,
        created_at,
        ai_messages (
          id,
          content,
          role
        ),
        ai_recommendations (
          id,
          title,
          recommendation_type
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Get training signals summary
    const { data: signals } = await supabase
      .from('ai_training_signals')
      .select('signal_type, strength, created_at')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Calculate signal summary
    const signalSummary = (signals || []).reduce((acc: any, signal: any) => {
      const type = signal.signal_type;
      if (!acc[type]) acc[type] = { count: 0, avgStrength: 0, totalStrength: 0 };
      acc[type].count++;
      acc[type].totalStrength += signal.strength || 0;
      acc[type].avgStrength = acc[type].totalStrength / acc[type].count;
      return acc;
    }, {});

    return NextResponse.json({
      feedback: feedback || [],
      signalSummary,
      totalSignals: signals?.length || 0,
    });
  } catch (error) {
    console.error('AI Feedback GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get feedback' },
      { status: 500 }
    );
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
    const { AiFeedbackSchema } = await import('@/lib/validation')
    const parseResult = AiFeedbackSchema.safeParse(body)
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
    const {
      messageId,
      recommendationId,
      feedbackType,
      rating,
      feedbackText,
      outcomeData,
    } = body;

    // Store feedback
    const { data: feedback, error } = await supabase
      .from('ai_feedback')
      .insert({
        user_id: user.id,
        message_id: messageId,
        recommendation_id: recommendationId,
        feedback_type: feedbackType,
        rating,
        feedback_text: feedbackText,
      })
      .select('id')
      .single();

    if (error) throw error;

    // Generate training signal
    const strength = feedbackType === 'positive' ? 1.0 :
                     feedbackType === 'negative' ? -0.5 : 0;

    await supabase.from('ai_training_signals').insert({
      user_id: user.id,
      signal_type: 'user_feedback',
      signal_data: {
        feedback_id: feedback.id,
        feedback_type: feedbackType,
        rating,
        message_id: messageId,
        recommendation_id: recommendationId,
      },
      strength,
    });

    // If this is a recommendation feedback, update recommendation status
    if (recommendationId && feedbackType) {
      await supabase
        .from('ai_recommendations')
        .update({
          outcome: feedbackType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recommendationId);
    }

    return NextResponse.json({
      success: true,
      feedbackId: feedback.id,
      signalGenerated: true,
      strength,
    });
  } catch (error) {
    console.error('AI Feedback POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record feedback' },
      { status: 500 }
    );
  }
}
