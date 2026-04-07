/**
 * Supabase Sign Out API Route
 * 
 * Handles user logout with Supabase authentication.
 * Clears session and invalidates tokens.
 * 
 * @module api/auth/signout
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  getOrCreateRequestId,
  getRequestIdHeaders,
  createRequestContext,
  withRequestId,
} from '@/lib/request-id'
import { logger } from '@/lib/logger'

// ═══════════════════════════════════════════════════════════════
// POST /api/auth/signout
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)
  
  return withRequestId(requestId, async () => {
    const startTime = Date.now()
    
    try {
      // ─── Create Supabase Client ──────────────────────────────────
      const supabase = await createClient()

      // ─── Get current user for logging ─────────────────────────────
      const { data: { user } } = await supabase.auth.getUser()

      // ─── Sign Out with Supabase ───────────────────────────────────
      const { error } = await supabase.auth.signOut()

      if (error) {
        logger.warn('Supabase sign out error', {
          requestId,
          context: { 
            userId: user?.id,
            errorCode: error.status,
            errorMessage: error.message,
          },
        })

        return NextResponse.json(
          { error: error.message || 'Failed to sign out', requestId },
          { 
            status: error.status || 500,
            headers: getRequestIdHeaders(requestId),
          }
        )
      }

      // ─── Log Success ───────────────────────────────────────────
      logger.auth('signout_success', {
        userId: user?.id,
        email: user?.email,
        success: true,
      })
      
      logger.performance('signout', Date.now() - startTime)

      // ─── Return Success ───────────────────────────────────────────
      return NextResponse.json({
        success: true,
        message: 'Signed out successfully',
        requestId,
      }, {
        headers: getRequestIdHeaders(requestId),
      })

    } catch (error) {
      logger.error('Sign out error', error, {
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
// GET /api/auth/signout (for redirect-based logout)
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers)
  const requestContext = createRequestContext(requestId, request)
  
  return withRequestId(requestId, async () => {
    const startTime = Date.now()
    
    try {
      // ─── Create Supabase Client ──────────────────────────────────
      const supabase = await createClient()

      // ─── Get current user for logging ─────────────────────────────
      const { data: { user } } = await supabase.auth.getUser()

      // ─── Sign Out with Supabase ───────────────────────────────────
      await supabase.auth.signOut()

      // ─── Log Success ───────────────────────────────────────────
      logger.auth('signout_success', {
        userId: user?.id,
        email: user?.email,
        success: true,
      })
      
      logger.performance('signout', Date.now() - startTime)

      // ─── Redirect to home page ───────────────────────────────────
      const redirectUrl = new URL('/', request.url)
      return NextResponse.redirect(redirectUrl)

    } catch (error) {
      logger.error('Sign out error', error, {
        requestId,
        context: { duration: Date.now() - startTime },
      })
      
      // Still redirect on error
      const redirectUrl = new URL('/', request.url)
      return NextResponse.redirect(redirectUrl)
    }
  })
}
