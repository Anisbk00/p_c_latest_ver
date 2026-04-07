/**
 * Supabase Sign In API Route
 * 
 * Handles user login with Supabase authentication.
 * Authenticates user and sets session cookies.
 * 
 * Security Features:
 * - Distributed rate limiting (persists across restarts)
 * - Failed attempt tracking with lockout
 * 
 * @module api/auth/signin
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  checkDistributedRateLimit,
  recordDistributedFailedAttempt,
  resetDistributedFailedAttempts,
  getDistributedRateLimitHeaders,
  getClientIp,
  DISTRIBUTED_RATE_LIMITS,
} from '@/lib/distributed-rate-limit'
import {
  getOrCreateRequestId,
  getRequestIdHeaders,
  createRequestContext,
  withRequestId,
} from '@/lib/request-id'
import { logger } from '@/lib/logger'

// ═══════════════════════════════════════════════════════════════
// Validation Helpers
// ═══════════════════════════════════════════════════════════════

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// ═══════════════════════════════════════════════════════════════
// POST /api/auth/signin
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)
  const ip = getClientIp(request)
  
  return withRequestId(requestId, async () => {
    const startTime = Date.now()
    
    try {
      // ─── Distributed Rate Limiting ─────────────────────────────────────────
      const rateLimitResult = await checkDistributedRateLimit(ip, DISTRIBUTED_RATE_LIMITS.AUTH_STRICT)
      
      if (!rateLimitResult.success) {
        logger.warn('Sign in rate limit exceeded', {
          requestId,
          context: { ip: requestContext.ip, blocked: rateLimitResult.blocked, lockout: rateLimitResult.lockout },
        })
        
        return NextResponse.json(
          { 
            error: rateLimitResult.lockout 
              ? `Account temporarily locked. Please try again in ${Math.ceil(rateLimitResult.retryAfter / 60000)} minutes.`
              : DISTRIBUTED_RATE_LIMITS.AUTH_STRICT.message,
            requestId,
            code: rateLimitResult.lockout ? 'LOCKOUT' : 'RATE_LIMITED',
            retryAfter: rateLimitResult.retryAfter,
          },
          { 
            status: 429,
            headers: {
              ...getDistributedRateLimitHeaders(rateLimitResult, DISTRIBUTED_RATE_LIMITS.AUTH_STRICT),
              ...getRequestIdHeaders(requestId),
            },
          }
        )
      }
      

      // Strict Zod validation
      let body: any
      try {
        body = await request.json()
      } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON body', requestId }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      const { AuthSigninSchema } = await import('@/lib/validation')
      const parseResult = AuthSigninSchema.safeParse(body)
      if (!parseResult.success) {
        return NextResponse.json({
          error: 'Invalid input',
          details: parseResult.error.flatten(),
          requestId
        }, { status: 400, headers: getRequestIdHeaders(requestId) })
      }
      body = parseResult.data
      // Extra: sanitize all strings (trim)
      for (const k of Object.keys(body)) {
        if (typeof body[k] === 'string') body[k] = body[k].trim()
      }
      const { email, password } = body

      // ─── Create Supabase Client ──────────────────────────────────
      const supabase = await createClient()

      // ─── Sign In with Supabase ───────────────────────────────────
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      })

      if (error) {
        // Record failed attempt for lockout tracking
        const failedResult = await recordDistributedFailedAttempt(ip, DISTRIBUTED_RATE_LIMITS.AUTH_STRICT)
        
        logger.warn('Supabase sign in error', {
          requestId,
          context: { 
            email: email.toLowerCase(),
            errorCode: error.status,
            errorMessage: error.message,
            failedAttemptsRemaining: failedResult.remaining,
          },
        })

        // Handle specific Supabase errors
        if (error.message.includes('Invalid login credentials') || 
            error.message.includes('invalid_credentials')) {
          return NextResponse.json(
            { 
              error: failedResult.lockout 
                ? 'Too many failed attempts. Account temporarily locked.'
                : `Invalid email or password. ${failedResult.remaining} attempts remaining.`,
              requestId,
              remainingAttempts: failedResult.remaining,
            },
            { 
              status: 401,
              headers: getRequestIdHeaders(requestId),
            }
          )
        }

        if (error.message.includes('Email not confirmed') || 
            error.message.includes('email_not_confirmed')) {
          return NextResponse.json(
            { 
              error: 'Please verify your email before signing in. Check your inbox for the verification link.',
              requestId,
              needsVerification: true,
            },
            { 
              status: 403,
              headers: getRequestIdHeaders(requestId),
            }
          )
        }

        if (error.message.includes('too many requests') || 
            error.message.includes('over_request_rate_limit')) {
          return NextResponse.json(
            { error: 'Too many login attempts. Please wait a moment and try again.', requestId },
            { 
              status: 429,
              headers: getRequestIdHeaders(requestId),
            }
          )
        }

        return NextResponse.json(
          { error: error.message || 'Failed to sign in', requestId },
          { 
            status: error.status || 500,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Reset failed attempts on success ─────────────────────────────────
      await resetDistributedFailedAttempts(ip, DISTRIBUTED_RATE_LIMITS.AUTH_STRICT)

      // ─── Log Success ───────────────────────────────────────────
      logger.auth('signin_success', {
        userId: data.user?.id,
        email: email.toLowerCase(),
        success: true,
      })
      
      logger.performance('signin', Date.now() - startTime)

      // ─── Return Success ───────────────────────────────────────────
      // SECURITY: Never expose tokens in API responses
      // Session is automatically managed via HTTP-only cookies by Supabase
      return NextResponse.json({
        success: true,
        message: 'Signed in successfully',
        requestId,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || null,
          avatar_url: data.user.user_metadata?.avatar_url || null,
        },
        session: {
          // Only expose non-sensitive session metadata
          expires_at: data.session.expires_at,
        },
      }, {
        headers: {
          ...getDistributedRateLimitHeaders(rateLimitResult, DISTRIBUTED_RATE_LIMITS.AUTH_STRICT),
          ...getRequestIdHeaders(requestId),
        },
      })

    } catch (error) {
      logger.error('Sign in error', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })
      
      return NextResponse.json(
        { error: 'An unexpected error occurred. Please try again.', requestId },
        { 
          status: 500,
          headers: getRequestIdHeaders(requestId),
        }
      )
    }
  })
}
