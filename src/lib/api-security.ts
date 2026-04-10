/**
 * API Security Utilities
 * 
 * Server-side security utilities for API routes:
 * - Authentication verification
 * - CSRF validation
 * - Input sanitization
 * - Rate limiting helpers
 * - Error handling
 * 
 * @module lib/api-security
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface AuthResult {
  success: boolean
  user?: {
    id: string
    email: string
    role?: string
  }
  error?: string
  statusCode?: number
}

export interface ApiError {
  error: string
  code?: string
  details?: unknown
  requestId?: string
}

// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Require authentication for an API route
 * Returns user info on success, error response on failure
 */
export async function requireAuth(request?: NextRequest): Promise<AuthResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return {
        success: false,
        error: 'Unauthorized',
        statusCode: 401,
      }
    }
    
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email || '',
        role: user.user_metadata?.role,
      },
    }
  } catch (error) {
    logger.error('Auth verification failed', error)
    return {
      success: false,
      error: 'Authentication failed',
      statusCode: 500,
    }
  }
}

/**
 * Require authentication and return error response if not authenticated
 * Use this in API routes for cleaner code
 */
export async function requireAuthOrResponse(
  request?: NextRequest
): Promise<{ user: { id: string; email: string } } | NextResponse> {
  const authResult = await requireAuth(request)
  
  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error || 'Unauthorized' },
      { status: authResult.statusCode || 401 }
    )
  }
  
  return { user: authResult.user! }
}

// ═══════════════════════════════════════════════════════════════
// CSRF VALIDATION (SERVER-SIDE)
// ═══════════════════════════════════════════════════════════════

/**
 * Validate CSRF token using the double-submit cookie pattern.
 *
 * How it works:
 * 1. When the client first loads, the server (or client) sets a `csrf-token` cookie
 *    containing a random 64-hex-char token.
 * 2. The client reads that cookie and includes the same value in the `X-CSRF-Token`
 *    header on every state-changing request (POST, PUT, PATCH, DELETE).
 * 3. The server compares the header value against the cookie value. Because a
 *    cross-origin attacker cannot read cookies set with `SameSite=Lax` (or
 *    `SameSite=Strict`) they cannot replay the token, so mismatched values are
 *    rejected.
 *
 * @param request - The incoming Next.js request
 * @returns `{ valid: true }` if the token passes all checks, otherwise `{ valid: false, error }`
 */
export async function validateCsrfToken(
  request: NextRequest
): Promise<{ valid: boolean; error?: string }> {
  const method = request.method.toUpperCase()

  // Skip CSRF check for safe methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { valid: true }
  }

  // ── Step 1: header must be present ──────────────────────────────
  const csrfToken = request.headers.get('X-CSRF-Token')

  if (!csrfToken) {
    return { valid: false, error: 'Missing CSRF token' }
  }

  // ── Step 2: format check (cheap first-pass) ─────────────────────
  // Must be exactly 64 hexadecimal characters
  if (!/^[a-f0-9]{64}$/i.test(csrfToken)) {
    return { valid: false, error: 'Invalid CSRF token format' }
  }

  // ── Step 3: double-submit cookie comparison ─────────────────────
  // The csrf-token cookie must exist and match the header value exactly.
  // Use constant-time comparison to prevent timing attacks.
  const csrfCookie = request.cookies.get('csrf-token')?.value

  if (!csrfCookie) {
    return { valid: false, error: 'Missing CSRF cookie' }
  }

  if (!timingSafeEqual(csrfToken, csrfCookie)) {
    return { valid: false, error: 'CSRF token mismatch' }
  }

  return { valid: true }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Compares two strings of equal length without short-circuiting.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Validate CSRF or return error response
 */
export async function validateCsrfOrResponse(
  request: NextRequest
): Promise<true | NextResponse> {
  const result = await validateCsrfToken(request)
  
  if (!result.valid) {
    return NextResponse.json(
      { error: result.error || 'CSRF validation failed', code: 'CSRF_ERROR' },
      { status: 403 }
    )
  }
  
  return true
}

// ═══════════════════════════════════════════════════════════════
// INPUT VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Validate request body is valid JSON
 */
export async function parseJsonBody<T = unknown>(
  request: NextRequest
): Promise<{ data?: T; error?: NextResponse }> {
  try {
    const body = await request.json()
    return { data: body as T }
  } catch {
    return {
      error: NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_JSON' },
        { status: 400 }
      ),
    }
  }
}

/**
 * Validate Content-Type header
 */
export function validateContentType(
  request: NextRequest,
  expectedType: string = 'application/json'
): { valid: boolean; error?: NextResponse } {
  const contentType = request.headers.get('content-type')
  
  if (!contentType?.includes(expectedType)) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: `Content-Type must be ${expectedType}`, code: 'INVALID_CONTENT_TYPE' },
        { status: 415 }
      ),
    }
  }
  
  return { valid: true }
}

/**
 * Validate query parameter bounds
 */
export function validateQueryBounds(
  request: NextRequest,
  options: {
    maxLimit?: number
    defaultLimit?: number
    maxOffset?: number
  } = {}
): { limit: number; offset: number; error?: NextResponse } {
  const { maxLimit = 100, defaultLimit = 50, maxOffset = 10000 } = options
  const { searchParams } = new URL(request.url)
  
  let limit = parseInt(searchParams.get('limit') || String(defaultLimit), 10)
  let offset = parseInt(searchParams.get('offset') || '0', 10)
  
  // Validate and clamp values
  if (isNaN(limit) || limit < 1) {
    limit = defaultLimit
  } else if (limit > maxLimit) {
    limit = maxLimit
  }
  
  if (isNaN(offset) || offset < 0) {
    offset = 0
  } else if (offset > maxOffset) {
    offset = maxOffset
  }
  
  return { limit, offset }
}

// ═══════════════════════════════════════════════════════════════
// SECURITY HEADERS
// ═══════════════════════════════════════════════════════════════

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Cache-Control': 'no-store, max-age=0',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
} as const

/**
 * Apply security headers to a response
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

/**
 * Create a secure JSON response with security headers
 */
export function secureJsonResponse(
  data: unknown,
  options: { status?: number; headers?: HeadersInit } = {}
): NextResponse {
  const response = NextResponse.json(data, { 
    status: options.status || 200,
    headers: options.headers,
  })
  return applySecurityHeaders(response)
}

/**
 * Create a secure error response
 */
export function secureErrorResponse(
  message: string,
  status: number = 500,
  code?: string
): NextResponse {
  return secureJsonResponse(
    { error: message, code },
    { status }
  )
}

// ═══════════════════════════════════════════════════════════════
// USER ID VALIDATION
// ═══════════════════════════════════════════════════════════════

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validate that a string is a valid UUID
 */
export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Validate user ID matches authenticated user
 */
export function validateUserId(
  requestedUserId: string,
  authenticatedUserId: string
): { valid: boolean; error?: string } {
  // Check if IDs are valid UUIDs
  if (!isValidUuid(requestedUserId)) {
    return { valid: false, error: 'Invalid user ID format' }
  }
  
  // Check if IDs match
  if (requestedUserId !== authenticatedUserId) {
    return { valid: false, error: 'Unauthorized access' }
  }
  
  return { valid: true }
}

/**
 * Validate resource ownership
 */
export function validateResourceOwnership(
  resourceUserId: string | undefined | null,
  authenticatedUserId: string
): { valid: boolean; error?: string } {
  if (!resourceUserId) {
    return { valid: false, error: 'Resource has no owner' }
  }
  
  if (resourceUserId !== authenticatedUserId) {
    logger.warn('Resource ownership mismatch', {
      resourceUserId,
      authenticatedUserId,
    })
    return { valid: false, error: 'Unauthorized access to resource' }
  }
  
  return { valid: true }
}

// ═══════════════════════════════════════════════════════════════
// IP ADDRESS EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Get client IP address from request
 */
export function getClientIp(request: NextRequest): string {
  // Try various headers that might contain the real IP
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, use the first one
    return forwarded.split(',')[0].trim()
  }
  
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  
  // Fallback to a default
  return 'unknown'
}

// ═══════════════════════════════════════════════════════════════
// ADMIN AUTHORIZATION
// ═══════════════════════════════════════════════════════════════

/** Admin email whitelist */
const ADMIN_EMAILS = new Set([
  'admin@progresscompanion.app',
  'anisbk00@gmail.com',
  // Add more admin emails as needed
])

/**
 * Check if user is an admin
 */
export function isAdmin(email: string | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.has(email.toLowerCase())
}

/**
 * Require admin role or return error response
 */
export async function requireAdminOrResponse(
  request?: NextRequest
): Promise<{ user: { id: string; email: string } } | NextResponse> {
  const authResult = await requireAuth(request)
  
  if (!authResult.success) {
    return NextResponse.json(
      { error: authResult.error || 'Unauthorized' },
      { status: authResult.statusCode || 401 }
    )
  }
  
  if (!isAdmin(authResult.user?.email)) {
    return NextResponse.json(
      { error: 'Admin access required', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }
  
  return { user: authResult.user! }
}

// ═══════════════════════════════════════════════════════════════
// AI ERROR SANITIZATION (P1 FIX)
// ═══════════════════════════════════════════════════════════════

/**
 * Sensitive patterns that should never be exposed to clients
 */
const SENSITIVE_ERROR_PATTERNS = [
  /ENOTFOUND/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /connect\s+/i,
  /database/i,
  /supabase/i,
  /postgres/i,
  /credential/i,
  /password/i,
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /internal\s+server/i,
]

/**
 * Sanitize error message for client response
 * Prevents leaking internal system details
 */
export function sanitizeErrorForClient(
  error: unknown,
  defaultMessage: string = 'An error occurred'
): string {
  if (!(error instanceof Error)) {
    return defaultMessage
  }
  
  const message = error.message
  
  // Check if error contains sensitive information
  for (const pattern of SENSITIVE_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return defaultMessage
    }
  }
  
  // If timeout error, provide specific message
  if (message.includes('timed out')) {
    return 'Request timed out. Please try again.'
  }
  
  // If rate limit error, preserve it
  if (message.toLowerCase().includes('rate limit')) {
    return 'Rate limit exceeded. Please wait before trying again.'
  }
  
  // For other errors, return the message if it looks safe
  if (message.length < 200 && !message.includes('/') && !message.includes('\\')) {
    return message
  }
  
  return defaultMessage
}

/**
 * Create a sanitized AI error response
 */
export function aiErrorResponse(
  error: unknown,
  operation: string,
  status: number = 500
): NextResponse {
  const sanitizedMessage = sanitizeErrorForClient(
    error,
    `Failed to ${operation}`
  )
  
  // Log full error internally
  logger.error(`AI ${operation} error`, error)
  
  return secureJsonResponse(
    { error: sanitizedMessage },
    { status }
  )
}
