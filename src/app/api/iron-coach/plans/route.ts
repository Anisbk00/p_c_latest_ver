import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';
import { buildIronCoachContext } from '@/lib/iron-coach/hybrid/context';
import { completeCloudPrompt } from '@/lib/iron-coach/hybrid/cloud';
import { buildHybridCoachSystemPrompt, buildHybridCoachUserPrompt } from '@/lib/iron-coach/hybrid/prompt-template';
import { getTopAIMemory, saveAIPlan } from '@/lib/iron-coach/hybrid/ai-store';

interface PlanRequestBody {
  message: string;
  planType?: 'workout' | 'nutrition' | 'recovery' | 'hybrid';
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();
    const body = (await request.json()) as PlanRequestBody;

    if (!body?.message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    // Resolve locale
    const ALLOWED_LOCALES = new Set(['en', 'fr', 'ar']);
    const { data: settingsRow } = await supabase
      .from('user_settings')
      .select('language')
      .eq('user_id', user.id)
      .single();
    const userLocale: string = settingsRow?.language && ALLOWED_LOCALES.has(settingsRow.language)
      ? settingsRow.language : 'en';

    const [context, adaptiveCtx] = await Promise.all([
      buildIronCoachContext(user.id, body.message),
      import('@/lib/ai/adaptive-engine').then(m => m.buildAdaptiveContext(user.id)).catch(() => null),
    ]);
    const memory = await getTopAIMemory(user.id, 10);
    const adaptiveBlock = adaptiveCtx
      ? (await import('@/lib/ai/adaptive-engine')).buildAdaptiveContextBlock(adaptiveCtx)
      : '';

    const systemPrompt = buildHybridCoachSystemPrompt(userLocale) + (adaptiveBlock ? `\n\n${adaptiveBlock}` : '');
    const userPrompt = buildHybridCoachUserPrompt({
      question: `Generate a ${body.planType || 'hybrid'} plan. ${body.message}`,
      context,
      memory,
      ragSnippets: context.ragSnippets ?? [],
    });

    const completion = await completeCloudPrompt(userPrompt, `${systemPrompt}\nReturn strict JSON only.`, userLocale);

    let planJson: Record<string, unknown>;
    try {
      planJson = JSON.parse(completion);
    } catch {
      return NextResponse.json(
        {
          error: 'Cloud model did not return valid JSON plan output',
          raw: completion,
        },
        { status: 422 },
      );
    }

    const planType = (planJson.plan_type as PlanRequestBody['planType']) || body.planType || 'hybrid';
    const planId = await saveAIPlan({
      userId: user.id,
      planType,
      source: 'cloud_model',
      title: typeof planJson.title === 'string' ? planJson.title : 'AI Plan',
      confidence: typeof planJson.confidence === 'number' ? planJson.confidence : 0.75,
      planJson,
      rationale: typeof planJson.rationale === 'string' ? planJson.rationale : undefined,
    });

    return NextResponse.json({ planId, plan: planJson, source: 'cloud_model' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to generate plan', details: msg }, { status: 500 });
  }
}
