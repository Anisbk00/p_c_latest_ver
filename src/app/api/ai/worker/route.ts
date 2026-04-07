/**
 * POST /api/ai/worker
 *
 * Unified async worker endpoint for the multi-agent system.
 * Called on a schedule (every minute) or triggered by user events.
 *
 * Operations (via ?op= query param):
 *   update-state   — compute_user_state for users with due states
 *   decision       — run_decision_engine (enqueue actions)
 *   dispatch       — dispatch_ai_actions (create agent tasks)
 *   execute-agents — process pending ai_agent_tasks
 *   coordinate     — run coordinator for users with unprocessed outputs
 *   cohort         — update cohort metrics
 *   full-loop      — run all steps in sequence (development/testing)
 *
 * Protected: requires WORKER_SECRET header (must be set in environment).
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-static';
import { getSupabase } from '@/lib/supabase/supabase-data';
import { processPendingTasks } from '@/lib/ai/agent-orchestrator';

// SECURITY FIX: Require WORKER_SECRET to be set in environment
// No hardcoded fallback - this prevents unauthorized access
const WORKER_SECRET = process.env.AI_WORKER_SECRET;
if (!WORKER_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[AI Worker] CRITICAL: AI_WORKER_SECRET environment variable is not set!');
}

type WorkerOp =
  | 'update-state'
  | 'decision'
  | 'dispatch'
  | 'execute-agents'
  | 'coordinate'
  | 'cohort'
  | 'full-loop';

interface WorkerResult {
  op: WorkerOp;
  success: boolean;
  result?: unknown;
  error?: string;
  duration_ms: number;
}

async function runOp(op: WorkerOp, batchSize: number): Promise<unknown> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  switch (op) {
    case 'update-state': {
      // Compute state for users whose next_action_due_at has passed
      const { data: users } = await sb
        .from('ai_user_state')
        .select('user_id')
        .lte('next_action_due_at', new Date().toISOString())
        .order('next_action_due_at', { ascending: true })
        .limit(batchSize);

      let count = 0;
      for (const u of (users ?? [])) {
        await sb.rpc('compute_user_state', { p_user_id: u.user_id });
        count++;
      }

      // Also bootstrap users who have no state row yet
      const { data: newUsers } = await sb
        .from('profiles')
        .select('id')
        .not('id', 'in',
          sb.from('ai_user_state').select('user_id')
        )
        .limit(batchSize);

      for (const u of (newUsers ?? [])) {
        await sb.rpc('compute_user_state', { p_user_id: u.id });
        count++;
      }

      return { users_updated: count };
    }

    case 'decision': {
      const { data } = await sb.rpc('run_decision_engine', { p_batch_size: batchSize });
      return { actions_created: data };
    }

    case 'dispatch': {
      const { data } = await sb.rpc('dispatch_ai_actions', { p_batch_size: batchSize });
      return { tasks_dispatched: data };
    }

    case 'execute-agents': {
      const result = await processPendingTasks(batchSize);
      return result;
    }

    case 'coordinate': {
      // Find users with uncoordinated agent outputs
      const { data: userIds } = await sb
        .from('ai_agent_outputs')
        .select('user_id')
        .eq('coordinator_processed', false)
        .gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .limit(batchSize);

      const seen = new Set<string>();
      let count = 0;
      for (const row of (userIds ?? [])) {
        if (seen.has(row.user_id)) continue;
        seen.add(row.user_id);
        await sb.rpc('run_coordinator', { p_user_id: row.user_id });
        count++;
      }
      return { users_coordinated: count };
    }

    case 'cohort': {
      await sb.rpc('update_cohort_metrics');
      return { updated: true };
    }

    case 'full-loop': {
      const stateResult  = await runOp('update-state',    Math.min(batchSize, 20));
      const decResult    = await runOp('decision',        Math.min(batchSize, 50));
      const dispResult   = await runOp('dispatch',        Math.min(batchSize, 50));
      const agentResult  = await runOp('execute-agents',  Math.min(batchSize, 10));
      const coordResult  = await runOp('coordinate',      Math.min(batchSize, 20));
      return { state: stateResult, decision: decResult, dispatch: dispResult, agents: agentResult, coordinator: coordResult };
    }

    default:
      throw new Error(`Unknown operation: ${op}`);
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();

  // Auth - SECURITY FIX: Fail if secret not configured
  const secret = request.headers.get('x-worker-secret');
  
  if (!WORKER_SECRET) {
    console.error('[AI Worker] Request rejected: AI_WORKER_SECRET not configured');
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 503 });
  }
  
  if (secret !== WORKER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }


  // Strict Zod validation for query params
  const { searchParams } = new URL(request.url);
  const { AiWorkerRequestSchema } = await import('@/lib/validation')
  const parseResult = AiWorkerRequestSchema.safeParse({
    op: searchParams.get('op'),
    batch: searchParams.get('batch'),
  })
  if (!parseResult.success) {
    return NextResponse.json({
      error: 'Invalid query parameters',
      details: parseResult.error.flatten(),
    }, { status: 400 })
  }
  const op = (parseResult.data.op ?? 'full-loop') as WorkerOp;
  const batchSize = parseResult.data.batch ? parseInt(parseResult.data.batch, 10) : 100;

  const supabase = await getSupabase();
  const sb = supabase as any;
  const runId = crypto.randomUUID();

  await sb.from('ai_worker_logs').insert({
    worker_name: `api-worker:${op}`,
    run_id: runId,
    status: 'started',
    batch_size: batchSize,
  });

  try {
    const result = await runOp(op, batchSize);
    const duration = Date.now() - start;

    await sb.from('ai_worker_logs').update({
      status: 'completed',
      tasks_processed: typeof result === 'object' && result !== null && 'processed' in result
        ? (result as { processed: number }).processed : 0,
      duration_ms: duration,
      completed_at: new Date().toISOString(),
      metadata: { result },
    }).eq('run_id', runId);

    const response: WorkerResult = {
      op,
      success: true,
      result,
      duration_ms: duration,
    };

    return NextResponse.json(response);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const duration = Date.now() - start;

    await sb.from('ai_worker_logs').update({
      status: 'failed',
      errors: 1,
      duration_ms: duration,
      completed_at: new Date().toISOString(),
      error_details: { error: msg },
    }).eq('run_id', runId);

    return NextResponse.json({
      op,
      success: false,
      error: msg,
      duration_ms: duration,
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: 'POST /api/ai/worker',
    operations: [
      'update-state   — compute feature vectors for users with due states',
      'decision       — run rule engine, enqueue ai_actions',
      'dispatch       — convert ai_actions to ai_agent_tasks',
      'execute-agents — process pending agent tasks (4-layer cost strategy)',
      'coordinate     — merge agent outputs into ai_coaching_summaries',
      'cohort         — update aggregate ai_cohort_metrics',
      'full-loop      — run all steps in sequence',
    ],
    auth: 'x-worker-secret header required',
    query: '?op=<operation>&batch=<size>',
  });
}
