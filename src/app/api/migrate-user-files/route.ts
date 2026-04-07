/**
 * One-time migration: Create user_files table + award_xp RPC
 * 
 * Call: GET /api/migrate-user-files
 * This should be called once after deployment, then can be deleted.
 * Uses the Supabase JS client (service role) to create the table.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// All SQL statements to run via Supabase Management API
const MIGRATION_SQL = `
-- 1. Create user_files table
CREATE TABLE IF NOT EXISTS public.user_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT,
  path TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other',
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON public.user_files (user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_category ON public.user_files (category);
CREATE INDEX IF NOT EXISTS idx_user_files_user_category ON public.user_files (user_id, category, created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.user_files ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies (safe to run multiple times)
DO $$ BEGIN
  CREATE POLICY "Users can read own files" ON public.user_files FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own files" ON public.user_files FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own files" ON public.user_files FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Create award_xp function (with actual XP persistence)
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  reference_id UUID DEFAULT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_id ON public.xp_transactions (user_id);
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users can read own xp" ON public.xp_transactions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role can insert xp" ON public.xp_transactions FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.award_xp(
  p_user_id UUID,
  p_amount INTEGER,
  p_action_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_xp INTEGER; v_old_level INTEGER; v_new_xp INTEGER; v_new_level INTEGER; v_leveled_up BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id) VALUES (p_user_id) ON CONFLICT (id) DO NOTHING;
  SELECT COALESCE(xp, 0), COALESCE(level, 1) INTO v_old_xp, v_old_level FROM public.profiles WHERE id = p_user_id;
  IF v_old_xp IS NULL THEN v_old_xp := 0; v_old_level := 1; END IF;
  v_new_xp := v_old_xp + p_amount;
  v_new_level := FLOOR(v_new_xp / 100) + 1;
  v_leveled_up := v_new_level > v_old_level;
  UPDATE public.profiles SET xp = v_new_xp, level = v_new_level, updated_at = NOW() WHERE id = p_user_id;
  IF p_reference_id IS NOT NULL THEN
    INSERT INTO public.xp_transactions (user_id, amount, action_type, reference_id, description)
    SELECT p_user_id, p_amount, p_action_type, p_reference_id, p_description
    WHERE NOT EXISTS (SELECT 1 FROM public.xp_transactions WHERE reference_id = p_reference_id);
  ELSE
    INSERT INTO public.xp_transactions (user_id, amount, action_type, reference_id, description)
    VALUES (p_user_id, p_amount, p_action_type, NULL, p_description);
  END IF;
  RETURN jsonb_build_object('success', true, 'new_xp', v_new_xp, 'new_level', v_new_level, 'leveled_up', v_leveled_up, 'xp_progress', v_new_xp - ((v_new_level - 1) * 100), 'xp_to_next_level', 100);
END;
$$;

-- 6. Ensure storage bucket is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-photos', 'progress-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;
`;

/**
 * Extract the Supabase project ref from the URL
 */
function getProjectRef(supabaseUrl: string): string | null {
  const match = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)
  return match ? match[1] : null
}

/**
 * Try to create a SQL execution RPC function via Supabase REST API,
 * then call it to run the migration.
 */
async function migrateViaSupabaseRest(): Promise<{ success: boolean; results: string[]; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const results: string[] = []

  if (!supabaseUrl || !serviceRoleKey) {
    return { success: false, results, error: 'Missing Supabase credentials' }
  }

  // Approach: Use Supabase's internal SQL execution endpoint
  // This is available at {project-url}/rest/v1/rpc/exec_sql
  // But we need the function to exist first
  
  // Instead, use the Supabase Management API to run SQL
  const projectRef = getProjectRef(supabaseUrl)
  if (!projectRef) {
    return { success: false, results, error: 'Could not extract project ref from SUPABASE_URL' }
  }

  // Try to find the Supabase access token
  // It might be in SUPABASE_ACCESS_TOKEN env var
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MANAGEMENT_TOKEN
  
  if (accessToken) {
    try {
      const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: MIGRATION_SQL }),
      })

      if (response.ok) {
        results.push('Migration executed via Management API')
        return { success: true, results }
      } else {
        const err = await response.text()
        results.push(`Management API failed: ${response.status}`)
        return { success: false, results, error: err }
      }
    } catch (e) {
      results.push(`Management API error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Fallback: Try using pg with pooler connection
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl && databaseUrl.includes('postgresql')) {
    try {
      const { Client } = await import('pg')
      
      // Convert to pooler URL if it's a direct connection
      let connectionString = databaseUrl
      if (databaseUrl.includes('db.')) {
        // Direct connection — try IPv4 pooler instead
        // Replace db.{ref}.supabase.co:5432 with aws-0-{region}.pooler.supabase.com:6543
        // Since we don't know the region, try common ones
        const regions = [
          'us-east-1', 'us-west-1', 'us-west-2',
          'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
          'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3', 'ap-south-1',
          'sa-east-1', 'me-south-1', 'af-south-1', 'ca-central-1',
        ]
        const password = databaseUrl.match(/:([^@]+)@/)?.[1]
        if (password) {
          for (const region of regions) {
            try {
              const poolerUrl = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:6543/postgres`
              const client = new Client({
                connectionString: poolerUrl,
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 5000,
                statement_timeout: 30000,
              })
              await client.connect()
              
              await client.query(MIGRATION_SQL)
              results.push(`Migration executed via pooler (${region})`)
              
              const { rows } = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'user_files' AND table_schema = 'public' ORDER BY ordinal_position`)
              results.push(`Verified: ${rows.length} columns in user_files`)
              
              await client.end()
              return { success: true, results }
            } catch (poolErr) {
              const poolMsg = poolErr instanceof Error ? poolErr.message : String(poolErr)
              results.push(`${region}: ${poolMsg.substring(0, 80)}`)
              try { await client?.end() } catch {}
              continue
            }
          }
          return { success: false, results, error: 'Could not connect via any pooler region' }
        }
      }
      
      // Try the original DATABASE_URL
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        statement_timeout: 30000,
      })
      await client.connect()
      await client.query(MIGRATION_SQL)
      results.push('Migration executed via DATABASE_URL')
      
      const { rows } = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'user_files' AND table_schema = 'public' ORDER BY ordinal_position`)
      results.push(`Verified: ${rows.length} columns in user_files`)
      
      await client.end()
      return { success: true, results }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push(`pg connection failed: ${msg}`)
      return { success: false, results, error: msg }
    }
  }

  return { success: false, results, error: 'No available method to execute migration' }
}

export async function GET() {
  try {
    const { success, results, error } = await migrateViaSupabaseRest()

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Migration completed successfully',
        results,
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Migration failed',
      details: error,
      results,
      instructions: error?.includes('SUPABASE_ACCESS_TOKEN')
        ? 'Set SUPABASE_ACCESS_TOKEN env var on Vercel, or run the SQL manually in Supabase SQL Editor. See: supabase/migrations/20260323_user_files_table.sql'
        : 'Run the migration SQL manually in your Supabase SQL Editor. See: supabase/migrations/20260323_user_files_table.sql',
    }, { status: 500 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[migrate-user-files] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
