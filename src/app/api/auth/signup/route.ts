/**
 * Supabase Sign Up API Route
 * 
 * Handles user registration with Supabase authentication.
 * Creates a new user account and sets session cookies.
 * 
 * Security Features:
 * - Distributed rate limiting (persists across restarts)
 * - Strong password validation
 * 
 * @module api/auth/signup
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  checkDistributedRateLimit,
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

function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  
  return { valid: errors.length === 0, errors }
}

function validateName(name: string): boolean {
  return name.trim().length >= 2 && name.trim().length <= 100
}

// ═══════════════════════════════════════════════════════════════
// POST /api/auth/signup
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)
  const ip = getClientIp(request)
  
  return withRequestId(requestId, async () => {
    const startTime = Date.now()
    
    try {
      // ─── Distributed Rate Limiting ─────────────────────────────────────────
      const rateLimitResult = await checkDistributedRateLimit(ip, DISTRIBUTED_RATE_LIMITS.REGISTRATION)
      
      if (!rateLimitResult.success) {
        logger.warn('Sign up rate limit exceeded', {
          requestId,
          context: { ip: requestContext.ip, blocked: rateLimitResult.blocked },
        })
        
        return NextResponse.json(
          { 
            error: DISTRIBUTED_RATE_LIMITS.REGISTRATION.message,
            requestId,
            code: 'RATE_LIMITED',
            retryAfter: rateLimitResult.retryAfter,
          },
          { 
            status: 429,
            headers: {
              ...getDistributedRateLimitHeaders(rateLimitResult, DISTRIBUTED_RATE_LIMITS.REGISTRATION),
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
      const { AuthSignupSchema } = await import('@/lib/validation')
      const parseResult = AuthSignupSchema.safeParse(body)
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
      const { email, password, name } = body

      // SECURITY FIX (VULN-010): Enforce server-side password validation
      // Client-side validation can be bypassed, so we must validate on the server
      const passwordValidation = validatePassword(password)
      if (!passwordValidation.valid) {
        logger.warn('Sign up failed: weak password', {
          requestId,
          context: { ip: requestContext.ip },
        })
        return NextResponse.json(
          { error: passwordValidation.errors.join('. '), requestId },
          { status: 400, headers: getRequestIdHeaders(requestId) }
        )
      }

      // ─── Create Supabase Client ──────────────────────────────────
      const supabase = await createClient()

      // ─── Sign Up with Supabase ───────────────────────────────────
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          data: {
            name: name?.trim() || null,
          },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL}/auth/callback`,
        },
      })

      if (error) {
        logger.warn('Supabase sign up error', {
          requestId,
          context: { 
            email: email.toLowerCase(),
            errorCode: error.status,
            errorMessage: error.message,
          },
        })

        // Handle specific Supabase errors
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          return NextResponse.json(
            { error: 'An account with this email already exists. Please sign in instead.', requestId },
            { 
              status: 409,
              headers: getRequestIdHeaders(requestId),
            }
          )
        }

        if (error.message.includes('weak password') || error.message.includes('password')) {
          return NextResponse.json(
            { error: 'Password does not meet security requirements', requestId },
            { 
              status: 400,
              headers: getRequestIdHeaders(requestId),
            }
          )
        }

        return NextResponse.json(
          { error: error.message || 'Failed to create account', requestId },
          { 
            status: error.status || 500,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Log Success ───────────────────────────────────────────
      logger.auth('signup_success', {
        userId: data.user?.id,
        email: email.toLowerCase(),
        success: true,
      })
      
      logger.performance('signup', Date.now() - startTime)

      // ─── Return Success ───────────────────────────────────────────
      // SECURITY: Never expose tokens in API responses
      // Session is automatically managed via HTTP-only cookies by Supabase
      return NextResponse.json({
        success: true,
        message: data.session 
          ? 'Account created successfully' 
          : 'Account created! Please check your email to verify your account.',
        requestId,
        user: data.user ? {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || null,
        } : null,
        session: data.session ? {
          // Only expose non-sensitive session metadata
          expires_at: data.session.expires_at,
        } : null,
      }, {
        headers: {
          ...getDistributedRateLimitHeaders(rateLimitResult, DISTRIBUTED_RATE_LIMITS.REGISTRATION),
          ...getRequestIdHeaders(requestId),
        },
      })

    } catch (error) {
      logger.error('Sign up error', error, {
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
