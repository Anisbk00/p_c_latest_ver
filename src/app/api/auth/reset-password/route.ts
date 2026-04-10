/**
 * Supabase Password Reset API Route
 * 
 * Handles password reset requests with Supabase authentication.
 * Sends password reset email to user.
 * 
 * @module api/auth/reset-password
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  checkRateLimit,
  getRateLimitHeaders,
  createRateLimitKey,
  RATE_LIMITS,
} from '@/lib/rate-limit'
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

// ═══════════════════════════════════════════════════════════════
// POST /api/auth/reset-password
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)
  
  return withRequestId(requestId, async () => {
    const startTime = Date.now()
    
    try {
      // ─── Rate Limiting ─────────────────────────────────────────
      const rateLimitKey = createRateLimitKey(request)
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.PASSWORD_RESET)
      
      if (!rateLimitResult.success) {
        logger.warn('Password reset rate limit exceeded', {
          requestId,
          context: { ip: requestContext.ip },
        })
        
        return NextResponse.json(
          { 
            error: RATE_LIMITS.PASSWORD_RESET.message,
            requestId,
            retryAfter: rateLimitResult.retryAfter,
          },
          { 
            status: 429,
            headers: {
              ...getRateLimitHeaders(rateLimitResult),
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
      const { AuthResetPasswordSchema } = await import('@/lib/validation')
      const parseResult = AuthResetPasswordSchema.safeParse(body)
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
      const { email } = body

      // ─── Create Supabase Client ──────────────────────────────────
      const supabase = await createClient()

      // ─── Request Password Reset ───────────────────────────────────
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.toLowerCase().trim(),
        {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL}/auth/reset-password/confirm`,
        }
      )

      if (error) {
        logger.warn('Password reset request error', {
          requestId,
          context: { 
            email: email.toLowerCase(),
            errorCode: error.status,
            errorMessage: error.message,
          },
        })

        // Don't reveal if email exists or not for security
        // Always return success message
      }

      // ─── Log Success ───────────────────────────────────────────
      logger.auth('password_reset_requested', {
        email: email.toLowerCase(),
        success: true,
      })
      
      logger.performance('password_reset_request', Date.now() - startTime)

      // ─── Return Success (always success for security) ────────────
      return NextResponse.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link shortly.',
        requestId,
      }, {
        headers: {
          ...getRateLimitHeaders(rateLimitResult),
          ...getRequestIdHeaders(requestId),
        },
      })

    } catch (error) {
      logger.error('Password reset request error', error, {
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

// ═══════════════════════════════════════════════════════════════
// PUT /api/auth/reset-password
// Updates password with token from reset email
// ═══════════════════════════════════════════════════════════════

export async function PUT(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)
  
  return withRequestId(requestId, async () => {
    const startTime = Date.now()
    
    try {
      const body = await request.json()
      const { password, token } = body

      // ─── Validate Input ─────────────────────────────────────────
      
      if (!password) {
        return NextResponse.json(
          { error: 'New password is required', requestId },
          { 
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      const passwordValidation = validatePassword(password)
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { error: passwordValidation.errors[0], requestId },
          { 
            status: 400,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Create Supabase Client ──────────────────────────────────
      const supabase = await createClient()

      // If token provided, verify it first (for recovery flow)
      if (token) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'recovery',
        })

        if (verifyError) {
          logger.warn('Password reset token verification error', {
            requestId,
            context: { 
              errorCode: verifyError.status,
              errorMessage: verifyError.message,
            },
          })

          return NextResponse.json(
            { 
              error: 'Invalid or expired reset link. Please request a new one.',
              requestId,
            },
            { 
              status: 400,
              headers: getRequestIdHeaders(requestId),
            }
          )
        }
      }

      // ─── Update Password ─────────────────────────────────────────
      const { data, error } = await supabase.auth.updateUser({
        password,
      })

      if (error) {
        logger.warn('Password update error', {
          requestId,
          context: { 
            errorCode: error.status,
            errorMessage: error.message,
          },
        })

        if (error.message.includes('same password')) {
          return NextResponse.json(
            { error: 'New password cannot be the same as your current password', requestId },
            { 
              status: 400,
              headers: getRequestIdHeaders(requestId),
            }
          )
        }

        return NextResponse.json(
          { error: error.message || 'Failed to update password', requestId },
          { 
            status: error.status || 500,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Log Success ───────────────────────────────────────────
      logger.auth('password_updated', {
        userId: data.user?.id,
        success: true,
      })
      
      logger.performance('password_update', Date.now() - startTime)

      // ─── Return Success ───────────────────────────────────────────
      return NextResponse.json({
        success: true,
        message: 'Password updated successfully',
        requestId,
        user: data.user ? {
          id: data.user.id,
          email: data.user.email,
        } : null,
      }, {
        headers: getRequestIdHeaders(requestId),
      })

    } catch (error) {
      logger.error('Password update error', error, {
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
