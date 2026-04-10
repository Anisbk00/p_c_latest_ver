/**
 * Distributed Rate Limiting Library
 * 
 * Uses Supabase as backing store for rate limit tracking.
 * Persists across restarts and works across multiple instances.
 * 
 * SECURITY: Critical for preventing brute force attacks on auth endpoints.
 * 
 * @module lib/distributed-rate-limit
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface DistributedRateLimitEntry {
  identifier: string
  count: number
  window_start: string
  blocked_until: string | null
  failed_attempts: number
  created_at: string
  updated_at: string
}

interface RateLimitConfig {
  windowMs?: number
  maxRequests?: number
  blockDurationMs?: number
  maxFailedAttempts?: number
  lockoutDurationMs?: number
  message?: string
  prefix?: string
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
// Configuration
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Lazy-initialized admin client for rate limit operations
let _adminClient: ReturnType<typeof createClient> | null = null

function getAdminClient() {
  if (!_adminClient && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  }
  return _adminClient
}

const DEFAULT_CONFIG: Required<Omit<RateLimitConfig, 'prefix'>> & { prefix: string } = {
  windowMs: 60 * 1000,
  maxRequests: 20,
  blockDurationMs: 5 * 60 * 1000,
  maxFailedAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000,
  message: 'Too many requests. Please try again later.',
  prefix: 'api',
}

// ═══════════════════════════════════════════════════════════════
// Rate Limit Presets
// ═══════════════════════════════════════════════════════════════

export const DISTRIBUTED_RATE_LIMITS = {
  AUTH_STRICT: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    blockDurationMs: 10 * 60 * 1000,
    maxFailedAttempts: 5,
    lockoutDurationMs: 30 * 60 * 1000,
    message: 'Too many login attempts. Please try again later.',
    prefix: 'auth',
  },
  REGISTRATION: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5, // 5 registrations per hour
    blockDurationMs: 30 * 60 * 1000, // 30 minutes block
    maxFailedAttempts: 10,
    lockoutDurationMs: 60 * 60 * 1000, // 1 hour lockout
    message: 'Too many registration attempts. Please try again later.',
    prefix: 'registration',
  },
  API_STANDARD: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    blockDurationMs: 5 * 60 * 1000,
    maxFailedAttempts: 10,
    lockoutDurationMs: 15 * 60 * 1000,
    message: 'Too many requests. Please slow down.',
    prefix: 'api',
  },
  API_READ: {
    windowMs: 60 * 1000,
    maxRequests: 120,
    blockDurationMs: 30 * 1000,
    maxFailedAttempts: 30,
    lockoutDurationMs: 2 * 60 * 1000,
    message: 'Too many requests. Please wait a moment.',
    prefix: 'read',
  },
  PROFILE_UPDATE: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    blockDurationMs: 2 * 60 * 1000,
    maxFailedAttempts: 10,
    lockoutDurationMs: 5 * 60 * 1000,
    message: 'Too many profile updates. Please wait.',
    prefix: 'profile',
  },
} as const

// ═══════════════════════════════════════════════════════════════
// Core Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Ensure the rate limit table exists
 */
async function ensureTable(supabase: NonNullable<ReturnType<typeof getAdminClient>>) {
  // Try to create the table if it doesn't exist (will fail silently if exists)
  await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS _rate_limits (
        identifier TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        window_start TIMESTAMPTZ DEFAULT NOW(),
        blocked_until TIMESTAMPTZ,
        failed_attempts INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  }).catch(() => {
    // Table might already exist or RPC not available - that's fine
  })
}

/**
 * Check rate limit using Supabase as backing store
 */
export async function checkDistributedRateLimit(
  identifier: string,
  config: RateLimitConfig = {}
): Promise<RateLimitResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const supabase = getAdminClient()
  
  if (!supabase) {
    // SECURITY FIX (VULN-003): Fail CLOSED for auth endpoints when Supabase unavailable
    // This prevents brute force attacks when rate limiting infrastructure is down
    if (cfg.prefix === 'auth' || cfg.prefix === 'registration') {
      console.error('[distributed-rate-limit] SECURITY: Supabase unavailable for auth endpoint, blocking request')
      return {
        success: false,
        remaining: 0,
        resetAt: Date.now() + cfg.windowMs,
        retryAfter: cfg.windowMs,
        blocked: true,
        lockout: false,
      }
    }
    // Fallback to allowing request if Supabase is not configured for non-auth endpoints
    console.warn('[distributed-rate-limit] Supabase not configured, allowing request')
    return {
      success: true,
      remaining: cfg.maxRequests - 1,
      resetAt: Date.now() + cfg.windowMs,
      retryAfter: 0,
      blocked: false,
      lockout: false,
    }
  }
  
  const now = new Date()
  const windowStart = new Date(now.getTime() - cfg.windowMs)
  const fullKey = `${cfg.prefix}:${identifier}`
  
  try {
    // Get current entry
    const { data: entry, error } = await supabase
      .from('_rate_limits')
      .select('*')
      .eq('identifier', fullKey)
      .maybeSingle()
    
    if (error && !error.message.includes('does not exist')) {
      console.error('[distributed-rate-limit] Query error:', error)
      // Fail open - allow request on error
      return {
        success: true,
        remaining: cfg.maxRequests - 1,
        resetAt: Date.now() + cfg.windowMs,
        retryAfter: 0,
        blocked: false,
        lockout: false,
      }
    }
    
    const typedEntry = entry as DistributedRateLimitEntry | null
    
    // Check if currently blocked
    if (typedEntry?.blocked_until && new Date(typedEntry.blocked_until) > now) {
      const blockedUntil = new Date(typedEntry.blocked_until).getTime()
      return {
        success: false,
        remaining: 0,
        resetAt: blockedUntil,
        retryAfter: blockedUntil - now.getTime(),
        blocked: true,
        lockout: typedEntry.failed_attempts >= cfg.maxFailedAttempts,
      }
    }
    
    // Check if window has expired
    if (!typedEntry || new Date(typedEntry.window_start) < windowStart) {
      // Start new window
      const newEntry = {
        identifier: fullKey,
        count: 1,
        window_start: now.toISOString(),
        blocked_until: null,
        failed_attempts: 0,
        updated_at: now.toISOString(),
      }
      
      await supabase
        .from('_rate_limits')
        .upsert(newEntry, { onConflict: 'identifier' })
      
      return {
        success: true,
        remaining: cfg.maxRequests - 1,
        resetAt: Date.now() + cfg.windowMs,
        retryAfter: 0,
        blocked: false,
        lockout: false,
      }
    }
    
    // Check if exceeded
    if (typedEntry.count >= cfg.maxRequests) {
      const blockedUntil = new Date(now.getTime() + cfg.blockDurationMs)
      
      await supabase
        .from('_rate_limits')
        .update({
          blocked_until: blockedUntil.toISOString(),
          count: typedEntry.count + 1,
          updated_at: now.toISOString(),
        })
        .eq('identifier', fullKey)
      
      return {
        success: false,
        remaining: 0,
        resetAt: blockedUntil.getTime(),
        retryAfter: cfg.blockDurationMs,
        blocked: true,
        lockout: false,
      }
    }
    
    // Increment counter
    await supabase
      .from('_rate_limits')
      .update({
        count: typedEntry.count + 1,
        updated_at: now.toISOString(),
      })
      .eq('identifier', fullKey)
    
    return {
      success: true,
      remaining: cfg.maxRequests - typedEntry.count - 1,
      resetAt: new Date(typedEntry.window_start).getTime() + cfg.windowMs,
      retryAfter: 0,
      blocked: false,
      lockout: false,
    }
  } catch (err) {
    console.error('[distributed-rate-limit] Error:', err)
    // SECURITY FIX (VULN-003): Fail CLOSED for auth endpoints on error
    if (cfg.prefix === 'auth' || cfg.prefix === 'registration') {
      console.error('[distributed-rate-limit] SECURITY: Error on auth endpoint, blocking request')
      return {
        success: false,
        remaining: 0,
        resetAt: Date.now() + cfg.windowMs,
        retryAfter: cfg.windowMs,
        blocked: true,
        lockout: false,
      }
    }
    // Fail open for non-auth endpoints
    return {
      success: true,
      remaining: cfg.maxRequests - 1,
      resetAt: Date.now() + cfg.windowMs,
      retryAfter: 0,
      blocked: false,
      lockout: false,
    }
  }
}

/**
 * Record a failed auth attempt
 */
export async function recordDistributedFailedAttempt(
  identifier: string,
  config: RateLimitConfig = {}
): Promise<{ lockout: boolean; remaining: number; lockoutUntil: number }> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const supabase = getAdminClient()
  
  if (!supabase) {
    return { lockout: false, remaining: cfg.maxFailedAttempts - 1, lockoutUntil: 0 }
  }
  
  const now = new Date()
  const fullKey = `${cfg.prefix}:${identifier}`
  
  try {
    const { data: entry } = await supabase
      .from('_rate_limits')
      .select('*')
      .eq('identifier', fullKey)
      .maybeSingle()
    
    const typedEntry = entry as DistributedRateLimitEntry | null
    const failedAttempts = (typedEntry?.failed_attempts || 0) + 1
    const remaining = Math.max(0, cfg.maxFailedAttempts - failedAttempts)
    
    if (failedAttempts >= cfg.maxFailedAttempts) {
      const lockoutUntil = new Date(now.getTime() + cfg.lockoutDurationMs)
      
      await supabase
        .from('_rate_limits')
        .upsert({
          identifier: fullKey,
          count: typedEntry?.count || 0,
          window_start: typedEntry?.window_start || now.toISOString(),
          blocked_until: lockoutUntil.toISOString(),
          failed_attempts: failedAttempts,
          updated_at: now.toISOString(),
        }, { onConflict: 'identifier' })
      
      return { lockout: true, remaining: 0, lockoutUntil: lockoutUntil.getTime() }
    }
    
    await supabase
      .from('_rate_limits')
      .upsert({
        identifier: fullKey,
        count: typedEntry?.count || 0,
        window_start: typedEntry?.window_start || now.toISOString(),
        blocked_until: null,
        failed_attempts: failedAttempts,
        updated_at: now.toISOString(),
      }, { onConflict: 'identifier' })
    
    return { lockout: false, remaining, lockoutUntil: 0 }
  } catch (err) {
    console.error('[distributed-rate-limit] recordFailedAttempt error:', err)
    return { lockout: false, remaining: cfg.maxFailedAttempts - 1, lockoutUntil: 0 }
  }
}

/**
 * Reset failed attempts after successful auth
 */
export async function resetDistributedFailedAttempts(
  identifier: string,
  config: RateLimitConfig = {}
): Promise<void> {
  const supabase = getAdminClient()
  if (!supabase) return
  
  const fullKey = `${config.prefix || 'api'}:${identifier}`
  
  try {
    await supabase
      .from('_rate_limits')
      .update({
        failed_attempts: 0,
        blocked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('identifier', fullKey)
  } catch (err) {
    console.error('[distributed-rate-limit] resetFailedAttempts error:', err)
  }
}

/**
 * Clear rate limit for an identifier
 */
export async function clearDistributedRateLimit(
  identifier: string,
  config: RateLimitConfig = {}
): Promise<void> {
  const supabase = getAdminClient()
  if (!supabase) return
  
  const fullKey = `${config.prefix || 'api'}:${identifier}`
  
  try {
    await supabase
      .from('_rate_limits')
      .delete()
      .eq('identifier', fullKey)
  } catch (err) {
    console.error('[distributed-rate-limit] clearRateLimit error:', err)
  }
}

/**
 * Clean up expired entries (call periodically)
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const supabase = getAdminClient()
  if (!supabase) return 0
  
  const now = new Date()
  
  try {
    const { data, error } = await supabase
      .from('_rate_limits')
      .delete()
      .lt('blocked_until', now.toISOString())
      .or(`blocked_until.is.null,window_start.lt.${new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()}`)
      .select('identifier')
    
    if (error) {
      console.error('[distributed-rate-limit] cleanup error:', error)
      return 0
    }
    
    return data?.length || 0
  } catch (err) {
    console.error('[distributed-rate-limit] cleanup error:', err)
    return 0
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions for API Routes
// ═══════════════════════════════════════════════════════════════

/**
 * Get client IP from request headers
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  
  return 'unknown'
}

/**
 * Create a rate limit key from request (IP-based)
 */
export function createDistributedRateLimitKey(request: NextRequest, prefix: string = 'api'): string {
  const ip = getClientIp(request)
  return `${prefix}:${ip}`
}

/**
 * Create rate limit headers for response
 */
export function getDistributedRateLimitHeaders(
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
export function distributedRateLimitExceededResponse(
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
      headers: getDistributedRateLimitHeaders(result, config),
    }
  )
}

/**
 * Middleware-style rate limiter for API routes
 */
export async function withDistributedRateLimit(
  request: NextRequest,
  config: RateLimitConfig = {}
): Promise<{ allowed: true; ip: string; key: string } | { allowed: false; response: NextResponse; ip: string; key: string }> {
  const ip = getClientIp(request)
  const key = `${config.prefix || 'api'}:${ip}`
  
  const result = await checkDistributedRateLimit(ip, config)
  
  if (!result.success) {
    return { 
      allowed: false, 
      response: distributedRateLimitExceededResponse(result, config),
      ip,
      key,
    }
  }
  
  return { allowed: true, ip, key }
}
