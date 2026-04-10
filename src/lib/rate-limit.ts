/**
 * Rate Limiting Library
 * 
 * Provides IP-based rate limiting for API endpoints.
 * Uses in-memory store for rate limit tracking.
 * 
 * SECURITY: Critical for preventing brute force attacks on auth endpoints.
 * 
 * @module lib/rate-limit
 */

import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface RateLimitStore {
  count: number
  resetAt: number
  blocked: boolean
  failedAttempts: number // Track failed auth attempts for lockout
}

interface RateLimitConfig {
  windowMs?: number       // Time window for rate limiting
  maxRequests?: number    // Max requests per window
  blockDurationMs?: number // Duration of block after exceeding limit
  maxFailedAttempts?: number // Max failed auth attempts before lockout
  lockoutDurationMs?: number // Duration of lockout after failed attempts
  message?: string       // Custom error message
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  retryAfter: number
  blocked: boolean
  lockout: boolean
}

// ═══════════════════════════════════════════════════════════════
// Global Store
// ═══════════════════════════════════════════════════════════════

// Global rate limit store - persists across requests in same process
declare global {
  var __RATE_LIMIT_STORE__: Map<string, RateLimitStore> | undefined
}

function getStore(): Map<string, RateLimitStore> {
  if (!global.__RATE_LIMIT_STORE__) {
    global.__RATE_LIMIT_STORE__ = new Map()
  }
  return global.__RATE_LIMIT_STORE__
}

// ═══════════════════════════════════════════════════════════════
// Default Configuration
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: Required<RateLimitConfig> = {
  windowMs: 60 * 1000,           // 1 minute
  maxRequests: 20,               // 20 requests per minute (generous for legitimate use)
  blockDurationMs: 5 * 60 * 1000, // 5 minutes block
  maxFailedAttempts: 5,          // 5 failed attempts before lockout
  lockoutDurationMs: 15 * 60 * 1000, // 15 minutes lockout
  message: 'Too many requests. Please try again later.',
}

// ═══════════════════════════════════════════════════════════════
// Rate Limit Presets
// ═══════════════════════════════════════════════════════════════

export const RATE_LIMITS = {
  // Strict rate limiting for auth endpoints
  AUTH_STRICT: {
    windowMs: 60 * 1000,           // 1 minute
    maxRequests: 10,              // 10 attempts per minute
    blockDurationMs: 10 * 60 * 1000, // 10 minutes block
    maxFailedAttempts: 5,         // 5 failed attempts
    lockoutDurationMs: 30 * 60 * 1000, // 30 minutes lockout
    message: 'Too many login attempts. Please try again later.',
  },
  // Standard rate limiting for API routes
  API_STANDARD: {
    windowMs: 60 * 1000,           // 1 minute
    maxRequests: 60,              // 60 requests per minute
    blockDurationMs: 5 * 60 * 1000, // 5 minutes block
    maxFailedAttempts: 10,
    lockoutDurationMs: 15 * 60 * 1000,
    message: 'Too many requests. Please slow down.',
  },
  // Relaxed rate limiting for read operations
  READ_RELAXED: {
    windowMs: 60 * 1000,          // 1 minute
    maxRequests: 100,            // 100 requests per minute
    blockDurationMs: 2 * 60 * 1000, // 2 minutes block
    maxFailedAttempts: 20,
    lockoutDurationMs: 5 * 60 * 1000,
    message: 'Too many requests.',
  },
  // API read operations (user, targets, etc.) - generous for legitimate use
  API_READ: {
    windowMs: 60 * 1000,          // 1 minute
    maxRequests: 120,            // 120 requests per minute (accounts for StrictMode double-renders)
    blockDurationMs: 30 * 1000,  // 30 seconds block (short)
    maxFailedAttempts: 30,
    lockoutDurationMs: 2 * 60 * 1000, // 2 minutes lockout
    message: 'Too many requests. Please wait a moment.',
  },
  // AI endpoints - prevent abuse and cost overruns
  AI_STANDARD: {
    windowMs: 60 * 1000,          // 1 minute
    maxRequests: 30,             // 30 AI requests per minute
    blockDurationMs: 5 * 60 * 1000, // 5 minutes block
    maxFailedAttempts: 10,
    lockoutDurationMs: 15 * 60 * 1000,
    message: 'Too many AI requests. Please wait before continuing.',
  },
  // AI streaming endpoints - more generous for long responses
  AI_STREAMING: {
    windowMs: 60 * 1000,          // 1 minute
    maxRequests: 20,             // 20 streaming requests per minute
    blockDurationMs: 3 * 60 * 1000, // 3 minutes block
    maxFailedAttempts: 5,
    lockoutDurationMs: 10 * 60 * 1000,
    message: 'Too many streaming requests. Please wait.',
  },
} as const

// ═══════════════════════════════════════════════════════════════
// Rate Limit Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Check rate limit for an identifier (usually IP address)
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = {}
): RateLimitResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const store = getStore()
  const now = Date.now()
  const record = store.get(identifier)
  
  // Check if currently in lockout
  if (record?.blocked) {
    if (now < record.resetAt) {
      return {
        success: false,
        remaining: 0,
        resetAt: record.resetAt,
        retryAfter: record.resetAt - now,
        blocked: true,
        lockout: record.failedAttempts >= cfg.maxFailedAttempts,
      }
    }
    // Block/lockout expired, reset
    store.delete(identifier)
  }
  
  // Check if in current window
  if (record && now < record.resetAt) {
    // Check if exceeded rate limit
    if (record.count >= cfg.maxRequests) {
      // Block the IP
      const blockUntil = now + cfg.blockDurationMs
      store.set(identifier, {
        count: record.count + 1,
        resetAt: blockUntil,
        blocked: true,
        failedAttempts: record.failedAttempts,
      })
      return {
        success: false,
        remaining: 0,
        resetAt: blockUntil,
        retryAfter: cfg.blockDurationMs,
        blocked: true,
        lockout: false,
      }
    }
    
    // Increment counter
    record.count++
    return {
      success: true,
      remaining: cfg.maxRequests - record.count,
      resetAt: record.resetAt,
      retryAfter: 0,
      blocked: false,
      lockout: false,
    }
  }
  
  // New window
  const resetAt = now + cfg.windowMs
  store.set(identifier, {
    count: 1,
    resetAt,
    blocked: false,
    failedAttempts: 0,
  })
  return {
    success: true,
    remaining: cfg.maxRequests - 1,
    resetAt,
    retryAfter: 0,
    blocked: false,
    lockout: false,
  }
}

/**
 * Record a failed auth attempt (for lockout tracking)
 */
export function recordFailedAttempt(
  identifier: string,
  config: RateLimitConfig = {}
): { lockout: boolean; remaining: number; lockoutUntil: number } {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const store = getStore()
  const now = Date.now()
  const record = store.get(identifier)
  
  const failedAttempts = (record?.failedAttempts || 0) + 1
  const remaining = Math.max(0, cfg.maxFailedAttempts - failedAttempts)
  
  if (failedAttempts >= cfg.maxFailedAttempts) {
    // Lockout!
    const lockoutUntil = now + cfg.lockoutDurationMs
    store.set(identifier, {
      count: record?.count || 0,
      resetAt: lockoutUntil,
      blocked: true,
      failedAttempts,
    })
    return { lockout: true, remaining: 0, lockoutUntil }
  }
  
  // Update failed attempts
  store.set(identifier, {
    count: record?.count || 0,
    resetAt: record?.resetAt || (now + cfg.windowMs),
    blocked: false,
    failedAttempts,
  })
  
  return { lockout: false, remaining, lockoutUntil: 0 }
}

/**
 * Reset failed attempts after successful auth
 */
export function resetFailedAttempts(identifier: string): void {
  const store = getStore()
  const record = store.get(identifier)
  if (record) {
    record.failedAttempts = 0
    record.blocked = false
  }
}

/**
 * Clear rate limit for an identifier (for testing)
 */
export function clearRateLimit(identifier: string): void {
  const store = getStore()
  store.delete(identifier)
}

/**
 * Clear all rate limits (for testing)
 */
export function clearAllRateLimits(): void {
  const store = getStore()
  store.clear()
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions for API Routes
// ═══════════════════════════════════════════════════════════════

/**
 * Get client IP from request headers
 */
export function getClientIp(request: NextRequest): string {
  try {
    const headers = request?.headers;
    if (!headers || typeof headers.get !== 'function') {
      return 'unknown';
    }
    // Check various headers for real IP
    const forwarded = headers.get('x-forwarded-for')
    if (forwarded) {
      // x-forwarded-for can be comma-separated, take first
      return forwarded.split(',')[0].trim()
    }
    
    const realIp = headers.get('x-real-ip')
    if (realIp) {
      return realIp
    }
  } catch {
    // Fallback if any error occurs
  }
  
  // Fallback
  return 'unknown'
}

/**
 * Create a rate limit key from request (IP-based)
 */
export function createRateLimitKey(request: NextRequest, prefix: string = 'auth'): string {
  const ip = getClientIp(request)
  return `${prefix}:${ip}`
}

/**
 * Create rate limit headers for response
 */
export function getRateLimitHeaders(
  result: RateLimitResult,
  config: RateLimitConfig = {}
): Record<string, string> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  return {
    'X-RateLimit-Limit': cfg.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
    'X-RateLimit-Blocked': result.blocked.toString(),
    'Retry-After': Math.max(0, Math.ceil(result.retryAfter / 1000)).toString(),
  }
}

/**
 * Create rate limit exceeded response
 */
export function rateLimitExceededResponse(
  result: RateLimitResult,
  config: RateLimitConfig = {}
): NextResponse {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  
  const message = result.lockout
    ? `Account temporarily locked due to too many failed attempts. Please try again in ${Math.ceil(cfg.lockoutDurationMs / 60000)} minutes.`
    : cfg.message
  
  return NextResponse.json(
    {
      error: message,
      code: result.lockout ? 'LOCKOUT' : 'RATE_LIMITED',
      retryAfter: result.retryAfter,
    },
    { 
      status: 429,
      headers: getRateLimitHeaders(result, config),
    }
  )
}

/**
 * Middleware-style rate limiter for auth routes
 */
export function withRateLimit(
  request: NextRequest,
  config: RateLimitConfig = {}
): { allowed: true; ip: string; key: string } | { allowed: false; response: NextResponse; ip: string; key: string } {
  const ip = getClientIp(request)
  const key = createRateLimitKey(request, 'auth')
  
  const result = checkRateLimit(key, config)
  
  if (!result.success) {
    return { 
      allowed: false, 
      response: rateLimitExceededResponse(result, config),
      ip,
      key,
    }
  }
  
  return { allowed: true, ip, key }
}
