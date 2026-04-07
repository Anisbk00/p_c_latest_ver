/**
 * Security Utilities for Progress Companion
 * 
 * This module provides security-focused utilities:
 * - URL sanitization to prevent XSS attacks
 * - String sanitization for user inputs
 * - CSRF token generation and validation
 * - Secure checksum generation using Web Crypto API
 */

// ═══════════════════════════════════════════════════════════════
// STRING SANITIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Sanitize a string input to prevent XSS attacks
 * Removes HTML tags and escapes special characters
 * 
 * @param input - The string to sanitize
 * @param maxLength - Maximum allowed length (default: 500)
 * @returns Sanitized string
 */
export function sanitizeString(input: string | null | undefined, maxLength: number = 500): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Trim and limit length
  let sanitized = input.trim().slice(0, maxLength);
  
  // Remove HTML tags (basic protection)
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Escape HTML entities
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  // Remove null bytes and other control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized;
}

/**
 * Sanitize a string but keep it as plain text (no HTML escaping)
 * Use this when you want to strip HTML but not escape entities
 * 
 * @param input - The string to sanitize
 * @param maxLength - Maximum allowed length (default: 500)
 * @returns Sanitized string
 */
export function sanitizeStringPlain(input: string | null | undefined, maxLength: number = 500): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Trim and limit length
  let sanitized = input.trim().slice(0, maxLength);
  
  // Remove HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Remove javascript: and vbscript: protocols
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/vbscript:/gi, '');
  
  return sanitized;
}

/**
 * Sanitize AI-generated content for safe rendering
 * This is specifically for AI outputs that will be rendered as markdown
 * 
 * SECURITY CONSIDERATIONS:
 * - Removes script tags and event handlers
 * - Removes javascript: and vbscript: protocols
 * - Removes data: URLs (except images)
 * - Removes iframe, object, embed, and other dangerous tags
 * - Keeps safe markdown formatting (bold, italic, code, lists)
 * 
 * @param content - The AI-generated content to sanitize
 * @param maxLength - Maximum allowed length (default: 10000)
 * @returns Sanitized content safe for rendering
 */
export function sanitizeAIContent(content: string | null | undefined, maxLength: number = 10000): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  // Trim and limit length
  let sanitized = content.trim().slice(0, maxLength);
  
  // Remove dangerous tags completely (with their content)
  const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link', 'style'];
  for (const tag of dangerousTags) {
    const regex = new RegExp(`<${tag}[^>]*>[\s\S]*?<\/${tag}>`, 'gi');
    sanitized = sanitized.replace(regex, '');
    // Also remove self-closing versions
    const selfClosingRegex = new RegExp(`<${tag}[^>]*\/?>`, 'gi');
    sanitized = sanitized.replace(selfClosingRegex, '');
  }
  
  // Remove event handlers (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: and vbscript: protocols
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  sanitized = sanitized.replace(/vbscript\s*:/gi, '');
  
  // Remove data: URLs (except images) - for href and src attributes
  sanitized = sanitized.replace(/href\s*=\s*["']data:(?!image\/)[^"']*["']/gi, 'href=""');
  sanitized = sanitized.replace(/src\s*=\s*["']data:(?!image\/)[^"']*["']/gi, 'src=""');
  
  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Remove any remaining HTML comments
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');
  
  return sanitized;
}

/**
 * Validate a numeric input
 * 
 * @param value - The value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Validated number or null if invalid
 */
export function validateNumber(value: unknown, min?: number, max?: number): number | null {
  const num = parseFloat(String(value));
  if (isNaN(num)) return null;
  if (min !== undefined && num < min) return null;
  if (max !== undefined && num > max) return null;
  return num;
}

// ═══════════════════════════════════════════════════════════════
// URL SANITIZATION
// ═══════════════════════════════════════════════════════════════

/** Allowed URL protocols for safe image sources */
const ALLOWED_PROTOCOLS = ['https:', 'http:', 'data:'];

/** Blocked domains that could be malicious */
const BLOCKED_DOMAINS: string[] = [];

/**
 * Sanitize a URL to prevent XSS attacks
 * 
 * @param url - The URL to sanitize
 * @returns Safe URL or empty string if invalid/dangerous
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  // Trim whitespace
  const trimmedUrl = url.trim();
  
  // Block javascript: protocol (case-insensitive)
  if (/^javascript:/i.test(trimmedUrl)) {
    return '';
  }
  
  // Block vbscript: protocol (case-insensitive)
  if (/^vbscript:/i.test(trimmedUrl)) {
    return '';
  }
  
  // Block data: URLs with script content
  if (/^data:/i.test(trimmedUrl)) {
    // Only allow image data URLs
    if (!/^data:image\//i.test(trimmedUrl)) {
      return '';
    }
  }
  
  // Try to parse the URL
  try {
    const parsed = new URL(trimmedUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    
    // Check protocol
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return '';
    }
    
    // Check blocked domains
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_DOMAINS.some(blocked => hostname.includes(blocked))) {
      return '';
    }
    
    // For relative URLs, the parser uses the base, so return original
    if (trimmedUrl.startsWith('/') || trimmedUrl.startsWith('./')) {
      return trimmedUrl;
    }
    
    return parsed.href;
  } catch {
    // Invalid URL format
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════
// CSRF PROTECTION
// ═══════════════════════════════════════════════════════════════

const CSRF_TOKEN_KEY = 'progress-companion-csrf-token';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create a CSRF token for the session
 * Tokens are stored in sessionStorage to persist across page refreshes
 */
export function getCsrfToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  
  let token = sessionStorage.getItem(CSRF_TOKEN_KEY);
  
  if (!token || token.length !== CSRF_TOKEN_LENGTH * 2) {
    token = generateRandomString(CSRF_TOKEN_LENGTH);
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  }
  
  return token;
}

/**
 * Create headers with CSRF token for API requests
 */
export function createSecureHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  
  // Add CSRF token header
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }
  
  // Ensure content-type for JSON requests
  if (!headers.has('Content-Type') && !headers.has('content-type')) {
    headers.set('Content-Type', 'application/json');
  }
  
  return headers;
}

// ═══════════════════════════════════════════════════════════════
// SECURE CHECKSUM (Web Crypto API)
// ═══════════════════════════════════════════════════════════════

/** 
 * Secret pepper for checksum - loaded from environment
 * For production, set NEXT_PUBLIC_CHECKSUM_SECRET in your environment
 * Note: Client-side checksums cannot be truly secure since the client
 * has all the information. This provides obfuscation only.
 */
const CHECKSUM_PEPPER = process.env.NEXT_PUBLIC_CHECKSUM_SECRET || 'pc_fallback_' + Date.now().toString(36);

/**
 * Generate a secure checksum using SHA-256
 * 
 * Note: Client-side checksums cannot be truly secure since the client
 * has all the information. This implementation provides:
 * - Timestamp-based expiration
 * - SHA-256 hashing (better than simple hash)
 * - Pepper for obfuscation
 * 
 * @param data - Data to checksum
 * @returns SHA-256 hash string
 */
export async function generateSecureChecksum(data: Record<string, unknown>): Promise<string> {
  const str = JSON.stringify(data) + CHECKSUM_PEPPER;
  
  // Check if crypto.subtle is available (requires secure context)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      
      // Convert to hex string
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch {
      // Fall back to simple hash if crypto.subtle fails
    }
  }
  
  // Fallback: Simple hash for non-secure contexts
  return simpleHash(str);
}

/**
 * Simple hash fallback for contexts where crypto.subtle is not available
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Verify a secure checksum
 * 
 * @param data - Data to verify
 * @param checksum - Expected checksum
 * @param maxAgeMs - Maximum age in milliseconds (default: 30 days)
 * @returns true if valid, false otherwise
 */
export async function verifySecureChecksum(
  data: Record<string, unknown>,
  checksum: string,
  maxAgeMs: number = 30 * 24 * 60 * 60 * 1000 // 30 days
): Promise<boolean> {
  // Check timestamp age
  const timestamp = data.completedAt as string | undefined;
  if (timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    if (age > maxAgeMs) {
      return false;
    }
  }
  
  // Verify checksum
  const expectedChecksum = await generateSecureChecksum(data);
  return expectedChecksum === checksum;
}

// ═══════════════════════════════════════════════════════════════
// DEVELOPMENT-ONLY LOGGING
// ═══════════════════════════════════════════════════════════════

/**
 * Log a warning only in development mode
 * Prevents leaking internal structure in production
 */
export function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Dev]', ...args);
  }
}

/**
 * Log an error only in development mode
 * Prevents exposing error details in production
 */
export function devError(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[Dev]', ...args);
  }
}

/**
 * Log info only in development mode
 */
export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Dev]', ...args);
  }
}

// ═══════════════════════════════════════════════════════════════
// SECURE FETCH WRAPPER
// ═══════════════════════════════════════════════════════════════

/**
 * Request options for secure fetch
 */
export interface SecureFetchOptions extends RequestInit {
  /** Skip adding CSRF token (for GET requests or external APIs) */
  skipCsrf?: boolean;
}

/**
 * Secure fetch wrapper that automatically adds CSRF protection
 * 
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Response from fetch
 */
export async function secureFetch(
  url: string, 
  options: SecureFetchOptions = {}
): Promise<Response> {
  const { skipCsrf = false, ...fetchOptions } = options;
  
  // Determine if this is a mutating request (should add CSRF)
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const shouldAddCsrf = !skipCsrf && method !== 'GET' && method !== 'HEAD';
  
  // Create headers with CSRF token for mutating requests
  const headers = new Headers(fetchOptions.headers);
  
  if (shouldAddCsrf) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }
  
  // Set content-type for JSON requests if body is an object
  if (fetchOptions.body && typeof fetchOptions.body === 'object' && !(fetchOptions.body instanceof FormData)) {
    if (!headers.has('Content-Type') && !headers.has('content-type')) {
      headers.set('Content-Type', 'application/json');
      fetchOptions.body = JSON.stringify(fetchOptions.body);
    }
  }
  
  return fetch(url, {
    ...fetchOptions,
    headers,
  });
}
