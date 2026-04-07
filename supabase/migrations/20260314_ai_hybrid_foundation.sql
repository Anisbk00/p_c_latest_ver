-- Hybrid AI foundation for offline-first Iron Coach
-- Adds AI conversation/memory/plan/embedding tables + vector search RPC + RLS

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Conversations
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  source_preference TEXT NOT NULL DEFAULT 'auto' CHECK (source_preference IN ('auto', 'local_model', 'cloud_model')),
  last_source TEXT CHECK (last_source IN ('local_model', 'cloud_model')),
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
  ON public.ai_conversations (user_id, updated_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  source TEXT CHECK (source IN ('local_model', 'cloud_model')),
  routing_reason TEXT,
  confidence NUMERIC(4,3),
  token_usage JSONB,
  retrieval_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
  ON public.ai_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_user_created
  ON public.ai_messages (user_id, created_at DESC);

-- Long-term memory
CREATE TABLE IF NOT EXISTS public.ai_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_key TEXT NOT NULL,
  memory_value JSONB NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.50,
  source TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, memory_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_user_conf
  ON public.ai_memory (user_id, confidence DESC);

-- Generated plans
CREATE TABLE IF NOT EXISTS public.ai_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('workout', 'nutrition', 'recovery', 'hybrid')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  source TEXT CHECK (source IN ('local_model', 'cloud_model')),
  confidence NUMERIC(4,3),
  title TEXT,
  plan_json JSONB NOT NULL,
  rationale TEXT,
  valid_from DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_plans_user_created
  ON public.ai_plans (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_plans_user_type_status
  ON public.ai_plans (user_id, plan_type, status);

-- Embeddings for RAG
CREATE TABLE IF NOT EXISTS public.ai_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id UUID,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_embeddings_user_created
  ON public.ai_embeddings (user_id, created_at DESC);

-- Use cosine distance operator class
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_user_embedding_cosine
  ON public.ai_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS policies (idempotent guards)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_conversations' AND policyname = 'Users can read own ai_conversations'
  ) THEN
    CREATE POLICY "Users can read own ai_conversations" ON public.ai_conversations
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_conversations' AND policyname = 'Users can insert own ai_conversations'
  ) THEN
    CREATE POLICY "Users can insert own ai_conversations" ON public.ai_conversations
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_conversations' AND policyname = 'Users can update own ai_conversations'
  ) THEN
    CREATE POLICY "Users can update own ai_conversations" ON public.ai_conversations
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_messages' AND policyname = 'Users can read own ai_messages'
  ) THEN
    CREATE POLICY "Users can read own ai_messages" ON public.ai_messages
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_messages' AND policyname = 'Users can insert own ai_messages'
  ) THEN
    CREATE POLICY "Users can insert own ai_messages" ON public.ai_messages
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_messages' AND policyname = 'Users can update own ai_messages'
  ) THEN
    CREATE POLICY "Users can update own ai_messages" ON public.ai_messages
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_memory' AND policyname = 'Users can read own ai_memory'
  ) THEN
    CREATE POLICY "Users can read own ai_memory" ON public.ai_memory
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_memory' AND policyname = 'Users can insert own ai_memory'
  ) THEN
    CREATE POLICY "Users can insert own ai_memory" ON public.ai_memory
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_memory' AND policyname = 'Users can update own ai_memory'
  ) THEN
    CREATE POLICY "Users can update own ai_memory" ON public.ai_memory
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_plans' AND policyname = 'Users can read own ai_plans'
  ) THEN
    CREATE POLICY "Users can read own ai_plans" ON public.ai_plans
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_plans' AND policyname = 'Users can insert own ai_plans'
  ) THEN
    CREATE POLICY "Users can insert own ai_plans" ON public.ai_plans
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_plans' AND policyname = 'Users can update own ai_plans'
  ) THEN
    CREATE POLICY "Users can update own ai_plans" ON public.ai_plans
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_embeddings' AND policyname = 'Users can read own ai_embeddings'
  ) THEN
    CREATE POLICY "Users can read own ai_embeddings" ON public.ai_embeddings
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_embeddings' AND policyname = 'Users can insert own ai_embeddings'
  ) THEN
    CREATE POLICY "Users can insert own ai_embeddings" ON public.ai_embeddings
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_embeddings' AND policyname = 'Users can update own ai_embeddings'
  ) THEN
    CREATE POLICY "Users can update own ai_embeddings" ON public.ai_embeddings
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END$$;

-- Search function for vector similarity
CREATE OR REPLACE FUNCTION public.match_ai_embeddings(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 6,
  p_source_tables TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  source_table TEXT,
  source_id UUID,
  content TEXT,
  metadata JSONB,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id,
    e.source_table,
    e.source_id,
    e.content,
    e.metadata,
    1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM public.ai_embeddings e
  WHERE e.user_id = p_user_id
    AND (p_source_tables IS NULL OR e.source_table = ANY (p_source_tables))
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 50));
$$;

COMMENT ON FUNCTION public.match_ai_embeddings(UUID, vector, INT, TEXT[])
IS 'User-scoped cosine similarity search over ai_embeddings for Iron Coach RAG.';
