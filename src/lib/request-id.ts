/**
 * Request ID Tracking Utility
 * 
 * Generates and tracks unique request IDs for debugging and tracing.
 * Each request gets a unique ID that can be logged and passed through
 * the request chain.
 * 
 * Note: Async context tracking (withRequestId/getCurrentRequestId) is 
 * server-only and requires importing request-id-server.ts directly in
 * server-side code.
 * 
 * Updated: 2025-01-20
 */

import { nanoid } from 'nanoid';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Header name for request ID */
export const REQUEST_ID_HEADER = 'X-Request-ID';

/** Request ID prefix for identification */
const REQUEST_ID_PREFIX = 'req';

/** Length of the random part of the ID */
const ID_LENGTH = 16;

// ═══════════════════════════════════════════════════════════════
// Request ID Generation
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a unique request ID
 * Format: req_[timestamp]_[random]
 * Example: req_1705756800000_a1b2c3d4e5f6g7h8
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = nanoid(ID_LENGTH);
  return `${REQUEST_ID_PREFIX}_${timestamp}_${random}`;
}

/**
 * Extract or generate request ID from headers
 * If the client provides an ID, use it; otherwise generate one
 */
export function getOrCreateRequestId(headers: Headers): string {
  const existingId = headers.get(REQUEST_ID_HEADER);
  
  if (existingId && isValidRequestId(existingId)) {
    return existingId;
  }
  
  return generateRequestId();
}

/**
 * Validate that a request ID is properly formatted
 */
export function isValidRequestId(id: string): boolean {
  // Allow any non-empty string that's reasonable length
  return id.length > 0 && id.length < 128;
}

// ═══════════════════════════════════════════════════════════════
// Request Context for Logging
// ═══════════════════════════════════════════════════════════════

export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  userAgent?: string;
  ip?: string;
  timestamp: Date;
}

/**
 * Create a request context for logging
 */
export function createRequestContext(
  requestId: string,
  request: Request
): RequestContext {
  const url = new URL(request.url);
  
  return {
    requestId,
    method: request.method,
    path: url.pathname,
    userAgent: request.headers.get('user-agent') || undefined,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        request.headers.get('x-real-ip') || undefined,
    timestamp: new Date(),
  };
}

/**
 * Format request context for logging
 */
export function formatRequestContext(context: RequestContext): string {
  const parts = [
    `[${context.requestId}]`,
    context.method,
    context.path,
    context.ip ? `ip=${context.ip}` : '',
  ].filter(Boolean);
  
  return parts.join(' ');
}

// ═══════════════════════════════════════════════════════════════
// Async Context (Server-Only Stub for Client)
// ═══════════════════════════════════════════════════════════════

/**
 * Get current request ID from async context
 * Returns undefined on client side (stub)
 * For server-side use, import request-id-context.server.ts directly
 */
export function getCurrentRequestId(): string | undefined {
  // Client-side stub - returns undefined
  // Server code should import from request-id-context.server.ts
  return undefined;
}

/**
 * Run a function with a request ID in async context
 * Falls through to just running the function on client side
 * For server-side use, import request-id-context.server.ts directly
 */
export function withRequestId<T>(_requestId: string, fn: () => T): T {
  // Client-side stub - just runs the function
  // Server code should import from request-id-context.server.ts
  return fn();
}

// ═══════════════════════════════════════════════════════════════
// Response Headers Helper
// ═══════════════════════════════════════════════════════════════

/**
 * Get headers to include in response for request tracing
 */
export function getRequestIdHeaders(requestId: string): Record<string, string> {
  return {
    [REQUEST_ID_HEADER]: requestId,
  };
}
