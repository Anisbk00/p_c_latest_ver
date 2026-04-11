/**
 * Experiments API — Supabase-native
 * GET   /api/experiments
 * POST  /api/experiments
 * PATCH /api/experiments
 *
 * Experiments are stored in ai_insights with insight_type = 'experiment'
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseUser } from '@/lib/supabase/supabase-data'
import { XPService, type XPAction } from '@/lib/xp-service'

export async function GET() {
  try {
    const { supabase, user } = await getSupabaseUser()

    const { data, error } = await supabase
      .from('ai_insights')
      .select('*')
      .eq('user_id', user.id)
      .eq('insight_type', 'experiment')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Parse content for each experiment
    const experiments = (data ?? []).map(e => {
      const content = typeof e.content === 'string' ? JSON.parse(e.content) : e.content;
      return {
        id: e.id,
        title: content.title || 'Untitled Experiment',
        description: content.description || '',
        category: content.category || 'habit',
        duration: content.duration || 14,
        expectedOutcome: content.expectedOutcome || '',
        dailyActions: content.dailyActions || [],
        whyItWorks: content.whyItWorks || '',
        tipsForSuccess: content.tipsForSuccess || [],
        status: content.status || 'available',
        startDate: content.startDate || null,
        endDate: content.endDate || null,
        adherence: content.adherence || 0,
        createdAt: e.created_at,
      };
    });

    return NextResponse.json({ experiments })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch experiments', details: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const body = await request.json()

    // Check if there's already an active experiment
    const { data: activeExps, error: activeCheckError } = await supabase
      .from('ai_insights')
      .select('id, content')
      .eq('user_id', user.id)
      .eq('insight_type', 'experiment');

    if (!activeCheckError && activeExps) {
      for (const row of activeExps) {
        const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
        if (content.status === 'active') {
          return NextResponse.json({ 
            error: 'An active experiment already exists. Complete or abandon it first.',
            existingExperiment: { id: row.id, title: content.title }
          }, { status: 400 });
        }
      }
    }

    const duration = body.duration ?? 14;
    const startDate = new Date();
    const endDate = new Date(Date.now() + duration * 86400000);

    const { data, error } = await supabase.from('ai_insights').insert({
      user_id: user.id,
      insight_type: 'experiment',
      title: body.title || 'Experiment',
      content: JSON.stringify({
        title: body.title,
        description: body.description,
        category: body.category ?? 'nutrition',
        duration: duration,
        expectedOutcome: body.expectedOutcome || '',
        dailyActions: body.dailyActions || [],
        whyItWorks: body.whyItWorks || '',
        tipsForSuccess: body.tipsForSuccess || [],
        status: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        adherence: 0,
      }),
    }).select().single()

    if (error) throw error

    return NextResponse.json({ success: true, experiment: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to create experiment', details: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await getSupabaseUser()
    const body = await request.json()

    if (!body.experimentId) return NextResponse.json({ error: 'Missing experimentId' }, { status: 400 })

    // If activating an experiment, check no other active experiment exists
    if (body.status === 'active') {
      const { data: allExps, error: checkError } = await supabase
        .from('ai_insights')
        .select('id, content')
        .eq('user_id', user.id)
        .eq('insight_type', 'experiment');

      if (!checkError && allExps) {
        for (const row of allExps) {
          if (row.id === body.experimentId) continue; // skip the one being activated
          const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
          if (content.status === 'active') {
            return NextResponse.json({ 
              error: 'An active experiment already exists. Complete it first.',
              existingExperiment: { id: row.id, title: content.title }
            }, { status: 400 });
          }
        }
      }
    }

    // First get the existing experiment
    const { data: existing, error: fetchError } = await supabase
      .from('ai_insights')
      .select('content')
      .eq('id', body.experimentId)
      .eq('user_id', user.id)
      .single();

    if (fetchError) throw fetchError;

    // Parse and merge content
    const existingContent = typeof existing.content === 'string' ? JSON.parse(existing.content) : existing.content;
    const updatedContent = {
      ...existingContent,
      ...body,
      status: body.status || existingContent.status,
    };

    const { data, error } = await supabase
      .from('ai_insights')
      .update({ content: JSON.stringify(updatedContent) })
      .eq('id', body.experimentId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    // ─── Award XP when experiment is completed ──────────────────
    let xpAwarded: { action: XPAction; amount: number; description: string; isOnTime: boolean } | null = null

    if (body.status === 'completed') {
      try {
        const xpService = new XPService(supabase)
        const startDate = existingContent.startDate ? new Date(existingContent.startDate).getTime() : null
        const durationDays = existingContent.duration || 14
        const now = Date.now()

        // Determine if completed on time (at or past the deadline)
        let isOnTime = false
        if (startDate) {
          const deadline = startDate + durationDays * 24 * 60 * 60 * 1000
          isOnTime = now >= deadline
        } else {
          isOnTime = false // No start date → treat as early
        }

        const action: XPAction = isOnTime ? 'experiment_completed_ontime' : 'experiment_completed_early'
        const description = isOnTime
          ? `🎯 "${existingContent.title}" completed on time!`
          : `"${existingContent.title}" completed`

        const result = await xpService.awardXP({
          userId: user.id,
          action,
          referenceId: body.experimentId,
          description,
        })

        if (result.success && result.awarded > 0) {
          xpAwarded = { action, amount: result.awarded, description, isOnTime }

          // Check if this is the first experiment completed (achievement)
          const { data: prevCompleted } = await supabase
            .from('xp_transactions')
            .select('id')
            .eq('user_id', user.id)
            .eq('action_type', 'first_experiment')
            .maybeSingle()

          if (!prevCompleted) {
            const firstResult = await xpService.awardXP({
              userId: user.id,
              action: 'first_experiment',
              referenceId: 'first_experiment_achievement',
              description: '🧪 First experiment completed! Keep going!',
            })
            if (firstResult.success && firstResult.awarded > 0) {
              // Add bonus to the response
              xpAwarded.amount += firstResult.awarded
              xpAwarded.description += ` +${firstResult.awarded} bonus!`
            }
          }
        }

        console.log(`[experiments] XP awarded: ${xpAwarded?.amount} (${isOnTime ? 'on-time' : 'early'})`)
      } catch (xpErr) {
        console.error('[experiments] XP award failed (non-fatal):', xpErr)
        // Don't fail the experiment completion just because XP failed
      }
    }

    return NextResponse.json({ success: true, experiment: data, xpAwarded })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to update experiment', details: msg }, { status: 500 })
  }
}
