/**
 * GET /api/ai/state
 *
 * Returns the current ai_user_state for the authenticated user.
 * Triggers a fresh compute if the state is stale (>1h old).
 * Also returns the latest ai_coaching_summary for immediate display.
 *
 * Designed for the home screen / dashboard to show the AI coaching status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser } from '@/lib/supabase/supabase-data';

export async function GET(_request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser();
    const sb = supabase as any;

    // Fetch current state
    let { data: state } = await sb
      .from('ai_user_state')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Bootstrap or refresh if stale (>1h)
    const isStale = !state ||
      new Date(state.computed_at).getTime() < Date.now() - 3600_000;

    if (isStale) {
      await sb.rpc('compute_user_state', { p_user_id: user.id });
      const { data: fresh } = await sb
        .from('ai_user_state')
        .select('*')
        .eq('user_id', user.id)
        .single();
      state = fresh;
    }

    // Fetch latest coaching summary
    const { data: summary } = await sb
      .from('ai_coaching_summaries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Fetch recent agent outputs — join ai_agents to resolve agent_name from agent_id FK
    const { data: agentOutputs } = await sb
      .from('ai_agent_outputs')
      .select('ai_agents(agent_name), output_type, content, confidence, reasoning_layer, created_at')
      .eq('user_id', user.id)
      .gt('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch pending actions count
    const { count: pendingActions } = await sb
      .from('ai_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending');

    const locale = state?.locale ?? 'en';

    return NextResponse.json({
      state: state ?? null,
      summary: summary ? {
        id: summary.id,
        content: summary.summary_content?.[locale] || summary.summary_content?.en || '',
        content_all: summary.summary_content,
        agents_involved: summary.agents_involved,
        primary_focus: summary.primary_focus,
        overall_confidence: summary.overall_confidence,
        delivered: summary.delivered,
        created_at: summary.created_at,
      } : null,
      agent_outputs: (agentOutputs ?? []).map((o: Record<string, unknown>) => ({
        agent: (o.ai_agents as any)?.agent_name ?? 'unknown',
        type: o.output_type,
        content: (o.content as Record<string, string>)?.[locale] || (o.content as Record<string, string>)?.en || '',
        confidence: o.confidence,
        layer: o.reasoning_layer,
        created_at: o.created_at,
      })),
      pending_actions: pendingActions ?? 0,
      is_fresh: !isStale,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // SECURITY: Do not expose internal error details to client
    return NextResponse.json({ error: 'Failed to fetch AI state' }, { status: 500 });
  }
}
