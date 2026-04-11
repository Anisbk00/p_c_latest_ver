/**
 * Auth Callback — Supabase-native
 *
 * POST /api/auth/callback — exchanges email confirmation code for session
 * and lazy-creates the profile row if it doesn't exist yet.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {

    // Strict Zod validation
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { AuthCallbackSchema } = await import('@/lib/validation')
    const parseResult = AuthCallbackSchema.safeParse(body)
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
    const { code } = body

    const supabase = await createServerClient()

    // SECURITY FIX (VULN-002): Invalidate any existing session first to prevent session fixation
    // This ensures old session cookies cannot persist after OAuth callback
    try {
      await supabase.auth.signOut()
    } catch {
      // Ignore errors - user may not have had a session
    }

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[auth/callback] code exchange error:', error.message)
      return NextResponse.json({ error: error.message || 'Failed to verify email' }, { status: 400 })
    }

    // Lazy-create profile row if this is a new user
    if (data.user) {
      const { data: existing } = await supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle()

      if (!existing) {
        // Use admin client to bypass RLS for initial row creation
        try {
          const admin = createAdminClient()
          // Parallelize all three inserts for faster new-user setup
          // Use upsert for all three tables to handle the race condition where
          // the auth callback is invoked twice in quick succession.
          await Promise.all([
            admin.from('profiles').upsert({
              id: data.user.id,
              email: data.user.email ?? '',
              name: (data.user.user_metadata?.name ?? data.user.user_metadata?.full_name ?? null) as string | null,
              timezone: 'UTC',
              locale: 'en',
              coaching_tone: 'encouraging',
              privacy_mode: false,
            }, { onConflict: 'id' }) as unknown as Promise<any>,
            admin.from('user_settings').upsert({ user_id: data.user.id }, { onConflict: 'user_id' }) as unknown as Promise<any>,
            admin.from('user_profiles').upsert({ user_id: data.user.id }, { onConflict: 'user_id' }) as unknown as Promise<any>,
          ])
        } catch (adminErr) {
          // Fall back to anon client — only works if RLS allows own-user insert
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email ?? '',
            name: (data.user.user_metadata?.name ?? null),
          }, { onConflict: 'id' } as any)
          void adminErr
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: data.user ? {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name ?? null,
      } : null,
    })
  } catch (err) {
    console.error('[auth/callback]', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
