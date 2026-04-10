/**
 * Supabase Session API Route
 * 
 * Gets the current session and user information.
 * Returns session data if authenticated, null otherwise.
 * 
 * @module api/auth/session
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { 
  checkRateLimit, 
  getRateLimitHeaders, 
  getClientIp,
  RATE_LIMITS 
} from '@/lib/rate-limit'

// ═══════════════════════════════════════════════════════════════
// Helper: Generate Request ID
// ═══════════════════════════════════════════════════════════════

function getRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

function getRequestIdHeaders(requestId: string): Record<string, string> {
  return { 'X-Request-Id': requestId }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/auth/session
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const requestId = getRequestId()
  const startTime = Date.now()
  
  // ─── Rate Limiting ───────────────────────────────────────────
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(clientIp, RATE_LIMITS.API_STANDARD)
  
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        success: false,
        error: RATE_LIMITS.API_STANDARD.message,
        requestId,
      },
      { 
        status: 429,
        headers: {
          ...getRequestIdHeaders(requestId),
          ...getRateLimitHeaders(rateLimitResult),
        },
      }
    )
  }
  
  try {
    // ─── Create Supabase Client ──────────────────────────────────
    const supabase = await createClient()

    // ─── Get Session ───────────────────────────────────────────
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      logger.warn('Session retrieval error', {
        requestId,
        context: { 
          errorMessage: sessionError.message,
        },
      })
    }

    // ─── Get User ───────────────────────────────────────────
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError) {
      logger.debug('User retrieval error (likely not authenticated)', {
        requestId,
        context: { 
          errorMessage: userError.message,
        },
      })
    }

    // ─── Return Session Data ───────────────────────────────────
    if (!session || !user) {
      return NextResponse.json({
        success: true,
        session: null,
        user: null,
        authenticated: false,
        requestId,
      }, {
        headers: getRequestIdHeaders(requestId),
      })
    }

    // SECURITY: Never expose access tokens in API responses
    // Tokens are automatically managed via HTTP-only cookies by Supabase
    return NextResponse.json({
      success: true,
      authenticated: true,
      requestId,
      session: {
        // Only expose non-sensitive session metadata
        expires_at: session.expires_at,
        expires_in: session.expires_in,
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        email_confirmed_at: user.email_confirmed_at,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      },
    }, {
      headers: getRequestIdHeaders(requestId),
    })

  } catch (error) {
    logger.error('Session retrieval error', error, {
      requestId,
      context: { duration: Date.now() - startTime },
    })
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to retrieve session', 
        requestId,
        session: null,
        user: null,
        authenticated: false,
      },
      { 
        status: 500,
        headers: getRequestIdHeaders(requestId),
      }
    )
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/auth/session (refresh session)
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const requestId = getRequestId()
  const startTime = Date.now()
  
  // ─── Rate Limiting (stricter for refresh) ───────────────────────────
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(clientIp, RATE_LIMITS.AUTH_STRICT)
  
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        success: false,
        error: RATE_LIMITS.AUTH_STRICT.message,
        requestId,
      },
      { 
        status: 429,
        headers: {
          ...getRequestIdHeaders(requestId),
          ...getRateLimitHeaders(rateLimitResult),
        },
      }
    )
  }
  
  try {
    // ─── Create Supabase Client ──────────────────────────────────
    const supabase = await createClient()

    // ─── Refresh Session ─────────────────────────────────────────
    const { data: { session }, error } = await supabase.auth.refreshSession()

    if (error) {
      logger.warn('Session refresh error', {
        requestId,
        context: { 
          errorMessage: error.message,
        },
      })

      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to refresh session', 
          requestId,
        },
        { 
          status: 401,
          headers: getRequestIdHeaders(requestId),
        }
      )
    }

    if (!session) {
      return NextResponse.json({
        success: true,
        session: null,
        user: null,
        authenticated: false,
        message: 'No active session to refresh',
        requestId,
      }, {
        headers: getRequestIdHeaders(requestId),
      })
    }

    // ─── Get updated user ───────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()

    // SECURITY: Never expose access tokens in API responses
    // Tokens are automatically managed via HTTP-only cookies by Supabase
    return NextResponse.json({
      success: true,
      authenticated: true,
      message: 'Session refreshed successfully',
      requestId,
      session: {
        // Only expose non-sensitive session metadata
        expires_at: session.expires_at,
        expires_in: session.expires_in,
      },
      user: user ? {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      } : null,
    }, {
      headers: getRequestIdHeaders(requestId),
    })

  } catch (error) {
    logger.error('Session refresh error', error, {
      requestId,
      context: { duration: Date.now() - startTime },
    })
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to refresh session', 
        requestId,
      },
      { 
        status: 500,
        headers: getRequestIdHeaders(requestId),
      }
    )
  }
}
