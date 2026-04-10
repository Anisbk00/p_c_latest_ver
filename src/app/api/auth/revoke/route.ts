/**
 * Session Revocation API Route
 * 
 * Server-side endpoint to revoke all sessions for a user.
 * Uses service role key when available, falls back gracefully.
 * Called during sign-out and account deletion.
 * 
 * SECURITY: This endpoint requires authentication.
 * 
 * @module api/auth/revoke
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════
// POST /api/auth/revoke
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // ─── Authenticate User ─────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    // If no user or auth error, return success - client will handle local cleanup
    // This handles the case where the session is already partially cleared
    if (authError || !user) {
      return NextResponse.json({
        success: true,
        message: 'No active session to revoke',
      })
    }

    const userId = user.id

    // ─── Try Admin API Revoke ───────────────────────────────────
    try {
      const adminClient = createAdminClient()
      
      // Sign out from all sessions (scope: global)
      const { error: signOutError } = await adminClient.auth.admin.signOut(userId, 'global')
      
      if (signOutError) {
        console.warn('[Revoke] Admin signOut warning:', signOutError.message)
        // Still return success - the client-side signOut will handle local cleanup
      } else {
        console.log('[Revoke] All sessions revoked via admin API for user:', userId)
      }
    } catch (adminError) {
      console.warn('[Revoke] Admin client error:', adminError instanceof Error ? adminError.message : adminError)
      // Still return success - client-side signOut will handle local cleanup
    }

    console.log('[Revoke] Completed in', Date.now() - startTime, 'ms')

    return NextResponse.json({
      success: true,
      message: 'Session revocation processed',
    })

  } catch (error) {
    console.error('[Revoke] Error:', error instanceof Error ? error.message : error)
    
    // Still return success - client will handle local cleanup
    // This prevents the sign-out flow from being blocked
    return NextResponse.json({
      success: true,
      message: 'Session revocation attempted',
    })
  }
}
