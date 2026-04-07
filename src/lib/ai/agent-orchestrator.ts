/**
 * Multi-Agent Orchestrator
 *
 * Provides the TypeScript-layer agent execution that complements the
 * Postgres-layer decision engine and dispatcher.
 *
 * Each agent receives an AdaptiveUserContext + task-specific payload,
 * calls the LLM (or falls back through the 4-layer cost strategy),
 * and stores a structured output in ai_agent_outputs.
 *
 * Cost optimisation layers:
 *   1. Rule     — instant, free (handled in Postgres)
 *   2. Embedding — vector search for cached similar answers
 *   3. Small    — deterministic coach engine
 *   4. Cloud    — full LLM (only when needed)
 *
 * @module lib/ai/agent-orchestrator
 */

import { getSupabase } from '@/lib/supabase/supabase-data';
import { completeCloudPrompt } from '@/lib/iron-coach/hybrid/cloud';
import { generateCoachResponse } from '@/lib/iron-coach/coach-engine';
import { buildAdaptiveContext, buildAdaptiveContextBlock } from './adaptive-engine';
import { generateMultilingualContent } from './multilingual-output';
import type { SupportedLocale } from './multilingual-output';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AgentName =
  | 'nutrition_agent'
  | 'training_agent'
  | 'recovery_agent'
  | 'behavior_agent'
  | 'progress_agent';

export type ReasoningLayer = 'rule' | 'embedding' | 'small_model' | 'cloud';

export interface AgentTask {
  id: string;
  userId: string;
  agentName: AgentName;
  taskType: string;
  payload: Record<string, unknown>;
  locale: SupportedLocale;
  reasoningLayer: ReasoningLayer;
  actionId?: string;
}

export interface AgentOutput {
  agentName: AgentName;
  outputType: 'analysis' | 'recommendation' | 'plan' | 'insight' | 'question' | 'nudge';
  content: { en: string; fr: string; ar: string };
  reasoning: string;
  confidence: number;
  reasoningLayer: ReasoningLayer;
  relatedInsightId?: string;
  relatedRecommendationId?: string;
  relatedPlanId?: string;
}

// ─────────────────────────────────────────────────────────────
// Agent Prompts (per agent, locale-aware)
// ─────────────────────────────────────────────────────────────

const AGENT_SYSTEM_PROMPTS: Record<AgentName, (locale: string) => string> = {
  nutrition_agent: (locale) => `You are the Nutrition Agent of an elite fitness AI system.
LANGUAGE: Respond entirely in ${locale === 'ar' ? 'Arabic' : locale === 'fr' ? 'French' : 'English'}.
Your role: Analyse food logs, macro adherence, caloric balance, meal timing.
Be direct, data-driven, specific. Identify patterns. Give actionable suggestions.
Return JSON: {"analysis": "...", "recommendation": "...", "confidence": 0.0-1.0, "focus": "..."}`,

  training_agent: (locale) => `You are the Training Agent of an elite fitness AI system.
LANGUAGE: Respond entirely in ${locale === 'ar' ? 'Arabic' : locale === 'fr' ? 'French' : 'English'}.
Your role: Review workout history, volume, intensity trends, progression rate.
Detect overtraining or under-training. Recommend adjustments.
Return JSON: {"analysis": "...", "recommendation": "...", "confidence": 0.0-1.0, "focus": "..."}`,

  recovery_agent: (locale) => `You are the Recovery Agent of an elite fitness AI system.
LANGUAGE: Respond entirely in ${locale === 'ar' ? 'Arabic' : locale === 'fr' ? 'French' : 'English'}.
Your role: Monitor sleep quality, fatigue signals, recovery windows.
Prioritise user safety. Issue rest or de-load recommendations urgently when needed.
Return JSON: {"analysis": "...", "recommendation": "...", "confidence": 0.0-1.0, "urgency": "low|medium|high"}`,

  behavior_agent: (locale) => `You are the Behavior Agent of an elite fitness AI system.
LANGUAGE: Respond entirely in ${locale === 'ar' ? 'Arabic' : locale === 'fr' ? 'French' : 'English'}.
Your role: Track habit adherence, engagement patterns, motivational signals.
Drive behavioural interventions when engagement drops. Be encouraging but honest.
Return JSON: {"analysis": "...", "nudge": "...", "confidence": 0.0-1.0, "intervention_type": "..."}`,

  progress_agent: (locale) => `You are the Progress Agent of an elite fitness AI system.
LANGUAGE: Respond entirely in ${locale === 'ar' ? 'Arabic' : locale === 'fr' ? 'French' : 'English'}.
Your role: Evaluate goal progression, weight trends, body composition, milestone proximity.
Celebrate wins. Address plateaus objectively.
Return JSON: {"analysis": "...", "recommendation": "...", "confidence": 0.0-1.0, "milestone": "..."}`,
};

// ─────────────────────────────────────────────────────────────
// Layer 2: Embedding cache lookup
// ─────────────────────────────────────────────────────────────

async function tryEmbeddingCache(
  userId: string,
  agentName: AgentName,
  _contextHash: string,
): Promise<AgentOutput | null> {
  try {
    const supabase = await getSupabase();
    // ai_agent_outputs.agent_id is a FK to ai_agents — join to filter by agent_name
    const { data } = await (supabase as any)
      .from('ai_agent_outputs')
      .select('content, reasoning, confidence, output_type, ai_agents!inner(agent_name)')
      .eq('user_id', userId)
      .eq('ai_agents.agent_name', agentName)
      .gt('created_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      return {
        agentName,
        outputType: data.output_type,
        content: data.content,
        reasoning: data.reasoning ?? 'Cached from recent analysis',
        confidence: data.confidence * 0.9,
        reasoningLayer: 'embedding',
      };
    }
  } catch {
    // No cache hit
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Layer 3: Small model (deterministic coach engine)
// ─────────────────────────────────────────────────────────────

async function runSmallModel(
  agentName: AgentName,
  contextBlock: string,
): Promise<AgentOutput> {
  const intentMap: Record<AgentName, string> = {
    nutrition_agent: 'How is my nutrition?',
    training_agent:  'How is my training?',
    recovery_agent:  'How is my recovery and sleep?',
    behavior_agent:  'How is my consistency and habits?',
    progress_agent:  'How is my progress toward my goals?',
  };

  const response = await generateCoachResponse(null, intentMap[agentName]);

  return {
    agentName,
    outputType: 'analysis',
    content: { en: response.text, fr: response.text, ar: response.text },
    reasoning: 'Deterministic coach engine (small model)',
    confidence: (response.confidence ?? 0.7) * 0.85,
    reasoningLayer: 'small_model',
  };
}

// ─────────────────────────────────────────────────────────────
// Layer 4: Cloud LLM
// ─────────────────────────────────────────────────────────────

async function runCloudAgent(
  agentName: AgentName,
  contextBlock: string,
  locale: SupportedLocale,
): Promise<AgentOutput> {
  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentName](locale);
  const userPrompt = `${contextBlock}\n\nPerform your analysis now. Return JSON only.`;

  let raw: string;
  try {
    raw = await completeCloudPrompt(userPrompt, systemPrompt, locale);
  } catch {
    // Fall back to small model if cloud fails
    return runSmallModel(agentName, contextBlock);
  }

  let parsed: Record<string, string | number>;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    parsed = { analysis: raw.slice(0, 500), confidence: 0.6 };
  }

  const enText = String(parsed.analysis ?? parsed.recommendation ?? parsed.nudge ?? raw).slice(0, 800);
  const multilingual = await generateMultilingualContent(enText, locale);

  return {
    agentName,
    outputType: parsed.nudge ? 'nudge' : parsed.recommendation ? 'recommendation' : 'analysis',
    content: multilingual,
    reasoning: String(parsed.analysis ?? ''),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
    reasoningLayer: 'cloud',
  };
}

// ─────────────────────────────────────────────────────────────
// Main: Execute a single agent task
// ─────────────────────────────────────────────────────────────

export async function executeAgentTask(task: AgentTask): Promise<string | null> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  // Mark task as processing
  await sb.from('ai_agent_tasks')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', task.id);

  let output: AgentOutput;
  const contextHash = `${task.userId}:${task.agentName}:${new Date().toISOString().slice(0, 13)}`;

  try {
    // Build adaptive context
    const ctx = await buildAdaptiveContext(task.userId);
    const contextBlock = buildAdaptiveContextBlock(ctx);

    // 4-layer cost strategy
    if (task.reasoningLayer === 'rule') {
      // Rules already fired at DB level — create simple output
      output = {
        agentName: task.agentName,
        outputType: 'nudge',
        content: { en: String(task.payload.message ?? 'Rule-triggered action'), fr: '', ar: '' },
        reasoning: 'Rule engine',
        confidence: 0.95,
        reasoningLayer: 'rule',
      };
    } else if (task.reasoningLayer === 'embedding') {
      const cached = await tryEmbeddingCache(task.userId, task.agentName, contextHash);
      output = cached ?? await runSmallModel(task.agentName, contextBlock);
    } else if (task.reasoningLayer === 'small_model' || ctx.momentumScore > 50) {
      output = await runSmallModel(task.agentName, contextBlock);
    } else {
      output = await runCloudAgent(task.agentName, contextBlock, ctx.locale as SupportedLocale);
    }

    // Save to ai_agent_outputs — look up agent_id from agent_name
    const { data: agentRow } = await sb
      .from('ai_agents')
      .select('id')
      .eq('agent_name', output.agentName)
      .single();

    const { data: savedOutput } = await sb.from('ai_agent_outputs').insert({
      task_id:           task.id,
      action_id:         task.actionId ?? null,
      user_id:           task.userId,
      agent_id:          agentRow?.id ?? null,  // FK to ai_agents
      output_type:       output.outputType,
      content:           output.content,
      reasoning:         output.reasoning,
      confidence:        output.confidence,
      reasoning_layer:   output.reasoningLayer,
      locale:            task.locale,
    }).select('id').single();

    // Save as ai_insight for the existing insight system (backward compat)
    const insightText = output.content[task.locale] || output.content.en;
    const { data: insight } = await sb.from('ai_insights').insert({
      user_id:     task.userId,
      insight_type: task.agentName.replace('_agent', ''),
      title:       `${task.agentName.replace(/_/g, ' ')} analysis`,
      content:     insightText,
      confidence:  output.confidence,
      locale:      task.locale,
      translations: output.content,
      model_version: `multi-agent-v1-${output.reasoningLayer}`,
    }).select('id').single();

    // Link insight back to output
    if (insight?.id && savedOutput?.id) {
      await sb.from('ai_agent_outputs')
        .update({ related_insight_id: insight.id })
        .eq('id', savedOutput.id);
    }

    // Mark task complete
    await sb.from('ai_agent_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: output.content,
      })
      .eq('id', task.id);

    // Coordinate if all agents for this action are done
    if (task.actionId) {
      const { data: pending } = await sb.from('ai_agent_tasks')
        .select('id')
        .eq('action_id', task.actionId)
        .eq('status', 'pending')
        .limit(1);

      if (!pending?.length) {
        // All agents done — run coordinator
        await sb.rpc('run_coordinator', { p_user_id: task.userId });

        await sb.from('ai_actions')
          .update({ status: 'done', completed_at: new Date().toISOString() })
          .eq('id', task.actionId);
      }
    }

    return savedOutput?.id ?? null;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb.from('ai_agent_tasks')
      .update({ status: 'failed', error_message: msg })
      .eq('id', task.id);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Batch processor — runs pending tasks (called by API worker)
// ─────────────────────────────────────────────────────────────

export async function processPendingTasks(batchSize = 10): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  const { data: tasks } = await sb
    .from('ai_agent_tasks')
    .select(`
      id, user_id, task_type, input_data, status, priority,
      action_id, locale, reasoning_layer, retry_count,
      ai_agents!inner(agent_name)
    `)
    .eq('status', 'pending')
    .lt('retry_count', 3)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(batchSize);

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const task of (tasks ?? [])) {
    try {
      await executeAgentTask({
        id:             task.id,
        userId:         task.user_id,
        agentName:      task.ai_agents?.agent_name as AgentName ?? 'progress_agent',
        taskType:       task.task_type,
        payload:        task.input_data ?? {},
        locale:         (task.locale ?? 'en') as SupportedLocale,
        reasoningLayer: (task.reasoning_layer ?? 'cloud') as ReasoningLayer,
        actionId:       task.action_id ?? undefined,
      });
      processed++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Task ${task.id}: ${msg}`);

      // Increment retry count
      await sb.from('ai_agent_tasks')
        .update({ retry_count: (task.retry_count ?? 0) + 1 })
        .eq('id', task.id);
    }
  }

  return { processed, failed, errors };
}
