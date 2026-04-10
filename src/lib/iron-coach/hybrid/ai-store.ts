import { getSupabase } from '@/lib/supabase/supabase-data';
import type { Json } from '@/lib/supabase/database.types';
import type { IronCoachModelSource } from './types';

export interface AIEmbeddingMatch {
  id: string;
  source_table: string;
  source_id: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

export interface SaveAIMessageInput {
  conversationId: string;
  userId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  source?: IronCoachModelSource;
  routingReason?: string;
  confidence?: number;
  tokenUsage?: Record<string, unknown>;
  retrievalMetadata?: Record<string, unknown>;
  locale?: string;
}

export interface UpsertAIMemoryInput {
  userId: string;
  memoryKey: string;
  memoryValue: Record<string, unknown>;
  confidence?: number;
  source?: string;
}

export interface SaveAIPlanInput {
  userId: string;
  planType: 'workout' | 'nutrition' | 'recovery' | 'hybrid';
  title?: string;
  status?: 'draft' | 'active' | 'archived';
  source?: IronCoachModelSource;
  confidence?: number;
  planJson: Record<string, unknown>;
  rationale?: string;
  validFrom?: string;
  validTo?: string;
}

export async function ensureAIConversation(
  userId: string,
  conversationId: string | null | undefined,
  titleSeed: string,
  sourcePreference: 'auto' | 'local_model' | 'cloud_model' = 'auto',
): Promise<string> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  if (conversationId) {
    const { data } = await sb
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (data?.id) return data.id as string;
  }

  const { data, error } = await sb
    .from('ai_conversations')
    .insert({
      user_id: userId,
      title: titleSeed.slice(0, 80) || 'Iron Coach Chat',
      source_preference: sourcePreference,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw error || new Error('Failed to create ai conversation');
  }

  return data.id as string;
}

export async function updateAIConversationTouch(
  conversationId: string,
  source?: IronCoachModelSource,
  summary?: string,
): Promise<void> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  await sb
    .from('ai_conversations')
    .update({
      updated_at: new Date().toISOString(),
      last_source: source,
      summary,
    })
    .eq('id', conversationId);
}

export async function saveAIMessage(input: SaveAIMessageInput): Promise<void> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  const { error } = await sb.from('ai_messages').insert({
    conversation_id: input.conversationId,
    user_id: input.userId,
    role: input.role,
    content: input.content,
    source: input.source,
    routing_reason: input.routingReason,
    confidence: input.confidence,
    token_usage: input.tokenUsage as Json | undefined,
    retrieval_metadata: input.retrievalMetadata as Json | undefined,
    locale: input.locale ?? 'en',
  });

  if (error) throw error;
}

export async function upsertAIMemory(input: UpsertAIMemoryInput): Promise<void> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  const { error } = await sb.from('ai_memory').upsert(
    {
      user_id: input.userId,
      memory_key: input.memoryKey,
      memory_value: input.memoryValue as Json,
      confidence: input.confidence ?? 0.7,
      source: input.source,
      updated_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,memory_key' },
  );

  if (error) throw error;
}

export async function getTopAIMemory(userId: string, limit = 8): Promise<Array<{ key: string; value: unknown; confidence: number }>> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  const { data, error } = await sb
    .from('ai_memory')
    .select('memory_key, memory_value, confidence')
    .eq('user_id', userId)
    .order('confidence', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 30)));

  if (error || !data) return [];

  return (data as Array<{ memory_key: string; memory_value: unknown; confidence: number | null }>).map((row) => ({
    key: row.memory_key,
    value: row.memory_value,
    confidence: row.confidence ?? 0,
  }));
}

export async function saveAIPlan(input: SaveAIPlanInput): Promise<string> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  const { data, error } = await sb
    .from('ai_plans')
    .insert({
      user_id: input.userId,
      plan_type: input.planType,
      status: input.status ?? 'active',
      source: input.source,
      confidence: input.confidence,
      title: input.title,
      plan_json: input.planJson as Json,
      rationale: input.rationale,
      valid_from: input.validFrom,
      valid_to: input.validTo,
    })
    .select('id')
    .single();

  if (error || !data?.id) throw error || new Error('Failed to save ai plan');
  return data.id as string;
}

export async function upsertAIEmbedding(params: {
  userId: string;
  sourceTable: string;
  sourceId?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
}): Promise<void> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  const { error } = await sb.from('ai_embeddings').insert({
    user_id: params.userId,
    source_table: params.sourceTable,
    source_id: params.sourceId ?? null,
    content: params.content,
    metadata: (params.metadata ?? {}) as Json,
    embedding: params.embedding,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function searchAIEmbeddings(params: {
  userId: string;
  queryEmbedding: number[];
  matchCount?: number;
  sourceTables?: string[];
}): Promise<AIEmbeddingMatch[]> {
  const supabase = await getSupabase();
  const sb = supabase as any;

  const { data, error } = await sb.rpc('match_ai_embeddings', {
    p_user_id: params.userId,
    p_query_embedding: params.queryEmbedding,
    p_match_count: params.matchCount ?? 6,
    p_source_tables: params.sourceTables ?? null,
  });

  if (error) {
    return [];
  }

  return (data ?? []) as AIEmbeddingMatch[];
}
